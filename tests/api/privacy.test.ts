import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHarness, nextWeekday, type Harness } from "../helpers/harness";

let h: Harness;
let bookingId = "";

beforeAll(async () => {
  h = await createHarness();
  const boss = await h.ceo();
  const cat = (await boss.get("/api/catalog")).body;
  const pkg = cat.packages.find((p: any) => p.slug === "recording-session");
  const r = await boss.post("/api/admin/bookings", {
    serviceSlug: "recording", packageId: pkg.id, date: nextWeekday(2), start: 600, extraHours: 0, extras: [], people: 2,
    artistName: "Kemi B", contactName: "Kemi Balogun", contactEmail: "kemi@example.com", contactPhone: "+234 805 111 2233", project: "", notes: "", links: "",
    status: "confirmed", source: "phone", ignoreHours: false, notify: false, payment: null,
  });
  expect(r.status).toBe(200);
  bookingId = r.body.id;
}, 120000);
afterAll(() => h?.dispose());

describe("producers cannot reach clients outside the portal", () => {
  it("get no email, phone or payment token from any booking endpoint", async () => {
    const { client } = await h.newStaff("producer", ["view_calendar", "deliver_files"]);
    const list = await client.get("/api/admin/bookings");
    expect(list.status).toBe(200);
    const row = list.body.find((b: any) => b.id === bookingId);
    expect(row.contact_email).toBe("");
    expect(row.contact_phone).toBe("");
    expect(row.contact_name).toBe("Kemi Balogun");
    expect(JSON.stringify(list.body)).not.toContain("pay_token");
    const detail = await client.get(`/api/admin/bookings/${bookingId}`);
    expect(detail.body.booking.contact_email).toBe("");
    expect(detail.body.booking.contact_phone).toBe("");
    expect(detail.body.payLink).toBeNull();
    expect(JSON.stringify(detail.body)).not.toMatch(/pay_token|kemi@example\.com|805 111 2233/);
  });

  it("are refused the client list and see no contacts on the dashboard overview", async () => {
    const { client } = await h.newStaff("producer", ["view_calendar", "deliver_files"]);
    expect((await client.get("/api/admin/clients")).status).toBe(403);
    expect((await client.get("/api/admin/clients/history?key=kemi@example.com")).status).toBe(403);
    const overview = await client.get("/api/admin/overview");
    expect(JSON.stringify(overview.body)).not.toMatch(/pay_token|kemi@example\.com|805 111 2233/);
  });

  it("front desk staff and the CEO keep full access, still without the payment token", async () => {
    const boss = await h.ceo();
    const detail = await boss.get(`/api/admin/bookings/${bookingId}`);
    expect(detail.body.booking.contact_email).toBe("kemi@example.com");
    expect(detail.body.booking.pay_token).toBeUndefined();
    expect(detail.body.payLink).toContain("/pay/");
    const desk = await h.newStaff("receptionist", ["view_calendar", "manage_bookings"]);
    expect((await desk.client.get(`/api/admin/bookings/${bookingId}`)).body.booking.contact_phone).toBe("+234 805 111 2233");
    expect((await desk.client.get("/api/admin/clients")).status).toBe(200);
  });

  it("staff with no permissions see no bookings on the overview", async () => {
    const { client } = await h.newStaff("custom", []);
    const overview = await client.get("/api/admin/overview");
    expect(overview.status).toBe(200);
    expect(overview.body.todays).toEqual([]);
  });

  it("report exports blank the contacts for staff who cannot see them", async () => {
    const { client } = await h.newStaff("custom", ["view_reports"]);
    const csv = await client.call("GET", `/api/admin/reports.csv?from=2020-01-01&to=2099-01-01`);
    const text = await csv.res.text();
    expect(text).toContain("Kemi Balogun");
    expect(text).not.toMatch(/kemi@example\.com|805 111 2233/);
  });
});
