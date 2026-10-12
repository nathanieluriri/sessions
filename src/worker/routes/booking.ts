import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { bookingService } from "../services/bookings";
import { body, date, minute, required, text, email } from "../lib/validate";
import { requireUser } from "../middleware/auth";
import { paymentProvider } from "../services/payments";
import { paymentsRepo } from "../repositories/bookings";
import { hmacSha512Hex, safeEqual } from "../lib/crypto";
import { forbidden, notFound } from "../lib/errors";

const r = new Hono<AppEnv>();

export const draftSchema = z.object({
  serviceSlug: required("Service"), packageId: required("Package"), date, start: minute, extraHours: z.number().int().min(0).max(4),
  extras: z.array(z.string()).max(5), people: z.number().int().min(1).max(20), artistName: required("Artist or group name"),
  contactName: required("Full name"), contactEmail: email, contactPhone: required("Phone number", 40), notes: text(2000).default(""),
});

r.post("/quote", async (c) => c.json(await bookingService.priceDraft(c.env, await body(c, draftSchema))));
r.post("/holds", async (c) => c.json(await bookingService.createHold(c.env, await body(c, draftSchema), c.get("user"))));
r.get("/holds/:id", async (c) => c.json(await bookingService.getHold(c.env, c.req.param("id"))));
r.delete("/holds/:id", async (c) => { await bookingService.releaseHold(c.env, c.req.param("id")); return c.json({ ok: true }); });

r.post("/checkout", requireUser, async (c) => {
  const b = await body(c, z.object({ holdId: required("Hold") }));
  return c.json(await bookingService.checkout(c.env, c.get("user")!, b.holdId, new URL(c.req.url).origin));
});

r.get("/payments/verify", requireUser, async (c) => {
  const ref = c.req.query("reference") ?? "";
  const p = await paymentsRepo.byReference(c.env.DB, ref);
  if (!p) throw notFound();
  if (p.user_id !== c.get("user")!.id) throw forbidden();
  return c.json(await bookingService.confirmPayment(c.env, ref, "server_verify"));
});

// Paystack calls this; the signature proves the event came from Paystack before anything is trusted.
r.post("/payments/webhook", async (c) => {
  const raw = await c.req.text();
  const key = c.env.PAYSTACK_SECRET_KEY;
  if (!key || !safeEqual(await hmacSha512Hex(key, raw), c.req.header("x-paystack-signature") ?? "")) return c.json({ ok: false }, 401);
  const event = JSON.parse(raw) as { event: string; data: { reference: string } };
  if (event.event === "charge.success") await bookingService.confirmPayment(c.env, event.data.reference, "webhook");
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
