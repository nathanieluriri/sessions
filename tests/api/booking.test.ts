import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createHarness, nextWeekday, type Client, type Harness } from "../helpers/harness";
import { addDays, studioNow } from "../../src/worker/lib/time";

vi.setConfig({ testTimeout: 30_000 });

let h: Harness;
let boss: Client;

beforeAll(async () => {
  h = await createHarness();
  boss = await h.ceo();
  // Every test books its own week, so the booking horizon is stretched to a year. The default 90 days is covered by the window unit tests.
  const open = (await boss.get("/api/admin/availability")).body.hours;
  const stretched = await boss.put("/api/admin/availability", { hours: open, buffer: 30, hold: 15, minNotice: 180, bookAhead: 365 });
  if (stretched.status !== 200) throw new Error(`availability failed: ${JSON.stringify(stretched.body)}`);
  // Add-ons the catalog does not ship with: a fixed price for any music booking, one scoped to mixing, a quote-only one, and a fixed one for exclusive offers.
  for (const e of [
    { name: "Studio snacks", price_kobo: 500_000, category: "music" }, { name: "Stem pack", price_kobo: 1_000_000, category: "music", service_slug: "mixing-mastering" },
    { name: "Rush masters", category: "music", service_slug: "mixing-mastering", pricing: "quote" }, { name: "Exclusive concierge", price_kobo: 1_234_500, category: "exclusive" },
  ]) {
    const r = await boss.post("/api/admin/collections/extras", { price_kobo: 0, category: "", service_slug: "", pricing: "fixed", description: "", active: 1, ...e });
    if (r.status !== 200) throw new Error(`extra ${e.name} failed: ${JSON.stringify(r.body)}`);
  }
}, 120000);
afterAll(() => h?.dispose());
afterEach(() => vi.useRealTimers());

// Every test books its own week, so slots never collide between tests.
const used: Record<number, number> = {};
const fresh = (weekday: number) => nextWeekday(weekday, 8 + 7 * (used[weekday] = (used[weekday] ?? -1) + 1));
const monday = () => fresh(1);
const saturday = () => fresh(6);

const who = { artistName: "Kemi B", contactName: "Kemi Balogun", contactEmail: "kemi@example.com", contactPhone: "+234 805 111 2233" };
const REC = { serviceSlug: "recording", packageId: "pkg_recording_session" };
const FULL = { serviceSlug: "full-production", packageId: "pkg_full_production" };
const EP = { serviceSlug: "produce-ep", packageId: "pkg_produce_ep" };
const ALBUM = { serviceSlug: "produce-album", packageId: "pkg_produce_album" };
const MIX = { serviceSlug: "mixing-mastering", packageId: "pkg_mm_standard" };
const EXPRESS = { serviceSlug: "mixing-mastering", packageId: "pkg_mm_express" };
const BEAT = { serviceSlug: "beat-production", packageId: "pkg_beat_production" };
const PODCAST = { serviceSlug: "podcast-recording", packageId: "pkg_podcast_hour" };
const STAGE = { serviceSlug: "music-videos", packageId: "pkg_stage_half_day" };
const PHOTO = { serviceSlug: "artist-portraits", packageId: "pkg_photo_session_2_hour" };
const S1 = 600, S2 = 750, S3 = 870, S4 = 1020, NIGHT = 1380;

const draft = (pkg: { serviceSlug: string; packageId: string }, date: string, start: number, over: Record<string, unknown> = {}) =>
  ({ ...pkg, date, start, extraHours: 0, extras: [], people: 2, project: "", notes: "", links: "", ...who, ...over });
const manual = (pkg: { serviceSlug: string; packageId: string }, date: string, start: number, over: Record<string, unknown> = {}) =>
  ({ ...draft(pkg, date, start), status: "confirmed", source: "phone", ignoreHours: false, notify: false, payment: null, ...over });
const row = async (id: string) => (await h.sql("SELECT * FROM bookings WHERE id = ?", id))[0];
const mailTo = async (email: string, subject: string) =>
  (await h.sql<{ body: string }>("SELECT body FROM email_outbox WHERE to_email = ? AND subject LIKE ? ORDER BY created_at DESC, rowid DESC", email, subject))[0]?.body ?? "";

/** A new client holds a slot, pays through the demo provider and ends up with a confirmed booking. */
async function book(body: Record<string, unknown>, plan: "full" | "deposit" = "full") {
  const { client, email, user } = await h.newClient();
  const hold = await client.post("/api/holds", { ...body, contactEmail: email });
  expect(hold.status, JSON.stringify(hold.body)).toBe(200);
  const co = await client.post("/api/checkout", { holdId: hold.body.holdId, plan });
  expect(co.status, JSON.stringify(co.body)).toBe(200);
  const paid = await h.payDemo(client, co.body.reference);
  expect(paid.body.status).toBe("confirmed");
  return { client, email, user, hold: hold.body, checkout: co.body, booking: paid.body.booking, id: paid.body.booking.id as string };
}

describe("catalog", () => {
  it("lists the session windows and the new package and extra fields", async () => {
    const { body } = await h.client().get("/api/catalog");
    expect(body.sessions.map((s: any) => [s.label, s.kind, s.start_min, s.end_min, s.weekday])).toEqual([
      ["Session 1", "day", 600, 720, null], ["Session 2", "day", 750, 840, null], ["Session 3", "day", 870, 990, null], ["Session 4", "day", 1020, 1140, null],
      ["All night session", "night", 1380, 1740, 6],
    ]);
    const pkg = (slug: string) => body.packages.find((p: any) => p.slug === slug);
    expect(pkg("recording-session")).toMatchObject({ scheduling: "slot", slot_kind: "day", price_kobo: 8_000_000, unit: "per session", room_id: "room_studio_a", service_slug: "recording" });
    expect(pkg("full-production")).toMatchObject({ scheduling: "slot", slot_kind: "night", price_kobo: 28_000_000, turnaround_days: 7, revision_limit: 3 });
    expect(pkg("produce-ep")).toMatchObject({ scheduling: "day", price_kobo: 150_000_000, tracks: 5, requires_approval: 1, compare_at_kobo: null });
    expect(pkg("produce-album")).toMatchObject({ scheduling: "day", price_kobo: 250_000_000, tracks: 12 });
    expect(pkg("mixing-mastering-express")).toMatchObject({ scheduling: "project", price_kobo: 17_000_000, turnaround_days: 1 });
    expect(pkg("mixing-mastering-standard")).toMatchObject({ scheduling: "project", price_kobo: 10_000_000, turnaround_days: 7 });
    expect(body.extras.find((e: any) => e.slug === "album-art")).toMatchObject({ pricing: "quote", price_kobo: 0, category: "exclusive" });
    expect(body.categories.map((c: any) => c.slug)).toContain("exclusive");
  });
  it("hides packages of categories that are closed to online booking but keeps their services", async () => {
    const { body } = await h.client().get("/api/catalog");
    expect(body.packages.map((p: any) => p.slug)).not.toContain("podcast-hour");
    expect(body.packages.every((p: any) => ["music", "exclusive"].includes(p.service_category))).toBe(true);
    expect(body.services.map((s: any) => s.slug)).toEqual(expect.arrayContaining(["music-videos", "podcast-recording", "artist-portraits"]));
    for (const gone of ["vocal-recording", "song-arrangement", "mastering", "voice-over", "vocal-editing"]) expect(body.services.map((s: any) => s.slug)).not.toContain(gone);
  });
});

describe("availability", () => {
  it("offers the four recording sessions of a day with their labels and times", async () => {
    const date = monday();
    const { body } = await h.client().get(`/api/availability/day?date=${date}&package=pkg_recording_session`);
    expect(body).toMatchObject({ date, mode: "slot", kind: "day", room: "room_studio_a", open: { from: 600, to: 1140 } });
    expect(body.slots.map((s: any) => [s.id, s.label, s.start, s.end, s.available])).toEqual([
      ["slot_day_1", "Session 1", 600, 720, true], ["slot_day_2", "Session 2", 750, 840, true], ["slot_day_3", "Session 3", 870, 990, true], ["slot_day_4", "Session 4", 1020, 1140, true],
    ]);
  });
  it("offers the all night session on Saturday and nothing on Sunday", async () => {
    const sat = saturday();
    const c = h.client();
    const night = await c.get(`/api/availability/day?date=${sat}&package=pkg_full_production`);
    expect(night.body.slots).toEqual([{ id: "slot_night", label: "All night session", kind: "night", start: 1380, end: 1740, available: true }]);
    expect(night.body.open).toEqual({ from: 1380, to: 1740 });
    for (const d of [1, 2, 3, 4, 5, 6].map((n) => addDays(sat, n))) {
      const r = await c.get(`/api/availability/day?date=${d}&package=pkg_full_production`);
      expect(r.body.slots, d).toEqual([]);
      expect(r.body.open).toBeNull();
    }
    const month = await c.get(`/api/availability/month?month=${sat.slice(0, 7)}&package=pkg_full_production`);
    const statusOf = (d: string) => month.body.days.find((x: any) => x.date === d)?.status;
    expect(statusOf(sat)).toBe("available");
    if (addDays(sat, 1).startsWith(sat.slice(0, 7))) expect(statusOf(addDays(sat, 1))).toBe("closed");
  });
  it("offers one whole-day window for day packages and no calendar for remote orders", async () => {
    const date = monday();
    const c = h.client();
    const ep = await c.get(`/api/availability/day?date=${date}&package=pkg_produce_ep`);
    expect(ep.body).toMatchObject({ mode: "day", room: "room_studio_a", open: { from: 600, to: 1140 } });
    expect(ep.body.slots).toEqual([{ id: "day", label: "Whole day", kind: "day", start: 600, end: 1140, available: true }]);
    const project = await c.get(`/api/availability/day?date=${date}&package=pkg_mm_standard`);
    expect(project.body).toEqual({ date: studioNow().date, mode: "project", room: null, open: null, slots: [] });
    const month = await c.get(`/api/availability/month?month=${date.slice(0, 7)}&package=pkg_mm_standard`);
    expect(month.body).toEqual({ month: date.slice(0, 7), mode: "project", room: null, days: [] });
  });
  it("keeps the flex grid for duration and room, with or without a package", async () => {
    const date = monday();
    const c = h.client();
    const legacy = await c.get(`/api/availability/day?date=${date}&duration=120&room=room_podcast`);
    expect(legacy.body).toMatchObject({ date, duration: 120, room: "room_podcast", open: { from: 600, to: 1140 } });
    expect(legacy.body.slots[0]).toEqual({ start: 600, available: true });
    expect(legacy.body.slots.at(-1)).toEqual({ start: 1020, available: true });
    const viaPackage = await c.get(`/api/availability/day?date=${date}&package=pkg_podcast_hour`);
    expect(viaPackage.body).toMatchObject({ mode: "flex", duration: 60, room: "room_podcast" });
    expect(viaPackage.body.slots.at(-1)).toEqual({ start: 1080, available: true });
    const month = await c.get(`/api/availability/month?month=${date.slice(0, 7)}&duration=120&room=room_stage`);
    expect(month.body.days.find((d: any) => d.date === date)).toMatchObject({ status: "available", total: 15 });
  });
  it("counts a day limited when one session is left and full when none are", async () => {
    const date = monday();
    const c = h.client();
    const status = async () => (await c.get(`/api/availability/month?month=${date.slice(0, 7)}&package=pkg_recording_session`)).body.days.find((d: any) => d.date === date);
    expect(await status()).toMatchObject({ status: "available", free: 4, total: 4 });
    const holds = [];
    for (const start of [S1, S2]) holds.push((await c.post("/api/holds", draft(REC, date, start))).body.holdId);
    expect(await status()).toMatchObject({ status: "available", free: 2 });
    holds.push((await c.post("/api/holds", draft(REC, date, S3))).body.holdId);
    expect(await status()).toMatchObject({ status: "limited", free: 1, total: 4 });
    holds.push((await c.post("/api/holds", draft(REC, date, S4))).body.holdId);
    expect(await status()).toMatchObject({ status: "full", free: 0 });
    await c.del(`/api/holds/${holds[0]}`);
    expect(await status()).toMatchObject({ status: "limited", free: 1 });
  });
  it("marks past days and days beyond the booking horizon", async () => {
    const c = h.client();
    const today = studioNow().date;
    const earlier = await c.get(`/api/availability/month?month=${addDays(today, -40).slice(0, 7)}&package=pkg_recording_session`);
    expect(earlier.body.days.every((d: any) => d.status === "past")).toBe(true);
    const thisMonth = await c.get(`/api/availability/month?month=${today.slice(0, 7)}&package=pkg_recording_session`);
    expect(thisMonth.body.days.find((d: any) => d.date === today).status).not.toBe("past");
    const far = addDays(today, 500);
    const later = await c.get(`/api/availability/month?month=${far.slice(0, 7)}&package=pkg_recording_session`);
    expect(later.body.days.every((d: any) => d.status === "past")).toBe(true);
    expect((await c.get(`/api/availability/day?date=${far}&package=pkg_recording_session`)).body.slots).toEqual([]);
  });
  it("refuses malformed requests", async () => {
    const c = h.client();
    const date = monday();
    for (const path of [
      `/api/availability/day?date=2026-02-30&package=pkg_recording_session`, `/api/availability/day?date=tomorrow&package=pkg_recording_session`, `/api/availability/day?package=pkg_recording_session`,
      `/api/availability/day?date=${date}&package=missing`, `/api/availability/day?date=${date}&duration=abc&room=room_podcast`, `/api/availability/day?date=${date}&duration=0&room=room_podcast`,
      `/api/availability/month?month=2026-13&package=pkg_recording_session`, `/api/availability/month?month=October`, `/api/availability/month?month=2026-10&package=missing`,
    ]) expect((await c.get(path)).status, path).toBe(400);
  });
  it("shows only what a hold would really accept", async () => {
    const date = monday();
    const c = h.client();
    expect((await boss.post("/api/admin/blocks", { date, start: S4, end: 1140, reason: "Maintenance", roomId: "room_studio_a" })).status).toBe(200);
    expect((await boss.post("/api/admin/bookings", manual(REC, date, S2))).status).toBe(200);
    const heldElsewhere = await c.post("/api/holds", draft(REC, date, S1));
    expect(heldElsewhere.status).toBe(200);
    const view = (await c.get(`/api/availability/day?date=${date}&package=pkg_recording_session`)).body.slots;
    expect(view.map((s: any) => [s.start, s.available])).toEqual([[S1, false], [S2, false], [S3, true], [S4, false]]);
    for (const s of view) {
      const r = await h.client().post("/api/holds", draft(REC, date, s.start));
      expect(r.status === 200, `start ${s.start}`).toBe(s.available);
    }
  });
});

describe("holds", () => {
  it("turns a second hold on the same session away, and still offers the neighbouring session", async () => {
    const date = monday();
    const first = await h.client().post("/api/holds", draft(REC, date, S2));
    expect(first.status).toBe(200);
    expect(first.body.draft).toMatchObject({ scheduling: "slot", slotKind: "day", slotLabel: "Session 2", start: 750, duration: 90, total: 8_000_000, roomId: "room_studio_a" });
    const second = await h.client().post("/api/holds", draft(REC, date, S2));
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("slot_taken");
    expect((await h.client().post("/api/holds", draft(REC, date, S1))).status).toBe(200);
    expect((await h.client().post("/api/holds", draft(REC, date, S3))).status).toBe(200);
  });
  it("lets only one of many simultaneous holds win", async () => {
    const date = monday();
    const results = await Promise.all(Array.from({ length: 10 }, () => h.client().post("/api/holds", draft(REC, date, S3))));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409).every((r) => r.body.code === "slot_taken")).toBe(true);
    expect(results.filter((r) => r.status !== 200 && r.status !== 409)).toEqual([]);
  });
  it("lets only one of a hold, a staff booking and a second hold take the same session", async () => {
    const date = monday();
    const [a, b, c] = await Promise.all([
      h.client().post("/api/holds", draft(REC, date, S4)), boss.post("/api/admin/bookings", manual(REC, date, S4)), h.client().post("/api/holds", draft(REC, date, S4)),
    ]);
    expect([a, b, c].filter((r) => r.status === 200)).toHaveLength(1);
  });
  it("frees the session once the hold lapses", async () => {
    const date = monday();
    const first = await h.client().post("/api/holds", draft(REC, date, S1));
    expect(first.status).toBe(200);
    const expires = new Date(first.body.expiresAt).getTime();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(expires - 1000);
    expect((await h.client().post("/api/holds", draft(REC, date, S1))).status).toBe(409);
    vi.setSystemTime(expires + 1000);
    expect((await h.client().post("/api/holds", draft(REC, date, S1))).status).toBe(200);
  });
  it("lets a day package hold the whole day against every session, both ways round", async () => {
    const date = monday();
    const ep = await h.client().post("/api/holds", draft(EP, date, S1));
    expect(ep.status).toBe(200);
    expect(ep.body.draft).toMatchObject({ scheduling: "day", slotLabel: "Whole day", start: 600, duration: 540, requiresApproval: true });
    for (const start of [S1, S2, S3, S4]) expect((await h.client().post("/api/holds", draft(REC, date, start))).status, `${start}`).toBe(409);
    expect((await h.client().post("/api/holds", draft(ALBUM, date, S1))).status).toBe(409);
    const other = monday();
    expect((await h.client().post("/api/holds", draft(REC, other, S2))).status).toBe(200);
    expect((await h.client().post("/api/holds", draft(EP, other, S1))).status).toBe(409);
  });
  it("never lets remote orders clash with anything", async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => h.client().post("/api/holds", draft(MIX, "", 0))));
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200, 200]);
    const stored = await h.sql<{ room_id: string | null; date: string; start_min: number; end_min: number }>("SELECT * FROM holds WHERE id = ?", results[0].body.holdId);
    expect(stored[0]).toMatchObject({ room_id: null, date: studioNow().date, start_min: 0, end_min: 0 });
  });
  it("keeps the small hours of Sunday for a session that ran past midnight, in both directions", async () => {
    const studioHour = await boss.post("/api/admin/packages", {
      name: "Studio hour", description: "An hour in Studio A.", category: "session", durationMin: 60, priceKobo: 2_500_000, includes: [], featured: false, active: true,
      serviceCategory: "music", roomId: "room_studio_a", pricing: "fixed", depositPercent: 0, requiresApproval: false, priceNote: "", scheduling: "flex",
    });
    expect(studioHour.status, JSON.stringify(studioHour.body)).toBe(200);
    const HOUR = { serviceSlug: "recording", packageId: studioHour.body.id };
    // A night hold first: Sunday 02:00 to 03:00 in Studio A is inside it, 05:30 is exactly the buffer after it ends.
    const sat = saturday();
    const sunday = addDays(sat, 1);
    const night = await h.client().post("/api/holds", draft(FULL, sat, NIGHT));
    expect(night.status).toBe(200);
    expect((await boss.post("/api/admin/bookings", manual(HOUR, sunday, 120, { ignoreHours: true }))).status).toBe(409);
    expect((await boss.post("/api/admin/bookings", manual(HOUR, sunday, 329, { ignoreHours: true }))).status).toBe(409);
    expect((await boss.post("/api/admin/bookings", manual(HOUR, sunday, 330, { ignoreHours: true }))).status).toBe(200);
    // A staff booking first: Sunday 02:00 in Studio A closes the Saturday night window.
    const sat2 = saturday();
    const early = await boss.post("/api/admin/bookings", manual(HOUR, addDays(sat2, 1), 120, { ignoreHours: true }));
    expect(early.status).toBe(200);
    const view = await h.client().get(`/api/availability/day?date=${sat2}&package=pkg_full_production`);
    expect(view.body.slots[0].available).toBe(false);
    const refused = await h.client().post("/api/holds", draft(FULL, sat2, NIGHT));
    expect(refused.status).toBe(409);
  });
});

describe("what a booking may not be", () => {
  const rejects = async (body: Record<string, unknown>, text?: RegExp) => {
    const r = await h.client().post("/api/holds", body);
    expect(r.status, JSON.stringify(r.body)).toBe(400);
    if (text) expect(r.body.error).toMatch(text);
  };
  it("rejects a start that is not one of the open sessions", async () => {
    const date = monday();
    for (const start of [0, 630, 660, 780, 1139, 1200, NIGHT]) await rejects(draft(REC, date, start), /Pick one of the open sessions/);
    await rejects(draft(REC, date, 600, { extraHours: 1 }), /Extra hours/);
  });
  it("rejects the all night session on any day but Saturday", async () => {
    const sat = saturday();
    for (const n of [1, 2, 3, 4, 5, 6]) await rejects(draft(FULL, addDays(sat, n), NIGHT), /Pick one of the open sessions/);
    await rejects(draft(FULL, sat, 1350), /Pick one of the open sessions/);
    await rejects(draft(FULL, sat, 600), /Pick one of the open sessions/);
    await rejects(draft(REC, sat, NIGHT), /Pick one of the open sessions/);
  });
  it("rejects a day package that does not start at the beginning of the day", async () => {
    await rejects(draft(EP, monday(), S2), /open day/);
    await rejects(draft(ALBUM, monday(), 0), /open day/);
  });
  it("rejects past dates, dates that do not exist and dates beyond the horizon", async () => {
    const today = studioNow().date;
    await rejects(draft(REC, addDays(today, -1), S1), /too soon/);
    await rejects(draft(REC, addDays(today, -30), S4), /too soon/);
    await rejects(draft(REC, "2026-02-30", S1), /Pick a date/);
    await rejects(draft(REC, "2026/10/24", S1), /Invalid date/);
    await rejects(draft(REC, addDays(today, 400), S1), /too far ahead/);
    await rejects(draft(REC, "", S1), /Pick a date/);
  });
  it("enforces the notice period from the session start, including the night session", async () => {
    const sat = saturday();
    const at = (hour: number, minute = 0) => new Date(Date.UTC(+sat.slice(0, 4), +sat.slice(5, 7) - 1, +sat.slice(8, 10), hour - 1, minute));
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(at(19, 30));
    expect((await h.client().post("/api/holds", draft(FULL, sat, NIGHT))).status).toBe(200);
    vi.setSystemTime(at(20, 30));
    await rejects(draft(FULL, sat, NIGHT), /too soon/);
    vi.setSystemTime(at(9, 59));
    await rejects(draft(REC, sat, S1), /too soon/);
    await rejects(draft(REC, sat, S2), /too soon/);
    expect((await h.client().post("/api/holds", draft(REC, sat, S3))).status).toBe(200);
  });
  it("rejects mismatched services, quote packages and unknown packages", async () => {
    const date = monday();
    await rejects(draft({ serviceSlug: "beat-production", packageId: "pkg_recording_session" }, date, S1), /fits this service/);
    await rejects(draft({ serviceSlug: "recording", packageId: "pkg_beat_production" }, date, S1), /fits this service/);
    await rejects(draft({ serviceSlug: "produce-ep", packageId: "pkg_recording_session" }, date, S1), /fits this service/);
    await rejects(draft({ serviceSlug: "artist-development", packageId: "pkg_artist_development" }, date, S1), /quote/);
    await rejects(draft({ serviceSlug: "recording", packageId: "nope" }, date, S1), /no longer available/);
    await rejects(draft({ serviceSlug: "vocal-recording", packageId: "pkg_recording_session" }, date, S1), /Choose a service/);
  });
  it("refuses room capacity but lets a remote order take any group size up to 200", async () => {
    await rejects(draft(REC, monday(), S1, { people: 7 }), /up to 6 people/);
    expect((await h.client().post("/api/holds", draft(MIX, "", 0, { people: 200 }))).status).toBe(200);
    expect((await h.client().post("/api/quote", draft(MIX, "", 0, { people: 201 }))).status).toBe(400);
  });
  it("refuses categories closed to online booking, but quotes them", async () => {
    await rejects(draft(PODCAST, monday(), S1), /not booked online/);
    expect((await h.client().post("/api/quote", draft(PODCAST, monday(), S1))).status).toBe(200);
  });
  it("forces a remote order onto today with no time and no room, whatever the client sends", async () => {
    const r = await h.client().post("/api/quote", draft(BEAT, "2030-01-01", 900));
    expect(r.body).toMatchObject({ scheduling: "project", date: studioNow().date, start: 0, duration: 0, roomId: "", roomName: "", slotKind: "", slotLabel: "", dueDate: null });
    const bare = await h.client().post("/api/quote", { ...BEAT, ...who });
    expect(bare.body).toMatchObject({ scheduling: "project", people: 1, total: 10_000_000 });
    expect((await h.client().post("/api/quote", draft(BEAT, "", 0, { extraHours: 2 }))).status).toBe(400);
  });
});

describe("session bookings", () => {
  it("turns a paid hold into a confirmed booking with every column filled in", async () => {
    const date = monday();
    const { id, email, user, booking } = await book(draft(REC, date, S3));
    expect(booking).toMatchObject({ status: "confirmed", scheduling: "slot", slot_label: "Session 3", due_date: null, total_kobo: 8_000_000, paid_kobo: 8_000_000, balance_kobo: 0, start_min: 870, end_min: 990, room_name: "Studio A" });
    expect(await row(id)).toMatchObject({
      room_id: "room_studio_a", room_name: "Studio A", category: "music", service_name: "Recording", package_name: "Recording session", package_price_kobo: 8_000_000, scheduling: "slot", slot_kind: "day",
      slot_label: "Session 3", date, start_min: 870, end_min: 990, due_date: null, revision_limit: 0, revisions_used: 0, delivered_final_at: null, deposit_kobo: 0,
      amount_paid_kobo: 8_000_000, refunded_kobo: 0, user_id: user.id, status: "confirmed", total_kobo: 8_000_000, source: "online", people: 2,
    });
    const mail = await mailTo(email, "You're booked%");
    expect(mail).toContain("Room: Studio A");
    expect(mail).toContain("Time: 2:30pm to 4:30pm");
    expect(mail).toContain("Payment status: paid in full");
    expect(mail).not.toContain("Order placed");
    expect(mail).not.toContain("Delivery due");
  });
  it("gives each session its own length at the same flat price", async () => {
    const date = monday();
    const prices = [];
    for (const [start, end] of [[S1, 720], [S2, 840], [S4, 1140]]) {
      const { id } = await book(draft(REC, date, start));
      const r = await row(id);
      expect([r.start_min, r.end_min]).toEqual([start, end]);
      prices.push(r.total_kobo);
    }
    expect(prices).toEqual([8_000_000, 8_000_000, 8_000_000]);
  });
  it("books the all night session with a deposit, then collects the balance", async () => {
    const sat = saturday();
    const { id, email, client, booking } = await book(draft(FULL, sat, NIGHT), "deposit");
    expect(booking).toMatchObject({ scheduling: "slot", slot_label: "All night session", start_min: 1380, end_min: 1740, total_kobo: 28_000_000, deposit_kobo: 14_000_000, paid_kobo: 14_000_000, balance_kobo: 14_000_000, due_date: addDays(sat, 7) });
    expect(await row(id)).toMatchObject({ slot_kind: "night", date: sat, revision_limit: 3, status: "confirmed", room_id: "room_studio_a" });
    const mail = await mailTo(email, "You're booked%");
    expect(mail).toContain("Time: 11:00pm to 5:00am (Sunday)");
    expect(mail).toContain("Room: Studio A");
    expect(mail).toContain("Balance due before your session: ₦140,000");
    expect(mail).toContain(`Delivery due: ${new Date(`${addDays(sat, 7)}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}`);
    const pay = await client.post(`/api/pay/${id}`, { plan: "full" });
    expect(pay.status, JSON.stringify(pay.body)).toBe(200);
    expect(pay.body.amount).toBe(14_000_000);
    expect((await h.payDemo(client, pay.body.reference)).body.status).toBe("confirmed");
    expect(await row(id)).toMatchObject({ amount_paid_kobo: 28_000_000 });
    expect(await mailTo(email, "Payment received%")).toContain("Payment status: paid in full");
    expect((await client.post(`/api/pay/${id}`, { plan: "full" })).status).toBe(400);
  });
  it("takes the whole price at once when the client skips the deposit", async () => {
    const { id, booking } = await book(draft(FULL, saturday(), NIGHT), "full");
    expect(booking).toMatchObject({ paid_kobo: 28_000_000, balance_kobo: 0 });
    expect(await row(id)).toMatchObject({ amount_paid_kobo: 28_000_000 });
  });
  it("charges the deposit the booking page promised, rounded to the nearest 100 naira", async () => {
    const created = await boss.post("/api/admin/packages", {
      name: "Odd priced hour", description: "Rounding check.", category: "session", durationMin: 60, priceKobo: 8_512_345, includes: [], featured: false, active: true,
      serviceCategory: "music", roomId: "room_studio_a", pricing: "fixed", depositPercent: 30, requiresApproval: false, priceNote: "", scheduling: "slot", slotKind: "day",
    });
    expect(created.status).toBe(200);
    const { client, email } = await h.newClient();
    const hold = await client.post("/api/holds", draft({ serviceSlug: "recording", packageId: created.body.id }, monday(), S2, { contactEmail: email }));
    expect(hold.body.draft).toMatchObject({ total: 8_512_345, depositPercent: 30, deposit: 2_550_000 });
    const co = await client.post("/api/checkout", { holdId: hold.body.holdId, plan: "deposit" });
    expect(co.body.amount).toBe(2_550_000);
    const paid = await h.payDemo(client, co.body.reference);
    expect(paid.body.booking).toMatchObject({ paid_kobo: 2_550_000, balance_kobo: 5_962_345, deposit_kobo: 2_550_000 });
  });
  it("sends a payment failure back without a booking", async () => {
    const { client, email } = await h.newClient();
    const date = monday();
    const hold = await client.post("/api/holds", draft(REC, date, S1, { contactEmail: email }));
    const co = await client.post("/api/checkout", { holdId: hold.body.holdId, plan: "full" });
    const failed = await h.payDemo(client, co.body.reference, "failed");
    expect(failed.body.status).toBe("failed");
    expect((await h.client().post("/api/holds", draft(REC, date, S1))).status).toBe(200);
  });
});

describe("money", () => {
  it("adds fixed add-ons within their category and service, and lists quote add-ons at no charge", async () => {
    const c = h.client();
    const rec = await c.post("/api/quote", draft(REC, monday(), S1, { extras: ["studio-snacks", "stem-pack", "album-art", "makeup-artist", "nonsense"] }));
    expect(rec.body.extrasList).toEqual([{ slug: "studio-snacks", name: "Studio snacks", price: 500_000 }]);
    expect(rec.body.extras).toEqual(["studio-snacks"]);
    expect(rec.body.total).toBe(8_500_000);
    const mix = await c.post("/api/quote", draft(MIX, "", 0, { extras: ["stem-pack", "studio-snacks", "rush-masters"] }));
    expect(mix.body.extrasList).toHaveLength(3);
    expect(mix.body.extrasList).toEqual(expect.arrayContaining([
      { slug: "studio-snacks", name: "Studio snacks", price: 500_000 }, { slug: "stem-pack", name: "Stem pack", price: 1_000_000 }, { slug: "rush-masters", name: "Rush masters", price: 0, quote: true },
    ]));
    expect(mix.body.total).toBe(11_500_000);
    const ep = await c.post("/api/quote", draft(EP, monday(), S1, { extras: ["album-art", "independent-distribution", "pr-campaign", "exclusive-concierge", "studio-snacks"] }));
    expect(ep.body.extrasList.filter((e: any) => e.quote).map((e: any) => e.slug).sort()).toEqual(["album-art", "independent-distribution", "pr-campaign"]);
    expect(ep.body.extrasList.every((e: any) => !e.quote || e.price === 0)).toBe(true);
    expect(ep.body.total).toBe(151_234_500);
    expect(ep.body.deposit).toBe(75_620_000);
    expect(ep.body.packagePrice).toBe(150_000_000);
  });
  it("stores the add-ons on the booking and tells staff which ones still need a price", async () => {
    const date = monday();
    const { client, email } = await h.newClient();
    const hold = await client.post("/api/holds", draft(EP, date, S1, { contactEmail: email, extras: ["album-art", "pr-campaign", "exclusive-concierge"] }));
    const req = await client.post("/api/requests", { holdId: hold.body.holdId });
    expect(req.status).toBe(200);
    const stored = JSON.parse((await row(req.body.booking.id)).extras);
    expect(stored).toEqual(expect.arrayContaining([{ slug: "album-art", name: "Album art", price: 0, quote: true }, { slug: "pr-campaign", name: "PR campaign", price: 0, quote: true }]));
    expect((await row(req.body.booking.id)).total_kobo).toBe(151_234_500);
    const staffMail = await mailTo("uririnathaniel@gmail.com", "Booking request%");
    expect(staffMail).toContain("Add-ons to quote: Album art, PR campaign");
    const clientMail = await mailTo(email, "Request received%");
    expect(clientMail).toContain("Add-ons: ");
    expect(clientMail).toContain("Album art (price on request)");
    expect(clientMail).toContain("Exclusive concierge (₦12,345)");
  });
  it("charges extra hours on flex packages only", async () => {
    const date = monday();
    const r = await boss.post("/api/admin/bookings", manual(PODCAST, date, S1, { extraHours: 2 }));
    expect(r.status).toBe(200);
    const stored = await row(r.body.id);
    expect(stored).toMatchObject({ total_kobo: 6_000_000, start_min: 600, end_min: 780, scheduling: "flex", slot_kind: "", slot_label: "" });
    expect(JSON.parse(stored.extras)).toEqual([{ slug: "extra-hours", name: "Extra time (2 hr)", price: 4_000_000 }]);
  });
});

describe("day packages (EP and album)", () => {
  it("goes from request to approval to payment, holding the whole day throughout", async () => {
    const date = monday();
    const { client, email } = await h.newClient();
    const hold = await client.post("/api/holds", draft(EP, date, S1, { contactEmail: email, extras: ["album-art", "exclusive-concierge"] }));
    expect(hold.status).toBe(200);
    const direct = await client.post("/api/checkout", { holdId: hold.body.holdId, plan: "full" });
    expect(direct.status).toBe(400);
    expect(direct.body.error).toMatch(/studio approval/);
    const req = await client.post("/api/requests", { holdId: hold.body.holdId });
    expect(req.status).toBe(200);
    const id = req.body.booking.id;
    expect(req.body.booking).toMatchObject({ status: "pending", scheduling: "day", slot_label: "Whole day", start_min: 600, end_min: 1140, total_kobo: 151_234_500, paid_kobo: 0 });
    const pending = await row(id);
    expect(pending).toMatchObject({ room_id: "room_studio_a", slot_kind: "day", revision_limit: 3, due_date: null, deposit_kobo: 75_620_000 });
    const left = new Date(pending.expires_at).getTime() - Date.now();
    expect(left).toBeGreaterThan(47 * 3_600_000);
    expect(left).toBeLessThanOrEqual(48 * 3_600_000);
    for (const start of [S1, S2, S3, S4]) expect((await h.client().post("/api/holds", draft(REC, date, start))).status, `${start}`).toBe(409);
    expect((await h.client().get(`/api/availability/day?date=${date}&package=pkg_produce_ep`)).body.slots[0].available).toBe(false);
    const received = await mailTo(email, "Request received%");
    expect(received).toContain("Room: Studio A");
    expect(received).toContain("Time: 10:00am to 7:00pm");

    expect((await boss.post(`/api/admin/bookings/${id}/approve`, { note: "See you then" })).status).toBe(200);
    const approved = await row(id);
    expect(approved.status).toBe("approved");
    const window = new Date(approved.expires_at).getTime() - Date.now();
    expect(window).toBeGreaterThan(23 * 3_600_000);
    expect(window).toBeLessThanOrEqual(24 * 3_600_000);
    expect(await mailTo(email, "Approved, pay to confirm%")).toContain("Deposit to secure it: ₦756,200");
    const page = await client.get(`/api/pay/${id}`);
    expect(page.body.due).toEqual({ full: 151_234_500, deposit: 75_620_000, kind: "approval" });

    const pay = await client.post(`/api/pay/${id}`, { plan: "deposit" });
    expect(pay.body.amount).toBe(75_620_000);
    expect((await h.payDemo(client, pay.body.reference)).body.status).toBe("confirmed");
    expect(await row(id)).toMatchObject({ status: "confirmed", amount_paid_kobo: 75_620_000, expires_at: null });
    expect(await mailTo(email, "You're booked%")).toContain("Time: 10:00am to 7:00pm");
    expect((await h.client().post("/api/holds", draft(REC, date, S3))).status).toBe(409);

    const rest = await client.post(`/api/pay/${id}`, { plan: "full" });
    expect(rest.body.amount).toBe(75_614_500);
    await h.payDemo(client, rest.body.reference);
    expect(await row(id)).toMatchObject({ amount_paid_kobo: 151_234_500 });
  });
  it("frees the day when staff decline the request or the client withdraws it", async () => {
    const date = monday();
    const { client, email } = await h.newClient();
    const first = await client.post("/api/holds", draft(EP, date, S1, { contactEmail: email }));
    const req = await client.post("/api/requests", { holdId: first.body.holdId });
    expect((await h.client().post("/api/holds", draft(REC, date, S2))).status).toBe(409);
    expect((await boss.post(`/api/admin/bookings/${req.body.booking.id}/reject`, { reason: "Studio is closed that week" })).status).toBe(200);
    expect(await mailTo(email, "About your booking request%")).toContain("Sorry, the studio could not take your request for");
    const again = await h.client().post("/api/holds", draft(EP, date, S1));
    expect(again.status).toBe(200);
    await h.client().del(`/api/holds/${again.body.holdId}`);
    const second = await client.post("/api/holds", draft(EP, date, S1, { contactEmail: email }));
    const req2 = await client.post("/api/requests", { holdId: second.body.holdId });
    expect((await client.post(`/api/account/bookings/${req2.body.booking.id}/withdraw`)).status).toBe(200);
    expect((await h.client().post("/api/holds", draft(REC, date, S2))).status).toBe(200);
  });
  it("sells the album the same way at its own price", async () => {
    const { client, email } = await h.newClient();
    const hold = await client.post("/api/holds", draft(ALBUM, monday(), S1, { contactEmail: email }));
    expect(hold.body.draft).toMatchObject({ total: 250_000_000, deposit: 125_000_000, tracks: 12, revisionLimit: 3, requiresApproval: true, unit: "for 12 tracks" });
    const req = await client.post("/api/requests", { holdId: hold.body.holdId });
    expect(req.body.booking).toMatchObject({ status: "pending", total_kobo: 250_000_000 });
  });
  it("lets staff create an approved day booking that waits for payment", async () => {
    const date = monday();
    const r = await boss.post("/api/admin/bookings", manual(EP, date, S1, { status: "approved", notify: true, contactEmail: "label@example.com" }));
    expect(r.status).toBe(200);
    expect(await row(r.body.id)).toMatchObject({ status: "approved", scheduling: "day", start_min: 600, end_min: 1140 });
    expect(await mailTo("label@example.com", "Approved, pay to confirm%")).toContain("Time: 10:00am to 7:00pm");
    expect((await boss.post("/api/admin/bookings", manual(EP, date, S1))).status).toBe(409);
  });
});

describe("remote orders", () => {
  it("are paid for without a room or a time, and carry a delivery date", async () => {
    const today = studioNow().date;
    const { id, email, booking, hold } = await book(draft(EXPRESS, "", 0));
    expect(hold.draft).toMatchObject({ scheduling: "project", roomId: "", dueDate: addDays(today, 1), turnaroundDays: 1, revisionLimit: 3 });
    expect(booking).toMatchObject({ scheduling: "project", room_name: "", date: today, start_min: 0, end_min: 0, due_date: addDays(today, 1), status: "confirmed", total_kobo: 17_000_000, paid_kobo: 17_000_000 });
    expect(await row(id)).toMatchObject({ room_id: null, room_name: "", scheduling: "project", slot_kind: "", slot_label: "", revision_limit: 3, revisions_used: 0, delivered_final_at: null, due_date: addDays(today, 1) });
    const mail = await mailTo(email, "Order confirmed%");
    expect(mail).toContain("Order placed:");
    expect(mail).toContain("Delivery due:");
    expect(mail).not.toMatch(/Room:|Time:|Date:/);
    expect(mail).toContain("Upload your files");
    expect(mail).toContain(`/account/bookings/${id}`);
    expect(mail).toContain("We never send finished work by email");
    expect(mail).toContain("Payment status: paid in full");
  });
  it("count seven days for standard mixing and nothing for a beat", async () => {
    const today = studioNow().date;
    expect((await book(draft(MIX, "", 0))).booking.due_date).toBe(addDays(today, 7));
    const beat = await book(draft(BEAT, "", 0));
    expect(beat.booking.due_date).toBeNull();
    expect(await mailTo(beat.email, "Order confirmed%")).not.toContain("Delivery due");
  });
  it("start the clock when the order is paid, even if the hold was made the evening before", async () => {
    const { client, email } = await h.newClient();
    const day = addDays(studioNow().date, 3);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(`${day}T22:55:00Z`));
    const hold = await client.post("/api/holds", draft(MIX, "", 0, { contactEmail: email }));
    expect(hold.body.draft).toMatchObject({ date: day, dueDate: addDays(day, 7) });
    const co = await client.post("/api/checkout", { holdId: hold.body.holdId, plan: "full" });
    vi.setSystemTime(new Date(`${day}T23:05:00Z`));
    const paid = await h.payDemo(client, co.body.reference);
    expect(paid.body.booking).toMatchObject({ date: addDays(day, 1), due_date: addDays(day, 8), start_min: 0 });
  });
  it("show up in the client's account with their scheduling fields", async () => {
    const { client, id } = await book(draft(EXPRESS, "", 0));
    const overview = await client.get("/api/account/overview");
    expect(overview.body.bookings.find((b: any) => b.id === id)).toMatchObject({ scheduling: "project", room_id: null, due_date: expect.any(String), revision_limit: 3 });
    const detail = await client.get(`/api/account/bookings/${id}`);
    expect(detail.body.policy).toEqual({ freeReschedule: false, refundShare: 1, refundAmount: 17_000_000 });
  });
  it("cannot be marked completed or no-show by hand", async () => {
    const { id } = await book(draft(MIX, "", 0));
    for (const outcome of ["completed", "no_show"]) {
      const r = await boss.post(`/api/admin/bookings/${id}/outcome`, { outcome });
      expect(r.status).toBe(400);
      expect(r.body.error).toMatch(/remote order/i);
    }
    expect((await row(id)).status).toBe("confirmed");
  });
  it("can be created by staff without a date, and wait for approval when the package asks for it", async () => {
    const r = await boss.post("/api/admin/bookings", { ...BEAT, ...who, status: "confirmed", source: "whatsapp", ignoreHours: false, notify: true, payment: { amount: 10_000_000, method: "transfer", note: "Bank ref 4471" } });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(await row(r.body.id)).toMatchObject({ scheduling: "project", room_id: null, status: "confirmed", amount_paid_kobo: 10_000_000, date: studioNow().date, source: "whatsapp" });
    expect(await mailTo("kemi@example.com", "Order confirmed%")).toContain("Create a free account with kemi@example.com");
  });
});

describe("staff bookings", () => {
  it("books sessions by hand and still refuses a clash or an invalid start", async () => {
    const date = monday();
    const r = await boss.post("/api/admin/bookings", manual(REC, date, S4, { payment: { amount: 8_000_000, method: "cash", note: "" } }));
    expect(r.status).toBe(200);
    expect(await row(r.body.id)).toMatchObject({ scheduling: "slot", slot_label: "Session 4", start_min: 1020, end_min: 1140, status: "confirmed", amount_paid_kobo: 8_000_000, source: "phone" });
    expect((await boss.post("/api/admin/bookings", manual(REC, date, S4))).status).toBe(409);
    const bad = await boss.post("/api/admin/bookings", manual(REC, date, S4 + 30));
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/open sessions/);
    expect((await boss.post("/api/admin/bookings", manual(REC, date, S3))).status).toBe(200);
  });
  it("books the all night session by hand and says it ends on Sunday", async () => {
    const sat = saturday();
    const r = await boss.post("/api/admin/bookings", manual(FULL, sat, NIGHT, { notify: true, contactEmail: "night@example.com" }));
    expect(r.status).toBe(200);
    expect(await row(r.body.id)).toMatchObject({ slot_kind: "night", start_min: 1380, end_min: 1740, due_date: addDays(sat, 7) });
    expect(await mailTo("night@example.com", "You're booked%")).toContain("Time: 11:00pm to 5:00am (Sunday)");
    expect((await boss.post("/api/admin/bookings", manual(FULL, addDays(sat, 1), NIGHT))).status).toBe(400);
  });
  it("keeps flex packages working: podcast, stage and photo, extra hours, clashes and opening hours", async () => {
    const date = monday();
    const podcast = await boss.post("/api/admin/bookings", manual(PODCAST, date, S1));
    expect(podcast.status).toBe(200);
    expect(await row(podcast.body.id)).toMatchObject({ scheduling: "flex", room_id: "room_podcast", start_min: 600, end_min: 660, total_kobo: 2_000_000, slot_label: "", due_date: null });
    expect((await boss.post("/api/admin/bookings", manual(PODCAST, date, 660))).status).toBe(409);
    expect((await boss.post("/api/admin/bookings", manual(PODCAST, date, 690))).status).toBe(200);
    expect((await boss.post("/api/admin/bookings", manual(PODCAST, date, 1200))).status).toBe(400);
    expect((await boss.post("/api/admin/bookings", manual(PODCAST, date, 1200, { ignoreHours: true }))).status).toBe(200);
    const stage = await boss.post("/api/admin/bookings", manual(STAGE, date, S1));
    expect(await row(stage.body.id)).toMatchObject({ room_id: "room_stage", start_min: 600, end_min: 840, total_kobo: 15_000_000 });
    expect((await boss.post("/api/admin/bookings", manual(PHOTO, date, 840, { extraHours: 1 }))).status).toBe(409);
    const photo = await boss.post("/api/admin/bookings", manual(PHOTO, date, 870, { extraHours: 1 }));
    expect(await row(photo.body.id)).toMatchObject({ room_id: "room_stage", start_min: 870, end_min: 1050, total_kobo: 11_000_000 });
    const grid = await h.client().get(`/api/availability/day?date=${date}&duration=120&room=room_podcast`);
    expect(grid.body.slots.find((s: any) => s.start === 600).available).toBe(false);
    expect(grid.body.slots.find((s: any) => s.start === 900).available).toBe(true);
  });
  it("lets different rooms run at the same time", async () => {
    const date = monday();
    expect((await boss.post("/api/admin/bookings", manual(REC, date, S1))).status).toBe(200);
    expect((await boss.post("/api/admin/bookings", manual(PODCAST, date, S1))).status).toBe(200);
    expect((await boss.post("/api/admin/bookings", manual(PHOTO, date, S1))).status).toBe(200);
  });
});

describe("moving bookings", () => {
  const move = (id: string, date: string, start: number) => boss.post(`/api/admin/bookings/${id}/reschedule`, { date, start });
  const pretty = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

  it("moves a session only to another open session, and never onto a taken one", async () => {
    const date = monday(), other = monday();
    const { id, email } = await book(draft(REC, date, S1));
    for (const start of [0, 630, 780, 1139, NIGHT]) expect((await move(id, other, start)).status, `${start}`).toBe(400);
    expect((await h.client().post("/api/holds", draft(REC, other, S3))).status).toBe(200);
    expect((await move(id, other, S3)).status).toBe(409);
    expect(await row(id)).toMatchObject({ date, start_min: S1 });
    expect((await move(id, other, S2)).status).toBe(200);
    expect(await row(id)).toMatchObject({ date: other, start_min: 750, end_min: 840, slot_label: "Session 2", total_kobo: 8_000_000, reschedules_used: 0 });
    const mail = await mailTo(email, "Your session has moved%");
    expect(mail).toContain(`Was: ${pretty(date)}, 10:00am to 12:00pm`);
    expect(mail).toContain(`Now: ${pretty(other)}, 12:30pm to 2:00pm`);
    expect((await h.client().post("/api/holds", draft(REC, date, S1))).status).toBe(200);
  });
  it("moves the all night session to another Saturday only, and moves its delivery date with it", async () => {
    const sat = saturday(), sat2 = saturday();
    const { id, email } = await book(draft(FULL, sat, NIGHT));
    for (const d of [addDays(sat, 1), addDays(sat, 3), addDays(sat, -1)]) expect((await move(id, d, NIGHT)).status, d).toBe(400);
    expect((await move(id, sat2, 600)).status).toBe(400);
    expect((await move(id, sat2, NIGHT)).status).toBe(200);
    expect(await row(id)).toMatchObject({ date: sat2, start_min: 1380, end_min: 1740, slot_label: "All night session", due_date: addDays(sat2, 7) });
    expect(await mailTo(email, "Your session has moved%")).toContain(`Now: ${pretty(sat2)}, 11:00pm to 5:00am (Sunday)`);
    expect((await h.client().post("/api/holds", draft(FULL, sat, NIGHT))).status).toBe(200);
  });
  it("moves a day booking to any free whole day", async () => {
    const date = monday(), other = monday(), busy = monday();
    const made = await boss.post("/api/admin/bookings", manual(EP, date, S1));
    expect(made.status).toBe(200);
    expect((await move(made.body.id, other, S2)).status).toBe(400);
    expect((await h.client().post("/api/holds", draft(REC, busy, S4))).status).toBe(200);
    expect((await move(made.body.id, busy, S1)).status).toBe(409);
    expect((await move(made.body.id, other, S1)).status).toBe(200);
    expect(await row(made.body.id)).toMatchObject({ date: other, start_min: 600, end_min: 1140, slot_label: "Whole day" });
    expect((await h.client().post("/api/holds", draft(REC, date, S2))).status).toBe(200);
    expect((await h.client().post("/api/holds", draft(REC, other, S2))).status).toBe(409);
  });
  it("never moves a remote order", async () => {
    const { id } = await book(draft(MIX, "", 0));
    const r = await move(id, monday(), 0);
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/no session time to move/);
    expect(await row(id)).toMatchObject({ date: studioNow().date, start_min: 0 });
  });
  it("keeps a flex booking inside opening hours and clear of its room's other bookings", async () => {
    const date = monday(), other = monday();
    const made = await boss.post("/api/admin/bookings", manual(PODCAST, date, S1));
    expect((await move(made.body.id, other, 1200)).status).toBe(400);
    expect((await boss.post("/api/admin/bookings", manual(PODCAST, other, 900))).status).toBe(200);
    expect((await move(made.body.id, other, 900)).status).toBe(409);
    expect((await move(made.body.id, other, 1020)).status).toBe(200);
    expect(await row(made.body.id)).toMatchObject({ date: other, start_min: 1020, end_min: 1080, slot_label: "", scheduling: "flex" });
  });
  it("keeps staff moves out of the past but lets them skip the notice period that clients must give", async () => {
    const { id: first, client } = await book(draft(REC, monday(), S3));
    const { id: second } = await book(draft(REC, monday(), S3));
    const soon = addDays(studioNow().date, 2);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(`${soon}T07:30:00Z`));
    const ask = await client.post(`/api/account/bookings/${first}/requests`, { kind: "reschedule", newDate: soon, newStart: S1, reason: "" });
    expect(ask.status).toBe(400);
    expect(ask.body.error).toMatch(/too soon/);
    expect((await move(second, soon, S1)).status).toBe(200);
    vi.setSystemTime(new Date(`${soon}T09:30:00Z`));
    expect((await move(first, soon, S2)).status).toBe(200);
    const started = await move(first, soon, S1);
    expect(started.status).toBe(400);
    expect(started.body.error).toMatch(/too soon/);
    vi.setSystemTime(new Date(`${soon}T12:00:00Z`));
    expect((await move(second, soon, S2)).status).toBe(400);
    expect((await move(second, addDays(soon, -3), S3)).status).toBe(400);
    expect(await row(second)).toMatchObject({ date: soon, start_min: S1 });
  });
  it("lets only one of two simultaneous moves into the same session win", async () => {
    const target = monday();
    const one = await book(draft(REC, monday(), S1));
    const two = await book(draft(REC, monday(), S1));
    const [a, b] = await Promise.all([move(one.id, target, S4), move(two.id, target, S4)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const at = await h.sql("SELECT COUNT(*) n FROM bookings WHERE date = ? AND start_min = ? AND status = 'confirmed'", target, S4);
    expect(at[0].n).toBe(1);
  });
});

describe("change requests and cancellations", () => {
  it("checks a client's reschedule request against the booking, then moves it when staff approve", async () => {
    const date = monday(), other = monday();
    const { id, client } = await book(draft(REC, date, S2));
    const ask = (body: Record<string, unknown>) => client.post(`/api/account/bookings/${id}/requests`, { reason: "", ...body });
    expect((await ask({ kind: "reschedule", newDate: other, newStart: 780 })).status).toBe(400);
    expect((await ask({ kind: "reschedule", newDate: date, newStart: S2 })).status).toBe(400);
    expect((await ask({ kind: "reschedule", newDate: "2026-02-30", newStart: S2 })).status).toBe(400);
    expect((await ask({ kind: "reschedule", newStart: S2 })).status).toBe(400);
    expect((await h.client().post("/api/holds", draft(REC, other, S4))).status).toBe(200);
    expect((await ask({ kind: "reschedule", newDate: other, newStart: S4 })).status).toBe(409);
    expect((await ask({ kind: "reschedule", newDate: other, newStart: S3, reason: "Clash with work" })).status).toBe(200);
    expect((await ask({ kind: "cancel" })).status).toBe(409);
    const before = await client.get(`/api/account/bookings/${id}`);
    expect(before.body.policy.freeReschedule).toBe(true);
    const pending = (await boss.get("/api/admin/requests")).body.find((r: any) => r.booking_id === id);
    expect(pending).toMatchObject({ kind: "reschedule", new_date: other, new_start_min: S3 });
    expect((await boss.post(`/api/admin/requests/${pending.id}`, { approve: true })).status).toBe(200);
    expect(await row(id)).toMatchObject({ date: other, start_min: 870, end_min: 990, slot_label: "Session 3", reschedules_used: 1 });
    expect((await client.get(`/api/account/bookings/${id}`)).body.policy.freeReschedule).toBe(false);
  });
  it("keeps a request for a time that has since been taken pending and tells staff why", async () => {
    const date = monday(), other = monday();
    const { id, client } = await book(draft(REC, date, S1));
    expect((await client.post(`/api/account/bookings/${id}/requests`, { kind: "reschedule", newDate: other, newStart: S2, reason: "" })).status).toBe(200);
    expect((await h.client().post("/api/holds", draft(REC, other, S2))).status).toBe(200);
    const pending = (await boss.get("/api/admin/requests")).body.find((r: any) => r.booking_id === id);
    const approve = await boss.post(`/api/admin/requests/${pending.id}`, { approve: true });
    expect(approve.status).toBe(409);
    expect(await row(id)).toMatchObject({ date, start_min: S1 });
    expect((await boss.get("/api/admin/requests")).body.some((r: any) => r.id === pending.id)).toBe(true);
  });
  it("lets a remote order be cancelled for a full refund until work is delivered, but not rescheduled", async () => {
    const { id, client, email } = await book(draft(MIX, "", 0));
    const ask = (body: Record<string, unknown>) => client.post(`/api/account/bookings/${id}/requests`, { reason: "", ...body });
    const nope = await ask({ kind: "reschedule", newDate: monday(), newStart: 0 });
    expect(nope.status).toBe(400);
    expect(nope.body.error).toMatch(/no session time to move/);
    expect((await ask({ kind: "reschedule" })).status).toBe(400);
    expect((await ask({ kind: "cancel", reason: "Changed my mind" })).status).toBe(200);
    const pending = (await boss.get("/api/admin/requests")).body.find((r: any) => r.booking_id === id);
    expect((await boss.post(`/api/admin/requests/${pending.id}`, { approve: true })).status).toBe(200);
    expect(await row(id)).toMatchObject({ status: "cancelled", refunded_kobo: 10_000_000 });
    expect(await mailTo(email, "Booking cancelled%")).toContain("₦100,000 is being refunded");
  });
  it("stops refunding a remote order in full once the first delivery is published", async () => {
    const { id, client } = await book(draft(MIX, "", 0));
    await h.sql("INSERT INTO booking_files (id, booking_id, direction, title, name, r2_key, state, delivered_at) VALUES (?, ?, 'delivery', 'Master', 'master.wav', ?, 'ready', '2026-10-23T10:00:00.000Z')", `file-${id}`, id, `portal/${id}/file`);
    expect((await client.get(`/api/account/bookings/${id}`)).body.policy).toMatchObject({ refundShare: 0, refundAmount: 0 });
    const cancelled = await boss.post(`/api/admin/bookings/${id}/cancel`, { reason: "Client asked", fullRefund: false });
    expect(cancelled.body).toEqual({ refund: 0, manual: 0 });
    const second = await book(draft(MIX, "", 0));
    await h.sql("INSERT INTO booking_files (id, booking_id, direction, title, name, r2_key, state, delivered_at) VALUES (?, ?, 'delivery', 'Master', 'master.wav', ?, 'ready', '2026-10-23T10:00:00.000Z')", `file-${second.id}`, second.id, `portal/${second.id}/file`);
    const override = await boss.post(`/api/admin/bookings/${second.id}/cancel`, { reason: "Our delay", fullRefund: true });
    expect(override.body.refund).toBe(10_000_000);
  });
  it("keeps the refund policy for sessions: full more than 72 hours out, and the slot is free again", async () => {
    const date = monday();
    const { id } = await book(draft(REC, date, S4));
    const cancelled = await boss.post(`/api/admin/bookings/${id}/cancel`, { reason: "Client asked", fullRefund: false });
    expect(cancelled.body).toEqual({ refund: 8_000_000, manual: 0 });
    expect(await row(id)).toMatchObject({ status: "cancelled", refunded_kobo: 8_000_000 });
    expect((await h.client().post("/api/holds", draft(REC, date, S4))).status).toBe(200);
  });
  it("refunds half between 24 and 72 hours before the all night session, and nothing within 24 hours", async () => {
    const half = await book(draft(FULL, saturday(), NIGHT));
    const today = studioNow().date;
    await h.sql("UPDATE bookings SET date = ? WHERE id = ?", addDays(today, 2), half.id);
    expect((await boss.post(`/api/admin/bookings/${half.id}/cancel`, { reason: "Late change", fullRefund: false })).body.refund).toBe(14_000_000);
    const none = await book(draft(FULL, saturday(), NIGHT));
    await h.sql("UPDATE bookings SET date = ? WHERE id = ?", today, none.id);
    expect((await boss.post(`/api/admin/bookings/${none.id}/cancel`, { reason: "Same day", fullRefund: false })).body.refund).toBe(0);
  });
});
