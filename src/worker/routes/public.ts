import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { catalogRepo } from "../repositories/catalog";
import { contentRepo, settingsRepo } from "../repositories/settings";
import { availabilityService, loadRules } from "../services/availability";
import { enquiryService } from "../services/admin";
import { body, email, required, text } from "../lib/validate";

const r = new Hono<AppEnv>();

r.get("/catalog", async (c) => {
  const [services, packages, extras, rules, hours] = await Promise.all([
    catalogRepo.services(c.env.DB), catalogRepo.packages(c.env.DB), catalogRepo.extras(c.env.DB), loadRules(c.env), settingsRepo.hours(c.env.DB),
  ]);
  return c.json({ services, packages: packages.map((p) => ({ ...p, includes: JSON.parse(p.includes) })), extras, rules, hours });
});

r.get("/content", async (c) => c.json({ policies: await contentRepo.policies(c.env.DB), content: await contentRepo.content(c.env.DB) }));

r.get("/availability/month", async (c) => c.json(await availabilityService.month(c.env, c.req.query("month") ?? "", Number(c.req.query("duration") ?? 120))));
r.get("/availability/day", async (c) => c.json(await availabilityService.slots(c.env, c.req.query("date") ?? "", Number(c.req.query("duration") ?? 120))));

r.post("/enquiries", async (c) => {
  const b = await body(c, z.object({
    name: required("Full name"), email, phone: text(40).default(""), topic: required("Topic", 60), message: required("Message", 4000),
    website: z.string().max(0, "Spam check failed.").optional(), startedAt: z.number(),
  }));
  // Honeypot plus a minimum fill time keeps out simple bots without a third-party captcha.
  if (Date.now() - b.startedAt < 2500) return c.json({ ok: true });
  await enquiryService.submit(c.env, { name: b.name, email: b.email, phone: b.phone, topic: b.topic, message: b.message });
  return c.json({ ok: true });
});

export default r;
