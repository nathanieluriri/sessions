import type { Env, SessionUser } from "../env";
import { catalogRepo } from "../repositories/catalog";
import { settingsRepo, contentRepo, type HoursRow } from "../repositories/settings";
import { usersRepo } from "../repositories/users";
import { enquiriesRepo, reportsRepo, auditRepo, outboxRepo, clientsRepo } from "../repositories/misc";
import { bookingsRepo, paymentsRepo, changeRequestsRepo } from "../repositories/bookings";
import { hashPassword, randomToken, uuid } from "../lib/crypto";
import { addDays, studioNow, prettyDate, label12 } from "../lib/time";
import { naira } from "../lib/money";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors";
import { LEVELS, PERMISSIONS, staffChangeBlocked, type Level, type Permission } from "../../shared/permissions";
import { audit } from "./audit";
import { notifyStaff, sendEmail } from "./notifications";
import { toSessionUser } from "./auth";
import { balanceOf, paidNet } from "./emails";

export interface PackageInput {
  id?: string; name: string; description: string; category: "session" | "post"; durationMin: number; priceKobo: number; includes: string[]; featured: boolean; active: boolean;
  serviceCategory: string; roomId: string | null; pricing: "fixed" | "quote"; depositPercent: number | null; requiresApproval: boolean; priceNote: string;
}

export const catalogService = {
  async savePackage(env: Env, actor: SessionUser, p: PackageInput) {
    if (p.pricing === "fixed" && !p.roomId) throw badRequest("Choose the room this package books.");
    if (p.roomId && !(await catalogRepo.roomById(env.DB, p.roomId))) throw badRequest("That room does not exist.");
    const id = p.id ?? uuid();
    const before = p.id ? await catalogRepo.packageById(env.DB, p.id) : null;
    if (p.id && !before) throw notFound("Package not found.");
    await catalogRepo.upsertPackage(env.DB, {
      id, slug: before?.slug ?? `${p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${id.slice(0, 4)}`, name: p.name, description: p.description,
      category: p.category, duration_min: p.durationMin, price_kobo: p.pricing === "quote" ? 0 : p.priceKobo, includes: p.includes, featured: p.featured, active: p.active,
      service_category: p.serviceCategory, room_id: p.roomId, pricing: p.pricing, deposit_percent: p.depositPercent, requires_approval: p.requiresApproval ? 1 : 0, price_note: p.priceNote,
    });
    const changes = [
      before && before.price_kobo !== p.priceKobo ? `Price ${naira(before.price_kobo)} → ${naira(p.priceKobo)} (new bookings only)` : "",
      before && (before.deposit_percent ?? -1) !== (p.depositPercent ?? -1) ? `Deposit ${before.deposit_percent ?? "default"} → ${p.depositPercent ?? "default"}` : "",
      before && !!before.requires_approval !== p.requiresApproval ? (p.requiresApproval ? "Now needs approval" : "Now confirms automatically") : "",
    ].filter(Boolean).join(". ");
    await audit(env.DB, actor, before ? "Updated package" : "Created package", p.name, changes);
    return id;
  },
  async deletePackage(env: Env, actor: SessionUser, id: string) {
    const p = await catalogRepo.packageById(env.DB, id);
    if (!p) throw notFound();
    const r = await catalogRepo.deletePackage(env.DB, id);
    if (r.meta.changes === 0) throw conflict("This package has bookings. Hide it instead so past bookings keep their terms.");
    await audit(env.DB, actor, "Removed package", p.name);
  },
  async saveRules(env: Env, actor: SessionUser, r: { depositPercent: number; requireApproval: boolean; requestExpiryHours: number; paymentWindowHours: number; reminderHours: number; extraHourKobo: number; maxPeople: number }) {
    await Promise.all([
      settingsRepo.set(env.DB, "deposit_percent", String(r.depositPercent)), settingsRepo.set(env.DB, "require_approval", r.requireApproval ? "1" : "0"),
      settingsRepo.set(env.DB, "request_expiry_hours", String(r.requestExpiryHours)), settingsRepo.set(env.DB, "payment_window_hours", String(r.paymentWindowHours)),
      settingsRepo.set(env.DB, "reminder_hours", String(r.reminderHours)), settingsRepo.set(env.DB, "extra_hour_kobo", String(r.extraHourKobo)),
      settingsRepo.set(env.DB, "max_people", String(r.maxPeople)),
    ]);
    await audit(env.DB, actor, "Updated booking rules", "Deposits and approvals", `Deposit ${r.depositPercent}% · ${r.requireApproval ? "every booking needs approval" : "approval per package"}`);
  },
};

export const availabilitySettingsService = {
  async get(env: Env) {
    const [hours, settings, blocks, rooms] = await Promise.all([settingsRepo.hours(env.DB), settingsRepo.all(env.DB), settingsRepo.blocks(env.DB, studioNow().date), catalogRepo.rooms(env.DB, true)]);
    return { hours, settings, blocks, rooms };
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
  async addBlock(env: Env, actor: SessionUser, b: { date: string; start: number; end: number; reason: string; roomId: string | null }) {
    if (b.end <= b.start) throw badRequest("End must be after start.");
    const clashes = (await bookingsRepo.list(env.DB, { from: b.date, to: b.date }))
      .filter((x) => ["pending", "approved", "confirmed"].includes(x.status) && (!b.roomId || x.room_id === b.roomId) && x.start_min < b.end && x.end_min > b.start);
    if (clashes.length) throw conflict(`Booking ${clashes[0].ref} is inside this time. Reschedule or cancel it first.`);
    await settingsRepo.addBlock(env.DB, { id: uuid(), date: b.date, start_min: b.start, end_min: b.end, reason: b.reason, created_by: actor.id, room_id: b.roomId });
    const room = b.roomId ? (await catalogRepo.roomById(env.DB, b.roomId))?.name : "All rooms";
    await audit(env.DB, actor, "Blocked time", `${room} · ${prettyDate(b.date)} ${label12(b.start)} to ${label12(b.end)}`, b.reason);
  },
  async removeBlock(env: Env, actor: SessionUser, id: string) {
    await settingsRepo.removeBlock(env.DB, id);
    await audit(env.DB, actor, "Removed blocked time", id);
  },
};

const cleanPerms = (perms: string[]) => [...new Set(perms)].filter((p): p is Permission => p in PERMISSIONS);

export const staffService = {
  list: async (env: Env) => (await usersRepo.staff(env.DB)).map((u) => ({ ...toSessionUser(u), active: !!u.active, createdAt: u.created_at })),
  async create(env: Env, actor: SessionUser, input: { name: string; email: string; title: string; level: Level; permissions: string[] }) {
    const perms = cleanPerms(input.permissions);
    const blocked = staffChangeBlocked(actor, null, { level: input.level, permissions: perms });
    if (blocked) throw forbidden(blocked);
    if (await usersRepo.byEmail(env.DB, input.email)) throw conflict("A user with this email already exists.");
    const tempPassword = randomToken(9);
    await usersRepo.create(env.DB, { id: uuid(), email: input.email, name: input.name, phone: "", passwordHash: await hashPassword(tempPassword), role: "admin", level: input.level, title: input.title, permissions: perms });
    await sendEmail(env, input.email, "Your staff account", `Hi ${input.name},\n\n${actor.name} created a staff account for you.\nSign in at ${env.APP_URL}/staff/login with ${input.email} and this temporary password: ${tempPassword}\nThen change it from your profile.`);
    await audit(env.DB, actor, "Created staff account", input.email, `${LEVELS[input.level].label} · ${perms.join(", ") || "no permissions"}`);
  },
  async update(env: Env, actor: SessionUser, id: string, input: { level: Level; permissions: string[]; active: boolean; title: string }) {
    const u = await usersRepo.byId(env.DB, id);
    if (!u || u.role === "client") throw notFound("Staff member not found.");
    const perms = cleanPerms(input.permissions);
    const blocked = staffChangeBlocked(actor, toSessionUser(u), { level: input.level, permissions: perms });
    if (blocked) throw forbidden(blocked);
    await usersRepo.setStaff(env.DB, id, { level: input.level, permissions: perms, active: input.active, title: input.title });
    await audit(env.DB, actor, "Changed permissions", u.email, `${LEVELS[input.level].label} · ${input.active ? "Active" : "Suspended"} · ${perms.join(", ") || "no permissions"}`);
  },
};

export const contentService = {
  get: async (env: Env) => ({ policies: await contentRepo.policies(env.DB), content: await contentRepo.content(env.DB) }),
  async savePolicy(env: Env, actor: SessionUser, slug: string, title: string, body: string) {
    const p = await contentRepo.policy(env.DB, slug);
    if (!p) throw notFound("Policy not found.");
    if (p.kind === "booking" && body.length > 4000) throw badRequest("Keep booking policies under 4,000 characters.");
    await contentRepo.savePolicy(env.DB, slug, title, body, actor.id);
    if (p.kind === "booking") {
      const v = Number((await settingsRepo.all(env.DB)).policy_version) + 1;
      await settingsRepo.set(env.DB, "policy_version", String(v));
      await audit(env.DB, actor, "Published policy", title, `Version ${v}`);
    } else await audit(env.DB, actor, "Published page", title);
  },
  async saveContent(env: Env, actor: SessionUser, entries: Record<string, string>) {
    const keys = Object.keys(entries);
    if (!keys.length) return;
    await env.DB.batch(keys.map((k) => contentRepo.setContent(env.DB, k, entries[k])));
    await audit(env.DB, actor, "Updated website content", keys.join(", "));
  },
};

export const enquiryService = {
  async submit(env: Env, input: { name: string; email: string; phone: string; topic: string; message: string; kind: "general" | "quote"; service: string; budget: string; timeline: string; links: string }) {
    if (((await enquiriesRepo.recentFromEmail(env.DB, input.email, new Date(Date.now() - 3600000).toISOString()))?.n ?? 0) >= 3) return;
    await enquiriesRepo.add(env.DB, { id: uuid(), ...input });
    const quote = input.kind === "quote";
    await notifyStaff(env, "assist_clients", `${quote ? "Quote request" : "New enquiry"} · ${input.service || input.topic}`,
      `${input.name} (${input.email}${input.phone ? `, ${input.phone}` : ""})\n${input.service ? `Service: ${input.service}\n` : ""}${input.budget ? `Budget: ${input.budget}\n` : ""}${input.timeline ? `Timeline: ${input.timeline}\n` : ""}${input.links ? `Links: ${input.links}\n` : ""}\n${input.message}`);
    await sendEmail(env, input.email, quote ? "We have your quote request" : "We have your message",
      `Hi ${input.name.split(" ")[0]},\n\nThanks for getting in touch. Your ${quote ? "quote request" : "message"} is with the studio team and we reply within one working day.\n\nWhat you sent:\n${input.message}`);
  },
  list: (env: Env) => enquiriesRepo.list(env.DB),
  async reply(env: Env, actor: SessionUser, id: string, message: string) {
    const e = await enquiriesRepo.byId(env.DB, id);
    if (!e) throw notFound();
    await sendEmail(env, e.email, `Re: ${e.kind === "quote" ? `Quote for ${e.service || "your project"}` : e.topic}`, `Hi ${e.name},\n\n${message}\n\n${actor.name}`);
    await enquiriesRepo.setStatus(env.DB, id, "replied");
    await audit(env.DB, actor, "Replied to enquiry", e.email);
  },
  async close(env: Env, actor: SessionUser, id: string) {
    await enquiriesRepo.setStatus(env.DB, id, "closed");
    await audit(env.DB, actor, "Closed enquiry", id);
  },
};

export const clientService = {
  async list(env: Env, q: string | null) {
    const [rows, accounts] = await Promise.all([clientsRepo.summary(env.DB, q), clientsRepo.accounts(env.DB, q)]);
    const byEmail = new Map(rows.map((r) => [r.email, r]));
    const withoutBookings = accounts.filter((a) => !byEmail.has(a.email.toLowerCase()))
      .map((a) => ({ key: a.email, email: a.email, name: a.name, phone: a.phone, user_id: a.id, bookings: 0, value: 0, paid: 0, balance: 0, last_date: "" }));
    return [...rows.map((r) => ({ ...r, account: !!r.user_id || accounts.some((a) => a.email.toLowerCase() === r.email) })), ...withoutBookings.map((r) => ({ ...r, account: true }))];
  },
  async history(env: Env, key: string) {
    const isEmail = key.includes("@");
    const user = isEmail ? await usersRepo.byEmail(env.DB, key) : null;
    const bookings = isEmail ? await bookingsRepo.forContact(env.DB, key, user?.id ?? null) : (await bookingsRepo.list(env.DB, { q: key })).filter((b) => b.contact_phone === key);
    return {
      client: { email: isEmail ? key : "", name: user?.name ?? bookings[0]?.contact_name ?? "", phone: user?.phone || bookings[0]?.contact_phone || "", account: !!user, since: user?.created_at ?? null },
      bookings: bookings.map((b) => ({ id: b.id, ref: b.ref, date: b.date, start_min: b.start_min, end_min: b.end_min, package_name: b.package_name, room_name: b.room_name, status: b.status, total_kobo: b.total_kobo, paid_kobo: paidNet(b), balance_kobo: balanceOf(b) })),
    };
  },
};

export const reportService = {
  async overview(env: Env, from: string, to: string) {
    const [totals, received, refunds, popular, weeks, repeat, hours, byCategory, byRoom, rooms] = await Promise.all([
      reportsRepo.totals(env.DB, from, to), reportsRepo.received(env.DB, from, to), reportsRepo.refunds(env.DB, from, to), reportsRepo.popular(env.DB, from, to),
      reportsRepo.byWeek(env.DB, from, to), reportsRepo.repeat(env.DB), reportsRepo.openMinutes(env.DB), reportsRepo.byCategory(env.DB, from, to), reportsRepo.byRoom(env.DB, from, to),
      catalogRepo.rooms(env.DB),
    ]);
    let openMinutes = 0;
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const h = hours.find((x) => x.weekday === new Date(`${d}T00:00:00Z`).getUTCDay());
      if (h?.is_open) openMinutes += h.close_min - h.open_min;
    }
    const capacity = openMinutes * Math.max(1, rooms.length);
    return {
      from, to,
      bookings: totals?.bookings ?? 0, cancellations: totals?.cancelled ?? 0, bookedValue: totals?.revenue ?? 0, collected: totals?.paid ?? 0,
      outstanding: totals?.outstanding ?? 0, depositOnly: totals?.deposits ?? 0,
      paymentsReceived: received?.total ?? 0, paymentsCount: received?.n ?? 0, refunds: { count: refunds?.n ?? 0, total: refunds?.total ?? 0 },
      utilisation: capacity ? Math.round(((totals?.minutes ?? 0) / capacity) * 100) : 0,
      repeatClients: repeat?.clients ? Math.round(((repeat.repeaters ?? 0) / repeat.clients) * 100) : 0,
      popular, weeks, byCategory,
      byRoom: byRoom.map((r) => ({ ...r, utilisation: openMinutes ? Math.round((r.minutes / openMinutes) * 100) : 0 })),
    };
  },
  async csv(env: Env, from: string, to: string) {
    const rows = await bookingsRepo.list(env.DB, { from, to });
    const esc = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
    return ["Reference,Date,Start,End,Room,Client,Email,Phone,Service,Package,Status,Source,Total (NGN),Paid (NGN),Balance (NGN)",
      ...rows.map((b) => [b.ref, b.date, label12(b.start_min), label12(b.end_min), b.room_name, b.contact_name, b.contact_email, b.contact_phone, b.service_name, b.package_name,
        b.status, b.source, b.total_kobo / 100, paidNet(b) / 100, ["confirmed", "completed"].includes(b.status) ? balanceOf(b) / 100 : 0].map(esc).join(","))].join("\n");
  },
};

export const dashboardService = {
  async overview(env: Env) {
    const today = studioNow().date;
    const monthStart = `${today.slice(0, 7)}-01`;
    const [todays, requests, report, enquiries, approvals] = await Promise.all([
      bookingsRepo.list(env.DB, { from: today, to: today }), changeRequestsRepo.pending(env.DB),
      reportService.overview(env, monthStart, addDays(monthStart, 30)), enquiriesRepo.list(env.DB), bookingsRepo.list(env.DB, { status: "pending" }),
    ]);
    return {
      today, todays: todays.filter((b) => ["confirmed", "completed", "no_show", "approved"].includes(b.status)).sort((a, b) => a.start_min - b.start_min),
      requests, approvals: approvals.map((b) => ({ id: b.id, ref: b.ref, date: b.date, start_min: b.start_min, end_min: b.end_min, artist_name: b.artist_name, package_name: b.package_name, room_name: b.room_name, total_kobo: b.total_kobo, expires_at: b.expires_at })),
      report, newEnquiries: enquiries.filter((e) => e.status === "new").length,
    };
  },
  payments: async (env: Env) => ({ payments: await paymentsRepo.list(env.DB), outstanding: await reportsRepo.outstanding(env.DB) }),
  audit: (env: Env) => auditRepo.list(env.DB),
  outbox: (env: Env) => outboxRepo.list(env.DB),
  requests: (env: Env) => changeRequestsRepo.pending(env.DB),
};
