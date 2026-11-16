import { z } from "zod";
import type { ToolDef } from "./types";
import { bookingsRepo } from "../../repositories/bookings";
import { clientsRepo, enquiriesRepo, reportsRepo } from "../../repositories/misc";
import { bookingService } from "../bookings";
import { reportService } from "../admin";
import { enquiryService } from "../admin";
import { naira } from "../../lib/money";
import { addDays, label12, prettyDate, studioNow, timeRange } from "../../lib/time";

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

// ---------------------------------------------------------------------------
// Read tools
// ---------------------------------------------------------------------------

const listBookingsTool: ToolDef = {
  name: "bookings.list",
  description: "List bookings by date or status. Leave both empty for today's upcoming sessions.",
  risk: "read",
  permission: "view_calendar",
  schema: z.object({ date: z.string().optional(), status: z.enum(["pending", "approved", "confirmed", "completed", "cancelled", "no_show"]).optional() }),
  execute: async (a, ctx) => {
    const today = studioNow().date;
    const from = a.date ?? addDays(today, -1);
    const rows = await bookingsRepo.list(ctx.env.DB, { from, to: a.date ?? addDays(from, 30), status: a.status });
    if (rows.length === 0) return { summary: "No bookings match." };
    return { summary: rows.map(describeBooking).join("\n"), data: rows };
  },
};

const outstandingTool: ToolDef = {
  name: "payments.outstanding",
  description: "List bookings that still owe money (outstanding balances).",
  risk: "read",
  permission: "view_payments",
  schema: z.object({}),
  execute: async (_a, ctx) => {
    const rows = await reportsRepo.outstanding(ctx.env.DB);
    if (rows.length === 0) return { summary: "No outstanding balances." };
    return {
      summary: rows.map((r) => `${r.ref} — ${r.contact_name || "no name"} · ${r.package_name} · balance ${naira(r.balance)}`).join("\n"),
      data: rows,
    };
  },
};

const overviewTool: ToolDef = {
  name: "reports.overview",
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
      data: r,
    };
  },
};

const findClientTool: ToolDef = {
  name: "clients.find",
  description: "Find a client by name, email or phone and show their bookings and balance.",
  risk: "read",
  permission: "assist_clients",
  schema: z.object({ query: z.string().min(1) }),
  execute: async (a, ctx) => {
    const rows = await clientsRepo.summary(ctx.env.DB, a.query.trim());
    if (rows.length === 0) return { summary: `No client matches "${a.query.trim()}".` };
    return {
      summary: rows.slice(0, 8).map((r) => `${r.name || r.email || r.phone} — ${r.bookings} booking(s), ${naira(r.paid)} paid, ${naira(r.balance)} balance`).join("\n"),
      data: rows.slice(0, 8),
    };
  },
};

const listEnquiriesTool: ToolDef = {
  name: "enquiries.list",
  description: "List recent enquiries and quote requests that are still open.",
  risk: "read",
  permission: "assist_clients",
  schema: z.object({}),
  execute: async (_a, ctx) => {
    const rows = (await enquiriesRepo.list(ctx.env.DB)).filter((e) => e.status === "new");
    if (rows.length === 0) return { summary: "No open enquiries." };
    return {
      summary: rows.map((e) => `${e.name} (${e.email}) — ${e.kind === "quote" ? `Quote for ${e.service || "a project"}` : e.topic}`).join("\n"),
      data: rows,
    };
  },
};

// ---------------------------------------------------------------------------
// Write tools — each maps to an existing permissioned service. No deletes.
// ---------------------------------------------------------------------------

const recordPaymentTool: ToolDef = {
  name: "payments.record",
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
    return { summary: `Recorded ${naira(kobo)} by ${a.method} on ${b.ref}.${r.receipt ? ` Receipt: ${r.receipt}` : ""}`, data: { ref: b.ref, amount_kobo: kobo } };
  },
};

const approveTool: ToolDef = {
  name: "bookings.approve",
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
  name: "bookings.confirm",
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
  name: "bookings.reschedule",
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
  name: "bookings.cancel",
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
  name: "enquiries.reply",
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

export const studioTools: ToolDef[] = [
  listBookingsTool,
  outstandingTool,
  overviewTool,
  findClientTool,
  listEnquiriesTool,
  recordPaymentTool,
  approveTool,
  confirmTool,
  rescheduleTool,
  cancelTool,
  replyEnquiryTool,
];
