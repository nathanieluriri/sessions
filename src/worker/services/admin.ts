import type { Env, SessionUser } from "../env";
import { catalogRepo } from "../repositories/catalog";
import { settingsRepo, contentRepo, type HoursRow } from "../repositories/settings";
import { usersRepo } from "../repositories/users";
import { enquiriesRepo, reportsRepo, auditRepo, outboxRepo } from "../repositories/misc";
import { bookingsRepo, paymentsRepo, changeRequestsRepo } from "../repositories/bookings";
import { hashPassword, randomToken, uuid } from "../lib/crypto";
import { addDays, studioNow, prettyDate, label12 } from "../lib/time";
import { naira } from "../lib/money";
import { badRequest, conflict, notFound } from "../lib/errors";
import { PERMISSIONS, type Permission } from "../../shared/permissions";
import { audit } from "./audit";
import { notifyStaff, sendEmail, studioFooter } from "./notifications";
import { toSessionUser } from "./auth";

export const catalogService = {
  async savePackage(env: Env, actor: SessionUser, p: { id?: string; name: string; description: string; category: "session" | "post"; durationMin: number; priceKobo: number; includes: string[]; featured: boolean; active: boolean }) {
    const id = p.id ?? uuid();
    const before = p.id ? await catalogRepo.packageById(env.DB, p.id) : null;
    await catalogRepo.upsertPackage(env.DB, {
      id, slug: before?.slug ?? `${p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${id.slice(0, 4)}`, name: p.name, description: p.description,
      category: p.category, duration_min: p.durationMin, price_kobo: p.priceKobo, includes: p.includes, featured: p.featured, active: p.active ? 1 : 0,
    });
    const detail = before && before.price_kobo !== p.priceKobo ? `Price ${naira(before.price_kobo)} → ${naira(p.priceKobo)} (new bookings only)` : "";
    await audit(env.DB, actor, before ? "Updated package" : "Created package", p.name, detail);
    return id;
  },
  async deletePackage(env: Env, actor: SessionUser, id: string) {
    const p = await catalogRepo.packageById(env.DB, id);
    if (!p) throw notFound();
    const r = await catalogRepo.deletePackage(env.DB, id);
    if (r.meta.changes === 0) throw conflict("This package has bookings. Deactivate it instead so past bookings keep their terms.");
    await audit(env.DB, actor, "Removed package", p.name);
  },
};

export const availabilitySettingsService = {
  async get(env: Env) {
    const [hours, settings, blocks] = await Promise.all([settingsRepo.hours(env.DB), settingsRepo.all(env.DB), settingsRepo.blocks(env.DB, studioNow().date)]);
    return { hours, settings, blocks };
  },
  async save(env: Env, actor: SessionUser, input: { hours: HoursRow[]; buffer: number; hold: number; minNotice: number; bookAhead: number }) {
    for (const h of input.hours) if (h.is_open && h.close_min <= h.open_min) throw badRequest("Closing time must be after opening time.");
    await settingsRepo.saveHours(env.DB, input.hours);
    await Promise.all([
      settingsRepo.set(env.DB, "buffer_min", String(input.buffer)), settingsRepo.set(env.DB, "hold_min", String(input.hold)),
      settingsRepo.set(env.DB, "min_notice_min", String(input.minNotice)), settingsRepo.set(env.DB, "book_ahead_days", String(input.bookAhead)),
    ]);
    await audit(env.DB, actor, "Updated availability", "Opening hours and booking rules");
  },
  async addBlock(env: Env, actor: SessionUser, b: { date: string; start: number; end: number; reason: string }) {
    if (b.end <= b.start) throw badRequest("End must be after start.");
    const clashes = (await bookingsRepo.list(env.DB, { from: b.date, to: b.date, status: "confirmed" })).filter((x) => x.start_min < b.end && x.end_min > b.start);
    if (clashes.length) throw conflict(`Booking ${clashes[0].ref} is inside this time. Reschedule or cancel it first.`);
    await settingsRepo.addBlock(env.DB, { id: uuid(), date: b.date, start_min: b.start, end_min: b.end, reason: b.reason, created_by: actor.id });
    await audit(env.DB, actor, "Blocked time", `${prettyDate(b.date)} ${label12(b.start)}–${label12(b.end)}`, b.reason);
  },
  async removeBlock(env: Env, actor: SessionUser, id: string) {
    await settingsRepo.removeBlock(env.DB, id);
    await audit(env.DB, actor, "Removed blocked time", id);
  },
};

export const staffService = {
  list: async (env: Env) => (await usersRepo.staff(env.DB)).map((u) => ({ ...toSessionUser(u), active: !!u.active, createdAt: u.created_at })),
  async create(env: Env, actor: SessionUser, input: { name: string; email: string; title: string; permissions: string[] }) {
    if (await usersRepo.byEmail(env.DB, input.email)) throw conflict("A user with this email already exists.");
    const perms = input.permissions.filter((p): p is Permission => p in PERMISSIONS);
    const tempPassword = randomToken(9);
    await usersRepo.create(env.DB, { id: uuid(), email: input.email, name: input.name, phone: "", passwordHash: await hashPassword(tempPassword), role: "admin", title: input.title, permissions: perms });
    await sendEmail(env, input.email, "Your staff account", `Hi ${input.name},\n\n${actor.name} created a staff account for you.\nSign in at ${env.APP_URL}/staff/login with ${input.email} and this temporary password: ${tempPassword}\nThen change it from your profile.${studioFooter(env)}`);
    await audit(env.DB, actor, "Created staff account", input.email, perms.join(", "));
  },
  async update(env: Env, actor: SessionUser, id: string, input: { permissions: string[]; active: boolean; title: string }) {
    const u = await usersRepo.byId(env.DB, id);
    if (!u || u.role !== "admin") throw notFound("Staff member not found.");
    const perms = input.permissions.filter((p): p is Permission => p in PERMISSIONS);
    await usersRepo.setStaff(env.DB, id, { permissions: perms, active: input.active, title: input.title });
    await audit(env.DB, actor, "Changed permissions", u.email, `${input.active ? "Active" : "Suspended"} · ${perms.join(", ") || "no permissions"}`);
  },
};

export const contentService = {
  get: async (env: Env) => ({ policies: await contentRepo.policies(env.DB), content: await contentRepo.content(env.DB) }),
  async savePolicy(env: Env, actor: SessionUser, slug: string, title: string, body: string) {
    await contentRepo.savePolicy(env.DB, slug, title, body, actor.id);
    const v = Number((await settingsRepo.all(env.DB)).policy_version) + 1;
    await settingsRepo.set(env.DB, "policy_version", String(v));
    await audit(env.DB, actor, "Published policy", title, `Version ${v}`);
  },
  async saveContent(env: Env, actor: SessionUser, entries: Record<string, string>) {
    for (const [k, v] of Object.entries(entries)) await contentRepo.setContent(env.DB, k, v);
    await audit(env.DB, actor, "Updated website content", Object.keys(entries).join(", "));
  },
};

export const enquiryService = {
  async submit(env: Env, input: { name: string; email: string; phone: string; topic: string; message: string }) {
    if (((await enquiriesRepo.recentFromEmail(env.DB, input.email, new Date(Date.now() - 3600000).toISOString()))?.n ?? 0) >= 3) return;
    await enquiriesRepo.add(env.DB, { id: uuid(), ...input });
    await notifyStaff(env, "assist_clients", `New enquiry · ${input.topic}`, `${input.name} (${input.email}, ${input.phone})\n\n${input.message}`);
  },
  list: (env: Env) => enquiriesRepo.list(env.DB),
  async reply(env: Env, actor: SessionUser, id: string, message: string) {
    const e = (await enquiriesRepo.list(env.DB)).find((x) => x.id === id);
    if (!e) throw notFound();
    await sendEmail(env, e.email, `Re: ${e.topic}`, `Hi ${e.name},\n\n${message}\n\n${actor.name}${studioFooter(env)}`);
    await enquiriesRepo.setStatus(env.DB, id, "replied");
    await audit(env.DB, actor, "Replied to enquiry", e.email);
  },
};

export const reportService = {
  async overview(env: Env, from: string, to: string) {
    const [totals, received, refunds, popular, weeks, repeat, hours] = await Promise.all([
      reportsRepo.totals(env.DB, from, to), reportsRepo.received(env.DB, from, to), reportsRepo.refunds(env.DB, from, to),
      reportsRepo.popular(env.DB, from, to), reportsRepo.byWeek(env.DB, from, to), reportsRepo.repeat(env.DB), reportsRepo.openMinutes(env.DB),
    ]);
    let openMinutes = 0;
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const h = hours.find((x) => x.weekday === new Date(`${d}T00:00:00Z`).getUTCDay());
      if (h?.is_open) openMinutes += h.close_min - h.open_min;
    }
    return {
      from, to,
      bookings: totals?.bookings ?? 0, cancellations: totals?.cancelled ?? 0, bookedValue: totals?.revenue ?? 0,
      paymentsReceived: received?.n ?? 0, refunds: { count: refunds?.n ?? 0, total: refunds?.total ?? 0 },
      utilisation: openMinutes ? Math.round(((totals?.minutes ?? 0) / openMinutes) * 100) : 0,
      repeatClients: repeat?.clients ? Math.round(((repeat.repeaters ?? 0) / repeat.clients) * 100) : 0,
      popular, weeks,
    };
  },
  async csv(env: Env, from: string, to: string) {
    const rows = await bookingsRepo.list(env.DB, { from, to });
    const esc = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
    return ["Reference,Date,Start,End,Client,Email,Package,Status,Total (NGN)",
      ...rows.map((b) => [b.ref, b.date, label12(b.start_min), label12(b.end_min), b.contact_name, b.contact_email, b.package_name, b.status, b.total_kobo / 100].map(esc).join(","))].join("\n");
  },
};

export const dashboardService = {
  async overview(env: Env) {
    const today = studioNow().date;
    const monthStart = `${today.slice(0, 7)}-01`;
    const [todays, requests, report, enquiries] = await Promise.all([
      bookingsRepo.list(env.DB, { from: today, to: today }), changeRequestsRepo.pending(env.DB),
      reportService.overview(env, monthStart, addDays(monthStart, 30)), enquiriesRepo.list(env.DB),
    ]);
    return { today, todays: todays.filter((b) => b.status !== "cancelled").sort((a, b) => a.start_min - b.start_min), requests, report, newEnquiries: enquiries.filter((e) => e.status === "new").length };
  },
  payments: (env: Env) => paymentsRepo.list(env.DB),
  audit: (env: Env) => auditRepo.list(env.DB),
  outbox: (env: Env) => outboxRepo.list(env.DB),
  requests: (env: Env) => changeRequestsRepo.pending(env.DB),
};
