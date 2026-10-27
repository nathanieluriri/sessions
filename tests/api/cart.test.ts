import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHarness, nextWeekday, type Harness } from "../helpers/harness";

let h: Harness;
beforeAll(async () => { h = await createHarness(); });
afterAll(() => h?.dispose());

describe("multi-session cart", () => {
  it("confirms separate one-hour bookings with one payment and per-booking allocations", async () => {
    const { client, email } = await h.newClient("Cart Artist");
    const date = nextWeekday(2, 8);
    const item = (start: number) => ({
      serviceSlug: "recording", packageId: "pkg_recording_session", date, start, extraHours: 0, extras: [], people: 1,
      artistName: "Cart Artist", contactName: "Cart Artist", contactEmail: email, contactPhone: "+234 906 744 9860",
      project: "Two verses", notes: "", links: "",
    });
    const created = await client.post("/api/cart/holds", { items: [item(600), item(690)] });
    expect(created.status, JSON.stringify(created.body)).toBe(200);
    expect(created.body).toMatchObject({ status: "active", total: 8_000_000, items: expect.any(Array) });

    const payment = await client.post("/api/cart/checkout", { cartId: created.body.id, plan: "full" });
    expect(payment.status, JSON.stringify(payment.body)).toBe(200);
    expect(payment.body.amount).toBe(8_000_000);
    expect((await client.post("/api/cart/checkout", { cartId: created.body.id, plan: "full" })).status).toBe(409);
    const verified = await h.payDemo(client, payment.body.reference);
    expect(verified.body.status).toBe("confirmed");
    expect(verified.body.bookings).toHaveLength(2);
    expect(verified.body.bookings.map((b: any) => [b.start_min, b.end_min])).toEqual([[600, 660], [690, 750]]);

    const allocations = await h.sql<{ amount_kobo: number }>("SELECT amount_kobo FROM payment_allocations WHERE payment_id = (SELECT id FROM payments WHERE reference = ?)", payment.body.reference);
    expect(allocations.map((x) => x.amount_kobo)).toEqual([4_000_000, 4_000_000]);
    const count = await h.sql<{ n: number }>("SELECT COUNT(*) n FROM bookings WHERE hold_id IN (SELECT hold_id FROM booking_cart_items WHERE cart_id = ?)", created.body.id);
    expect(count[0].n).toBe(2);
  });
});
