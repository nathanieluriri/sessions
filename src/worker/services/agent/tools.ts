import { z } from "zod";
import type { ToolDef } from "./types";
import { bookingsRepo, paymentsRepo } from "../../repositories/bookings";
import { catalogRepo } from "../../repositories/catalog";
import { clientsRepo, enquiriesRepo, reportsRepo } from "../../repositories/misc";
import { bookingService, depositFor } from "../bookings";
import { catalogService, enquiryService, reportService } from "../admin";
import { run } from "../../repositories/db";
import { audit } from "../audit";
import { emails, payLink, receiptLink } from "../emails";
import { sendEmail } from "../notifications";
import { naira } from "../../lib/money";
import { addDays, prettyDate, studioNow, timeRange } from "../../lib/time";

/** Find a booking by its public reference (PR…). The agent works with refs, never raw ids. */
async function resolveBooking(env: { DB: D1Database }, ref: string) {
  const rows = await bookingsRepo.list(env.DB, { q: ref.trim() });
  const exact = rows.find((r) => r.ref.toLowerCase() === ref.trim().toLowerCase());
  const b = exact ?? rows[0];
  if (!b) throw new Error(`No booking matches "${ref.trim()}". Give the reference from the booking, e.g. PR-ABCD-1234.`);
  return b;
}

function parseTime(t: string): number {
  const m = /^(\d{1,2}):?(\d{2})?$/.exec(t.trim());
  if (!m) throw new Error(`"${t}" is not a time. Use 24-hour HH:MM, e.g. 14:00.`);
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h > 23 || min > 59) throw new Error(`"${t}" is not a valid time.`);
  return h * 60 + min;
}

const describeBooking = (b: { ref: string; date: string; start_min: number; end_min: number; scheduling: string; contact_name: string; package_name: string; service_name: string; status: string; total_kobo: number; amount_paid_kobo: number; refunded_kobo: number }) =>
  `${b.ref} — ${b.contact_name || "no name"} · ${b.service_name} / ${b.package_name}${b.scheduling !== "project" ? ` · ${prettyDate(b.date)} ${timeRange(b.date, b.start_min, b.end_min)}` : ""} · ${b.status} · ${naira(b.total_kobo)}${b.amount_paid_kobo - b.refunded_kobo > 0 ? ` (paid ${naira(b.amount_paid_kobo - b.refunded_kobo)})` : ""}`;

const listBookingsTool: ToolDef = {
  name: "bookings_list",
  description: "List bookings by date or status. Leave both empty for the next few weeks from yesterday.",
  risk: "read",
  permission: "view_calendar",
  schema: z.object({ date: z.string().optional().describe("YYYY-MM-DD"), status: z.enum(["pending", "approved", "confirmed", "completed", "cancelled", "no_show"]).optional() }),
  execute: async (a, ctx) => {
    const today = studioNow().date;
    const from = a.date ?? addDays(today, -1);
    const rows = await bookingsRepo.list(ctx.env.DB, { from, to: a.date ?? addDays(from, 30), status: a.status });
    if (rows.length === 0) return { summary: "No bookings match." };
    const shown = rows.slice(0, 25);
    const extra = rows.length > shown.length ? `\n…and ${rows.length - shown.length} more.` : "";
    return { summary: shown.map(describeBooking).join("\n") + extra };
  },
};

const getBookingTool: ToolDef = {
  name: "bookings_get",
  description: "Look up one booking by its public reference (PR…).",
  risk: "read",
  permission: "view_calendar",
  schema: z.object({ ref: z.string().min(1).describe("Booking reference, e.g. PR-ABCD-1234") }),
  execute: async (a, ctx) => {
    const b = await resolveBooking(ctx.env, a.ref);
    return { summary: describeBooking(b) };
  },
};

const outstandingTool: ToolDef = {
  name: "payments_outstanding",
  description: "List bookings that still owe money (outstanding balances).",
  risk: "read",
  permission: "view_payments",
  schema: z.object({}),
  execute: async (_a, ctx) => {
    const rows = await reportsRepo.outstanding(ctx.env.DB);
    if (rows.length === 0) return { summary: "No outstanding balances." };
    const shown = rows.slice(0, 25);
    const extra = rows.length > shown.length ? `\n…and ${rows.length - shown.length} more.` : "";
    return { summary: shown.map((r) => `${r.ref} — ${r.contact_name || "no name"} · ${r.package_name} · balance ${naira(r.balance)}`).join("\n") + extra };
  },
};

const overviewTool: ToolDef = {
  name: "reports_overview",
  description: "Monthly studio overview: bookings, revenue collected, outstanding, refunds and utilisation.",
  risk: "read",
  permission: "view_reports",
  schema: z.object({}),
  execute: async (_a, ctx) => {
    const today = studioNow().date;
    const monthStart = `${today.slice(0, 7)}-01`;
    const r = await reportService.overview(ctx.env, monthStart, addDays(monthStart, 30));
    return {
      summary: `This month: ${r.bookings} bookings, ${naira(r.collected)} collected, ${naira(r.outstanding)} outstanding, ${naira(r.refunds.total)} refunded, ${r.utilisation}% room utilisation.`,
    };
  },
};

const findClientTool: ToolDef = {
  name: "clients_find",
  description: "Find a client by name, email or phone and show their bookings and balance.",
  risk: "read",
  permission: "assist_clients",
  schema: z.object({ query: z.string().min(1) }),
  execute: async (a, ctx) => {
    const rows = await clientsRepo.summary(ctx.env.DB, a.query.trim());
    if (rows.length === 0) return { summary: `No client matches "${a.query.trim()}".` };
    return {
      summary: rows.slice(0, 8).map((r) => `${r.name || r.email || r.phone} — ${r.bookings} booking(s), ${naira(r.paid)} paid, ${naira(r.balance)} balance`).join("\n"),
    };
  },
};

const listEnquiriesTool: ToolDef = {
  name: "enquiries_list",
  description: "List recent enquiries and quote requests that are still open.",
  risk: "read",
  permission: "assist_clients",
  schema: z.object({}),
  execute: async (_a, ctx) => {
    const rows = (await enquiriesRepo.list(ctx.env.DB)).filter((e) => e.status === "new");
    if (rows.length === 0) return { summary: "No open enquiries." };
    return {
      summary: rows.map((e) => `${e.name} (${e.email}) — ${e.kind === "quote" ? `Quote for ${e.service || "a project"}` : e.topic}`).join("\n"),
    };
  },
};

const recordPaymentTool: ToolDef = {
  name: "payments_record",
  description: "Record a cash, transfer or POS payment against a booking by its reference. Money records are added, never removed.",
  risk: "write",
  permission: "record_payments",
  schema: z.object({
    ref: z.string().min(1).describe("Booking reference, e.g. PR-ABCD-1234"),
    amount_ngn: z.number().positive().describe("Amount received, in naira (whole number)"),
    method: z.enum(["cash", "transfer", "pos", "other"]),
    note: z.string().optional(),
  }),
  execute: async (a, ctx) => {
    const b = await resolveBooking(ctx.env, a.ref);
    const kobo = Math.round(a.amount_ngn * 100);
    const r = await bookingService.recordPayment(ctx.env, ctx.user, b.id, { amount: kobo, method: a.method, note: a.note ?? "" });
    return { summary: `Recorded ${naira(kobo)} by ${a.method} on ${b.ref}.${r.receipt ? ` Receipt: ${r.receipt}` : ""}` };
  },
};

const approveTool: ToolDef = {
  name: "bookings_approve",
  description: "Approve a pending booking request by reference so the client can pay to confirm.",
  risk: "write",
  permission: "manage_bookings",
  schema: z.object({ ref: z.string().min(1), note: z.string().optional() }),
  execute: async (a, ctx) => {
    const b = await resolveBooking(ctx.env, a.ref);
    await bookingService.approve(ctx.env, ctx.user, b.id, a.note ?? "");
    return { summary: `Approved ${b.ref}.` };
  },
};

const confirmTool: ToolDef = {
  name: "bookings_confirm",
  description: "Confirm a booking without payment (pay-on-arrival or a label account) by reference.",
  risk: "write",
  permission: "manage_bookings",
  schema: z.object({ ref: z.string().min(1), note: z.string().optional() }),
  execute: async (a, ctx) => {
    const b = await resolveBooking(ctx.env, a.ref);
    await bookingService.confirmWithoutPayment(ctx.env, ctx.user, b.id, a.note ?? "");
    return { summary: `Confirmed ${b.ref} without payment.` };
  },
};

const rescheduleTool: ToolDef = {
  name: "bookings_reschedule",
  description: "Move a booking to a new date and start time by reference. Time is 24-hour HH:MM.",
  risk: "write",
  permission: "manage_bookings",
  schema: z.object({ ref: z.string().min(1), date: z.string().describe("New date YYYY-MM-DD"), time: z.string().describe("New start time, 24-hour HH:MM") }),
  execute: async (a, ctx) => {
    const b = await resolveBooking(ctx.env, a.ref);
    await bookingService.reschedule(ctx.env, ctx.user, b.id, a.date, parseTime(a.time));
    return { summary: `Rescheduled ${b.ref} to ${prettyDate(a.date)} ${a.time}.` };
  },
};

const cancelTool: ToolDef = {
  name: "bookings_cancel",
  description: "Cancel a booking by reference and refund what is owed under studio policy.",
  risk: "write",
  permission: "manage_bookings",
  schema: z.object({ ref: z.string().min(1), reason: z.string().min(1) }),
  execute: async (a, ctx) => {
    const b = await resolveBooking(ctx.env, a.ref);
    const r = await bookingService.cancel(ctx.env, ctx.user, b.id, a.reason);
    return { summary: `Cancelled ${b.ref}. Refund ${naira(r.refund)}${r.manual ? `, of which ${naira(r.manual)} to return by hand` : ""}.` };
  },
};

const replyEnquiryTool: ToolDef = {
  name: "enquiries_reply",
  description: "Email a reply to an enquiry or quote request by the sender's email address.",
  risk: "write",
  permission: "assist_clients",
  schema: z.object({ email: z.string().email().describe("The enquiry sender's email"), message: z.string().min(1) }),
  execute: async (a, ctx) => {
    const open = (await enquiriesRepo.list(ctx.env.DB)).filter((e) => e.status === "new" && e.email.toLowerCase() === a.email.toLowerCase());
    const e = open[0];
    if (!e) throw new Error(`No open enquiry from ${a.email}.`);
    await enquiryService.reply(ctx.env, ctx.user, e.id, a.message);
    return { summary: `Reply sent to ${a.email}.` };
  },
};

async function resolveService(db: D1Database, slugOrName: string) {
  const q = slugOrName.trim().toLowerCase();
  const services = await catalogRepo.services(db, true);
  return services.find((s) => s.slug.toLowerCase() === q || s.name.toLowerCase() === q)
    ?? services.find((s) => s.name.toLowerCase().includes(q) || s.slug.toLowerCase().includes(q));
}

async function resolvePackage(db: D1Database, idOrName: string, serviceSlug?: string) {
  const q = idOrName.trim().toLowerCase();
  const packages = await catalogRepo.packages(db, true);
  const scoped = serviceSlug ? packages.filter((p) => !p.service_slug || p.service_slug === serviceSlug) : packages;
  return scoped.find((p) => p.id === idOrName || p.slug.toLowerCase() === q)
    ?? scoped.find((p) => p.name.toLowerCase() === q)
    ?? scoped.find((p) => p.name.toLowerCase().includes(q));
}

const catalogListTool: ToolDef = {
  name: "catalog_list",
  description: "List every studio service and package, including Request a Quote items. Use this before answering anything about the catalogue.",
  risk: "read",
  permission: "view_calendar",
  schema: z.object({}),
  execute: async (_a, ctx) => {
    const [services, packages, categories] = await Promise.all([
      catalogRepo.services(ctx.env.DB, true),
      catalogRepo.packages(ctx.env.DB, true),
      catalogRepo.categories(ctx.env.DB),
    ]);
    const quoteServices = services.filter((s) => /quote/i.test(s.price_label) || packages.filter((p) => (p.service_slug ? p.service_slug === s.slug : p.service_category === s.category) && p.active).every((p) => p.pricing === "quote" || p.price_kobo === 0));
    const lines = services.filter((s) => s.active).map((s) => {
      const pkgs = packages.filter((p) => p.active && (p.service_slug ? p.service_slug === s.slug : p.service_category === s.category));
      const cat = categories.find((c) => c.slug === s.category);
      const bookable = cat?.bookable ? "online booking open" : "quote only (not booked online)";
      const pkgBit = pkgs.length
        ? pkgs.map((p) => `${p.name} (${p.pricing === "quote" ? "staff quote" : naira(p.price_kobo)})`).join("; ")
        : "no packages";
      return `${s.name} [${s.slug}] — ${s.price_label || "no price"} · ${bookable} · ${pkgBit}`;
    });
    return {
      summary: `${services.filter((s) => s.active).length} services. ${quoteServices.filter((s) => s.active).length} are Request a Quote (staff set the price).\n${lines.join("\n")}`,
    };
  },
};

const bookingsFormTool: ToolDef = {
  name: "bookings_form",
  description: "Open the in-chat booking form (service, package, date, client, email confirmation). Call this when staff want to create a booking and have not given every field.",
  risk: "read",
  permission: "manage_bookings",
  schema: z.object({}),
  execute: async () => ({ summary: "Open the booking form and fill it in. Lists are the live catalogue.", data: { form: "booking" } }),
};

const quotesFormTool: ToolDef = {
  name: "quotes_form",
  description: "Open the in-chat quote form. Staff set the price and we email the client. Call this for Request a Quote work.",
  risk: "read",
  permission: "manage_bookings",
  schema: z.object({}),
  execute: async () => ({ summary: "Open the quote form. You set the price; we email the client.", data: { form: "quote" } }),
};

const paymentsFormTool: ToolDef = {
  name: "payments_form",
  description: "Open the in-chat payment form (booking reference, amount, method, send receipt).",
  risk: "read",
  permission: "record_payments",
  schema: z.object({}),
  execute: async () => ({ summary: "Open the payment form.", data: { form: "payment" } }),
};

const catalogPriceFormTool: ToolDef = {
  name: "catalog_price_form",
  description: "Open the form to put a naira price on a Request a Quote service, or switch it back to quote.",
  risk: "read",
  permission: "edit_packages",
  schema: z.object({}),
  execute: async () => ({ summary: "Open the price form.", data: { form: "price" } }),
};

const catalogSetPriceTool: ToolDef = {
  name: "catalog_set_price",
  description: "Set a package or service to a fixed naira price (shows on the website) or switch it back to Request a quote. Past bookings keep their old price.",
  risk: "write",
  permission: "edit_packages",
  schema: z.object({
    service: z.string().min(1).describe("Service name or slug"),
    package: z.string().optional().describe("Package name or id. Leave empty to update every package on the service."),
    amount_ngn: z.number().nonnegative().optional().describe("New price in naira. Required unless quote is true."),
    quote: z.boolean().optional().describe("If true, switch to Request a quote instead of a fixed price."),
  }),
  execute: async (a, ctx) => {
    const svc = await resolveService(ctx.env.DB, a.service);
    if (!svc) throw new Error(`No service matches "${a.service}". Call catalog_list.`);
    const quote = !!a.quote || !(a.amount_ngn && a.amount_ngn > 0);
    const kobo = Math.round((a.amount_ngn ?? 0) * 100);
    if (!quote && kobo <= 0) throw new Error("Enter the price in naira, or set quote to true.");
    const packages = await catalogRepo.packages(ctx.env.DB, true);
    const mine = packages.filter((p) => p.service_slug ? p.service_slug === svc.slug : p.service_category === svc.category);
    const targets = a.package
      ? [await resolvePackage(ctx.env.DB, a.package, svc.slug)].filter(Boolean)
      : mine;
    if (a.package && !targets[0]) throw new Error(`No package matches "${a.package}" on ${svc.name}.`);
    if (targets.length) {
      await catalogService.setPrices(ctx.env, ctx.user, {
        packages: targets.map((p) => ({ id: p!.id, pricing: quote ? "quote" as const : "fixed" as const, priceKobo: quote ? p!.price_kobo : kobo })),
        extras: [],
      });
    } else {
      await run(ctx.env.DB, "UPDATE services SET price_label = ? WHERE id = ?", quote ? "Request a quote" : naira(kobo), svc.id);
      await audit(ctx.env.DB, ctx.user, "Updated prices", svc.name, quote ? "Request a quote" : naira(kobo));
    }
    const fresh = await catalogRepo.serviceBySlug(ctx.env.DB, svc.slug);
    return { summary: quote
      ? `${svc.name} now asks for a quote on the website.`
      : `${svc.name} is now ${fresh?.price_label || naira(kobo)} on the website.${targets.length ? ` Updated ${targets.length} package(s).` : ""}` };
  },
};

const bookingsCreateTool: ToolDef = {
  name: "bookings_create",
  description: "Create a booking for a client (phone, WhatsApp, walk-in). Emails them when notify is true. For quote packages pass amount_ngn.",
  risk: "write",
  permission: "manage_bookings",
  schema: z.object({
    service: z.string().min(1).describe("Service slug or name"),
    package: z.string().min(1).describe("Package id, slug or name"),
    contact_name: z.string().min(1),
    contact_phone: z.string().min(1),
    contact_email: z.string().optional(),
    artist_name: z.string().optional(),
    date: z.string().optional().describe("YYYY-MM-DD"),
    time: z.string().optional().describe("24-hour HH:MM"),
    people: z.number().int().min(1).max(200).optional(),
    source: z.enum(["phone", "whatsapp", "walk_in", "email", "instagram", "other"]).optional(),
    status: z.enum(["confirmed", "approved"]).optional(),
    notify: z.boolean().optional(),
    amount_ngn: z.number().positive().optional().describe("Quoted total in naira, required for quote packages"),
    pay_amount_ngn: z.number().positive().optional(),
    pay_method: z.enum(["cash", "transfer", "pos", "other"]).optional(),
    notes: z.string().optional(),
    project: z.string().optional(),
  }),
  execute: async (a, ctx) => {
    const svc = await resolveService(ctx.env.DB, a.service);
    if (!svc) throw new Error(`No service matches "${a.service}". Call catalog_list.`);
    const pkg = await resolvePackage(ctx.env.DB, a.package, svc.slug);
    if (!pkg) throw new Error(`No package matches "${a.package}" for ${svc.name}.`);
    const remote = pkg.scheduling === "project";
    const date = a.date || studioNow().date;
    const start = remote ? 0 : a.time ? parseTime(a.time) : 10 * 60;
    const quoted = a.amount_ngn ? Math.round(a.amount_ngn * 100) : 0;
    if (pkg.pricing === "quote" && quoted <= 0) throw new Error("This package is priced by quote. Enter the amount in naira.");
    const created = await bookingService.createManual(ctx.env, ctx.user, {
      serviceSlug: svc.slug, packageId: pkg.id, date, start, extraHours: 0, extras: [], people: a.people ?? 1,
      artistName: a.artist_name || a.contact_name, contactName: a.contact_name, contactEmail: a.contact_email ?? "",
      contactPhone: a.contact_phone, project: a.project ?? "", notes: a.notes ?? "", links: "",
      status: a.status ?? "confirmed", source: a.source ?? "other", ignoreHours: true, pastOk: true,
      notify: false, payment: null,
    });
    if (quoted > 0) {
      const deposit = depositFor(quoted, pkg.deposit_percent ?? 100);
      await bookingsRepo.setQuotedTotal(ctx.env.DB, created.id, quoted, quoted, deposit < quoted ? deposit : 0);
    }
    if (a.pay_amount_ngn && a.pay_method) {
      await bookingService.recordPayment(ctx.env, ctx.user, created.id, { amount: Math.round(a.pay_amount_ngn * 100), method: a.pay_method, note: "" }, false);
    }
    const fresh = await bookingsRepo.byId(ctx.env.DB, created.id);
    const b = fresh ?? created;
    const notify = a.notify !== false;
    if (notify && b.contact_email) {
      const mail = b.status === "approved" ? emails.approved(ctx.env, b) : emails.confirmed(ctx.env, b);
      await sendEmail(ctx.env, b.contact_email, mail.subject, mail.text);
    }
    return { summary: `Created ${b.ref} for ${b.contact_name} · ${b.service_name} / ${b.package_name} · ${naira(b.total_kobo)} · ${b.status}${notify && b.contact_email ? `. Emailed ${b.contact_email}` : notify ? ". No email on the booking, so nothing was sent." : ""}.` };
  },
};

const quotesSendTool: ToolDef = {
  name: "quotes_send",
  description: "Email a staff-written quote to the client. By default also creates an approved booking at that price so they can pay.",
  risk: "write",
  permission: "manage_bookings",
  schema: z.object({
    name: z.string().min(1),
    email: z.string().email(),
    phone: z.string().optional(),
    service: z.string().min(1),
    package: z.string().optional(),
    amount_ngn: z.number().positive(),
    details: z.string().optional(),
    create_booking: z.boolean().optional(),
    date: z.string().optional(),
    time: z.string().optional(),
  }),
  execute: async (a, ctx) => {
    const svc = await resolveService(ctx.env.DB, a.service);
    if (!svc) throw new Error(`No service matches "${a.service}". Call catalog_list.`);
    const packages = await catalogRepo.packages(ctx.env.DB, true);
    const pkg = a.package
      ? await resolvePackage(ctx.env.DB, a.package, svc.slug)
      : packages.find((p) => p.active && (p.service_slug ? p.service_slug === svc.slug : p.service_category === svc.category));
    const kobo = Math.round(a.amount_ngn * 100);
    const create = a.create_booking !== false && !!pkg;
    let ref = "";
    let pay = "";
    if (create && pkg) {
      const remote = pkg.scheduling === "project";
      const created = await bookingService.createManual(ctx.env, ctx.user, {
        serviceSlug: svc.slug, packageId: pkg.id, date: a.date || studioNow().date, start: remote ? 0 : a.time ? parseTime(a.time) : 10 * 60,
        extraHours: 0, extras: [], people: 1, artistName: a.name, contactName: a.name, contactEmail: a.email,
        contactPhone: a.phone ?? "", project: a.details ?? "", notes: "", links: "",
        status: "approved", source: "email", ignoreHours: true, pastOk: true, notify: false, payment: null,
      });
      const deposit = depositFor(kobo, pkg.deposit_percent ?? 100);
      await bookingsRepo.setQuotedTotal(ctx.env.DB, created.id, kobo, kobo, deposit < kobo ? deposit : 0);
      const fresh = await bookingsRepo.byId(ctx.env.DB, created.id);
      if (fresh) {
        ref = fresh.ref;
        pay = `\n\nPay to confirm: ${payLink(ctx.env, fresh)}`;
      }
    }
    const body = `Hi ${a.name.split(" ")[0]},\n\nHere is our quote for ${svc.name}${pkg ? ` · ${pkg.name}` : ""}.\n\n${a.details ? `${a.details}\n\n` : ""}Total: ${naira(kobo)}${ref ? `\nBooking reference: ${ref}` : ""}${pay}\n\nReply to this email if you want to change anything.`;
    await sendEmail(ctx.env, a.email, `Quote from Psych Studios · ${svc.name}`, body);
    return { summary: `Quoted ${naira(kobo)} for ${svc.name} to ${a.email}${ref ? `. Booking ${ref} is approved, waiting for payment` : ""}.` };
  },
};

const receiptsSendTool: ToolDef = {
  name: "receipts_send",
  description: "Email the latest receipt link for a booking to the client.",
  risk: "write",
  permission: "print_receipts",
  schema: z.object({ ref: z.string().min(1) }),
  execute: async (a, ctx) => {
    const b = await resolveBooking(ctx.env, a.ref);
    const pays = await paymentsRepo.forBooking(ctx.env.DB, b.id);
    const p = [...pays].reverse().find((x) => x.receipt_token);
    if (!p?.receipt_token) throw new Error(`No receipt on ${b.ref} yet. Record a payment first.`);
    if (!b.contact_email) throw new Error(`${b.ref} has no email. Add one, or copy the receipt link ${receiptLink(ctx.env, p.receipt_token)}.`);
    const link = receiptLink(ctx.env, p.receipt_token);
    const mail = emails.manualReceipt(ctx.env, b, p.amount_kobo, p.channel || "card", link);
    await sendEmail(ctx.env, b.contact_email, mail.subject, mail.text);
    return { summary: `Receipt for ${naira(p.amount_kobo)} on ${b.ref} emailed to ${b.contact_email}. ${link}` };
  },
};

const paymentsLinkTool: ToolDef = {
  name: "payments_link",
  description: "Email the client a Paystack link for the amount still owed on a booking.",
  risk: "write",
  permission: "record_payments",
  schema: z.object({ ref: z.string().min(1) }),
  execute: async (a, ctx) => {
    const b = await resolveBooking(ctx.env, a.ref);
    const r = await bookingService.sendPaymentLink(ctx.env, ctx.user, b.id);
    return { summary: `Payment link sent for ${b.ref}. ${r.link}` };
  },
};

export const studioTools: ToolDef[] = [
  listBookingsTool,
  getBookingTool,
  outstandingTool,
  overviewTool,
  findClientTool,
  listEnquiriesTool,
  catalogListTool,
  catalogPriceFormTool,
  catalogSetPriceTool,
  bookingsFormTool,
  bookingsCreateTool,
  quotesFormTool,
  quotesSendTool,
  paymentsFormTool,
  recordPaymentTool,
  receiptsSendTool,
  paymentsLinkTool,
  approveTool,
  confirmTool,
  rescheduleTool,
  cancelTool,
  replyEnquiryTool,
];

