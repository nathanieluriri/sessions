import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createHarness, nextWeekday, type Client, type Harness } from "../helpers/harness";
import { bookingService } from "../../src/worker/services/bookings";

vi.setConfig({ testTimeout: 60_000 });
let h: Harness;
let boss: Client;
beforeAll(async () => {
  h = await createHarness();
  boss = await h.ceo();
  const open = (await boss.get("/api/admin/availability")).body.hours;
  await boss.put("/api/admin/availability", { hours: open, buffer: 30, hold: 15, minNotice: 180, bookAhead: 365 });
}, 120000);
afterAll(() => h?.dispose());

let wk = 0;
const day = (wd: number) => nextWeekday(wd, 8 + 7 * wk++);
const who = { artistName: "Crit", contactName: "Crit Ic", contactPhone: "+234 805 111 2233" };
const REC = { serviceSlug: "recording", packageId: "pkg_recording_session" };
const FULL = { serviceSlug: "full-production", packageId: "pkg_full_production" };
const EP = { serviceSlug: "produce-ep", packageId: "pkg_produce_ep" };
const BEAT = { serviceSlug: "beat-production", packageId: "pkg_beat_production" };
const d = (pkg: any, date: string, start: number, o: any = {}) => ({ ...pkg, date, start, extraHours: 0, extras: [], people: 1, ...who, ...o });
const log: Record<string, unknown> = {};

describe("critic p2r2", () => {
  it("A: two checkouts on one hold verified at once", async () => {
    const { client, email } = await h.newClient();
    const date = day(2);
    const hold = await client.post("/api/holds", d(REC, date, 600, { contactEmail: email }));
    expect(hold.status).toBe(200);
    const c1 = await client.post("/api/checkout", { holdId: hold.body.holdId, plan: "full" });
    const c2 = await client.post("/api/checkout", { holdId: hold.body.holdId, plan: "full" });
    for (const c of [c1, c2]) await client.post(`/api/payments/demo/${c.body.reference}`, { outcome: "success", channel: "card" });
    const [v1, v2] = await Promise.all([client.get(`/api/payments/verify?reference=${c1.body.reference}`), client.get(`/api/payments/verify?reference=${c2.body.reference}`)]);
    const bookings = await h.sql("SELECT id, amount_paid_kobo, refunded_kobo, total_kobo, status FROM bookings WHERE hold_id = ?", hold.body.holdId);
    const pays = await h.sql("SELECT reference, status, amount_kobo, refunded_kobo, booking_id, verified_via FROM payments WHERE hold_id = ?", hold.body.holdId);
    log.A = { v: [v1.body.status, v2.body.status], bookings, pays };
  });

  it("B: two cancels at once", async () => {
    const { client, email } = await h.newClient();
    const date = day(3);
    const hold = await client.post("/api/holds", d(REC, date, 600, { contactEmail: email }));
    const co = await client.post("/api/checkout", { holdId: hold.body.holdId, plan: "full" });
    const v = await h.payDemo(client, co.body.reference);
    const id = v.body.booking.id;
    const [x, y] = await Promise.all([boss.post(`/api/admin/bookings/${id}/cancel`, { reason: "a" }), boss.post(`/api/admin/bookings/${id}/cancel`, { reason: "b" })]);
    const refunds = await h.sql("SELECT amount_kobo FROM refunds WHERE booking_id = ?", id);
    const b = (await h.sql("SELECT amount_paid_kobo, refunded_kobo FROM bookings WHERE id = ?", id))[0];
    const mails = await h.sql("SELECT subject FROM email_outbox WHERE to_email = ? AND subject LIKE '%ancel%'", email);
    log.B = { st: [x.status, y.status, x.body, y.body], refunds, b, mails };
  });

  it("C: lapsed hold paid late after slot resold, concurrently with the winner", async () => {
    const a = await h.newClient(), bb = await h.newClient();
    const date = day(4);
    const ha = await a.client.post("/api/holds", d(REC, date, 870, { contactEmail: a.email }));
    const ca = await a.client.post("/api/checkout", { holdId: ha.body.holdId, plan: "full" });
    await h.sql("UPDATE holds SET expires_at = '2000-01-01T00:00:00Z' WHERE id = ?", ha.body.holdId);
    const hb = await bb.client.post("/api/holds", d(REC, date, 870, { contactEmail: bb.email }));
    expect(hb.status).toBe(200);
    const cb = await bb.client.post("/api/checkout", { holdId: hb.body.holdId, plan: "full" });
    await h.sql("UPDATE holds SET expires_at = '2000-01-01T00:00:00Z' WHERE id = ?", hb.body.holdId);
    for (const [c, r] of [[a.client, ca], [bb.client, cb]] as const) await c.post(`/api/payments/demo/${r.body.reference}`, { outcome: "success", channel: "card" });
    const res = await Promise.all([a.client.get(`/api/payments/verify?reference=${ca.body.reference}`), bb.client.get(`/api/payments/verify?reference=${cb.body.reference}`)]);
    const bookings = await h.sql("SELECT id, status FROM bookings WHERE date = ? AND start_min = 870 AND status = 'confirmed'", date);
    const refunds = await h.sql("SELECT r.amount_kobo FROM refunds r JOIN payments p ON p.id = r.payment_id WHERE p.reference IN (?, ?)", ca.body.reference, cb.body.reference);
    log.C = { st: res.map((r) => r.body.status), bookings: bookings.length, refunds };
    expect(bookings.length).toBe(1);
  });

  it("D: EP request vs recordPayment vs session hold, and two EPs on the same day", async () => {
    const date = day(5);
    const a = await h.newClient();
    const ha = await a.client.post("/api/holds", d(EP, date, 600, { contactEmail: a.email }));
    const ra = await a.client.post("/api/requests", { holdId: ha.body.holdId });
    expect(ra.status).toBe(200);
    const id = ra.body.booking.id;
    // request lapses but housekeeping has not run; another EP then a session take the day
    await h.sql("UPDATE bookings SET expires_at = '2000-01-01T00:00:00Z' WHERE id = ?", id);
    const b = await h.newClient();
    const hb = await b.client.post("/api/holds", d(EP, date, 600, { contactEmail: b.email }));
    const rb = await b.client.post("/api/requests", { holdId: hb.body.holdId });
    const id2 = rb.body.booking?.id;
    const [ap1, ap2] = await Promise.all([boss.post(`/api/admin/bookings/${id}/approve`, {}), boss.post(`/api/admin/bookings/${id2}/approve`, {})]);
    const pay = await boss.post(`/api/admin/bookings/${id}/payments`, { amount: 100000, method: "cash", note: "" });
    const conf = await boss.post(`/api/admin/bookings/${id}/confirm`, {});
    const sess = await boss.post("/api/admin/bookings", { ...d(REC, date, 600, { contactEmail: "" }), status: "confirmed", source: "phone", notify: false });
    log.D = { rb: rb.status, ap: [ap1.status, ap2.status], pay: [pay.status, pay.body], conf: conf.status, sess: [sess.status, sess.body], rows: await h.sql("SELECT id, status FROM bookings WHERE date = ?", date) };
  });

  it("E: concurrent manual staff bookings and EP vs EP concurrent approve after both pending on different days moved same day", async () => {
    const date = day(1);
    const rs = await Promise.all([0, 1, 2].map(() => boss.post("/api/admin/bookings", { ...d(FULL, nextWeekday(6, 8 + 7 * wk), 1380, { contactEmail: "" }), status: "confirmed", source: "phone", notify: false })));
    wk++;
    const ms = await Promise.all([0, 1].map(() => boss.post("/api/admin/bookings", { ...d(REC, date, 1020, { contactEmail: "" }), status: "approved", source: "phone", notify: false })));
    log.E = { night: rs.map((r) => r.status), rec: ms.map((r) => r.status) };
  });

  it("F: concurrent cancel and late balance payment", async () => {
    const { client, email } = await h.newClient();
    const date = day(2);
    const hold = await client.post("/api/holds", d(FULL, nextWeekday(6, 8 + 7 * wk++), 1380, { contactEmail: email }));
    const co = await client.post("/api/checkout", { holdId: hold.body.holdId, plan: "deposit" });
    const v = await h.payDemo(client, co.body.reference);
    const id = v.body.booking.id;
    const p2 = await client.post(`/api/pay/${id}`, { plan: "full" });
    await client.post(`/api/payments/demo/${p2.body.reference}`, { outcome: "success", channel: "card" });
    const [cx, vx] = await Promise.all([boss.post(`/api/admin/bookings/${id}/cancel`, { reason: "x" }), client.get(`/api/payments/verify?reference=${p2.body.reference}`)]);
    const b = (await h.sql("SELECT status, amount_paid_kobo, refunded_kobo, total_kobo FROM bookings WHERE id = ?", id))[0];
    const refunds = await h.sql("SELECT amount_kobo, reason FROM refunds WHERE booking_id = ? OR payment_id IN (SELECT id FROM payments WHERE booking_id = ?)", id, id);
    log.F = { cx: [cx.status, cx.body], vx: vx.body.status, b, refunds, date };
  });

  it("G: overnight completion and project order money", async () => {
    const date = nextWeekday(6, 8 + 7 * wk++);
    const r = await boss.post("/api/admin/bookings", { ...d(FULL, date, 1380, { contactEmail: "" }), status: "confirmed", source: "phone", notify: false });
    const id = r.body.id;
    const sunday = new Date(`${date}T23:00:00Z`); // Sunday 00:00 Lagos
    await bookingService.housekeeping(h.env, sunday);
    const s1 = (await h.sql("SELECT status FROM bookings WHERE id = ?", id))[0].status;
    await bookingService.housekeeping(h.env, new Date(sunday.getTime() + 299 * 60000));
    const s2 = (await h.sql("SELECT status FROM bookings WHERE id = ?", id))[0].status;
    await bookingService.housekeeping(h.env, new Date(sunday.getTime() + 300 * 60000));
    const s3 = (await h.sql("SELECT status FROM bookings WHERE id = ?", id))[0].status;
    const { client, email } = await h.newClient();
    const hold = await client.post("/api/holds", { ...BEAT, ...who, contactEmail: email });
    const co = await client.post("/api/checkout", { holdId: hold.body.holdId, plan: "deposit" });
    const v = await h.payDemo(client, co.body.reference);
    log.G = { s: [s1, s2, s3], beat: { hold: hold.status, draft: hold.body.draft && { total: hold.body.draft.total, deposit: hold.body.draft.deposit }, amount: co.body.amount, v: v.body.status, b: v.body.booking } };
  });

  afterAll(() => console.log("CRITICLOG " + JSON.stringify(log, null, 1)));
});
