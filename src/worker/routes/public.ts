import { Hono, type Context } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { catalogRepo } from "../repositories/catalog";
import { contentRepo, settingsRepo } from "../repositories/settings";
import { availabilityService, loadRules } from "../services/availability";
import { enquiryService } from "../services/admin";
import { collectionsService } from "../services/collections";
import { bookingService } from "../services/bookings";
import { body, email, required, text } from "../lib/validate";
import { studioNow } from "../lib/time";

const r = new Hono<AppEnv>();

const PRIVATE_SETTINGS = ["analytics_ga", "analytics_cf", "gsc_verification", "seo_indexing"];

r.get("/catalog", async (c) => {
  const [services, packages, extras, rules, hours, rooms, categories, sessions] = await Promise.all([
    catalogRepo.services(c.env.DB), catalogRepo.packages(c.env.DB), catalogRepo.extras(c.env.DB), loadRules(c.env), settingsRepo.hours(c.env.DB),
    catalogRepo.rooms(c.env.DB), catalogRepo.categories(c.env.DB), catalogRepo.sessionSlots(c.env.DB),
  ]);
  return c.json({
    services: services.map((s) => ({ ...s, deliverables: JSON.parse(s.deliverables), gallery: JSON.parse(s.gallery) })),
    packages: packages.filter((p) => categories.some((x) => x.slug === p.service_category && x.bookable)).map((p) => ({ ...p, includes: JSON.parse(p.includes) })),
    rooms: rooms.map((x) => ({ ...x, features: JSON.parse(x.features) })),
    extras, categories, hours, sessions,
    rules: {
      holdMin: rules.holdMin, extraHourKobo: rules.extraHourKobo, maxPeople: rules.maxPeople, buffer: rules.buffer, depositPercent: rules.depositPercent,
      requireApproval: rules.requireApproval, paymentWindowHours: rules.paymentWindowHours, minNotice: rules.minNotice, bookAhead: rules.bookAhead,
    },
  });
});

r.get("/content", async (c) => {
  const today = studioNow().date;
  const list = (name: string) => collectionsService.list(c.env, name, true, today);
  const [policies, content, portfolio, team, equipment, gallery, testimonials, faqs, announcements] = await Promise.all([
    contentRepo.policies(c.env.DB, true), contentRepo.content(c.env.DB), list("portfolio"), list("team"), list("equipment"), list("gallery"), list("testimonials"), list("faqs"), list("announcements"),
  ]);
  for (const k of PRIVATE_SETTINGS) delete content[k];
  return c.json({ policies, content, portfolio, team, equipment, gallery, testimonials, faqs, announcements });
});

// With `package` the answer follows that package's scheduling mode. `duration` and `room` still work on their own for the flex grid.
const availabilityQuery = (c: Context<AppEnv>) => ({
  packageId: c.req.query("package") || undefined, duration: c.req.query("duration") ? Number(c.req.query("duration")) : undefined, roomId: c.req.query("room") ?? "",
});
r.get("/availability/month", async (c) => c.json(await availabilityService.month(c.env, { month: c.req.query("month") ?? "", ...availabilityQuery(c) })));
r.get("/availability/day", async (c) => c.json(await availabilityService.day(c.env, { date: c.req.query("date") ?? "", ...availabilityQuery(c) })));

// Anyone holding the receipt token (printed slip, email or WhatsApp) can read the receipt. No login, no other contact details.
r.get("/receipts/:token", async (c) => {
  const { payment, booking } = await bookingService.receiptByToken(c.env, c.req.param("token"));
  return c.json({
    payment: { reference: payment.reference, amount_kobo: payment.amount_kobo, channel: payment.channel, provider: payment.provider, kind: payment.kind, paid_at: payment.paid_at, refunded_kobo: payment.refunded_kobo },
    booking: { ref: booking.ref, service_name: booking.service_name, package_name: booking.package_name, package_price_kobo: booking.package_price_kobo, extras: JSON.parse(booking.extras), total_kobo: booking.total_kobo, amount_paid_kobo: booking.amount_paid_kobo, refunded_kobo: booking.refunded_kobo, date: booking.date, start_min: booking.start_min, end_min: booking.end_min, room_name: booking.room_name, scheduling: booking.scheduling, slot_label: booking.slot_label, due_date: booking.due_date, contact_name: booking.contact_name, policy_version: booking.policy_version, status: booking.status },
  });
});

r.post("/enquiries", async (c) => {
  const b = await body(c, z.object({
    name: required("Full name"), email, phone: text(40).default(""), topic: text(60).default("General enquiry"), message: required("Message", 4000),
    kind: z.enum(["general", "quote"]).default("general"), service: text(120).default(""), budget: text(80).default(""), timeline: text(120).default(""), links: text(1000).default(""),
    website: z.string().max(0, "Spam check failed.").optional(), startedAt: z.number(),
  }));
  // Honeypot plus a minimum fill time keeps out simple bots without a third-party captcha.
  if (Date.now() - b.startedAt < 2500) return c.json({ ok: true });
  await enquiryService.submit(c.env, { name: b.name, email: b.email, phone: b.phone, topic: b.kind === "quote" ? "Quote request" : b.topic, message: b.message, kind: b.kind, service: b.service, budget: b.budget, timeline: b.timeline, links: b.links });
  return c.json({ ok: true });
});

export default r;
