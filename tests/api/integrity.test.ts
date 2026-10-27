import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createHarness, nextWeekday, type Client, type Harness } from "../helpers/harness";
import { addDays, studioNow } from "../../src/worker/lib/time";
import { bookingsRepo } from "../../src/worker/repositories/bookings";

vi.setConfig({ testTimeout: 30_000 });

let h: Harness;
let boss: Client;

beforeAll(async () => {
  h = await createHarness();
  boss = await h.ceo();
}, 120000);
afterAll(() => h?.dispose());
afterEach(() => vi.useRealTimers());

const used: Record<number, number> = {};
const fresh = (weekday: number) => nextWeekday(weekday, 9 + 7 * (used[weekday] = (used[weekday] ?? -1) + 1));
const who = { artistName: "Kemi B", contactName: "Kemi Balogun", contactEmail: "kemi@example.com", contactPhone: "+234 805 111 2233" };
const REC = { serviceSlug: "recording", packageId: "pkg_recording_session" };
const FULL = { serviceSlug: "interviews", packageId: "pkg_stage_half_day" };
const EP = { serviceSlug: "produce-ep", packageId: "pkg_produce_ep" };
const PODCAST = { serviceSlug: "podcast-recording", packageId: "pkg_podcast_hour" };
const draft = (pkg: { serviceSlug: string; packageId: string }, date: string, start: number, over: Record<string, unknown> = {}) =>
  ({ ...pkg, date, start, extraHours: 0, extras: [], people: 2, project: "", notes: "", links: "", ...who, ...over });
const manual = (pkg: { serviceSlug: string; packageId: string }, date: string, start: number, over: Record<string, unknown> = {}) =>
  ({ ...draft(pkg, date, start), status: "confirmed", source: "phone", ignoreHours: false, notify: false, payment: null, ...over });
const row = async (id: string) => (await h.sql("SELECT * FROM bookings WHERE id = ?", id))[0];
const payment = async (reference: string) => (await h.sql("SELECT * FROM payments WHERE reference = ?", reference))[0];
const mailTo = async (email: string, subject: string) =>
  (await h.sql<{ body: string }>("SELECT body FROM email_outbox WHERE to_email = ? AND subject LIKE ? ORDER BY created_at DESC, rowid DESC", email, subject))[0]?.body ?? "";
const lagos = (date: string, minute: number) => new Date(Date.parse(`${date}T00:00:00Z`) + (minute - 60) * 60_000);

/** A client holds a slot and starts a payment for it, without paying yet. */
async function start(body: Record<string, unknown>, plan: "full" | "deposit" = "full") {
  const { client, email } = await h.newClient();
  const hold = await client.post("/api/holds", { ...body, contactEmail: email });
  expect(hold.status, JSON.stringify(hold.body)).toBe(200);
  const co = await client.post("/api/checkout", { holdId: hold.body.holdId, plan });
  expect(co.status, JSON.stringify(co.body)).toBe(200);
  return { client, email, hold: hold.body, reference: co.body.reference as string };
}
async function book(body: Record<string, unknown>, plan: "full" | "deposit" = "full") {
  const s = await start(body, plan);
  const paid = await h.payDemo(s.client, s.reference);
  expect(paid.body.status).toBe("confirmed");
  return { ...s, id: paid.body.booking.id as string };
}

describe("no double booking when late payments land together", () => {
  it("confirms only one of two lapsed holds on the same session, and refunds the other", async () => {
    const date = fresh(2);
    const a = await start(draft(REC, date, 750));
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(new Date(a.hold.expiresAt).getTime() + 60_000));
    const b = await start(draft(REC, date, 750));
    const [one, two] = await Promise.all([h.payDemo(a.client, a.reference), h.payDemo(b.client, b.reference)]);
    expect([one.body.status, two.body.status].sort()).toEqual(["confirmed", "refunded"]);
    const booked = await h.sql("SELECT id FROM bookings WHERE date = ? AND start_min = 750 AND status = 'confirmed'", date);
    expect(booked).toHaveLength(1);
    const loser = one.body.status === "refunded" ? a : b;
    expect((await payment(loser.reference)).status).toBe("refunded");
    expect(await mailTo(loser.email, "Payment refunded%")).toContain("was taken after your hold expired");
  });
  it("does the same for a separate Saturday daytime session", async () => {
    const sat = fresh(6);
    const a = await start(draft(FULL, sat, 750));
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(new Date(a.hold.expiresAt).getTime() + 60_000));
    const b = await start(draft(FULL, sat, 750));
    const results = await Promise.all([h.payDemo(a.client, a.reference), h.payDemo(b.client, b.reference)]);
    expect(results.map((r) => r.body.status).sort()).toEqual(["confirmed", "refunded"]);
    expect(await h.sql("SELECT id FROM bookings WHERE date = ? AND status = 'confirmed'", sat)).toHaveLength(1);
  });
  it("refuses to approve or confirm a request whose time was sold after it expired", async () => {
    const date = fresh(3);
    const { client, email } = await h.newClient();
    const hold = await client.post("/api/holds", draft(EP, date, 600, { contactEmail: email }));
    const req = await client.post("/api/requests", { holdId: hold.body.holdId });
    const id = req.body.booking.id;
    await h.sql("UPDATE bookings SET expires_at = '2020-01-01T00:00:00.000Z' WHERE id = ?", id);
    const sold = await book(draft(REC, date, 870));
    for (const path of ["approve", "confirm"]) {
      const r = await boss.post(`/api/admin/bookings/${id}/${path}`, { note: "" });
      expect(r.status, path).toBe(409);
      expect(r.body.error).toMatch(/taken by another booking/);
    }
    const pay = await boss.post(`/api/admin/bookings/${id}/payments`, { amount: 1_000_000, method: "cash", note: "" });
    expect(pay.status).toBe(409);
    expect((await row(id)).status).toBe("pending");
    expect((await row(id)).amount_paid_kobo).toBe(0);
    expect((await row(sold.id)).status).toBe("confirmed");
  });
  it("still approves an expired request when nothing took its time", async () => {
    const date = fresh(3);
    const { client, email } = await h.newClient();
    const hold = await client.post("/api/holds", draft(EP, date, 600, { contactEmail: email }));
    const id = (await client.post("/api/requests", { holdId: hold.body.holdId })).body.booking.id;
    await h.sql("UPDATE bookings SET expires_at = '2020-01-01T00:00:00.000Z' WHERE id = ?", id);
    expect((await boss.post(`/api/admin/bookings/${id}/approve`, { note: "" })).status).toBe(200);
    expect((await row(id)).status).toBe("approved");
  });
  it("refunds a payment for an approved booking whose time was sold, and cancels the booking", async () => {
    const date = fresh(4);
    const { client, email } = await h.newClient();
    const hold = await client.post("/api/holds", draft(EP, date, 600, { contactEmail: email }));
    const id = (await client.post("/api/requests", { holdId: hold.body.holdId })).body.booking.id;
    expect((await boss.post(`/api/admin/bookings/${id}/approve`, { note: "" })).status).toBe(200);
    const pay = await client.post(`/api/pay/${id}`, { plan: "deposit" });
    expect(pay.status).toBe(200);
    await h.sql("UPDATE bookings SET expires_at = '2020-01-01T00:00:00.000Z' WHERE id = ?", id);
    const sold = await book(draft(REC, date, 1020));
    const paid = await h.payDemo(client, pay.body.reference);
    expect(paid.body.status).toBe("refunded");
    expect(await row(id)).toMatchObject({ status: "cancelled", cancel_reason: "Time was taken before payment", amount_paid_kobo: 0 });
    expect((await payment(pay.body.reference)).status).toBe("refunded");
    expect(await mailTo(email, "Payment refunded%")).toContain("lost its time to another booking");
    expect((await row(sold.id)).status).toBe("confirmed");
  });
  it("lets only one of two simultaneous staff confirmations of overlapping requests through", async () => {
    const date = fresh(5);
    const ids = [];
    for (const start of [600, 870]) {
      const { client, email } = await h.newClient();
      const hold = await client.post("/api/holds", draft(start === 600 ? REC : REC, date, start, { contactEmail: email }));
      ids.push(hold.body.holdId);
    }
    expect(ids).toHaveLength(2);
    const made = await Promise.all([boss.post("/api/admin/bookings", manual(REC, date, 1020)), boss.post("/api/admin/bookings", manual(REC, date, 1020))]);
    expect(made.map((r) => r.status).sort()).toEqual([200, 409]);
  });
});

describe("completed bookings keep their room until they end", () => {
  it("holds a completed session until its scheduled end", async () => {
    const sat = fresh(6);
    const id = (await boss.post("/api/admin/bookings", manual(FULL, sat, 600))).body.id;
    await h.sql("UPDATE bookings SET status = 'completed' WHERE id = ?", id);
    expect((await h.client().post("/api/holds", draft(FULL, sat, 600))).status).toBe(409);
    const free = (at: Date) => bookingsRepo.isFree(h.env.DB, { date: sat, start: 600, end: 660, roomId: "room_stage" }, 30, at.toISOString());
    expect(await free(lagos(sat, 659))).toBe(false);
    expect(await free(lagos(sat, 661))).toBe(true);
  });
  it("holds a daytime session completed early, and frees it once the end has passed", async () => {
    const date = fresh(1);
    const id = (await boss.post("/api/admin/bookings", manual(REC, date, 870))).body.id;
    await h.sql("UPDATE bookings SET status = 'completed' WHERE id = ?", id);
    expect((await h.client().post("/api/holds", draft(REC, date, 870))).status).toBe(409);
    const free = (at: Date) => bookingsRepo.isFree(h.env.DB, { date, start: 870, end: 930, roomId: "room_studio_a" }, 30, at.toISOString());
    expect(await free(lagos(date, 929))).toBe(false);
    expect(await free(lagos(date, 931))).toBe(true);
  });
});

describe("overpayment", () => {
  it("refunds the second of two checkouts paid on one hold", async () => {
    const date = fresh(2);
    const { client, email } = await h.newClient();
    const hold = await client.post("/api/holds", draft(REC, date, 600, { contactEmail: email }));
    const first = await client.post("/api/checkout", { holdId: hold.body.holdId, plan: "full" });
    const second = await client.post("/api/checkout", { holdId: hold.body.holdId, plan: "full" });
    expect((await h.payDemo(client, first.body.reference)).body.status).toBe("confirmed");
    const late = await h.payDemo(client, second.body.reference);
    expect(late.body.status).toBe("refunded");
    const booking = await h.sql("SELECT * FROM bookings WHERE hold_id = ?", hold.body.holdId);
    expect(booking[0]).toMatchObject({ amount_paid_kobo: 8_000_000, refunded_kobo: 0 });
    expect(await payment(second.body.reference)).toMatchObject({ status: "refunded", refunded_kobo: 8_000_000, booking_id: booking[0].id });
    expect(await mailTo(email, "Payment refunded%")).toContain("already paid in full");
    expect((await h.client().get(`/api/payments/verify?reference=${second.body.reference}`)).body.status).toBe("refunded");
  });
  it("refunds a balance paid twice, simultaneously", async () => {
    const { id, client } = await book(draft(FULL, fresh(6), 1380), "deposit");
    const a = await client.post(`/api/pay/${id}`, { plan: "full" });
    const b = await client.post(`/api/pay/${id}`, { plan: "full" });
    const results = await Promise.all([h.payDemo(client, a.body.reference), h.payDemo(client, b.body.reference)]);
    expect(results.map((r) => r.body.status).sort()).toEqual(["confirmed", "refunded"]);
    expect(await row(id)).toMatchObject({ amount_paid_kobo: 28_000_000 });
  });
  it("accepts a second deposit that still fits inside the total", async () => {
    const date = fresh(2);
    const { client, email } = await h.newClient();
    const hold = await client.post("/api/holds", draft(FULL, fresh(6), 1380, { contactEmail: email }));
    const a = await client.post("/api/checkout", { holdId: hold.body.holdId, plan: "deposit" });
    const b = await client.post("/api/checkout", { holdId: hold.body.holdId, plan: "deposit" });
    expect(date).toBeTruthy();
    await h.payDemo(client, a.body.reference);
    expect((await h.payDemo(client, b.body.reference)).body.status).toBe("confirmed");
    expect((await h.sql("SELECT amount_paid_kobo FROM bookings WHERE hold_id = ?", hold.body.holdId))[0].amount_paid_kobo).toBe(28_000_000);
  });
});

describe("staff bookings in the past", () => {
  it("refuses sessions that are already over, unless a flex booking is forced", async () => {
    const yesterday = addDays(studioNow().date, -1);
    for (const pkg of [REC, EP]) {
      const r = await boss.post("/api/admin/bookings", manual(pkg, yesterday, 600));
      expect(r.status).toBe(400);
      expect(r.body.error).toMatch(/already over/);
    }
    const forcedSlot = await boss.post("/api/admin/bookings", manual(REC, yesterday, 600, { ignoreHours: true }));
    expect(forcedSlot.status).toBe(400);
    expect((await boss.post("/api/admin/bookings", manual(PODCAST, yesterday, 600))).status).toBe(400);
    expect((await boss.post("/api/admin/bookings", manual(PODCAST, yesterday, 600, { ignoreHours: true }))).status).toBe(400);
    expect((await boss.post("/api/admin/bookings", manual(PODCAST, yesterday, 600, { pastOk: true }))).status).toBe(400);
    const forced = await boss.post("/api/admin/bookings", manual(PODCAST, yesterday, 600, { ignoreHours: true, pastOk: true }));
    expect(forced.status).toBe(200);
  });
  it("still lets staff book a session that is under way or later today", async () => {
    const date = fresh(2);
    expect((await boss.post("/api/admin/bookings", manual(REC, date, 600))).status).toBe(200);
  });
});

describe("running overnight and rescheduling rules", () => {
  it("shows a Saturday night session on Sunday morning's dashboard while it runs, and counts it in capacity", async () => {
    const sat = fresh(6);
    const id = (await boss.post("/api/admin/bookings", manual(FULL, sat, 1380))).body.id;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(lagos(addDays(sat, 1), 120));
    const admin = await h.ceo();
    const early = await admin.get("/api/admin/overview");
    expect(early.body.todays.map((b: any) => b.id)).toContain(id);
    vi.setSystemTime(lagos(addDays(sat, 1), 360));
    expect((await admin.get("/api/admin/overview")).body.todays.map((b: any) => b.id)).not.toContain(id);
    const report = await admin.get(`/api/admin/reports?from=${sat}&to=${sat}`);
    // Capacity is the 540 opening minutes plus the 360 night minutes, for each of the 4 rooms: 360 of 3600.
    expect(report.body.utilisation).toBe(10);
  });
  it("refuses a free reschedule request inside 48 hours", async () => {
    const { id, client } = await book(draft(REC, fresh(1), 750));
    await h.sql("UPDATE bookings SET date = ? WHERE id = ?", addDays(studioNow().date, 1), id);
    const r = await client.post(`/api/account/bookings/${id}/requests`, { kind: "reschedule", newDate: fresh(1), newStart: 600, reason: "" });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/48 hours/);
    expect((await client.post(`/api/account/bookings/${id}/requests`, { kind: "cancel", reason: "" })).status).toBe(200);
  });
});

describe("copy", () => {
  it("keeps comping out of Recording and Beat, and invents nothing for beats", async () => {
    const { body } = await h.client().get("/api/catalog");
    const text = (slug: string) => JSON.stringify(body.services.find((s: any) => s.slug === slug)) + JSON.stringify(body.packages.filter((p: any) => p.service_slug === slug));
    expect(text("recording")).not.toMatch(/\bcomp(s|ed|ing)?\b/i);
    expect(text("beat-production")).not.toMatch(/stems|usage terms/i);
    expect(text("beat-production")).toContain("WAV and MP3");
  });
  it("publishes hours that agree with the all night session and policies that state the remote order refund", async () => {
    const { body } = await h.client().get("/api/content");
    expect(body.content.hours_note).toBe("Recording sessions run daily from 10:00am to 7:00pm. The All night session runs on Saturdays from 11:00pm to 5:00am (Sunday).");
    for (const key of ["hero_subtitle", "footer_blurb", "seo_description"]) expect(body.content[key], key).toMatch(/by quote/);
    const policy = (slug: string) => body.policies.find((p: any) => p.slug === slug).body;
    expect(policy("cancellations")).toContain("full refund until the first finished files are delivered");
    expect(policy("terms")).toContain("full refund until the first finished files are delivered");
    expect(policy("approvals")).toContain("within 48 hours");
  });
  it("words the add-on and balance lines cleanly", async () => {
    const date = fresh(2);
    const { client, email } = await h.newClient();
    const hold = await client.post("/api/holds", draft(EP, date, 600, { contactEmail: email, extras: ["independent-distribution"] }));
    await client.post("/api/requests", { holdId: hold.body.holdId });
    const mail = await mailTo(email, "Request received%");
    expect(mail).toContain("Independent distribution (optional, price on request)");
    expect(mail).not.toContain(") (");
    const beat = await book({ serviceSlug: "beat-production", packageId: "pkg_beat_production", ...who });
    expect(await mailTo(beat.email, "Order confirmed%")).toContain("Service: Beat production\n");
  });
});

const REPEAT = [0, 1, 2];
/** Every payment on a booking ends up counted or refunded, exactly once. */
async function accounted(where: string, arg: string) {
  const pays = await h.sql<{ amount_kobo: number; status: string; refunded_kobo: number }>(`SELECT amount_kobo, status, refunded_kobo FROM payments WHERE ${where} AND status IN ('success', 'refunded')`, arg);
  return pays;
}

describe("every money movement happens once", () => {
  for (const round of REPEAT) {
    it(`counts one of two checkouts verified together and refunds the other (round ${round})`, async () => {
      const date = fresh(2 + (round % 3));
      const { client, email } = await h.newClient();
      const hold = await client.post("/api/holds", draft(REC, date, 600, { contactEmail: email }));
      const refs = [];
      for (let i = 0; i < 2; i++) refs.push((await client.post("/api/checkout", { holdId: hold.body.holdId, plan: "full" })).body.reference);
      for (const r of refs) await client.post(`/api/payments/demo/${r}`, { outcome: "success", channel: "card" });
      const out = await Promise.all(refs.map((r) => client.get(`/api/payments/verify?reference=${r}`)));
      expect(out.map((o) => o.body.status).sort()).toEqual(["confirmed", "refunded"]);
      const bookings = await h.sql("SELECT * FROM bookings WHERE hold_id = ?", hold.body.holdId);
      expect(bookings).toHaveLength(1);
      expect(bookings[0]).toMatchObject({ amount_paid_kobo: 8_000_000, refunded_kobo: 0 });
      const pays = await accounted("hold_id = ?", hold.body.holdId);
      expect(pays.filter((p) => p.status === "refunded")).toHaveLength(1);
      expect(pays.filter((p) => p.status === "success")).toHaveLength(1);
      expect((await h.sql("SELECT amount_kobo FROM refunds WHERE booking_id = ?", bookings[0].id)).length).toBe(1);
      expect(await h.sql("SELECT subject FROM email_outbox WHERE to_email = ? AND subject LIKE 'Payment refunded%'", email)).toHaveLength(1);
    });
  }
  it("refunds a verified payment once when the same reference is verified many times at once", async () => {
    const { client, email } = await h.newClient();
    const hold = await client.post("/api/holds", draft(REC, fresh(1), 750, { contactEmail: email }));
    const co = await client.post("/api/checkout", { holdId: hold.body.holdId, plan: "full" });
    await client.post(`/api/payments/demo/${co.body.reference}`, { outcome: "success", channel: "card" });
    await Promise.all([1, 2, 3, 4].map(() => client.get(`/api/payments/verify?reference=${co.body.reference}`)));
    expect(await h.sql("SELECT id FROM bookings WHERE hold_id = ?", hold.body.holdId)).toHaveLength(1);
    expect((await h.sql("SELECT amount_paid_kobo FROM bookings WHERE hold_id = ?", hold.body.holdId))[0].amount_paid_kobo).toBe(8_000_000);
    expect(await h.sql("SELECT subject FROM email_outbox WHERE to_email = ? AND subject LIKE 'You%'", email)).toHaveLength(1);
  });
  for (const round of REPEAT) {
    it(`cancels once when cancelled twice at the same moment (round ${round})`, async () => {
      const { id, email } = await book(draft(REC, fresh(3), 600));
      const out = await Promise.all([boss.post(`/api/admin/bookings/${id}/cancel`, { reason: "a" }), boss.post(`/api/admin/bookings/${id}/cancel`, { reason: "b" }), boss.post(`/api/admin/bookings/${id}/cancel`, { reason: "c" })]);
      expect(out.map((o) => o.status).sort()).toEqual([200, 409, 409]);
      expect(out.find((o) => o.status === 409)!.body.code).toBe("already_decided");
      expect(await h.sql("SELECT amount_kobo FROM refunds WHERE booking_id = ?", id)).toHaveLength(1);
      expect(await row(id)).toMatchObject({ status: "cancelled", refunded_kobo: 8_000_000 });
      expect(await h.sql("SELECT subject FROM email_outbox WHERE to_email = ? AND subject LIKE 'Booking cancelled%'", email)).toHaveLength(1);
    });
    it(`acts on a change request once when two staff approve it together (round ${round})`, async () => {
      const { id, client } = await book(draft(REC, fresh(4), 750));
      await client.post(`/api/account/bookings/${id}/requests`, { kind: "cancel", reason: "x" });
      const pending = (await boss.get("/api/admin/requests")).body.find((r: any) => r.booking_id === id);
      const out = await Promise.all([boss.post(`/api/admin/requests/${pending.id}`, { approve: true }), boss.post(`/api/admin/requests/${pending.id}`, { approve: true })]);
      expect(out.map((o) => o.status).sort()).toEqual([200, 409]);
      expect(await h.sql("SELECT amount_kobo FROM refunds WHERE booking_id = ?", id)).toHaveLength(1);
    });
    it(`lets only one of two simultaneous approvals win with an already decided answer (round ${round})`, async () => {
      const { client, email } = await h.newClient();
      const hold = await client.post("/api/holds", draft(EP, fresh(5), 600, { contactEmail: email }));
      const id = (await client.post("/api/requests", { holdId: hold.body.holdId })).body.booking.id;
      const out = await Promise.all([boss.post(`/api/admin/bookings/${id}/approve`, { note: "" }), boss.post(`/api/admin/bookings/${id}/approve`, { note: "" })]);
      expect(out.map((o) => o.status).sort()).toEqual([200, 409]);
      const loser = out.find((o) => o.status === 409)!;
      expect(loser.body.code).toBe("already_decided");
      expect(loser.body.error).toMatch(/Already decided/);
      expect(await h.sql("SELECT subject FROM email_outbox WHERE to_email = ? AND subject LIKE 'Approved%'", email)).toHaveLength(1);
    });
  }
  it("hands a change request back when approving it fails", async () => {
    const date = fresh(1), other = fresh(1);
    const { id, client } = await book(draft(REC, date, 600));
    await client.post(`/api/account/bookings/${id}/requests`, { kind: "reschedule", newDate: other, newStart: 750, reason: "" });
    await h.client().post("/api/holds", draft(REC, other, 750));
    const pending = (await boss.get("/api/admin/requests")).body.find((r: any) => r.booking_id === id);
    expect((await boss.post(`/api/admin/requests/${pending.id}`, { approve: true })).status).toBe(409);
    expect((await boss.get("/api/admin/requests")).body.some((r: any) => r.id === pending.id)).toBe(true);
  });
  for (const round of REPEAT) {
    it(`never expires an approval that was paid while housekeeping ran (round ${round})`, async () => {
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) ids.push((await boss.post("/api/admin/bookings", manual(REC, fresh(1 + i), 600, { status: "approved", contactEmail: `exp${round}${i}@example.com` }))).body.id);
      const target = ids[2];
      const pay = await boss.post(`/api/pay/${target}`, { plan: "full" });
      await boss.post(`/api/payments/demo/${pay.body.reference}`, { outcome: "success", channel: "card" });
      for (const id of ids) await h.sql("UPDATE bookings SET expires_at = ? WHERE id = ?", new Date(Date.now() - 1000).toISOString(), id);
      const { bookingService } = await import("../../src/worker/services/bookings");
      await Promise.all([bookingService.housekeeping(h.env), boss.get(`/api/payments/verify?reference=${pay.body.reference}`)]);
      const b = await row(target);
      const refunded = (await payment(pay.body.reference)).status === "refunded";
      // Either the payment confirmed the booking and was kept, or housekeeping won and the payment was refunded in full. Never both, never neither.
      if (b.status === "confirmed") expect([refunded, b.amount_paid_kobo]).toEqual([false, 8_000_000]);
      else expect([b.status, refunded, b.amount_paid_kobo]).toEqual(["cancelled", true, 0]);
      expect((await row(ids[0])).status).toBe("cancelled");
    });
  }
  it("confirms an expired approval whose time is still free when its payment lands before the cron runs", async () => {
    const id = (await boss.post("/api/admin/bookings", manual(REC, fresh(2), 870, { status: "approved", contactEmail: "late@example.com" }))).body.id;
    const pay = await boss.post(`/api/pay/${id}`, { plan: "full" });
    await h.sql("UPDATE bookings SET expires_at = ? WHERE id = ?", new Date(Date.now() - 1000).toISOString(), id);
    expect((await h.payDemo(boss, pay.body.reference)).body.status).toBe("confirmed");
    expect(await row(id)).toMatchObject({ status: "confirmed", amount_paid_kobo: 8_000_000 });
  });
  it("leaves a booking that already has money on it alone when it passes its expiry", async () => {
    const id = (await boss.post("/api/admin/bookings", manual(REC, fresh(3), 870, { status: "approved" }))).body.id;
    await h.sql("UPDATE bookings SET expires_at = ?, amount_paid_kobo = 1000 WHERE id = ?", new Date(Date.now() - 1000).toISOString(), id);
    const { bookingService } = await import("../../src/worker/services/bookings");
    await bookingService.housekeeping(h.env);
    expect((await row(id)).status).toBe("approved");
  });
  it("caps staff payments at the balance, even when two are recorded at once", async () => {
    const { id } = await book(draft(REC, fresh(4), 870));
    expect((await boss.post(`/api/admin/bookings/${id}/payments`, { amount: 1, method: "cash", note: "" })).status).toBe(400);
    const made = await boss.post("/api/admin/bookings", manual(REC, fresh(4), 870));
    const over = await boss.post(`/api/admin/bookings/${made.body.id}/payments`, { amount: 50_000_000, method: "cash", note: "" });
    expect(over.status).toBe(400);
    expect(over.body.error).toMatch(/more than the ₦80,000 still owed/);
    expect((await row(made.body.id)).amount_paid_kobo).toBe(0);
    const two = await Promise.all([1, 2].map(() => boss.post(`/api/admin/bookings/${made.body.id}/payments`, { amount: 5_000_000, method: "transfer", note: "" })));
    expect(two.map((r) => r.status).sort()).toEqual([200, 400]);
    expect((await row(made.body.id)).amount_paid_kobo).toBe(5_000_000);
    expect(await h.sql("SELECT id FROM payments WHERE booking_id = ?", made.body.id)).toHaveLength(1);
    expect((await boss.post(`/api/admin/bookings/${made.body.id}/payments`, { amount: 3_000_000, method: "cash", note: "" })).status).toBe(200);
    expect((await boss.post("/api/admin/bookings", manual(REC, fresh(4), 1020, { payment: { amount: 9_000_000, method: "cash", note: "" } }))).status).toBe(400);
  });
});

describe("wording and rules from round three", () => {
  it("says the preferred start date moved for a day booking", async () => {
    const date = fresh(1), other = fresh(1);
    const made = await boss.post("/api/admin/bookings", manual(EP, date, 600, { contactEmail: "moved@example.com" }));
    expect((await boss.post(`/api/admin/bookings/${made.body.id}/reschedule`, { date: other, start: 600 })).status).toBe(200);
    const mail = await mailTo("moved@example.com", "Your preferred start date has moved%");
    expect(mail).toContain("The preferred start date for");
    expect(mail).not.toContain("Your session");
  });
  it("leaves no full stop stuck to the pay link in a remote order email", async () => {
    const r = await boss.post("/api/admin/bookings", { serviceSlug: "mixing-mastering", packageId: "pkg_mm_standard", ...who, contactEmail: "link@example.com", status: "confirmed", source: "phone", ignoreHours: false, notify: true, payment: null });
    expect(r.status).toBe(200);
    const mail = await mailTo("link@example.com", "Order confirmed%");
    expect(mail).toContain("/pay/");
    expect(mail).not.toMatch(/\/pay\/\S*\.(\s|$)/);
  });
  it("refuses a second free reschedule", async () => {
    const { id, client } = await book(draft(REC, fresh(2), 600));
    const other = fresh(2);
    await client.post(`/api/account/bookings/${id}/requests`, { kind: "reschedule", newDate: other, newStart: 750, reason: "" });
    const pending = (await boss.get("/api/admin/requests")).body.find((r: any) => r.booking_id === id);
    expect((await boss.post(`/api/admin/requests/${pending.id}`, { approve: true })).status).toBe(200);
    const again = await client.post(`/api/account/bookings/${id}/requests`, { kind: "reschedule", newDate: fresh(2), newStart: 600, reason: "" });
    expect(again.status).toBe(400);
    expect(again.body.error).toMatch(/free reschedule has been used.*cancellation/);
  });
});
