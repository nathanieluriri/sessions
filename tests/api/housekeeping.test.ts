import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createHarness, nextWeekday, type Client, type Harness } from "../helpers/harness";
import { bookingService } from "../../src/worker/services/bookings";
import { addDays } from "../../src/worker/lib/time";

vi.setConfig({ testTimeout: 30_000 });

let h: Harness;
let boss: Client;

beforeAll(async () => {
  h = await createHarness();
  boss = await h.ceo();
}, 120000);
afterAll(() => h?.dispose());

// Every test books its own week, so one test's bookings never get in the way of another's.
const used: Record<number, number> = {};
const fresh = (weekday: number) => nextWeekday(weekday, 10 + 7 * (used[weekday] = (used[weekday] ?? -1) + 1));

const who = { artistName: "Kemi B", contactName: "Kemi Balogun", contactEmail: "kemi@example.com", contactPhone: "+234 805 111 2233" };
const REC = { serviceSlug: "recording", packageId: "pkg_recording_session" };
const EP = { serviceSlug: "produce-ep", packageId: "pkg_produce_ep" };
const MIX = { serviceSlug: "mixing-mastering", packageId: "pkg_mm_standard" };
const draft = (pkg: { serviceSlug: string; packageId: string }, date: string, start: number, over: Record<string, unknown> = {}) =>
  ({ ...pkg, date, start, extraHours: 0, extras: [], people: 2, project: "", notes: "", links: "", ...who, ...over });
const manual = (pkg: { serviceSlug: string; packageId: string }, date: string, start: number, over: Record<string, unknown> = {}) =>
  ({ ...draft(pkg, date, start), status: "confirmed", source: "phone", ignoreHours: false, notify: false, payment: null, ...over });
const status = async (id: string) => (await h.sql<{ status: string }>("SELECT status FROM bookings WHERE id = ?", id))[0].status;
/** The instant it is `minute` minutes past midnight in Lagos (UTC+1) on `date`. */
const lagos = (date: string, minute: number) => new Date(Date.parse(`${date}T00:00:00Z`) + (minute - 60) * 60_000);
const created = async (r: { status: number; body: any }) => { expect(r.status, JSON.stringify(r.body)).toBe(200); return r.body.id as string; };
const mailTo = async (email: string, subject: string) =>
  (await h.sql<{ body: string }>("SELECT body FROM email_outbox WHERE to_email = ? AND subject LIKE ? ORDER BY created_at DESC, rowid DESC", email, subject))[0]?.body ?? "";

describe("completing bookings", () => {
  it("completes a one-hour session as soon as its scheduled end has passed", async () => {
    const date = fresh(2);
    const id = await created(await boss.post("/api/admin/bookings", manual(REC, date, 600)));
    await bookingService.housekeeping(h.env, lagos(date, 659));
    expect(await status(id)).toBe("confirmed");
    await bookingService.housekeeping(h.env, lagos(date, 660));
    expect(await status(id)).toBe("completed");
  });
  it("completes a daytime session as soon as its own end has passed", async () => {
    const date = fresh(2);
    const first = await created(await boss.post("/api/admin/bookings", manual(REC, date, 750)));
    const last = await created(await boss.post("/api/admin/bookings", manual(REC, date, 1020)));
    await bookingService.housekeeping(h.env, lagos(date, 809));
    expect([await status(first), await status(last)]).toEqual(["confirmed", "confirmed"]);
    await bookingService.housekeeping(h.env, lagos(date, 810));
    expect([await status(first), await status(last)]).toEqual(["completed", "confirmed"]);
    await bookingService.housekeeping(h.env, lagos(addDays(date, 1), 0));
    expect(await status(last)).toBe("completed");
  });
  it("completes a flex booking after its end and a day booking after the studio day", async () => {
    const date = fresh(3);
    const podcast = await created(await boss.post("/api/admin/bookings", manual({ serviceSlug: "podcast-recording", packageId: "pkg_podcast_hour" }, date, 600)));
    const ep = await created(await boss.post("/api/admin/bookings", manual(EP, date, 600)));
    await bookingService.housekeeping(h.env, lagos(date, 659));
    expect(await status(podcast)).toBe("confirmed");
    await bookingService.housekeeping(h.env, lagos(date, 660));
    expect([await status(podcast), await status(ep)]).toEqual(["completed", "confirmed"]);
    await bookingService.housekeeping(h.env, lagos(date, 1140));
    expect(await status(ep)).toBe("completed");
  });
  it("leaves unpaid requests, cancelled bookings and other statuses alone", async () => {
    const date = fresh(4);
    const approved = await created(await boss.post("/api/admin/bookings", manual(REC, date, 600, { status: "approved" })));
    const cancelled = await created(await boss.post("/api/admin/bookings", manual(REC, date, 870)));
    await boss.post(`/api/admin/bookings/${cancelled}/cancel`, { reason: "Test", fullRefund: false });
    await bookingService.housekeeping(h.env, lagos(addDays(date, 2), 0));
    expect(await status(cancelled)).toBe("cancelled");
    expect(["cancelled", "approved"]).toContain(await status(approved));
  });
  it("never completes a remote order, however old it is", async () => {
    const id = await created(await boss.post("/api/admin/bookings", { ...MIX, ...who, status: "confirmed", source: "phone", ignoreHours: false, notify: false, payment: null }));
    await h.sql("UPDATE bookings SET date = '2025-01-02' WHERE id = ?", id);
    await bookingService.housekeeping(h.env, new Date());
    await bookingService.housekeeping(h.env, new Date(Date.now() + 400 * 86_400_000));
    expect(await status(id)).toBe("confirmed");
  });
});

describe("reminders", () => {
  it("reminds a client 24 hours before a one-hour session", async () => {
    const date = fresh(2);
    const email = "session@example.com";
    const id = await created(await boss.post("/api/admin/bookings", manual(REC, date, 600, { contactEmail: email })));
    await bookingService.housekeeping(h.env, lagos(addDays(date, -1), 599));
    expect(await mailTo(email, "Reminder%")).toBe("");
    await bookingService.housekeeping(h.env, lagos(addDays(date, -1), 605));
    const mail = await mailTo(email, "Reminder%");
    expect(mail).toContain("Time: 10:00am to 11:00am");
    expect(mail).toContain("Room: Studio A");
    const sent = await h.sql<{ reminder_sent_at: string | null }>("SELECT reminder_sent_at FROM bookings WHERE id = ?", id);
    expect(sent[0].reminder_sent_at).not.toBeNull();
  });
  it("skip remote orders, which have no session to remind anyone of", async () => {
    const email = "remote@example.com";
    await created(await boss.post("/api/admin/bookings", { ...MIX, ...who, contactEmail: email, status: "confirmed", source: "phone", ignoreHours: false, notify: false, payment: null }));
    await bookingService.housekeeping(h.env, new Date());
    await bookingService.housekeeping(h.env, new Date(Date.now() + 3_600_000));
    expect(await mailTo(email, "Reminder%")).toBe("");
  });
});

describe("expiry", () => {
  it("releases an unanswered EP request after its window and opens the day again", async () => {
    const date = fresh(1);
    const { client, email } = await h.newClient();
    const hold = await client.post("/api/holds", draft(EP, date, 600, { contactEmail: email }));
    const req = await client.post("/api/requests", { holdId: hold.body.holdId });
    const id = req.body.booking.id;
    const [expires] = await h.sql<{ expires_at: string }>("SELECT expires_at FROM bookings WHERE id = ?", id);
    expect((await h.client().post("/api/holds", draft(REC, date, 750))).status).toBe(409);
    await bookingService.housekeeping(h.env, new Date(new Date(expires.expires_at).getTime() - 60_000));
    expect(await status(id)).toBe("pending");
    await bookingService.housekeeping(h.env, new Date(new Date(expires.expires_at).getTime() + 60_000));
    expect(await status(id)).toBe("cancelled");
    expect(await mailTo(email, "Booking released%")).toContain("The studio could not review your request in time.");
    expect((await h.client().post("/api/holds", draft(REC, date, 750))).status).toBe(200);
  });
  it("releases an approved booking that is not paid within the payment window", async () => {
    const date = fresh(2);
    const id = await created(await boss.post("/api/admin/bookings", manual(EP, date, 600, { status: "approved", notify: true, contactEmail: "late@example.com" })));
    const [expires] = await h.sql<{ expires_at: string }>("SELECT expires_at FROM bookings WHERE id = ?", id);
    await bookingService.housekeeping(h.env, new Date(new Date(expires.expires_at).getTime() + 60_000));
    expect(await status(id)).toBe("cancelled");
    expect(await mailTo("late@example.com", "Booking released%")).toContain("The payment window for your approved booking closed.");
  });
  it("lapses a hold for a remote order like any other", async () => {
    const hold = await h.client().post("/api/holds", draft(MIX, "", 0));
    expect(hold.status).toBe(200);
    await bookingService.housekeeping(h.env, new Date(new Date(hold.body.expiresAt).getTime() + 60_000));
    const stored = await h.client().get(`/api/holds/${hold.body.holdId}`);
    expect(stored.body.status).toBe("expired");
  });
});

describe("payments that arrive after the hold lapsed", () => {
  it("still books a remote order, since nothing can have taken its place", async () => {
    const { client, email } = await h.newClient();
    const hold = await client.post("/api/holds", draft(MIX, "", 0, { contactEmail: email }));
    const co = await client.post("/api/checkout", { holdId: hold.body.holdId, plan: "full" });
    await bookingService.housekeeping(h.env, new Date(new Date(hold.body.expiresAt).getTime() + 60_000));
    const paid = await h.payDemo(client, co.body.reference);
    expect(paid.body.status).toBe("confirmed");
    expect(paid.body.booking).toMatchObject({ scheduling: "project", total_kobo: 10_000_000 });
  });
  it("refunds a session payment in full when someone else took the slot meanwhile", async () => {
    const date = fresh(5);
    const { client, email } = await h.newClient();
    const hold = await client.post("/api/holds", draft(REC, date, 600, { contactEmail: email }));
    const co = await client.post("/api/checkout", { holdId: hold.body.holdId, plan: "full" });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(new Date(hold.body.expiresAt).getTime() + 60_000));
    expect((await h.client().post("/api/holds", draft(REC, date, 600))).status).toBe(200);
    vi.useRealTimers();
    const paid = await h.payDemo(client, co.body.reference);
    expect(paid.body.status).toBe("refunded");
    expect(await h.sql("SELECT id FROM bookings WHERE hold_id = ?", hold.body.holdId)).toEqual([]);
    expect(await mailTo(email, "Payment refunded%")).toContain("was taken after your hold expired");
    expect(await mailTo(email, "Payment refunded%")).toContain("10:00am to 11:00am");
  });
  it("refunds a late Saturday session payment with its daytime in the message", async () => {
    const sat = fresh(6);
    const { client, email } = await h.newClient();
    const hold = await client.post("/api/holds", draft(REC, sat, 750, { contactEmail: email }));
    const co = await client.post("/api/checkout", { holdId: hold.body.holdId, plan: "full" });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(new Date(hold.body.expiresAt).getTime() + 60_000));
    expect((await h.client().post("/api/holds", draft(REC, sat, 750))).status).toBe(200);
    vi.useRealTimers();
    expect((await h.payDemo(client, co.body.reference)).body.status).toBe("refunded");
    expect(await mailTo(email, "Payment refunded%")).toContain("12:30pm to 1:30pm");
  });
});
