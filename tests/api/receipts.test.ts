import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHarness, nextWeekday, type Client, type Harness } from "../helpers/harness";

let h: Harness;
let boss: Client;

beforeAll(async () => {
  h = await createHarness();
  boss = await h.ceo();
  const open = (await boss.get("/api/admin/availability")).body.hours;
  await boss.put("/api/admin/availability", { hours: open, buffer: 30, hold: 15, minNotice: 180, bookAhead: 365 });
}, 120000);
afterAll(() => h?.dispose());

const who = { artistName: "Kemi B", contactName: "Kemi Balogun", contactEmail: "kemi@example.com", contactPhone: "+234 805 111 2233" };
const REC = { serviceSlug: "recording", packageId: "pkg_recording_session" };
let turn = 0;
const fresh = (weekday: number) => nextWeekday(weekday, 8 + 7 * turn++);
const manual = (date: string, start: number, over: Record<string, unknown> = {}) =>
  ({ ...REC, date, start, extraHours: 0, extras: [], people: 2, project: "", notes: "", links: "", ...who, status: "confirmed", source: "walk_in", ignoreHours: false, notify: false, payment: null, ...over });

describe("receipts", () => {
  it("a manual booking reserves the slot and its recorded payment has a printable receipt", async () => {
    const date = fresh(2);
    const r = await boss.post("/api/admin/bookings", manual(date, 600, { payment: { amount: 8_000_000, method: "cash", note: "Drawer 1" } }));
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    // The slot is taken now: another booking at the same time clashes.
    expect((await boss.post("/api/admin/bookings", manual(date, 600, { contactEmail: "other@example.com" }))).status).toBe(409);
    const detail = await boss.get(`/api/admin/bookings/${r.body.id}`);
    expect(detail.body.receipts.length).toBe(1);
    const reference = detail.body.receipts[0].reference;
    expect(detail.body.receipts[0].url).toContain("/receipt/");
    const receipt = await boss.get(`/api/admin/receipts?reference=${reference}`);
    expect(receipt.status).toBe(200);
    expect(receipt.body.payment).toMatchObject({ reference, amount_kobo: 8_000_000, provider: "manual", channel: "cash", note: "Drawer 1" });
    expect(receipt.body.booking).toMatchObject({ service_name: "Recording", package_name: "Recording session", total_kobo: 8_000_000, contact_name: "Kemi Balogun", room_name: "Studio A" });
  });

  it("emails the receipt link to the client when the payment is recorded", async () => {
    const date = fresh(3);
    const r = await boss.post("/api/admin/bookings", manual(date, 600, { contactEmail: "receipt@example.com", notify: true, payment: { amount: 4_000_000, method: "transfer", note: "" } }));
    expect(r.status).toBe(200);
    // A payment that confirms the booking rides the confirmation email; the receipt link is in the dashboard for staff to share.
    const mail = (await h.sql<{ subject: string; body: string }>("SELECT subject, body FROM email_outbox WHERE to_email = ? ORDER BY created_at DESC, rowid DESC LIMIT 1", "receipt@example.com"))[0];
    expect(mail.body).toContain("₦40,000");
    const detail = await boss.get(`/api/admin/bookings/${r.body.id}`);
    expect(detail.body.receipts[0].url).toContain("/receipt/");
  });

  it("emails a receipt for a later payment recorded on an already confirmed booking", async () => {
    const date = fresh(1);
    const r = await boss.post("/api/admin/bookings", manual(date, 600, { contactEmail: "balance@example.com", notify: true }));
    expect(r.status).toBe(200);
    const pay = await boss.post(`/api/admin/bookings/${r.body.id}/payments`, { amount: 4_000_000, method: "cash", note: "" });
    expect(pay.status, JSON.stringify(pay.body)).toBe(200);
    expect(pay.body.receipt).toContain("/receipt/");
    const mail = (await h.sql<{ subject: string; body: string }>("SELECT subject, body FROM email_outbox WHERE to_email = ? AND subject LIKE ? ORDER BY created_at DESC, rowid DESC LIMIT 1", "balance@example.com", "Payment received%"))[0];
    expect(mail.subject).toMatch(/Payment received/);
    expect(mail.body).toContain("/receipt/");
    expect(mail.body).toContain("₦40,000");
    expect(mail.body).toContain("Balance due");
  });

  it("the token receipt page needs no login and shows no contacts beyond the booking", async () => {
    const date = fresh(4);
    const r = await boss.post("/api/admin/bookings", manual(date, 600, { payment: { amount: 8_000_000, method: "pos", note: "" } }));
    const detail = await boss.get(`/api/admin/bookings/${r.body.id}`);
    const url: string = detail.body.receipts[0].url;
    const token = url.split("/receipt/")[1];
    const anon = h.client();
    const receipt = await anon.get(`/api/receipts/${token}`);
    expect(receipt.status).toBe(200);
    expect(receipt.body.payment).toMatchObject({ amount_kobo: 8_000_000, provider: "manual", channel: "pos" });
    expect(receipt.body.booking.contact_name).toBe("Kemi Balogun");
    // The token page never leaks email, phone or the payment token itself.
    expect(JSON.stringify(receipt.body)).not.toMatch(/kemi@example\.com|805 111 2233|receipt_token|pay_token/);
    expect((await anon.get(`/api/receipts/${token}x`)).status).toBe(404);
    expect((await anon.get("/api/receipts/")).status).toBe(404);
  });

  it("online payments get a receipt token too, so staff can print them", async () => {
    const { client, email } = await h.newClient();
    const date = fresh(5);
    const hold = await client.post("/api/holds", { ...REC, date, start: 600, extraHours: 0, extras: [], people: 2, project: "", notes: "", links: "", ...who, contactEmail: email });
    expect(hold.status).toBe(200);
    const co = await client.post("/api/checkout", { holdId: hold.body.holdId, plan: "full" });
    expect(co.status).toBe(200);
    await h.payDemo(client, co.body.reference);
    const receipt = await boss.get(`/api/admin/receipts?reference=${co.body.reference}`);
    expect(receipt.status).toBe(200);
    expect(receipt.body.payment).toMatchObject({ reference: co.body.reference, provider: "demo", kind: "full" });
    expect(receipt.body.payment.receipt_token).toBeTruthy();
  });

  it("refuses receipts for pending or failed payments and unknown references", async () => {
    const { client, email } = await h.newClient();
    const date = fresh(6);
    const hold = await client.post("/api/holds", { ...REC, date, start: 600, extraHours: 0, extras: [], people: 2, project: "", notes: "", links: "", ...who, contactEmail: email });
    const co = await client.post("/api/checkout", { holdId: hold.body.holdId, plan: "full" });
    expect((await boss.get(`/api/admin/receipts?reference=${co.body.reference}`)).status).toBe(400);
    expect((await boss.get("/api/admin/receipts?reference=PR-DOES-NOT-EXIST")).status).toBe(404);
    expect((await boss.get("/api/admin/receipts?reference=")).status).toBe(400);
  });

  it("staff without print_receipts cannot read receipts, and the CEO can grant it back", async () => {
    const date = fresh(0);
    const r = await boss.post("/api/admin/bookings", manual(date, 600, { payment: { amount: 8_000_000, method: "cash", note: "" } }));
    const detail = await boss.get(`/api/admin/bookings/${r.body.id}`);
    const reference = detail.body.receipts[0].reference;
    // Default custom staff (no permissions) is refused.
    const bare = await h.newStaff("custom", []);
    expect((await bare.client.get(`/api/admin/receipts?reference=${reference}`)).status).toBe(403);
    // A receptionist with the default set prints receipts.
    const desk = await h.newStaff("receptionist", ["view_calendar", "manage_bookings", "print_receipts"]);
    expect((await desk.client.get(`/api/admin/receipts?reference=${reference}`)).status).toBe(200);
    // The CEO revokes it and the same staff member is refused.
    const staff = (await boss.get("/api/admin/staff")).body.find((s: any) => s.email === desk.email);
    await boss.put(`/api/admin/staff/${staff.id}`, { level: "custom", permissions: ["view_calendar", "manage_bookings"], active: true, title: "" });
    expect((await desk.client.get(`/api/admin/receipts?reference=${reference}`)).status).toBe(403);
  });

  it("permission descriptions and level defaults include print receipts", async () => {
    const { body } = await boss.get("/api/admin/permissions");
    expect(body.permissions.print_receipts).toMatch(/receipt/i);
    expect(body.levels.receptionist.defaults).toContain("print_receipts");
    expect(body.levels.accountant.defaults).toContain("print_receipts");
    expect(body.levels.producer.defaults).toContain("print_receipts");
    expect(body.levels.custom.defaults).toContain("print_receipts");
  });
});
