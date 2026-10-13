import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { catalogRepo } from "../repositories/catalog";
import { contentRepo, settingsRepo } from "../repositories/settings";
import { availabilityService, loadRules } from "../services/availability";
import { enquiryService } from "../services/admin";
import { collectionsService } from "../services/collections";
import { body, email, personName, phone, required, text } from "../lib/validate";
import { studioNow } from "../lib/time";

const r = new Hono<AppEnv>();

const PRIVATE_SETTINGS = ["analytics_ga", "analytics_cf", "gsc_verification", "seo_indexing"];

r.get("/catalog", async (c) => {
  const [services, packages, extras, rules, hours, rooms, categories] = await Promise.all([
    catalogRepo.services(c.env.DB), catalogRepo.packages(c.env.DB), catalogRepo.extras(c.env.DB), loadRules(c.env), settingsRepo.hours(c.env.DB),
    catalogRepo.rooms(c.env.DB), catalogRepo.categories(c.env.DB),
  ]);
  return c.json({
    services: services.map((s) => ({ ...s, deliverables: JSON.parse(s.deliverables), gallery: JSON.parse(s.gallery) })),
    packages: packages.map((p) => ({ ...p, includes: JSON.parse(p.includes) })),
    rooms: rooms.map((x) => ({ ...x, features: JSON.parse(x.features) })),
    extras, categories, hours,
    rules: { holdMin: rules.holdMin, extraHourKobo: rules.extraHourKobo, maxPeople: rules.maxPeople, buffer: rules.buffer, depositPercent: rules.depositPercent, requireApproval: rules.requireApproval, paymentWindowHours: rules.paymentWindowHours },
  });
});

r.get("/content", async (c) => {
  const today = studioNow().date;
  const list = (name: string) => collectionsService.list(c.env, name, true, today);
  const [policies, content, portfolio, team, equipment, gallery, testimonials, faqs, announcements] = await Promise.all([
    contentRepo.policies(c.env.DB), contentRepo.content(c.env.DB), list("portfolio"), list("team"), list("equipment"), list("gallery"), list("testimonials"), list("faqs"), list("announcements"),
  ]);
  for (const k of PRIVATE_SETTINGS) delete content[k];
  return c.json({ policies, content, portfolio, team, equipment, gallery, testimonials, faqs, announcements });
});

r.get("/availability/month", async (c) => c.json(await availabilityService.month(c.env, c.req.query("month") ?? "", Number(c.req.query("duration") ?? 120), c.req.query("room") ?? "")));
r.get("/availability/day", async (c) => c.json(await availabilityService.slots(c.env, c.req.query("date") ?? "", Number(c.req.query("duration") ?? 120), c.req.query("room") ?? "")));

r.post("/enquiries", async (c) => {
  const b = await body(c, z.object({
    name: personName(), email, phone: phone("Phone number", true).default(""), topic: text(60).default("General enquiry"), message: required("Message", 4000),
    kind: z.enum(["general", "quote"]).default("general"), service: text(120).default(""), budget: text(80).default(""), timeline: text(120).default(""), links: text(1000).default(""),
    website: z.string().max(0, "Spam check failed.").optional(), startedAt: z.number(),
  }));
  // Honeypot plus a minimum fill time keeps out simple bots without a third-party captcha.
  if (Date.now() - b.startedAt < 2500) return c.json({ ok: true });
  await enquiryService.submit(c.env, { name: b.name, email: b.email, phone: b.phone, topic: b.kind === "quote" ? "Quote request" : b.topic, message: b.message, kind: b.kind, service: b.service, budget: b.budget, timeline: b.timeline, links: b.links });
  return c.json({ ok: true });
});

export default r;
