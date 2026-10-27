import { hasPermission, type Permission } from "../../shared/permissions";
import type { Env, SessionUser } from "../env";
import { bookingsRepo, paymentsRepo, changeRequestsRepo, type BookingRow, type BookingStatus, type NewBooking, type PaymentRow } from "../repositories/bookings";
import { catalogRepo } from "../repositories/catalog";
import { settingsRepo } from "../repositories/settings";
import { usersRepo } from "../repositories/users";
import { run, stmt } from "../repositories/db";
import { randomToken, safeEqual, uuid } from "../lib/crypto";
import { addDays, daysBetween, isDate, isoIn, minutesUntil, prettyDate, studioNow, timeRange, weekday } from "../lib/time";
import { naira } from "../lib/money";
import { badRequest, conflict, forbidden, notFound, AppError } from "../lib/errors";
import { loadRules, windowFor } from "./availability";
import { newReference, paymentProvider, refundBooking } from "./payments";
import { notifyStaff, notifyUser, sendEmail } from "./notifications";
import { balanceOf, emails, paidNet, payLink, when } from "./emails";
import { audit } from "./audit";
import { forStaff } from "../lib/redact";

export interface DraftInput {
  serviceSlug: string; packageId: string; date: string; start: number; extraHours: number; extras: string[]; people: number;
  artistName: string; contactName: string; contactEmail: string; contactPhone: string; project: string; notes: string; links: string;
}

export interface Draft extends DraftInput {
  serviceName: string; category: string; packageName: string; packagePrice: number; duration: number; roomId: string; roomName: string;
  extrasList: { slug: string; name: string; price: number; quote?: boolean }[]; extraHourPrice: number; extraHoursPrice: number; total: number;
  depositPercent: number; deposit: number; requiresApproval: boolean; policyVersion: number;
  scheduling: BookingRow["scheduling"]; slotKind: "" | "day" | "night"; slotLabel: string; unit: string; turnaroundDays: number | null;
  revisionLimit: number; dueDate: string | null; tracks: number | null;
}

type Rules = Awaited<ReturnType<typeof loadRules>>;
type Plan = "deposit" | "full" | "balance";

/** Deposits are rounded to the nearest ₦100. A percentage of 0 or 100 means the package is paid in full. */
export const depositFor = (total: number, percent: number) => (percent > 0 && percent < 100 ? Math.round((total * percent) / 1_000_000) * 10_000 : total);
export const refundShare = (minutesBefore: number) => (minutesBefore >= 72 * 60 ? 1 : minutesBefore >= 24 * 60 ? 0.5 : 0);

/** Sessions count back from their start. A remote order has no start, so it refunds in full until the studio publishes its first delivery. */
async function refundShareOf(env: Env, b: BookingRow) {
  if (b.scheduling !== "project") return refundShare(minutesUntil(b.date, b.start_min));
  return (await bookingsRepo.deliveredCount(env.DB, b.id)) ? 0 : 1;
}

/** Requests and approvals hold their slot for a window, but never past the session start (remote orders have none). */
const windowEnd = (hours: number, b: { date: string; start_min: number; scheduling?: string }) =>
  new Date(Math.min(Date.now() + hours * 3_600_000, b.scheduling === "project" ? Infinity : Date.now() + minutesUntil(b.date, b.start_min) * 60_000)).toISOString();

export async function priceDraft(env: Env, input: DraftInput, rules?: Rules): Promise<Draft> {
  const [svc, pkg, extras, r, sessions] = await Promise.all([
    catalogRepo.serviceBySlug(env.DB, input.serviceSlug), catalogRepo.packageById(env.DB, input.packageId), catalogRepo.extras(env.DB), rules ?? loadRules(env),
    catalogRepo.sessionSlots(env.DB),
  ]);
  if (!svc) throw badRequest("Choose a service.");
  if (!pkg || !pkg.active) throw badRequest("This package is no longer available.");
  if (pkg.pricing === "quote") throw badRequest("This package is priced by quote. Send a quote request instead.");
  if (pkg.service_category !== svc.category || (pkg.service_slug && pkg.service_slug !== svc.slug)) throw badRequest("Pick a package that fits this service.");
  const mode = pkg.scheduling;
  const remote = mode === "project";
  const room = remote ? null : pkg.room_id ? await catalogRepo.roomById(env.DB, pkg.room_id) : null;
  if (!remote && (!room || !room.active)) throw badRequest("This package is not linked to an open room yet.");
  const maxPeople = room ? room.capacity || r.maxPeople : 200;
  if (input.people < 1 || input.people > maxPeople) throw badRequest(room ? `${room.name} takes up to ${maxPeople} people.` : "Enter between 1 and 200 people.");
  if (mode !== "flex" && input.extraHours) throw badRequest("Extra hours are not available on this package.");
  const date = remote ? studioNow().date : input.date;
  if (!isDate(date)) throw badRequest("Pick a date.");
  let start = remote ? 0 : input.start, duration = remote ? 0 : pkg.duration_min + input.extraHours * 60, slotLabel = "";
  if (mode === "slot" || mode === "day") {
    const w = windowFor(sessions, pkg, date, input.start);
    if (!w) throw badRequest(mode === "slot" ? "Pick one of the open sessions." : "Pick an open day to start.");
    start = w.start;
    duration = w.end - w.start;
    slotLabel = w.label;
  }
  const extrasList = extras
    .filter((e) => input.extras.includes(e.slug) && (!e.category || e.category === svc.category) && (!e.service_slug || e.service_slug === svc.slug))
    .map((e) => (e.pricing === "quote" ? { slug: e.slug, name: e.name, price: 0, quote: true } : { slug: e.slug, name: e.name, price: e.price_kobo }));
  const extraHourPrice = mode === "flex" ? room?.hourly_kobo || r.extraHourKobo : 0;
  const extraHoursPrice = input.extraHours * extraHourPrice;
  const total = pkg.price_kobo + extraHoursPrice + extrasList.reduce((s, e) => s + e.price, 0);
  const depositPercent = pkg.deposit_percent ?? r.depositPercent;
  return {
    ...input, date, start, duration, extras: extrasList.map((e) => e.slug), serviceName: svc.name, category: svc.category, packageName: pkg.name, packagePrice: pkg.price_kobo,
    roomId: room?.id ?? "", roomName: room?.name ?? "", extrasList, extraHourPrice, extraHoursPrice, total, depositPercent, deposit: depositFor(total, depositPercent),
    requiresApproval: !!pkg.requires_approval || r.requireApproval, policyVersion: r.policyVersion,
    scheduling: mode, slotKind: mode === "slot" || mode === "day" ? pkg.slot_kind : "", slotLabel, unit: pkg.unit, turnaroundDays: pkg.turnaround_days,
    revisionLimit: pkg.revision_limit, dueDate: pkg.turnaround_days ? addDays(date, pkg.turnaround_days) : null, tracks: pkg.tracks,
  };
}

// Holds made before the catalog change carry no scheduling fields.
function fromDraft(d: Draft, x: { id: string; userId: string | null; holdId: string | null; status: BookingStatus; source: string; createdBy: string | null; expiresAt: string | null }): NewBooking {
  return {
    ...x, roomId: d.roomId, roomName: d.roomName, category: d.category, serviceName: d.serviceName, packageId: d.packageId, packageName: d.packageName,
    packagePrice: d.packagePrice, total: d.total, deposit: d.deposit < d.total ? d.deposit : 0, date: d.date, start: d.start, end: d.start + d.duration,
    extras: JSON.stringify([...d.extrasList, ...(d.extraHours ? [{ slug: "extra-hours", name: `Extra time (${d.extraHours} hr)`, price: d.extraHoursPrice }] : [])]),
    people: d.people, artistName: d.artistName, contactName: d.contactName, contactEmail: d.contactEmail, contactPhone: d.contactPhone,
    project: d.project ?? "", notes: d.notes ?? "", links: d.links ?? "", payToken: randomToken(18), policyVersion: d.policyVersion,
    scheduling: d.scheduling ?? "flex", slotKind: d.slotKind ?? "", slotLabel: d.slotLabel ?? "", dueDate: d.dueDate ?? null, revisionLimit: d.revisionLimit ?? 0,
  };
}

/** What the public pay page and the verify page may show: no contact details. */
export const summary = (b: BookingRow) => ({
  id: b.id, ref: b.ref, status: b.status, service_name: b.service_name, package_name: b.package_name, package_price_kobo: b.package_price_kobo,
  room_name: b.room_name, date: b.date, start_min: b.start_min, end_min: b.end_min, extras: JSON.parse(b.extras), total_kobo: b.total_kobo,
  deposit_kobo: b.deposit_kobo, paid_kobo: paidNet(b), balance_kobo: balanceOf(b), expires_at: b.expires_at,
  scheduling: b.scheduling, slot_label: b.slot_label, due_date: b.due_date,
});

/** The amount the client can pay now and whether a smaller deposit is on offer. */
export function dueNow(b: BookingRow) {
  const remaining = balanceOf(b);
  if (b.status === "approved") {
    const deposit = b.deposit_kobo > 0 && paidNet(b) === 0 && b.deposit_kobo < remaining ? b.deposit_kobo : 0;
    return { full: remaining, deposit, kind: "approval" as const };
  }
  if (b.status === "confirmed" || b.status === "completed") return { full: remaining, deposit: 0, kind: "balance" as const };
  return { full: 0, deposit: 0, kind: "none" as const };
}

const staffCanSeeMoney = (u: SessionUser) => ["record_payments", "verify_payments", "view_payments", "manage_bookings"].some((p) => hasPermission(u, p as Permission));

async function startPayment(env: Env, p: { holdId: string | null; bookingId: string | null; userId: string | null; email: string; amount: number; kind: PaymentRow["kind"] }, origin: string) {
  const provider = paymentProvider(env);
  const reference = newReference();
  await paymentsRepo.create(env.DB, { id: uuid(), reference, holdId: p.holdId, bookingId: p.bookingId, userId: p.userId, amount: p.amount, provider: provider.name, kind: p.kind });
  const url = await provider.initialize(reference, p.amount, p.email, `${origin}/book/verify?reference=${reference}`);
  return { reference, authorizationUrl: url, provider: provider.name, amount: p.amount };
}

async function mail(env: Env, b: BookingRow, m: { subject: string; text: string }, notice?: string) {
  await sendEmail(env, b.contact_email, m.subject, m.text);
  if (notice) await notifyUser(env, b.user_id, notice, `${b.ref} · ${when(b)}`);
}

function checkHours(hours: { is_open: number; open_min: number; close_min: number } | null, start: number, end: number) {
  if (!hours?.is_open || start < hours.open_min || end > hours.close_min) throw badRequest("That time is outside opening hours.");
}

/** Flex bookings must sit inside opening hours. Fixed sessions set their own times, so only a closed weekday rules them out. Remote orders have no time. */
async function checkOpen(env: Env, mode: BookingRow["scheduling"], date: string, start: number, end: number) {
  if (mode === "project") return;
  const hours = await settingsRepo.hoursFor(env.DB, weekday(date));
  if (mode === "flex") checkHours(hours, start, end);
  else if (!hours?.is_open) throw badRequest("The studio is closed that day.");
}

/** Notice period and booking horizon apply to clients. Staff can book at short notice but never into the past. */
function checkLead(rules: Rules, date: string, start: number, client: boolean) {
  if (minutesUntil(date, start) < (client ? rules.minNotice : 1)) throw badRequest("That time is too soon to book.");
  if (client && daysBetween(studioNow().date, date) > rules.bookAhead) throw badRequest("That date is too far ahead to book.");
}

/** Where a booking lands when it moves: only a time its own mode allows, with the end that goes with it. */
async function moveTarget(env: Env, b: BookingRow, date: string, start: number) {
  if (b.scheduling === "project") throw badRequest("Remote orders have no session time to move.");
  if (!isDate(date)) throw badRequest("Pick a new date and time.");
  if (b.scheduling === "flex") {
    const end = start + (b.end_min - b.start_min);
    await checkOpen(env, "flex", date, start, end);
    return { start, end, label: "" };
  }
  const w = windowFor(await catalogRepo.sessionSlots(env.DB), { scheduling: b.scheduling, slot_kind: b.slot_kind === "night" ? "night" : "day" }, date, start);
  if (!w) throw badRequest(b.scheduling === "slot" ? "Pick one of the open sessions." : "Pick an open day to start.");
  await checkOpen(env, b.scheduling, date, w.start, w.end);
  return { start: w.start, end: w.end, label: w.label };
}

async function loadBooking(env: Env, id: string) {
  const b = await bookingsRepo.byId(env.DB, id);
  if (!b) throw notFound("Booking not found.");
  return b;
}

/** True when this booking has published deliveries and nothing left to pay, so a payment email can say the files are open. */
const unlocks = async (env: Env, b: BookingRow) => paidNet(b) >= b.total_kobo && (await bookingsRepo.deliveredCount(env.DB, b.id)) > 0;

/** Once an order is complete (final delivery approved or finalized) nothing about the booking may change. */
const assertOpen = (b: BookingRow) => {
  if (b.delivered_final_at) throw badRequest("This order is complete and can no longer be changed.");
};

const alreadyDecided = () => conflict("Already decided. Someone else dealt with this booking a moment ago, so reload to see where it stands.", "already_decided");
const taken = () => conflict("That time was taken by another booking while this one waited. Decline it, or move it to a free time first.", "slot_taken");

/** Add-ons without a price yet, for the staff who have to quote them. */
const quoteLine = (b: BookingRow) => {
  const names = (JSON.parse(b.extras) as { name: string; quote?: boolean }[]).filter((e) => e.quote).map((e) => e.name);
  return names.length ? `\nAdd-ons to quote: ${names.join(", ")}` : "";
};
const placeOf = (b: BookingRow) => (b.scheduling === "project" ? "as a remote order" : `in ${b.room_name}`);

/** Sends a payment back that this call has just claimed. It was never added to a booking, so the booking's own totals stay as they are. */
async function refundClaimed(env: Env, payment: PaymentRow, bookingId: string | null, reason: string) {
  await paymentProvider(env).refund(payment.reference, payment.amount_kobo);
  await env.DB.batch([
    paymentsRepo.addRefund(env.DB, { id: uuid(), paymentId: payment.id, bookingId, amount: payment.amount_kobo, reason }),
    paymentsRepo.addRefunded(env.DB, payment.id, payment.amount_kobo),
  ]);
}

export const bookingService = {
  priceDraft,

  /** Holds the slot for the checkout window. Fails if anyone else holds, requested or booked an overlapping time in the same room. */
  async createHold(env: Env, input: DraftInput, user: SessionUser | null) {
    const rules = await loadRules(env);
    const draft = await priceDraft(env, input, rules);
    if (!(await catalogRepo.categoryBySlug(env.DB, draft.category))?.bookable) throw badRequest("This service is not booked online right now. Send a quote request instead.");
    const end = draft.start + draft.duration;
    await checkOpen(env, draft.scheduling, draft.date, draft.start, end);
    if (draft.scheduling === "flex") {
      const hours = await settingsRepo.hoursFor(env.DB, weekday(draft.date));
      if ((draft.start - hours!.open_min) % rules.step !== 0) throw badRequest("Invalid start time.");
    }
    if (draft.scheduling !== "project") checkLead(rules, draft.date, draft.start, true);
    const id = uuid();
    const expiresAt = isoIn(rules.holdMin);
    const ok = await bookingsRepo.createHoldIfFree(env.DB, { id, date: draft.date, start: draft.start, end, expiresAt, draft: JSON.stringify(draft), userId: user?.id ?? null, roomId: draft.roomId }, rules.buffer, new Date().toISOString());
    if (!ok) throw conflict("This slot is no longer available. Pick another time.", "slot_taken");
    return { holdId: id, expiresAt, draft };
  },

  async getHold(env: Env, id: string) {
    const h = await bookingsRepo.hold(env.DB, id);
    if (!h) throw notFound("Hold not found.");
    const booking = h.status === "converted" ? await bookingsRepo.byHold(env.DB, id) : null;
    const active = h.status === "active" && h.expires_at > new Date().toISOString();
    return { id: h.id, status: active ? "active" : h.status === "converted" ? "converted" : "expired", expiresAt: h.expires_at, draft: JSON.parse(h.draft) as Draft, bookingId: booking?.id ?? null };
  },

  releaseHold: (env: Env, id: string) => bookingsRepo.releaseHold(env.DB, id),

  async activeHold(env: Env, user: SessionUser, holdId: string) {
    const h = await bookingsRepo.hold(env.DB, holdId);
    if (!h || h.status !== "active" || h.expires_at <= new Date().toISOString()) throw new AppError(410, "Your hold expired. Pick a time again.", "hold_expired");
    if (h.user_id && h.user_id !== user.id) throw forbidden();
    await bookingsRepo.attachHoldUser(env.DB, holdId, user.id);
    return { hold: h, draft: JSON.parse(h.draft) as Draft };
  },

  /** Starts a deposit or full payment for a held slot. Requires a logged-in client. */
  async checkout(env: Env, user: SessionUser, holdId: string, plan: Plan, origin: string) {
    const { draft } = await this.activeHold(env, user, holdId);
    if (draft.requiresApproval) throw badRequest("This booking needs studio approval. Send it as a request.");
    const amount = plan === "deposit" && draft.deposit < draft.total ? draft.deposit : draft.total;
    return startPayment(env, { holdId, bookingId: null, userId: user.id, email: user.email, amount, kind: amount < draft.total ? "deposit" : "full" }, origin);
  },

  /** Turns a held slot into a request that waits for studio approval. Nothing is charged until it is approved. */
  async submitRequest(env: Env, user: SessionUser, holdId: string) {
    const { hold, draft } = await this.activeHold(env, user, holdId);
    if (!draft.requiresApproval) throw badRequest("This booking can be paid straight away.");
    const rules = await loadRules(env);
    const b = fromDraft(draft, { id: uuid(), userId: user.id, holdId: hold.id, status: "pending", source: "online", createdBy: null, expiresAt: windowEnd(rules.requestExpiryHours, { date: hold.date, start_min: hold.start_min, scheduling: draft.scheduling }) });
    await env.DB.batch([
      bookingsRepo.insertFromHold(env.DB, b, { buffer: rules.buffer, now: new Date().toISOString() }),
      stmt(env.DB, "UPDATE holds SET status = 'converted' WHERE id = ? AND EXISTS (SELECT 1 FROM bookings WHERE hold_id = ?)", hold.id, hold.id),
    ]);
    const booking = await bookingsRepo.byHold(env.DB, hold.id);
    if (!booking) throw conflict("This slot is no longer available. Pick another time.", "slot_taken");
    if (booking.id === b.id) {
      await mail(env, booking, emails.requestReceived(env, booking), "Request received");
      await notifyStaff(env, "manage_bookings", `Booking request · ${booking.artist_name} · ${booking.ref}`,
        `${booking.contact_name} asked for ${booking.package_name} ${placeOf(booking)}.\nWhen: ${when(booking)}\nEstimated total: ${naira(booking.total_kobo)}${quoteLine(booking)}\nProject: ${booking.project || "None given"}\nApprove or decline it in the dashboard: ${env.APP_URL}/admin/bookings?open=${booking.id}`);
      await audit(env.DB, user, "Requested booking", booking.ref, `${booking.package_name}, ${when(booking)}`);
    }
    return booking;
  },

  /** Called by the verify page and the webhook. Each payment is applied exactly once, and only after the provider confirms it. */
  async confirmPayment(env: Env, reference: string, via: "server_verify" | "webhook" | "staff_check") {
    const payment = await paymentsRepo.byReference(env.DB, reference);
    if (!payment) throw notFound("Payment not found.");
    if (payment.verified_via) {
      const booking = payment.booking_id ? await bookingsRepo.byId(env.DB, payment.booking_id) : null;
      return { status: payment.status === "refunded" ? ("refunded" as const) : booking ? ("confirmed" as const) : ("pending" as const), booking };
    }
    const provider = paymentProvider(env);
    const result = payment.provider === provider.name ? await provider.verify(reference) : { status: "failed" as const, amount: 0, channel: null };
    if (result.status === "pending") return { status: "pending" as const, booking: null };
    if (result.status === "failed" || result.amount !== payment.amount_kobo) {
      await paymentsRepo.markFailed(env.DB, reference);
      const releases = payment.hold_id && !payment.booking_id;
      if (releases) await bookingsRepo.releaseHold(env.DB, payment.hold_id!);
      const mismatch = result.status === "success" && result.amount !== payment.amount_kobo;
      await audit(env.DB, null, mismatch ? "Payment amount mismatch" : "Payment failed", reference, mismatch ? `Provider reports ${naira(result.amount)}, expected ${naira(payment.amount_kobo)}. Check the provider dashboard and refund by hand if money was taken.` : releases ? "Slot released" : "");
      if (mismatch) await notifyStaff(env, "verify_payments", `Payment amount mismatch · ${reference}`, `The provider confirmed ${naira(result.amount)} but ${naira(payment.amount_kobo)} was expected. The payment was not applied to any booking. Check the provider dashboard and refund by hand if money was taken.`);
      return { status: "failed" as const, booking: null };
    }
    return payment.booking_id ? this.applyToBooking(env, payment, via, result.channel) : this.bookFromHold(env, payment, via, result.channel);
  },

  async bookFromHold(env: Env, payment: PaymentRow, via: string, channel: string | null) {
    const hold = await bookingsRepo.hold(env.DB, payment.hold_id!);
    if (!hold) throw notFound("Hold not found.");
    const draft = JSON.parse(hold.draft) as Draft;
    const rules = await loadRules(env);
    const now = new Date().toISOString();
    if (draft.scheduling === "project") {
      // The order is placed when it is paid, which can be the day after the hold was made.
      draft.date = studioNow().date;
      draft.dueDate = draft.turnaroundDays ? addDays(draft.date, draft.turnaroundDays) : null;
    }
    // A second payment on a hold that already became a booking is checked against that booking's total.
    const existing = await bookingsRepo.byHold(env.DB, hold.id);
    if (existing) return this.settle(env, payment, existing, via, channel);

    // One batch claims the payment and inserts the booking only if the room is still free of everything but this hold, so two lapsed holds cannot both win.
    const b = fromDraft(draft, { id: uuid(), userId: payment.user_id, holdId: hold.id, status: "confirmed", source: "online", createdBy: null, expiresAt: null });
    const claimed = "EXISTS (SELECT 1 FROM payments WHERE reference = ?3 AND verified_via = ?4 AND paid_at = ?5)";
    const res = await env.DB.batch([
      bookingsRepo.claimPayment(env.DB, payment.reference, via, channel, now),
      bookingsRepo.insertFromHold(env.DB, b, { buffer: rules.buffer, now, payment: { reference: payment.reference, via, paidAt: now } }),
      stmt(env.DB, `UPDATE bookings SET amount_paid_kobo = ?1 WHERE hold_id = ?2 AND amount_paid_kobo = 0 AND ${claimed}`, payment.amount_kobo, hold.id, payment.reference, via, now),
      stmt(env.DB, "UPDATE payments SET booking_id = (SELECT id FROM bookings WHERE hold_id = ?1) WHERE reference = ?2 AND verified_via = ?3 AND paid_at = ?4", hold.id, payment.reference, via, now),
      stmt(env.DB, "UPDATE holds SET status = 'converted' WHERE id = ? AND EXISTS (SELECT 1 FROM bookings WHERE hold_id = ?)", hold.id, hold.id),
    ]);
    const booking = await bookingsRepo.byHold(env.DB, hold.id);
    if (res[0].meta.changes !== 1) return { status: booking ? ("confirmed" as const) : ("pending" as const), booking };
    // Another payment on this hold created the booking first: this one is already claimed, so it is added to that booking or refunded, never dropped.
    if (booking && res[1].meta.changes !== 1) {
      const added = await bookingsRepo.applyPayment(env.DB, booking, payment.amount_kobo, { reference: payment.reference, via, paidAt: now }, rules.buffer).run();
      return this.finishApplied(env, payment, booking, added.meta.changes === 1);
    }

    if (!booking) {
      // The hold lapsed and someone else took the slot before this payment arrived: refund in full.
      await refundClaimed(env, payment, null, "Slot taken after hold expired");
      const u = payment.user_id ? await usersRepo.byId(env.DB, payment.user_id) : null;
      if (u) await sendEmail(env, u.email, "Payment refunded", `Hi ${u.name},\n\nThe slot on ${when({ date: hold.date, start_min: hold.start_min, end_min: hold.end_min, scheduling: draft.scheduling })} was taken after your hold expired. ${naira(payment.amount_kobo)} is on its way back to you.`);
      await notifyUser(env, payment.user_id, "Payment refunded", `The slot was taken after your hold expired. ${naira(payment.amount_kobo)} is on its way back.`);
      await audit(env.DB, null, "Auto refund", payment.reference, "Hold expired and the slot was taken");
      return { status: "refunded" as const, booking: null };
    }
    await mail(env, booking, emails.confirmed(env, booking), "Booking confirmed");
    await notifyStaff(env, "manage_bookings", `New booking · ${booking.artist_name} · ${booking.ref}`,
      `New booking ${booking.ref} ${placeOf(booking)}\nClient: ${booking.contact_name} (${booking.contact_email}, ${booking.contact_phone})\nWhen: ${when(booking)}\nPackage: ${booking.service_name} · ${booking.package_name}\nPaid: ${naira(payment.amount_kobo)} of ${naira(booking.total_kobo)} (${payment.kind}) · verified via ${via}${quoteLine(booking)}`);
    await audit(env.DB, null, "Booking confirmed", booking.ref, `${payment.kind} payment ${payment.reference} verified via ${via}`);
    return { status: "confirmed" as const, booking };
  },

  async applyToBooking(env: Env, payment: PaymentRow, via: string, channel: string | null) {
    return this.settle(env, payment, await loadBooking(env, payment.booking_id!), via, channel);
  },

  /**
   * Applies a verified payment to an existing booking. The payment is claimed first, then added in one guarded statement:
   * it may not overpay the total, and a request or approval must still have its room free. Otherwise the payment is refunded.
   */
  async settle(env: Env, payment: PaymentRow, b: BookingRow, via: string, channel: string | null) {
    const rules = await loadRules(env);
    const now = new Date().toISOString();
    const closed = ["cancelled", "rejected", "no_show"].includes(b.status);
    const res = await env.DB.batch([
      bookingsRepo.claimPayment(env.DB, payment.reference, via, channel, now),
      ...(closed ? [] : [bookingsRepo.applyPayment(env.DB, b, payment.amount_kobo, { reference: payment.reference, via, paidAt: now }, rules.buffer)]),
    ]);
    if (res[0].meta.changes !== 1) return { status: "confirmed" as const, booking: await loadBooking(env, b.id) };
    if (!payment.booking_id) await run(env.DB, "UPDATE payments SET booking_id = ? WHERE reference = ? AND booking_id IS NULL", b.id, payment.reference);
    return this.finishApplied(env, payment, b, !closed && res[1].meta.changes === 1);
  },

  /** The one place a claimed payment ends: counted on the booking (applied) or refunded in full, never both and never neither. */
  async finishApplied(env: Env, payment: PaymentRow, before: BookingRow, applied: boolean) {
    const booking = await loadBooking(env, before.id);
    if (applied) {
      const confirmedNow = before.status !== "confirmed" && booking.status === "confirmed";
      await mail(env, booking, confirmedNow ? emails.confirmed(env, booking) : emails.paymentReceived(env, booking, payment.amount_kobo, await unlocks(env, booking)), confirmedNow ? "Booking confirmed" : "Payment received");
      await notifyStaff(env, "manage_bookings", `${confirmedNow ? "Booking confirmed" : "Payment received"} · ${booking.ref}`,
        `${booking.contact_name} paid ${naira(payment.amount_kobo)} for ${booking.ref} (${when(booking)}).\nPaid so far: ${naira(paidNet(booking))} of ${naira(booking.total_kobo)}`);
      await audit(env.DB, null, confirmedNow ? "Booking confirmed" : "Payment received", booking.ref, `${naira(payment.amount_kobo)} via ${payment.reference}`);
      return { status: "confirmed" as const, booking };
    }
    const closed = ["cancelled", "rejected", "no_show"].includes(booking.status);
    const overpaid = paidNet(booking) + payment.amount_kobo > booking.total_kobo;
    const reason = closed ? "Paid after the booking closed" : overpaid ? "Paid more than the booking total" : "Time was taken before payment";
    const why = closed ? "was already closed when your payment arrived" : overpaid ? "is already paid in full, so this extra payment was not kept" : "lost its time to another booking before your payment arrived, so it has been cancelled";
    if (!closed && !overpaid) await bookingsRepo.transition(env.DB, booking.id, ["pending", "approved"], "cancelled", { reason, unpaid: true });
    await refundClaimed(env, payment, booking.id, reason);
    await sendEmail(env, booking.contact_email, `Payment refunded · ${booking.ref}`, `Hi ${booking.contact_name},\n\nBooking ${booking.ref} ${why}, so ${naira(payment.amount_kobo)} is on its way back to you.`);
    await audit(env.DB, null, "Auto refund", booking.ref, `Payment ${payment.reference}: ${reason}`);
    return { status: "refunded" as const, booking: await loadBooking(env, booking.id) };
  },

  /** Starts an online payment for an existing booking: a deposit or full payment after approval, or the balance later. */
  async payBooking(env: Env, id: string, auth: { token?: string; user: SessionUser | null }, plan: Plan, origin: string) {
    const b = await this.forPayer(env, id, auth);
    const due = dueNow(b);
    if (due.kind === "none" || due.full <= 0) throw badRequest("Nothing is due on this booking right now.");
    if (b.status === "approved" && b.expires_at && b.expires_at <= new Date().toISOString()) throw new AppError(410, "The payment window for this booking has closed.", "expired");
    if (!b.contact_email) throw badRequest("Add an email address to this booking before paying online.");
    const amount = plan === "deposit" && due.deposit ? due.deposit : due.full;
    const kind = due.kind === "balance" ? "balance" : amount < due.full ? "deposit" : "full";
    return startPayment(env, { holdId: null, bookingId: b.id, userId: b.user_id, email: b.contact_email, amount, kind }, origin);
  },

  /** The client who owns the booking, anyone holding its payment link, or staff. */
  async forPayer(env: Env, id: string, auth: { token?: string; user: SessionUser | null }) {
    const b = await loadBooking(env, id);
    const owner = auth.user && (auth.user.id === b.user_id || auth.user.role !== "client");
    const linked = !!auth.token && !!b.pay_token && safeEqual(auth.token, b.pay_token);
    if (!owner && !linked) throw forbidden("This payment link is not valid.");
    return b;
  },

  async payPage(env: Env, id: string, auth: { token?: string; user: SessionUser | null }) {
    const b = await this.forPayer(env, id, auth);
    return { booking: { ...summary(b), contact_name: b.contact_name }, due: dueNow(b), provider: paymentProvider(env).name };
  },

  async forClient(env: Env, user: SessionUser) {
    const [bookings, requests] = await Promise.all([bookingsRepo.forUser(env.DB, user.id), changeRequestsRepo.forUser(env.DB, user.id)]);
    return bookings.map((b) => ({ ...b, pay_token: undefined, extras: JSON.parse(b.extras), paid_kobo: paidNet(b), balance_kobo: balanceOf(b), pendingRequest: requests.find((r) => r.booking_id === b.id && r.status === "pending") ?? null }));
  },

  async detailForClient(env: Env, user: SessionUser, id: string) {
    const b = await loadBooking(env, id);
    if (b.user_id !== user.id) throw notFound();
    const [payments, pending, share] = await Promise.all([paymentsRepo.forBooking(env.DB, id), changeRequestsRepo.pendingForBooking(env.DB, id), refundShareOf(env, b)]);
    const mins = minutesUntil(b.date, b.start_min);
    return {
      booking: { ...b, pay_token: undefined, extras: JSON.parse(b.extras), paid_kobo: paidNet(b), balance_kobo: balanceOf(b) }, payments, pendingRequest: pending, due: dueNow(b),
      policy: { freeReschedule: b.scheduling !== "project" && b.status === "confirmed" && mins >= 48 * 60 && b.reschedules_used < 1, refundShare: share, refundAmount: Math.round(paidNet(b) * share) },
    };
  },

  async detailForStaff(env: Env, user: SessionUser, id: string) {
    const b = await loadBooking(env, id);
    const [payments, pending, history] = await Promise.all([
      paymentsRepo.forBooking(env.DB, id), changeRequestsRepo.pendingForBooking(env.DB, id), bookingsRepo.forContact(env.DB, b.contact_email, b.user_id),
    ]);
    const money = staffCanSeeMoney(user);
    return {
      booking: { ...forStaff(b, user), extras: JSON.parse(b.extras), paid_kobo: paidNet(b), balance_kobo: balanceOf(b) }, payments: money ? payments : null, pendingRequest: pending, due: dueNow(b),
      payLink: money ? payLink(env, b) : null,
      history: history.filter((h) => h.id !== b.id).map((h) => ({ id: h.id, ref: h.ref, date: h.date, start_min: h.start_min, package_name: h.package_name, status: h.status, total_kobo: h.total_kobo })),
    };
  },

  async requestChange(env: Env, user: SessionUser, bookingId: string, input: { kind: "reschedule" | "cancel"; newDate?: string; newStart?: number; reason: string }) {
    const b = await loadBooking(env, bookingId);
    assertOpen(b);
    if (b.user_id !== user.id) throw notFound();
    if (b.status !== "confirmed") throw badRequest("Only confirmed bookings can be changed. Withdraw a request instead.");
    if (await changeRequestsRepo.pendingForBooking(env.DB, bookingId)) throw conflict("You already have a request waiting for the studio.");
    let target = "";
    if (input.kind === "reschedule") {
      if (b.scheduling === "project") throw badRequest("Remote orders have no session time to move.");
      if (!input.newDate || input.newStart == null) throw badRequest("Pick a new date and time.");
      if (b.reschedules_used >= 1) throw badRequest("Your free reschedule has been used. Any further change is treated as a cancellation, so send a cancellation request or contact the studio.");
      if (minutesUntil(b.date, b.start_min) < 48 * 60) throw badRequest("Free rescheduling closes 48 hours before your session. A later change is treated as a cancellation, so send a cancellation request or contact the studio.");
      const rules = await loadRules(env);
      const t = await moveTarget(env, b, input.newDate, input.newStart);
      if (input.newDate === b.date && t.start === b.start_min) throw badRequest("That is already your session time.");
      checkLead(rules, input.newDate, t.start, true);
      const free = await bookingsRepo.isFree(env.DB, { date: input.newDate, start: t.start, end: t.end, roomId: b.room_id ?? "" }, rules.buffer, new Date().toISOString(), b.id);
      if (!free) throw conflict("That time is no longer free.");
      target = `${prettyDate(input.newDate)}, ${timeRange(input.newDate, t.start, t.end)}`;
    }
    await changeRequestsRepo.create(env.DB, { id: uuid(), booking_id: b.id, user_id: user.id, kind: input.kind, new_date: input.newDate ?? null, new_start_min: input.newStart ?? null, reason: input.reason });
    await notifyStaff(env, "manage_bookings", `${input.kind === "cancel" ? "Cancellation" : "Reschedule"} request · ${b.ref}`,
      `${b.contact_name} asked to ${input.kind === "cancel" ? "cancel" : `move to ${target}`} booking ${b.ref} (${when(b)}).\nReason: ${input.reason || "None given"}`);
    await audit(env.DB, user, `Requested ${input.kind}`, b.ref, input.reason);
  },

  /** A client can withdraw a request or an approved booking they have not paid for yet. */
  async withdraw(env: Env, user: SessionUser, bookingId: string) {
    const b = await loadBooking(env, bookingId);
    assertOpen(b);
    if (b.user_id !== user.id) throw notFound();
    if (!["pending", "approved"].includes(b.status) || paidNet(b) > 0) throw badRequest("This booking cannot be withdrawn. Request a cancellation instead.");
    if (!(await bookingsRepo.transition(env.DB, b.id, ["pending", "approved"], "cancelled", { reason: "Withdrawn by client", unpaid: true }))) throw conflict("This booking was already decided or paid. Reload to see where it stands.", "already_decided");
    await notifyStaff(env, "manage_bookings", `Request withdrawn · ${b.ref}`, `${b.contact_name} withdrew ${b.ref} (${when(b)}). The time is free again.`);
    await audit(env.DB, user, "Withdrew booking", b.ref);
  },

  async decideRequest(env: Env, actor: SessionUser, requestId: string, approve: boolean) {
    const r = await changeRequestsRepo.byId(env.DB, requestId);
    if (!r || r.status !== "pending") throw notFound("Request not found.");
    const b = await loadBooking(env, r.booking_id);
    const yes = approve && !b.delivered_final_at;
    // Claim the request first so two staff (or one double click) cannot act on it twice; hand it back if the action fails.
    if ((await changeRequestsRepo.decide(env.DB, requestId, yes ? "approved" : "declined", actor.id)).meta.changes !== 1) throw alreadyDecided();
    if (yes) {
      try {
        if (r.kind === "reschedule") await this.reschedule(env, actor, b.id, r.new_date!, r.new_start_min!, true);
        else await this.cancel(env, actor, b.id, "Cancelled at client request");
      } catch (e) {
        await changeRequestsRepo.reopen(env.DB, requestId);
        throw e;
      }
    } else {
      await notifyUser(env, b.user_id, "Request declined", `Your ${r.kind} request for ${b.ref} was declined. ${b.delivered_final_at ? "The order is already complete." : "Your booking stays as it is."}`);
      await sendEmail(env, b.contact_email, `Your ${r.kind} request · ${b.ref}`, `Hi ${b.contact_name},\n\nYour ${r.kind} request for ${b.ref} was declined. Your booking stays on ${when(b)}.`);
    }
    await audit(env.DB, actor, `${yes ? "Approved" : "Declined"} ${r.kind} request`, b.ref, approve && !yes ? "Order was already complete" : "");
  },

  async approve(env: Env, actor: SessionUser, id: string, note: string) {
    const b = await loadBooking(env, id);
    assertOpen(b);
    if (b.status !== "pending") throw badRequest("Only requests waiting for approval can be approved.");
    if (b.scheduling !== "project" && minutesUntil(b.date, b.start_min) <= 0) throw badRequest("This session time has passed.");
    const rules = await loadRules(env);
    if (!(await bookingsRepo.decideIfFree(env.DB, b, { status: "approved", by: actor.id, note, expiresAt: windowEnd(rules.paymentWindowHours, b), from: ["pending"] }, rules.buffer, new Date().toISOString()))) {
      throw (await loadBooking(env, id)).status === "pending" ? taken() : alreadyDecided();
    }
    const fresh = await loadBooking(env, id);
    await mail(env, fresh, emails.approved(env, fresh), "Booking approved, pay to confirm");
    await audit(env.DB, actor, "Approved booking", b.ref, note);
  },

  async reject(env: Env, actor: SessionUser, id: string, reason: string) {
    const b = await loadBooking(env, id);
    assertOpen(b);
    if (!["pending", "approved"].includes(b.status)) throw badRequest("Only requests and unpaid approvals can be declined.");
    if (paidNet(b) > 0) throw badRequest("This booking has payments. Cancel it instead so the refund is handled.");
    if (!(await bookingsRepo.decide(env.DB, b.id, { status: "rejected", by: actor.id, note: reason, expiresAt: null }, ["pending", "approved"], true))) throw alreadyDecided();
    const fresh = await loadBooking(env, id);
    await mail(env, fresh, emails.rejected(env, fresh), "Booking request declined");
    await audit(env.DB, actor, "Declined booking", b.ref, reason);
  },

  /** Studio policy allows staff to confirm without payment, for example pay-on-arrival or a label account. */
  async confirmWithoutPayment(env: Env, actor: SessionUser, id: string, note: string) {
    const b = await loadBooking(env, id);
    assertOpen(b);
    if (!["pending", "approved"].includes(b.status)) throw badRequest("Only requests and approvals can be confirmed.");
    if (!(await bookingsRepo.decideIfFree(env.DB, b, { status: "confirmed", by: actor.id, note, expiresAt: null }, (await loadRules(env)).buffer, new Date().toISOString()))) {
      throw ["pending", "approved"].includes((await loadBooking(env, id)).status) ? taken() : alreadyDecided();
    }
    const fresh = await loadBooking(env, id);
    await mail(env, fresh, emails.confirmed(env, fresh), "Booking confirmed");
    await audit(env.DB, actor, "Confirmed without payment", b.ref, note);
  },

  async setOutcome(env: Env, actor: SessionUser, id: string, outcome: "completed" | "no_show") {
    const b = await loadBooking(env, id);
    assertOpen(b);
    if (b.scheduling === "project") throw badRequest("A remote order is completed when its final delivery is approved or finalized.");
    if (!["confirmed", "completed", "no_show"].includes(b.status)) throw badRequest("Only confirmed sessions can be marked.");
    if (minutesUntil(b.date, b.start_min) > 0) throw badRequest("You can mark a session once it has started.");
    if (!(await bookingsRepo.transition(env.DB, b.id, ["confirmed", "completed", "no_show"], outcome))) throw alreadyDecided();
    await audit(env.DB, actor, outcome === "completed" ? "Marked completed" : "Marked no-show", b.ref);
  },

  async reschedule(env: Env, actor: SessionUser, bookingId: string, date: string, start: number, fromRequest = false) {
    const b = await loadBooking(env, bookingId);
    assertOpen(b);
    if (!["confirmed", "approved", "pending"].includes(b.status)) throw badRequest("Only upcoming bookings can be moved.");
    const rules = await loadRules(env);
    const t = await moveTarget(env, b, date, start);
    checkLead(rules, date, t.start, false);
    const dueDate = b.due_date ? addDays(b.due_date, daysBetween(b.date, date)) : null;
    const before = when(b);
    const moved = await bookingsRepo.move(env.DB, { id: b.id, roomId: b.room_id ?? "", date, start: t.start, end: t.end, slotLabel: t.label, dueDate }, rules.buffer, new Date().toISOString(), fromRequest);
    if (!moved) throw conflict("That time is not free.");
    const fresh = await loadBooking(env, bookingId);
    const after = when(fresh);
    await mail(env, fresh, emails.moved(env, fresh, before, after), "Session rescheduled");
    await audit(env.DB, actor, "Rescheduled booking", b.ref, `${before} → ${after}`);
  },

  async cancel(env: Env, actor: SessionUser, bookingId: string, reason: string, overrideShare?: number) {
    const b = await loadBooking(env, bookingId);
    assertOpen(b);
    if (!["pending", "approved", "confirmed"].includes(b.status)) throw badRequest("This booking cannot be cancelled.");
    const share = overrideShare ?? (await refundShareOf(env, b));
    // Only the call that wins this write refunds and emails, so a double click or two staff cannot refund twice.
    if (!(await bookingsRepo.transition(env.DB, b.id, ["pending", "approved", "confirmed"], "cancelled", { reason }))) throw conflict("This booking was already cancelled or changed. Reload to see where it stands.", "already_decided");
    const fresh = await loadBooking(env, bookingId);
    const amount = Math.round(paidNet(fresh) * share);
    const manual = amount > 0 ? await refundBooking(env, fresh, amount, reason) : 0;
    const done = await loadBooking(env, bookingId);
    await mail(env, done, emails.cancelled(env, done, amount), "Booking cancelled");
    await audit(env.DB, actor, "Cancelled booking", b.ref, `${reason}. Refund ${naira(amount)}${manual ? `, ${naira(manual)} of it paid in cash or transfer to return by hand` : ""}`);
    return { refund: amount, manual };
  },

  async lookupPayment(env: Env, reference: string) {
    if (!reference) throw badRequest("Enter a reference code.");
    const p = await paymentsRepo.lookup(env.DB, reference);
    if (!p) throw notFound("No payment has this reference.");
    return p;
  },

  /** Staff check of a reference code. Pending online payments are confirmed with the provider first, so the amount must match before anything is applied. */
  async checkPayment(env: Env, actor: SessionUser, reference: string) {
    let p = await this.lookupPayment(env, reference);
    if (p.status === "pending") {
      await this.confirmPayment(env, p.reference, "staff_check");
      p = await this.lookupPayment(env, reference);
    }
    if (p.status === "pending") throw conflict("The payment provider has not confirmed this payment yet. Try again in a few minutes.");
    if (p.status === "failed") {
      await audit(env.DB, actor, "Payment check failed", p.reference, `${naira(p.amount_kobo)} was not received`);
      throw badRequest("This payment did not go through, or the amount paid does not match. Do not accept it.");
    }
    if (!p.checked_by) {
      await paymentsRepo.markChecked(env.DB, p.reference, actor.id);
      await audit(env.DB, actor, "Validated payment", p.reference, `${naira(p.amount_kobo)}${p.booking_ref ? ` for ${p.booking_ref}` : ""}`);
    }
    return this.lookupPayment(env, reference);
  },

  async recordPayment(env: Env, actor: SessionUser, id: string, p: { amount: number; method: string; note: string }, notify = true) {
    const b = await loadBooking(env, id);
    if (["cancelled", "rejected"].includes(b.status)) throw badRequest("This booking is closed.");
    if (p.amount > balanceOf(b)) throw badRequest(`That is more than the ${naira(balanceOf(b))} still owed on this booking. Record the amount actually received, up to the balance.`);
    if (["pending", "approved"].includes(b.status) && !(await bookingsRepo.decideIfFree(env.DB, b, { status: "confirmed", by: actor.id, note: b.decision_note, expiresAt: null }, (await loadRules(env)).buffer, new Date().toISOString()))) {
      throw ["pending", "approved"].includes((await loadBooking(env, id)).status) ? taken() : alreadyDecided();
    }
    const res = await env.DB.batch([
      paymentsRepo.manual(env.DB, { id: uuid(), reference: newReference("PRM"), bookingId: b.id, userId: b.user_id, amount: p.amount, channel: p.method, note: p.note, by: actor.id }),
      bookingsRepo.addPaid(env.DB, b.id, p.amount),
    ]);
    if (res[0].meta.changes !== 1 || res[1].meta.changes !== 1) throw badRequest("The balance on this booking changed while you were recording. Reload and try again.");
    const fresh = await loadBooking(env, id);
    const confirmedNow = b.status !== "confirmed" && fresh.status === "confirmed";
    if (notify) await mail(env, fresh, confirmedNow ? emails.confirmed(env, fresh) : emails.paymentReceived(env, fresh, p.amount, await unlocks(env, fresh)), confirmedNow ? "Booking confirmed" : "Payment received");
    await audit(env.DB, actor, "Recorded payment", b.ref, `${naira(p.amount)} by ${p.method}${p.note ? `. ${p.note}` : ""}`);
    return fresh;
  },

  async sendPaymentLink(env: Env, actor: SessionUser, id: string) {
    const b = await loadBooking(env, id);
    const due = dueNow(b);
    if (due.kind === "none" || due.full <= 0) throw badRequest("Nothing is due on this booking.");
    if (!b.contact_email) throw badRequest("This booking has no email address. Copy the link and send it by WhatsApp instead.");
    await sendEmail(env, b.contact_email, emails.paymentLink(env, b, due.full).subject, emails.paymentLink(env, b, due.full).text);
    await audit(env.DB, actor, "Sent payment link", b.ref, naira(due.full));
    return { link: payLink(env, b) };
  },

  /** Staff bookings for phone, WhatsApp and walk-in clients. Opening hours can be overridden, clashes cannot. */
  async createManual(env: Env, actor: SessionUser, input: DraftInput & { status: "confirmed" | "approved"; source: string; ignoreHours: boolean; pastOk?: boolean; notify: boolean; payment: { amount: number; method: string; note: string } | null }) {
    const rules = await loadRules(env);
    const draft = await priceDraft(env, input, rules);
    if (input.payment && input.payment.amount > draft.total) throw badRequest(`The payment is more than the ${naira(draft.total)} total.`);
    if (draft.scheduling !== "project" && minutesUntil(draft.date, draft.start + draft.duration) <= 0 && !(draft.scheduling === "flex" && input.ignoreHours && input.pastOk && hasPermission(actor, "manage_bookings"))) {
      throw badRequest("That session is already over. Pick a time that has not finished yet. Only a flex booking can be recorded after the fact, by staff who manage bookings, with the past-date box ticked.");
    }
    if (!input.ignoreHours) await checkOpen(env, draft.scheduling, draft.date, draft.start, draft.start + draft.duration);
    const user = input.contactEmail ? await usersRepo.byEmail(env.DB, input.contactEmail) : null;
    const b = fromDraft(draft, {
      id: uuid(), userId: user?.role === "client" ? user.id : null, holdId: null, status: input.status, source: input.source, createdBy: actor.id,
      expiresAt: input.status === "approved" ? windowEnd(rules.paymentWindowHours, { date: draft.date, start_min: draft.start, scheduling: draft.scheduling }) : null,
    });
    if (!(await bookingsRepo.insertIfFree(env.DB, b, rules.buffer, new Date().toISOString()))) throw conflict("That time clashes with a booking, hold or blocked time in this room.");
    if (input.payment && input.payment.amount > 0) await this.recordPayment(env, actor, b.id, input.payment, false);
    const fresh = await loadBooking(env, b.id);
    if (input.notify) await mail(env, fresh, fresh.status === "approved" ? emails.approved(env, fresh) : emails.confirmed(env, fresh), fresh.status === "approved" ? "Booking approved, pay to confirm" : "Booking confirmed");
    await audit(env.DB, actor, "Created booking", fresh.ref, `${input.source} · ${fresh.status} · ${when(fresh)}`);
    return fresh;
  },

  /** Sessions only: remote orders have no time. A session that ran past midnight on the day before `from` is included, with its real end above 1440. */
  async calendar(env: Env, from: string, to: string, room?: string) {
    const eve = addDays(from, -1);
    const [bookings, holds, blocks] = await Promise.all([
      bookingsRepo.list(env.DB, { from: eve, to, room }), bookingsRepo.holdsBetween(env.DB, eve, to, new Date().toISOString()), settingsRepo.blocks(env.DB, from),
    ]);
    const visible = (x: { date: string; end_min: number }) => x.date >= from || x.end_min > 1440;
    return {
      bookings: bookings.filter((b) => b.scheduling !== "project" && visible(b) && !["cancelled", "rejected"].includes(b.status)).map((b) => ({
        id: b.id, ref: b.ref, date: b.date, start: b.start_min, end: b.end_min, title: b.artist_name, subtitle: `${b.package_name} · ${b.room_name}`, status: b.status, room: b.room_id,
        scheduling: b.scheduling, label: b.slot_label,
      })),
      holds: holds.filter((h) => h.room_id && visible(h) && (!room || h.room_id === room)).map((h) => ({ id: h.id, date: h.date, start: h.start_min, end: h.end_min, expiresAt: h.expires_at, room: h.room_id })),
      blocks: blocks.filter((x) => x.date <= to && (!room || !x.room_id || x.room_id === room)).map((x) => ({ id: x.id, date: x.date, start: x.start_min, end: x.end_min, reason: x.reason, room: x.room_name ?? "All rooms" })),
    };
  },

  async housekeeping(env: Env, at = new Date()) {
    const now = at.toISOString();
    await bookingsRepo.releaseExpired(env.DB, now);
    await paymentsRepo.failPendingForExpiredHolds(env.DB, now);
    for (const b of await bookingsRepo.expiring(env.DB, now)) {
      const pending = b.status === "pending";
      // Only an unpaid booking that is still waiting is released; one paid while this ran stays confirmed.
      if (!(await bookingsRepo.transition(env.DB, b.id, [b.status], "cancelled", { reason: pending ? "Request expired" : "Payment window expired", unpaid: true, expiredBefore: now }))) continue;
      await mail(env, b, emails.expired(env, b, pending ? "The studio could not review your request in time." : "The payment window for your approved booking closed."), "Booking released");
      await audit(env.DB, null, "Released booking", b.ref, pending ? "Request expired before a decision" : "Not paid within the payment window");
    }
    const rules = await loadRules(env);
    const { date: today, minute } = studioNow(at);
    for (const b of await bookingsRepo.dueReminders(env.DB, today, addDays(today, 2))) {
      const mins = minutesUntil(b.date, b.start_min, at);
      if (mins <= 0 || mins > rules.reminderHours * 60) continue;
      await mail(env, b, emails.reminder(env, b), "Session reminder");
      await bookingsRepo.markReminded(env.DB, b.id);
    }
    await bookingsRepo.markCompleted(env.DB, today, minute);
  },
};
