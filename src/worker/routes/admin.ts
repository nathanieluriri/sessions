import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { requireCeo, requirePermission, requireStaff } from "../middleware/auth";
import { body, date, minute, required, text, email } from "../lib/validate";
import { bookingService } from "../services/bookings";
import { availabilitySettingsService, catalogService, contentService, dashboardService, enquiryService, reportService, staffService } from "../services/admin";
import { bookingsRepo, paymentsRepo } from "../repositories/bookings";
import { catalogRepo } from "../repositories/catalog";
import { audit } from "../services/audit";
import { forbidden, notFound } from "../lib/errors";
import { studioNow, addDays } from "../lib/time";
import { PERMISSIONS, CEO_ONLY } from "../../shared/permissions";

const r = new Hono<AppEnv>();
r.use("*", requireStaff);

r.get("/overview", async (c) => {
  const data = await dashboardService.overview(c.env);
  // Financial figures are CEO only; admins get the operational parts.
  if (c.get("user")!.role !== "ceo") return c.json({ ...data, report: null });
  return c.json(data);
});
r.get("/permissions", (c) => c.json({ permissions: PERMISSIONS, ceoOnly: CEO_ONLY }));

// Calendar and bookings
r.get("/calendar", requirePermission("view_calendar"), async (c) => {
  const from = c.req.query("from") ?? studioNow().date;
  return c.json(await bookingService.calendar(c.env, from, c.req.query("to") ?? addDays(from, 6)));
});
r.get("/bookings", requirePermission("view_calendar"), async (c) =>
  c.json(await bookingsRepo.list(c.env.DB, { q: c.req.query("q") || undefined, status: c.req.query("status") || undefined, from: c.req.query("from") || undefined })));
r.get("/bookings/:id", requirePermission("view_calendar"), async (c) => {
  const b = await bookingsRepo.byId(c.env.DB, c.req.param("id"));
  if (!b) throw notFound();
  const payment = await paymentsRepo.forBooking(c.env.DB, b.id);
  const u = c.get("user")!;
  return c.json({ booking: { ...b, extras: JSON.parse(b.extras) }, payment: u.role === "ceo" || u.permissions.includes("manage_bookings") ? payment : null });
});
r.put("/bookings/:id/details", requirePermission("update_booking_details"), async (c) => {
  const b = await body(c, z.object({ people: z.number().int().min(1).max(20), artist_name: required("Artist name"), contact_phone: required("Phone", 40), notes: text(2000) }));
  const bk = await bookingsRepo.byId(c.env.DB, c.req.param("id"));
  if (!bk) throw notFound();
  await bookingsRepo.updateDetails(c.env.DB, bk.id, b);
  await audit(c.env.DB, c.get("user"), "Updated booking details", bk.ref);
  return c.json({ ok: true });
});
r.post("/bookings/:id/reschedule", requirePermission("manage_bookings"), async (c) => {
  const b = await body(c, z.object({ date, start: minute }));
  await bookingService.reschedule(c.env, c.get("user")!, c.req.param("id"), b.date, b.start);
  return c.json({ ok: true });
});
r.post("/bookings/:id/cancel", requirePermission("manage_bookings"), async (c) => {
  const b = await body(c, z.object({ reason: required("Reason", 500), fullRefund: z.boolean().default(false) }));
  await bookingService.cancel(c.env, c.get("user")!, c.req.param("id"), b.reason, b.fullRefund ? 1 : undefined);
  return c.json({ ok: true });
});
r.get("/requests", requirePermission("manage_bookings"), async (c) => c.json(await dashboardService.requests(c.env)));
r.post("/requests/:id", requirePermission("manage_bookings"), async (c) => {
  const b = await body(c, z.object({ approve: z.boolean() }));
  await bookingService.decideRequest(c.env, c.get("user")!, c.req.param("id"), b.approve);
  return c.json({ ok: true });
});

// Availability
r.get("/availability", requirePermission("view_calendar"), async (c) => c.json(await availabilitySettingsService.get(c.env)));
r.put("/availability", requirePermission("edit_availability"), async (c) => {
  const b = await body(c, z.object({
    hours: z.array(z.object({ weekday: z.number().int().min(0).max(6), is_open: z.number().int().min(0).max(1), open_min: minute, close_min: minute })).length(7),
    buffer: z.number().int().min(0).max(180), hold: z.number().int().min(5).max(60), minNotice: z.number().int().min(0).max(10080), bookAhead: z.number().int().min(1).max(365),
  }));
  await availabilitySettingsService.save(c.env, c.get("user")!, b);
  return c.json({ ok: true });
});
r.post("/blocks", requirePermission("edit_availability"), async (c) => {
  const b = await body(c, z.object({ date, start: minute, end: minute, reason: required("Reason", 200) }));
  await availabilitySettingsService.addBlock(c.env, c.get("user")!, b);
  return c.json({ ok: true });
});
r.delete("/blocks/:id", requirePermission("edit_availability"), async (c) => { await availabilitySettingsService.removeBlock(c.env, c.get("user")!, c.req.param("id")); return c.json({ ok: true }); });

// Catalogue
r.get("/catalog", requirePermission("edit_packages"), async (c) => {
  const [services, packages] = await Promise.all([catalogRepo.services(c.env.DB, true), catalogRepo.packages(c.env.DB, true)]);
  return c.json({ services, packages: packages.map((p) => ({ ...p, includes: JSON.parse(p.includes) })) });
});
const packageSchema = z.object({
  id: z.string().optional(), name: required("Name", 80), description: required("Description", 400), category: z.enum(["session", "post"]),
  durationMin: z.number().int().min(30).max(720), priceKobo: z.number().int().min(0), includes: z.array(text(80)).max(6), featured: z.boolean(), active: z.boolean(),
});
r.post("/packages", requirePermission("edit_packages"), async (c) => c.json({ id: await catalogService.savePackage(c.env, c.get("user")!, await body(c, packageSchema)) }));
r.delete("/packages/:id", requirePermission("edit_packages"), async (c) => { await catalogService.deletePackage(c.env, c.get("user")!, c.req.param("id")); return c.json({ ok: true }); });
r.put("/services/:id", requirePermission("edit_packages"), async (c) => {
  const b = await body(c, z.object({ name: required("Name", 80), description: required("Description", 400), price_label: required("Price label", 60), active: z.boolean() }));
  await catalogRepo.updateService(c.env.DB, c.req.param("id"), b);
  await catalogRepo.setServiceActive(c.env.DB, c.req.param("id"), b.active);
  await audit(c.env.DB, c.get("user"), "Updated service", b.name, b.active ? "" : "Deactivated");
  return c.json({ ok: true });
});

// Enquiries
r.get("/enquiries", requirePermission("assist_clients"), async (c) => c.json(await enquiryService.list(c.env)));
r.post("/enquiries/:id/reply", requirePermission("assist_clients"), async (c) => {
  const b = await body(c, z.object({ message: required("Message", 4000) }));
  await enquiryService.reply(c.env, c.get("user")!, c.req.param("id"), b.message);
  return c.json({ ok: true });
});

// CEO only
const ceo = new Hono<AppEnv>();
ceo.use("*", requireCeo);
ceo.get("/payments", async (c) => c.json(await dashboardService.payments(c.env)));
ceo.get("/reports", async (c) => {
  const today = studioNow().date;
  return c.json(await reportService.overview(c.env, c.req.query("from") ?? `${today.slice(0, 7)}-01`, c.req.query("to") ?? today));
});
ceo.get("/reports.csv", async (c) => {
  const today = studioNow().date;
  const csv = await reportService.csv(c.env, c.req.query("from") ?? `${today.slice(0, 7)}-01`, c.req.query("to") ?? addDays(today, 90));
  return c.body(csv, 200, { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="sessions-bookings.csv"` });
});
ceo.get("/staff", async (c) => c.json(await staffService.list(c.env)));
ceo.post("/staff", async (c) => {
  const b = await body(c, z.object({ name: required("Name"), email, title: text(60).default(""), permissions: z.array(z.string()) }));
  await staffService.create(c.env, c.get("user")!, b);
  return c.json({ ok: true });
});
ceo.put("/staff/:id", async (c) => {
  if (c.req.param("id") === c.get("user")!.id) throw forbidden("You cannot change your own access.");
  const b = await body(c, z.object({ permissions: z.array(z.string()), active: z.boolean(), title: text(60).default("") }));
  await staffService.update(c.env, c.get("user")!, c.req.param("id"), b);
  return c.json({ ok: true });
});
ceo.get("/content", async (c) => c.json(await contentService.get(c.env)));
ceo.put("/policies/:slug", async (c) => {
  const b = await body(c, z.object({ title: required("Title", 80), body: required("Policy text", 4000) }));
  await contentService.savePolicy(c.env, c.get("user")!, c.req.param("slug"), b.title, b.body);
  return c.json({ ok: true });
});
ceo.put("/content", async (c) => {
  const b = await body(c, z.record(z.string(), text(600)));
  await contentService.saveContent(c.env, c.get("user")!, b);
  return c.json({ ok: true });
});
ceo.get("/audit", async (c) => c.json(await dashboardService.audit(c.env)));
ceo.get("/outbox", async (c) => c.json(await dashboardService.outbox(c.env)));

r.route("/", ceo);
export default r;
