import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { bookingService, summary } from "../services/bookings";
import { body, minute, required, text, email } from "../lib/validate";
import { requireUser } from "../middleware/auth";
import { paymentProvider } from "../services/payments";
import { paymentsRepo } from "../repositories/bookings";
import { hmacSha512Hex, safeEqual } from "../lib/crypto";
import { notFound } from "../lib/errors";

const r = new Hono<AppEnv>();

// Remote orders have no date or start time, so both may be left out; the server sets them.
export const draftFields = {
  serviceSlug: required("Service"), packageId: required("Package"), date: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, "Invalid date.").default(""), start: minute.default(0), extraHours: z.number().int().min(0).max(8).default(0),
  extras: z.array(z.string()).max(8).default([]), people: z.number().int().min(1).max(200).default(1), artistName: required("Artist, brand or project name"),
  contactName: required("Full name"), contactPhone: required("Phone number", 40),
  project: text(2000).default(""), notes: text(2000).default(""), links: text(1000).default(""),
};
export const draftSchema = z.object({ ...draftFields, contactEmail: email });
const plan = z.enum(["deposit", "full", "balance"]).default("full");

r.post("/quote", async (c) => c.json(await bookingService.priceDraft(c.env, await body(c, draftSchema))));
r.post("/holds", async (c) => c.json(await bookingService.createHold(c.env, await body(c, draftSchema), c.get("user"))));
r.get("/holds/:id", async (c) => c.json(await bookingService.getHold(c.env, c.req.param("id"))));
r.delete("/holds/:id", async (c) => { await bookingService.releaseHold(c.env, c.req.param("id")); return c.json({ ok: true }); });

r.post("/checkout", requireUser, async (c) => {
  const b = await body(c, z.object({ holdId: required("Hold"), plan }));
  return c.json(await bookingService.checkout(c.env, c.get("user")!, b.holdId, b.plan, new URL(c.req.url).origin));
});
r.post("/requests", requireUser, async (c) => {
  const b = await body(c, z.object({ holdId: required("Hold") }));
  return c.json({ booking: summary(await bookingService.submitRequest(c.env, c.get("user")!, b.holdId)) });
});

// Payment links work for the signed-in owner, staff, or anyone holding the token from the booking email.
r.get("/pay/:id", async (c) => c.json(await bookingService.payPage(c.env, c.req.param("id"), { token: c.req.query("t"), user: c.get("user") })));
r.post("/pay/:id", async (c) => {
  const b = await body(c, z.object({ t: z.string().max(100).optional(), plan }));
  return c.json(await bookingService.payBooking(c.env, c.req.param("id"), { token: b.t, user: c.get("user") }, b.plan, new URL(c.req.url).origin));
});

r.get("/payments/verify", async (c) => {
  const ref = c.req.query("reference") ?? "";
  const payment = await paymentsRepo.byReference(c.env.DB, ref);
  if (!payment) throw notFound();
  const result = await bookingService.confirmPayment(c.env, ref, "server_verify");
  return c.json({ status: result.status, booking: result.booking ? summary(result.booking) : null, payment: { kind: payment.kind, amount_kobo: payment.amount_kobo } });
});

// Paystack calls this; the signature proves the event came from Paystack before anything is trusted.
r.post("/payments/webhook", async (c) => {
  const raw = await c.req.text();
  const key = c.env.PAYSTACK_SECRET_KEY;
  if (!key || !safeEqual(await hmacSha512Hex(key, raw), c.req.header("x-paystack-signature") ?? "")) return c.json({ ok: false }, 401);
  const event = JSON.parse(raw) as { event: string; data: { reference: string } };
  if (event.event === "charge.success" && (await paymentsRepo.byReference(c.env.DB, event.data.reference))) await bookingService.confirmPayment(c.env, event.data.reference, "webhook");
  return c.json({ ok: true });
});

// Simulated provider for environments without Paystack keys. Disabled automatically once a key is set.
r.get("/payments/demo/:reference", async (c) => {
  if (paymentProvider(c.env).name !== "demo") throw notFound();
  const t = await paymentsRepo.demoGet(c.env.DB, c.req.param("reference"));
  if (!t) throw notFound();
  return c.json(t);
});
r.post("/payments/demo/:reference", async (c) => {
  if (paymentProvider(c.env).name !== "demo") throw notFound();
  const b = await body(c, z.object({ outcome: z.enum(["success", "failed"]), channel: z.enum(["card", "bank_transfer", "ussd"]) }));
  await paymentsRepo.demoSet(c.env.DB, c.req.param("reference"), b.outcome, b.channel);
  return c.json({ ok: true });
});

export default r;
