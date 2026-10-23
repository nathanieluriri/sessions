import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createHarness, nextWeekday, type Client, type Harness } from "../helpers/harness";
import { addDays } from "../../src/worker/lib/time";
import { bookingService } from "../../src/worker/services/bookings";

vi.setConfig({ testTimeout: 60_000 });
let h: Harness;
let boss: Client;
beforeAll(async () => { h = await createHarness(); boss = await h.ceo(); }, 120000);
afterAll(() => h?.dispose());
afterEach(() => vi.useRealTimers());

const used: Record<number, number> = {};
const fresh = (wd: number) => nextWeekday(wd, 8 + 7 * (used[wd] = (used[wd] ?? -1) + 1));
const who = { artistName: "Kemi B", contactName: "Kemi Balogun", contactEmail: "kemi@example.com", contactPhone: "+234 805 111 2233" };
const REC = { serviceSlug: "recording", packageId: "pkg_recording_session" };
const FULL = { serviceSlug: "full-production", packageId: "pkg_full_production" };
const EP = { serviceSlug: "produce-ep", packageId: "pkg_produce_ep" };
const draft = (pkg: object, date: string, start: number, over: Record<string, unknown> = {}) =>
  ({ ...pkg, date, start, extraHours: 0, extras: [], people: 2, project: "", notes: "", links: "", ...who, ...over });
const manual = (pkg: object, date: string, start: number, over: Record<string, unknown> = {}) =>
  ({ ...draft(pkg, date, start), status: "confirmed", source: "phone", ignoreHours: false, notify: false, payment: null, ...over });
const occupying = (date: string) => h.sql("SELECT ref, package_name, status, start_min, end_min, amount_paid_kobo FROM bookings WHERE date = ? AND status IN ('confirmed','pending','approved') ORDER BY start_min", date);

async function book(body: Record<string, unknown>) {
  const { client, email } = await h.newClient();
  const hold = await client.post("/api/holds", { ...body, contactEmail: email });
  expect(hold.status, JSON.stringify(hold.body)).toBe(200);
  const co = await client.post("/api/checkout", { holdId: hold.body.holdId, plan: "full" });
  const paid = await h.payDemo(client, co.body.reference);
  return { client, paid: paid.body };
}

describe("critic p2c", () => {
  it("A: late payment on an approved EP whose window lapsed (before the 5 minute sweep) after the day was sold", async () => {
    const date = fresh(2);
    const { client, email } = await h.newClient();
    const hold = await client.post("/api/holds", draft(EP, date, 600, { contactEmail: email }));
    const req = await client.post("/api/requests", { holdId: hold.body.holdId });
    const id = req.body.booking.id;
    expect((await boss.post(`/api/admin/bookings/${id}/approve`, {})).status).toBe(200);
    const pay = await client.post(`/api/pay/${id}`, { plan: "deposit" });
    expect(pay.status).toBe(200);
    await h.sql("UPDATE bookings SET expires_at = ? WHERE id = ?", new Date(Date.now() - 60_000).toISOString(), id);
    const other = await book(draft(REC, date, 600));
    expect(other.paid.status).toBe("confirmed");
    const late = await h.payDemo(client, pay.body.reference);
    console.log("A late EP payment:", late.body.status, JSON.stringify(await occupying(date)));
  });

  it("B: staff approve a pending request that already lapsed after the day was sold", async () => {
    const date = fresh(3);
    const { client, email } = await h.newClient();
    const hold = await client.post("/api/holds", draft(EP, date, 600, { contactEmail: email }));
    const id = (await client.post("/api/requests", { holdId: hold.body.holdId })).body.booking.id;
    await h.sql("UPDATE bookings SET expires_at = ? WHERE id = ?", new Date(Date.now() - 60_000).toISOString(), id);
    const other = await book(draft(REC, date, 870));
    expect(other.paid.status).toBe("confirmed");
    const ap = await boss.post(`/api/admin/bookings/${id}/approve`, {});
    console.log("B approve stale:", ap.status, JSON.stringify(ap.body));
    const conf = await boss.post(`/api/admin/bookings/${id}/confirm`, {});
    console.log("B confirm stale:", conf.status, JSON.stringify(await occupying(date)));
  });

  it("C: two lapsed holds on one session both paid late at the same moment", async () => {
    const date = fresh(4);
    const mk = async () => {
      const { client, email } = await h.newClient();
      const hold = await client.post("/api/holds", draft(REC, date, 750, { contactEmail: email }));
      expect(hold.status, JSON.stringify(hold.body)).toBe(200);
      const co = await client.post("/api/checkout", { holdId: hold.body.holdId, plan: "full" });
      await h.sql("UPDATE holds SET expires_at = ? WHERE id = ?", new Date(Date.now() - 60_000).toISOString(), hold.body.holdId);
      await client.post(`/api/payments/demo/${co.body.reference}`, { outcome: "success", channel: "card" });
      return { client, ref: co.body.reference };
    };
    const a = await mk(); const b = await mk();
    const [ra, rb] = await Promise.all([a.client.get(`/api/payments/verify?reference=${a.ref}`), b.client.get(`/api/payments/verify?reference=${b.ref}`)]);
    console.log("C:", ra.body.status, rb.body.status, JSON.stringify(await occupying(date)));
  });

  it("D: completing a full production order before its Saturday frees the night", async () => {
    const sat = fresh(6);
    const { client, paid } = await book(draft(FULL, sat, 1380));
    const id = paid.booking.id;
    const data = new Uint8Array(1000);
    const begun = await boss.post(`/api/admin/bookings/${id}/files`, { name: "beat.mp3", size: data.length, contentType: "audio/mpeg" });
    await boss.call("PUT", `/api/admin/files/${begun.body.id}/parts/1`, { raw: data });
    await boss.post(`/api/admin/files/${begun.body.id}/complete`);
    const del = await boss.post(`/api/admin/bookings/${id}/deliver`, { items: [{ fileId: begun.body.id, title: "Beat" }], note: "" });
    console.log("D deliver:", del.status);
    const ap = await client.post(`/api/account/bookings/${id}/approve`);
    console.log("D approve:", ap.status, JSON.stringify(ap.body));
    const avail = await h.client().get(`/api/availability/day?date=${sat}&package=pkg_full_production`);
    const second = await h.client().post("/api/holds", draft(FULL, sat, 1380));
    console.log("D second hold:", second.status, "available:", avail.body.slots[0].available, JSON.stringify(await h.sql("SELECT status, delivered_final_at FROM bookings WHERE id = ?", id)));
  });

  it("E: paying the same hold twice", async () => {
    const date = fresh(5);
    const { client, email } = await h.newClient();
    const hold = await client.post("/api/holds", draft(REC, date, 1020, { contactEmail: email }));
    const c1 = await client.post("/api/checkout", { holdId: hold.body.holdId, plan: "full" });
    const c2 = await client.post("/api/checkout", { holdId: hold.body.holdId, plan: "full" });
    await h.payDemo(client, c1.body.reference);
    const r2 = await h.payDemo(client, c2.body.reference);
    console.log("E:", r2.body.status, JSON.stringify(await h.sql("SELECT total_kobo, amount_paid_kobo FROM bookings WHERE hold_id = ?", hold.body.holdId)));
  });

  it("F: forged inputs", async () => {
    const date = fresh(1), sat = fresh(6);
    const c = h.client();
    const q = async (b: object) => { const r = await c.post("/api/quote", b); return [r.status, r.body.error ?? r.body.total, r.body.start, r.body.duration]; };
    const out: Record<string, unknown> = {};
    for (const s of [601, 599, -1, 1440, 1380, 1740, 720, 600.5]) out[`rec ${s}`] = await q(draft(REC, date, s));
    for (const s of [600, 1380, 1381, 1379]) out[`full sat ${s}`] = await q(draft(FULL, sat, s));
    out["full sun 1380"] = await q(draft(FULL, addDays(sat, 1), 1380));
    out["full fri 1380"] = await q(draft(FULL, addDays(sat, -1), 1380));
    for (const s of [750, 1020, 1380]) out[`ep ${s}`] = await q(draft(EP, date, s));
    out["rec exclusive extra"] = await q(draft(REC, date, 600, { extras: ["album-art", "pr-campaign"] }));
    out["ep extras dup"] = await q(draft(EP, date, 600, { extras: ["album-art", "album-art"] }));
    out["rec people 0"] = await q(draft(REC, date, 600, { people: 0 }));
    out["rec extraHours"] = await q(draft(REC, date, 600, { extraHours: 1 }));
    out["artist dev"] = await q(draft({ serviceSlug: "artist-development", packageId: "pkg_artist_development" }, "", 0));
    out["ep wrong service"] = await q(draft({ serviceSlug: "recording", packageId: "pkg_produce_ep" }, date, 600));
    out["full via recording svc"] = await q(draft({ serviceSlug: "recording", packageId: "pkg_full_production" }, sat, 1380));
    out["full date 2026-02-30"] = await q(draft(FULL, "2026-02-30", 1380));
    console.log("F:", JSON.stringify(out, null, 0));
  });

  it("G: month agrees with day for every package across a busy month", async () => {
    const sat = fresh(6);
    const month = sat.slice(0, 7);
    // Saturday Session 4 and a Sunday Session 1, a block on Sunday 00:00 to 01:00, and a day sold out.
    await boss.post("/api/admin/bookings", manual(REC, sat, 1020));
    const sun = addDays(sat, 1);
    await boss.post("/api/admin/bookings", manual(REC, sun, 600));
    const mon = addDays(sat, 2);
    for (const s of [600, 750, 870]) await boss.post("/api/admin/bookings", manual(REC, mon, s));
    const results: string[] = [];
    for (const pkg of ["pkg_recording_session", "pkg_full_production", "pkg_produce_ep"]) {
      const m = (await h.client().get(`/api/availability/month?month=${month}&package=${pkg}`)).body;
      for (const d of m.days) {
        const day = (await h.client().get(`/api/availability/day?date=${d.date}&package=${pkg}`)).body;
        const free = day.slots.filter((s: any) => s.available).length;
        if (free !== d.free || (d.status === "available" || d.status === "limited") !== free > 0) results.push(`${pkg} ${d.date} month=${d.status}/${d.free} day=${free}`);
      }
    }
    const night = (await h.client().get(`/api/availability/day?date=${sat}&package=pkg_full_production`)).body.slots;
    const satRec = (await h.client().get(`/api/availability/day?date=${sat}&package=pkg_recording_session`)).body.slots.map((s: any) => s.available);
    const sunRec = (await h.client().get(`/api/availability/day?date=${sun}&package=pkg_recording_session`)).body.slots.map((s: any) => s.available);
    const monM = (await h.client().get(`/api/availability/month?month=${mon.slice(0, 7)}&package=pkg_recording_session`)).body.days.find((x: any) => x.date === mon);
    console.log("G mismatches:", JSON.stringify(results), "night:", JSON.stringify(night), "satRec", satRec, "sunRec", sunRec, "mon", JSON.stringify(monM));
    const nh = await h.client().post("/api/holds", draft(FULL, sat, 1380));
    console.log("G night hold beside Sat S4 and Sun S1:", nh.status);
    await h.sql("INSERT INTO blocked_periods (id, date, start_min, end_min, reason, room_id) VALUES ('blk1', ?, 0, 60, 'x', NULL)", addDays(sat, 8));
    const n2 = (await h.client().get(`/api/availability/day?date=${addDays(sat, 7)}&package=pkg_full_production`)).body.slots;
    const n2h = await h.client().post("/api/holds", draft(FULL, addDays(sat, 7), 1380));
    console.log("G block Sun 00:00-01:00:", JSON.stringify(n2), n2h.status);
  });

  it("H: today and minNotice on a Saturday afternoon, night window", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const sat = fresh(6);
    // 20:30 Lagos on the Saturday: night starts in 150 minutes, notice is 180 by default.
    const settings = await h.sql("SELECT key, value FROM settings WHERE key IN ('min_notice_min','book_ahead_days','buffer_min','hold_min')");
    vi.setSystemTime(new Date(Date.parse(`${sat}T00:00:00Z`) + (1230 - 60) * 60_000));
    const d1 = (await h.client().get(`/api/availability/day?date=${sat}&package=pkg_full_production`)).body;
    const h1 = await h.client().post("/api/holds", draft(FULL, sat, 1380));
    vi.setSystemTime(new Date(Date.parse(`${sat}T00:00:00Z`) + (1190 - 60) * 60_000));
    const d2 = (await h.client().get(`/api/availability/day?date=${sat}&package=pkg_full_production`)).body;
    const h2 = await h.client().post("/api/holds", draft(FULL, sat, 1380));
    // Sunday 00:30: Saturday is in the past, cannot book that night.
    vi.setSystemTime(new Date(Date.parse(`${sat}T00:00:00Z`) + (1470 - 60) * 60_000));
    const d3 = (await h.client().get(`/api/availability/day?date=${sat}&package=pkg_full_production`)).body;
    const h3 = await h.client().post("/api/holds", draft(FULL, sat, 1380));
    console.log("H:", JSON.stringify(settings), JSON.stringify(d1.slots), h1.status, JSON.stringify(d2.slots), h2.status, JSON.stringify(d3), h3.status);
  });

  it("I: project order money, deposit and dates at midnight Lagos", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // 23:59:30 Lagos Friday = 22:59:30 UTC
    vi.setSystemTime(new Date("2026-10-30T22:59:30Z"));
    const q = await h.client().post("/api/quote", draft({ serviceSlug: "mixing-mastering", packageId: "pkg_mm_express" }, "2020-01-01", 999, { people: 150 }));
    vi.setSystemTime(new Date("2026-10-30T23:00:30Z"));
    const q2 = await h.client().post("/api/quote", draft({ serviceSlug: "mixing-mastering", packageId: "pkg_mm_express" }, "", 0));
    const full = await h.client().post("/api/quote", draft(FULL, "2026-11-07", 1380, { extras: [] }));
    console.log("I:", q.status, q.body.date, q.body.dueDate, q.body.total, q.body.deposit, "|", q2.body.date, q2.body.dueDate, "| full", full.body.total, full.body.deposit, full.body.dueDate);
  });

  it("J: housekeeping cancels approved EP while payment in flight, then payment lands", async () => {
    const date = fresh(2);
    const { client, email } = await h.newClient();
    const hold = await client.post("/api/holds", draft(EP, date, 600, { contactEmail: email }));
    const id = (await client.post("/api/requests", { holdId: hold.body.holdId })).body.booking.id;
    await boss.post(`/api/admin/bookings/${id}/approve`, {});
    const pay = await client.post(`/api/pay/${id}`, { plan: "full" });
    await h.sql("UPDATE bookings SET expires_at = ? WHERE id = ?", new Date(Date.now() - 60_000).toISOString(), id);
    await bookingService.housekeeping(h.env);
    const late = await h.payDemo(client, pay.body.reference);
    console.log("J:", late.body.status, JSON.stringify(await h.sql("SELECT status, amount_paid_kobo, refunded_kobo FROM bookings WHERE id = ?", id)));
  });

  it("K: client reschedule request within 48h and second reschedule", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const date = fresh(3);
    const { client, paid } = await book(draft(REC, date, 600));
    const id = paid.booking.id;
    vi.setSystemTime(new Date(Date.parse(`${date}T00:00:00Z`) - 20 * 3_600_000));
    const r = await client.post(`/api/account/bookings/${id}/requests`, { kind: "reschedule", newDate: date, newStart: 1020, reason: "" });
    const det = await client.get(`/api/account/bookings/${id}`);
    console.log("K:", r.status, JSON.stringify(r.body), JSON.stringify(det.body.policy));
  });
});

describe("critic p2c round 2", () => {
  it("L: mixed concurrent holds EP vs sessions vs night", async () => {
    const date = fresh(1);
    const reqs = [
      ...Array.from({ length: 5 }, () => h.client().post("/api/holds", draft(EP, date, 600))),
      ...[600, 750, 870, 1020, 600, 750].map((s) => h.client().post("/api/holds", draft(REC, date, s))),
      boss.post("/api/admin/bookings", manual(EP, date, 600)),
    ];
    const res = await Promise.all(reqs);
    console.log("L statuses:", res.map((r) => r.status).join(","), JSON.stringify(await h.sql("SELECT start_min, end_min FROM holds WHERE date = ? AND status='active' UNION ALL SELECT start_min, end_min FROM bookings WHERE date = ?", date, date)));
  });

  it("M: emails, csv, calendar, overview for overnight and project", async () => {
    const sat = fresh(6);
    const { paid } = await book(draft(FULL, sat, 1380));
    const proj = await book(draft({ serviceSlug: "mixing-mastering", packageId: "pkg_mm_standard" }, "", 0));
    const b = (await h.sql("SELECT * FROM bookings WHERE id = ?", paid.booking.id))[0];
    const p = (await h.sql("SELECT * FROM bookings WHERE id = ?", proj.paid.booking.id))[0];
    const mails = await h.sql("SELECT to_email, subject, body FROM email_outbox WHERE to_email IN (?, ?) ORDER BY rowid", b.contact_email, p.contact_email);
    console.log("M mails:", JSON.stringify(mails));
    const staffMails = await h.sql("SELECT subject, body FROM email_outbox WHERE subject LIKE 'New booking%' ORDER BY rowid DESC LIMIT 2");
    console.log("M staff:", JSON.stringify(staffMails));
    const csv = await boss.call("GET", `/api/admin/reports.csv?from=${studioToday()}&to=${addDays(sat, 1)}`);
    console.log("M csv:", JSON.stringify(await csv.res.text()));
    const cal = await boss.get(`/api/admin/calendar?from=${addDays(sat, 1)}&to=${addDays(sat, 1)}`);
    console.log("M cal sunday:", JSON.stringify(cal.body.bookings));
    const ov = await boss.get("/api/admin/overview");
    console.log("M overview projects:", ov.body.projects, "todays", ov.body.todays.length);
    const rep = await boss.get(`/api/admin/reports?from=${studioToday()}&to=${addDays(sat, 1)}`);
    console.log("M report byRoom:", JSON.stringify(rep.body.byRoom));
  });

  it("N: flex staff manual bookings incl ignoreHours", async () => {
    const date = fresh(2);
    const r: Record<string, unknown> = {};
    const PODCAST = { serviceSlug: "podcast-recording", packageId: "pkg_podcast_hour" };
    const STAGE = { serviceSlug: "music-videos", packageId: "pkg_stage_half_day" };
    const PHOTO = { serviceSlug: "artist-portraits", packageId: "pkg_photo_session_2_hour" };
    for (const [n, pkg, s, ih] of [["pod 600", PODCAST, 600, false], ["pod 1260 noIgnore", PODCAST, 1260, false], ["pod 1260 ignore", PODCAST, 1260, true], ["stage 900", STAGE, 900, false], ["photo 630", PHOTO, 630, false], ["photo 1400 ignore", PHOTO, 1400, true], ["pod 1430 ignore", PODCAST, 1430, true]] as const) {
      const x = await boss.post("/api/admin/bookings", manual(pkg, date, s, { ignoreHours: ih }));
      r[n] = [x.status, x.body.error ?? `${x.body.start_min}-${x.body.end_min}`];
    }
    const past = await boss.post("/api/admin/bookings", manual(REC, "2026-10-01", 600));
    r["staff past slot"] = [past.status, past.body.error ?? past.body.status];
    const qp = await boss.post("/api/admin/bookings", manual({ serviceSlug: "artist-development", packageId: "pkg_artist_development" }, "", 0));
    r["staff quote pkg"] = [qp.status, qp.body.error];
    console.log("N:", JSON.stringify(r));
  });

  it("O: client change request and cancel maths", async () => {
    const date = fresh(3);
    const { client, paid } = await book(draft(REC, date, 600));
    const id = paid.booking.id;
    const night = await client.post(`/api/account/bookings/${id}/requests`, { kind: "reschedule", newDate: addDays(date, 3), newStart: 1380, reason: "" });
    const ok = await client.post(`/api/account/bookings/${id}/requests`, { kind: "reschedule", newDate: date, newStart: 1020, reason: "" });
    console.log("O:", night.status, night.body.error, ok.status, ok.body.error);
    const full = await book(draft(FULL, fresh(6), 1380));
    const c = await boss.post(`/api/admin/bookings/${full.paid.booking.id}/cancel`, { reason: "test" });
    console.log("O cancel full:", JSON.stringify(c.body));
  });
});
const studioToday = () => new Date(Date.now() + 3600000).toISOString().slice(0, 10);
