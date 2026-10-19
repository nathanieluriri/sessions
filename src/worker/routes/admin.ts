import { Hono, type Context } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { requirePermission, requireStaff } from "../middleware/auth";
import { body, date, minute, required, text, email } from "../lib/validate";
import { bookingService } from "../services/bookings";
import { availabilitySettingsService, catalogService, clientService, contentService, dashboardService, enquiryService, reportService, staffService } from "../services/admin";
import { collectionFor, collectionsService } from "../services/collections";
import { bookingsRepo } from "../repositories/bookings";
import { catalogRepo } from "../repositories/catalog";
import { contentRepo, settingsRepo } from "../repositories/settings";
import { run } from "../repositories/db";
import { audit } from "../services/audit";
import { draftFields } from "./booking";
import { badRequest, forbidden } from "../lib/errors";
import { uuid } from "../lib/crypto";
import { studioNow, addDays } from "../lib/time";
import { can } from "../middleware/auth";
import { LEVELS, OWNER_ONLY, PERMISSIONS, isOwner, type Level } from "../../shared/permissions";

const r = new Hono<AppEnv>();
r.use("*", requireStaff);
const actor = (c: Context<AppEnv>) => c.get("user")!;
const ok = { ok: true };

r.get("/overview", async (c) => {
  const data = await dashboardService.overview(c.env);
  if (!isOwner(actor(c))) return c.json({ ...data, report: can(actor(c), "view_reports") ? data.report : null });
  const content = await contentRepo.content(c.env.DB);
  const setup = {
    payments: !!c.env.PAYSTACK_SECRET_KEY, email: !!c.env.RESEND_API_KEY, domain: !new URL(c.env.APP_URL).hostname.endsWith(".workers.dev"),
    contact: !!content.contact_phone && content.contact_phone !== "+234 812 555 0142", analytics: !!(content.analytics_cf || content.analytics_ga), indexing: content.seo_indexing === "1",
  };
  return c.json({ ...data, setup });
});
r.get("/permissions", (c) => c.json({ permissions: PERMISSIONS, levels: LEVELS, ownerOnly: OWNER_ONLY }));

// Calendar, bookings and clients
r.get("/calendar", requirePermission("view_calendar"), async (c) => {
  const from = c.req.query("from") ?? studioNow().date;
  return c.json(await bookingService.calendar(c.env, from, c.req.query("to") ?? addDays(from, 6), c.req.query("room") || undefined));
});
r.get("/bookings", requirePermission("view_calendar"), async (c) =>
  c.json((await bookingsRepo.list(c.env.DB, { q: c.req.query("q") || undefined, status: c.req.query("status") || undefined, from: c.req.query("from") || undefined, room: c.req.query("room") || undefined }))
    .map((b) => ({ ...b, pay_token: undefined }))));
r.get("/bookings/:id", requirePermission("view_calendar"), async (c) => c.json(await bookingService.detailForStaff(c.env, actor(c), c.req.param("id"))));
r.post("/bookings", requirePermission("manage_bookings"), async (c) => {
  const b = await body(c, z.object({
    ...draftFields, contactEmail: z.union([email, z.literal("")]).default(""),
    status: z.enum(["confirmed", "approved"]), source: z.enum(["phone", "whatsapp", "walk_in", "email", "instagram", "other"]), ignoreHours: z.boolean().default(false), notify: z.boolean().default(true),
    payment: z.object({ amount: z.number().int().min(1), method: z.enum(["cash", "transfer", "pos", "other"]), note: text(200).default("") }).nullable().default(null),
  }));
  if (b.payment && !can(actor(c), "record_payments")) throw forbidden("Recording payments needs the record payments permission.");
  const booking = await bookingService.createManual(c.env, actor(c), b);
  return c.json({ id: booking.id, ref: booking.ref });
});
r.put("/bookings/:id/details", requirePermission("update_booking_details"), async (c) => {
  const b = await body(c, z.object({ people: z.number().int().min(1).max(200), artist_name: required("Artist name"), contact_phone: required("Phone", 40), notes: text(2000), project: text(2000).default(""), reference_links: text(1000).default("") }));
  const bk = await bookingsRepo.byId(c.env.DB, c.req.param("id"));
  if (!bk) throw badRequest("Booking not found.");
  await bookingsRepo.updateDetails(c.env.DB, bk.id, b);
  await audit(c.env.DB, actor(c), "Updated booking details", bk.ref);
  return c.json(ok);
});
r.post("/bookings/:id/reschedule", requirePermission("manage_bookings"), async (c) => {
  const b = await body(c, z.object({ date, start: minute }));
  await bookingService.reschedule(c.env, actor(c), c.req.param("id"), b.date, b.start);
  return c.json(ok);
});
r.post("/bookings/:id/cancel", requirePermission("manage_bookings"), async (c) => {
  const b = await body(c, z.object({ reason: required("Reason", 500), fullRefund: z.boolean().default(false) }));
  return c.json(await bookingService.cancel(c.env, actor(c), c.req.param("id"), b.reason, b.fullRefund ? 1 : undefined));
});
r.post("/bookings/:id/approve", requirePermission("manage_bookings"), async (c) => {
  const b = await body(c, z.object({ note: text(500).default("") }));
  await bookingService.approve(c.env, actor(c), c.req.param("id"), b.note);
  return c.json(ok);
});
r.post("/bookings/:id/reject", requirePermission("manage_bookings"), async (c) => {
  const b = await body(c, z.object({ reason: required("Reason", 500) }));
  await bookingService.reject(c.env, actor(c), c.req.param("id"), b.reason);
  return c.json(ok);
});
r.post("/bookings/:id/confirm", requirePermission("manage_bookings"), async (c) => {
  const b = await body(c, z.object({ note: text(500).default("") }));
  await bookingService.confirmWithoutPayment(c.env, actor(c), c.req.param("id"), b.note);
  return c.json(ok);
});
r.post("/bookings/:id/outcome", requirePermission("manage_bookings"), async (c) => {
  const b = await body(c, z.object({ outcome: z.enum(["completed", "no_show"]) }));
  await bookingService.setOutcome(c.env, actor(c), c.req.param("id"), b.outcome);
  return c.json(ok);
});
r.post("/bookings/:id/payments", requirePermission("record_payments"), async (c) => {
  const b = await body(c, z.object({ amount: z.number().int().min(1), method: z.enum(["cash", "transfer", "pos", "other"]), note: text(200).default("") }));
  await bookingService.recordPayment(c.env, actor(c), c.req.param("id"), b);
  return c.json(ok);
});
r.post("/bookings/:id/payment-link", requirePermission("record_payments"), async (c) => c.json(await bookingService.sendPaymentLink(c.env, actor(c), c.req.param("id"))));
r.get("/requests", requirePermission("manage_bookings"), async (c) => c.json(await dashboardService.requests(c.env)));
r.post("/requests/:id", requirePermission("manage_bookings"), async (c) => {
  const b = await body(c, z.object({ approve: z.boolean() }));
  await bookingService.decideRequest(c.env, actor(c), c.req.param("id"), b.approve);
  return c.json(ok);
});
r.get("/clients", requirePermission("view_calendar"), async (c) => c.json(await clientService.list(c.env, c.req.query("q") || null)));
r.get("/clients/history", requirePermission("view_calendar"), async (c) => c.json(await clientService.history(c.env, c.req.query("key") ?? "")));

// Availability
r.get("/availability", requirePermission("view_calendar"), async (c) => c.json(await availabilitySettingsService.get(c.env)));
r.put("/availability", requirePermission("edit_availability"), async (c) => {
  const b = await body(c, z.object({
    hours: z.array(z.object({ weekday: z.number().int().min(0).max(6), is_open: z.number().int().min(0).max(1), open_min: minute, close_min: minute })).length(7),
    buffer: z.number().int().min(0).max(180), hold: z.number().int().min(5).max(60), minNotice: z.number().int().min(0).max(10080), bookAhead: z.number().int().min(1).max(365),
  }));
  await availabilitySettingsService.save(c.env, actor(c), b);
  return c.json(ok);
});
r.post("/blocks", requirePermission("edit_availability"), async (c) => {
  const b = await body(c, z.object({ date, start: minute, end: minute, reason: required("Reason", 200), roomId: z.string().max(64).nullable().default(null) }));
  await availabilitySettingsService.addBlock(c.env, actor(c), { ...b, roomId: b.roomId || null });
  return c.json(ok);
});
r.delete("/blocks/:id", requirePermission("edit_availability"), async (c) => { await availabilitySettingsService.removeBlock(c.env, actor(c), c.req.param("id")); return c.json(ok); });

// Services, packages, rooms and booking rules
r.get("/catalog", requirePermission("edit_packages"), async (c) => {
  const [services, packages, rooms, categories, extras, settings] = await Promise.all([
    collectionsService.list(c.env, "services"), catalogRepo.packages(c.env.DB, true), collectionsService.list(c.env, "rooms"), collectionsService.list(c.env, "categories"),
    collectionsService.list(c.env, "extras"), settingsRepo.all(c.env.DB),
  ]);
  return c.json({
    services, rooms, categories, extras, packages: packages.map((p) => ({ ...p, includes: JSON.parse(p.includes) })),
    rules: { depositPercent: +settings.deposit_percent, requireApproval: settings.require_approval === "1", requestExpiryHours: +settings.request_expiry_hours, paymentWindowHours: +settings.payment_window_hours, reminderHours: +settings.reminder_hours, extraHourKobo: +settings.extra_hour_kobo, maxPeople: +settings.max_people },
  });
});
const packageSchema = z.object({
  id: z.string().optional(), name: required("Name", 80), description: required("Description", 400), category: z.enum(["session", "post"]),
  durationMin: z.number().int().min(30).max(1440), priceKobo: z.number().int().min(0), includes: z.array(text(80)).max(8), featured: z.boolean(), active: z.boolean(),
  serviceCategory: required("Category", 40), roomId: z.string().max(64).nullable(), pricing: z.enum(["fixed", "quote"]), depositPercent: z.number().int().min(0).max(100).nullable(),
  requiresApproval: z.boolean(), priceNote: text(120).default(""),
});
r.post("/packages", requirePermission("edit_packages"), async (c) => c.json({ id: await catalogService.savePackage(c.env, actor(c), await body(c, packageSchema)) }));
r.delete("/packages/:id", requirePermission("edit_packages"), async (c) => { await catalogService.deletePackage(c.env, actor(c), c.req.param("id")); return c.json(ok); });
r.put("/rules", requirePermission("edit_packages"), async (c) => {
  const b = await body(c, z.object({
    depositPercent: z.number().int().min(0).max(100), requireApproval: z.boolean(), requestExpiryHours: z.number().int().min(1).max(336),
    paymentWindowHours: z.number().int().min(1).max(336), reminderHours: z.number().int().min(1).max(168), extraHourKobo: z.number().int().min(0), maxPeople: z.number().int().min(1).max(200),
  }));
  await catalogService.saveRules(c.env, actor(c), b);
  return c.json(ok);
});

r.put("/categories/:slug/bookable", requirePermission("toggle_booking_categories"), async (c) => {
  const b = await body(c, z.object({ bookable: z.boolean() }));
  const cat = await catalogRepo.categoryBySlug(c.env.DB, c.req.param("slug"));
  if (!cat) throw badRequest("That category does not exist.");
  await catalogRepo.setBookable(c.env.DB, cat.slug, b.bookable);
  await audit(c.env.DB, actor(c), b.bookable ? "Opened category for booking" : "Closed category for booking", cat.name);
  return c.json(ok);
});

// Generic collections: rooms, categories, services, extras, portfolio, team, equipment, gallery, testimonials, FAQs, announcements, page SEO
const collectionAccess = (c: Context<AppEnv>) => {
  const col = collectionFor(c.req.param("name") ?? "");
  if (!can(actor(c), col.perm)) throw forbidden();
};
r.get("/collections/:name", async (c) => { collectionAccess(c); return c.json(await collectionsService.list(c.env, c.req.param("name"))); });
r.post("/collections/:name", async (c) => { collectionAccess(c); return c.json({ id: await collectionsService.save(c.env, actor(c), c.req.param("name"), null, await c.req.json().catch(() => null)) }); });
r.put("/collections/:name/:id", async (c) => { collectionAccess(c); return c.json({ id: await collectionsService.save(c.env, actor(c), c.req.param("name"), c.req.param("id"), await c.req.json().catch(() => null)) }); });
r.delete("/collections/:name/:id", async (c) => { collectionAccess(c); await collectionsService.remove(c.env, actor(c), c.req.param("name"), c.req.param("id")); return c.json(ok); });

// Website content, policies, SEO and analytics
r.get("/content", requirePermission("edit_content"), async (c) => c.json({ ...(await contentService.get(c.env)), pages: await contentRepo.pageMeta(c.env.DB) }));
r.put("/policies/:slug", requirePermission("edit_content"), async (c) => {
  const b = await body(c, z.object({ title: required("Title", 80), body: required("Text", 20000) }));
  await contentService.savePolicy(c.env, actor(c), c.req.param("slug"), b.title, b.body);
  return c.json(ok);
});
r.put("/content", requirePermission("edit_content"), async (c) => {
  const b = await body(c, z.record(z.string().regex(/^[a-z_]{2,40}$/, "Invalid field."), text(2000)));
  await contentService.saveContent(c.env, actor(c), b);
  return c.json(ok);
});

// Image uploads go to R2 and are served from /media. Images are resized in the browser before upload.
const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
r.post("/uploads", async (c) => {
  const u = actor(c);
  if (!can(u, "edit_content") && !can(u, "edit_packages")) throw forbidden();
  if (!c.env.MEDIA) throw badRequest("Uploads are not set up on this deployment. Paste an image link instead.");
  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") throw badRequest("Choose an image to upload.");
  const ext = IMAGE_TYPES[file.type];
  if (!ext) throw badRequest("Upload a JPG, PNG, WebP or GIF image.");
  if (file.size > 8 * 1024 * 1024) throw badRequest("Images must be under 8 MB.");
  const key = `${studioNow().date.slice(0, 7)}/${uuid()}.${ext}`;
  await c.env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type, cacheControl: "public, max-age=31536000, immutable" } });
  await run(c.env.DB, "INSERT INTO uploads (key, name, content_type, size, uploaded_by) VALUES (?, ?, ?, ?, ?)", key, file.name.slice(0, 200), file.type, file.size, u.id);
  await audit(c.env.DB, u, "Uploaded image", file.name.slice(0, 200));
  return c.json({ url: `/media/${key}` });
});

// Enquiries and quote requests
r.get("/enquiries", requirePermission("assist_clients"), async (c) => c.json(await enquiryService.list(c.env)));
r.post("/enquiries/:id/reply", requirePermission("assist_clients"), async (c) => {
  const b = await body(c, z.object({ message: required("Message", 4000) }));
  await enquiryService.reply(c.env, actor(c), c.req.param("id"), b.message);
  return c.json(ok);
});
r.post("/enquiries/:id/close", requirePermission("assist_clients"), async (c) => { await enquiryService.close(c.env, actor(c), c.req.param("id")); return c.json(ok); });

// Payments, reports, staff and audit
const levelSchema = z.enum(Object.keys(LEVELS) as [Level, ...Level[]]);
r.get("/payments", requirePermission("view_payments"), async (c) => c.json(await dashboardService.payments(c.env)));
r.get("/payments/lookup", requirePermission("verify_payments"), async (c) => c.json(await bookingService.lookupPayment(c.env, (c.req.query("reference") ?? "").trim())));
r.post("/payments/:reference/check", requirePermission("verify_payments"), async (c) => c.json(await bookingService.checkPayment(c.env, actor(c), c.req.param("reference"))));
r.get("/reports", requirePermission("view_reports"), async (c) => {
  const today = studioNow().date;
  return c.json(await reportService.overview(c.env, c.req.query("from") ?? `${today.slice(0, 7)}-01`, c.req.query("to") ?? today));
});
r.get("/reports.csv", requirePermission("view_reports"), async (c) => {
  const today = studioNow().date;
  const csv = await reportService.csv(c.env, c.req.query("from") ?? `${today.slice(0, 7)}-01`, c.req.query("to") ?? addDays(today, 90));
  return c.body(csv, 200, { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="psych-records-bookings.csv"` });
});
r.get("/staff", requirePermission("manage_staff"), async (c) => c.json(await staffService.list(c.env)));
r.post("/staff", requirePermission("manage_staff"), async (c) => {
  const b = await body(c, z.object({ name: required("Name"), email, title: text(60).default(""), level: levelSchema.default("custom"), permissions: z.array(z.string()) }));
  await staffService.create(c.env, actor(c), b);
  return c.json(ok);
});
r.put("/staff/:id", requirePermission("manage_staff"), async (c) => {
  const b = await body(c, z.object({ level: levelSchema.default("custom"), permissions: z.array(z.string()), active: z.boolean(), title: text(60).default("") }));
  await staffService.update(c.env, actor(c), c.req.param("id"), b);
  return c.json(ok);
});
r.get("/audit", requirePermission("view_audit"), async (c) => c.json(await dashboardService.audit(c.env)));
r.get("/outbox", requirePermission("view_audit"), async (c) => c.json(await dashboardService.outbox(c.env)));

export default r;
