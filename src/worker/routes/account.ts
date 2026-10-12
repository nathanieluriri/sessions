import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { bookingService } from "../services/bookings";
import { paymentsRepo } from "../repositories/bookings";
import { notificationsRepo } from "../repositories/misc";
import { body, date, minute, text } from "../lib/validate";
import { requireUser } from "../middleware/auth";

const r = new Hono<AppEnv>();
r.use("*", requireUser);

r.get("/overview", async (c) => {
  const u = c.get("user")!;
  const [bookings, payments, notifications] = await Promise.all([bookingService.forClient(c.env, u), paymentsRepo.forUser(c.env.DB, u.id), notificationsRepo.forUser(c.env.DB, u.id)]);
  return c.json({ bookings, payments, notifications });
});
r.post("/notifications/read", async (c) => { await notificationsRepo.markRead(c.env.DB, c.get("user")!.id); return c.json({ ok: true }); });
r.get("/bookings/:id", async (c) => c.json(await bookingService.detailForClient(c.env, c.get("user")!, c.req.param("id"))));
r.post("/bookings/:id/requests", async (c) => {
  const b = await body(c, z.object({ kind: z.enum(["reschedule", "cancel"]), newDate: date.optional(), newStart: minute.optional(), reason: text(1000).default("") }));
  await bookingService.requestChange(c.env, c.get("user")!, c.req.param("id"), b);
  return c.json({ ok: true });
});
r.post("/bookings/:id/withdraw", async (c) => { await bookingService.withdraw(c.env, c.get("user")!, c.req.param("id")); return c.json({ ok: true }); });

export default r;
