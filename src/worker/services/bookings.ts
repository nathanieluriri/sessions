import type { Env, SessionUser } from "../env";
import { bookingsRepo, paymentsRepo, changeRequestsRepo, type BookingRow, type HoldRow } from "../repositories/bookings";
import { catalogRepo } from "../repositories/catalog";
import { settingsRepo } from "../repositories/settings";
import { stmt } from "../repositories/db";
import { uuid } from "../lib/crypto";
import { isoIn, label12, minutesUntil, prettyDate, studioNow, weekday } from "../lib/time";
import { naira } from "../lib/money";
import { badRequest, conflict, forbidden, notFound, AppError } from "../lib/errors";
import { loadRules } from "./availability";
import { paymentProvider } from "./payments";
import { notifyStaff, notifyUser, sendEmail, studioFooter } from "./notifications";
import { audit } from "./audit";

export interface DraftInput {
  serviceSlug: string; packageId: string; date: string; start: number; extraHours: number; extras: string[];
  people: number; artistName: string; contactName: string; contactEmail: string; contactPhone: string; notes: string;
}

export interface Draft extends DraftInput {
  serviceName: string; packageName: string; packagePrice: number; duration: number;
  extrasList: { slug: string; name: string; price: number }[]; extraHoursPrice: number; total: number; policyVersion: number;
}

export async function priceDraft(env: Env, input: DraftInput): Promise<Draft> {
  const [svc, pkg, extras, rules] = await Promise.all([
    catalogRepo.serviceBySlug(env.DB, input.serviceSlug), catalogRepo.packageById(env.DB, input.packageId), catalogRepo.extras(env.DB), loadRules(env),
  ]);
  if (!svc) throw badRequest("Choose a service.");
  if (!pkg || !pkg.active) throw badRequest("This package is no longer available.");
  if (input.people < 1 || input.people > rules.maxPeople) throw badRequest(`Up to ${rules.maxPeople} people per session.`);
  const extrasList = extras.filter((e) => input.extras.includes(e.slug)).map((e) => ({ slug: e.slug, name: e.name, price: e.price_kobo }));
  const extraHoursPrice = input.extraHours * rules.extraHourKobo;
  return {
    ...input, serviceName: svc.name, packageName: pkg.name, packagePrice: pkg.price_kobo, duration: pkg.duration_min + input.extraHours * 60,
    extrasList, extraHoursPrice, total: pkg.price_kobo + extraHoursPrice + extrasList.reduce((s, e) => s + e.price, 0), policyVersion: rules.policyVersion,
  };
}

const refundShare = (minutesBefore: number) => (minutesBefore >= 72 * 60 ? 1 : minutesBefore >= 24 * 60 ? 0.5 : 0);
const when = (b: { date: string; start_min: number; end_min: number }) => `${prettyDate(b.date)}, ${label12(b.start_min)} to ${label12(b.end_min)}`;

function bookingEmail(env: Env, b: BookingRow) {
  return `Hi ${b.contact_name},\n\nYou're booked. Your payment was verified and your session is confirmed.\n\nBooking reference: ${b.ref}\nPackage: ${b.service_name} · ${b.package_name}\nDate: ${prettyDate(b.date)}\nStart time: ${label12(b.start_min)}\nDuration: ${(b.end_min - b.start_min) / 60} hours\nAmount paid: ${naira(b.total_kobo)}\n\nArrive 10 minutes early. Your receipt is in your dashboard: ${env.APP_URL}/account/bookings/${b.id}${studioFooter(env)}`;
}

export const bookingService = {
  priceDraft,

  /** Holds the slot for the checkout window. Fails if anyone else holds or booked an overlapping time. */
  async createHold(env: Env, input: DraftInput, user: SessionUser | null) {
    const draft = await priceDraft(env, input);
    const rules = await loadRules(env);
    const hours = await settingsRepo.hoursFor(env.DB, weekday(draft.date));
    const end = draft.start + draft.duration;
    if (!hours?.is_open || draft.start < hours.open_min || end > hours.close_min) throw badRequest("That time is outside opening hours.");
    if ((draft.start - hours.open_min) % rules.step !== 0) throw badRequest("Invalid start time.");
    if (minutesUntil(draft.date, draft.start) < rules.minNotice) throw badRequest("That time is too soon to book.");
    const id = uuid();
    const expiresAt = isoIn(rules.holdMin);
    const ok = await bookingsRepo.createHoldIfFree(env.DB, { id, date: draft.date, start: draft.start, end, expiresAt, draft: JSON.stringify(draft), userId: user?.id ?? null }, rules.buffer, new Date().toISOString());
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

  /** Requires a logged-in client. Starts a payment for the held slot. */
  async checkout(env: Env, user: SessionUser, holdId: string, origin: string) {
    const h = await bookingsRepo.hold(env.DB, holdId);
    if (!h || h.status !== "active" || h.expires_at <= new Date().toISOString()) throw new AppError(410, "Your hold expired. Pick a time again.", "hold_expired");
    if (h.user_id && h.user_id !== user.id) throw forbidden();
    await bookingsRepo.attachHoldUser(env.DB, holdId, user.id);
    const draft = JSON.parse(h.draft) as Draft;
    const provider = paymentProvider(env);
    const reference = `SS${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    await paymentsRepo.create(env.DB, { id: uuid(), reference, holdId, userId: user.id, amount: draft.total, provider: provider.name });
    const url = await provider.initialize(reference, draft.total, user.email, `${origin}/book/verify?reference=${reference}`);
    return { reference, authorizationUrl: url, provider: provider.name };
  },

  /** Called by the verify page and the webhook. Confirms the booking exactly once, only after the provider says the payment succeeded. */
  async confirmPayment(env: Env, reference: string, via: "server_verify" | "webhook") {
    const payment = await paymentsRepo.byReference(env.DB, reference);
    if (!payment) throw notFound("Payment not found.");
    if (payment.booking_id) return { status: "confirmed" as const, booking: await bookingsRepo.byId(env.DB, payment.booking_id) };

    const provider = paymentProvider(env);
    const result = await provider.verify(reference);
    if (result.status === "pending") return { status: "pending" as const, booking: null };
    if (result.status === "failed" || result.amount !== payment.amount_kobo) {
      await paymentsRepo.markFailed(env.DB, reference);
      await bookingsRepo.releaseHold(env.DB, payment.hold_id);
      await audit(env.DB, null, "Payment failed", reference, "Slot released");
      return { status: "failed" as const, booking: null };
    }

    const now = new Date().toISOString();
    await paymentsRepo.markSuccess(env.DB, reference, via, result.channel, now);
    const hold = (await bookingsRepo.hold(env.DB, payment.hold_id)) as HoldRow;
    const draft = JSON.parse(hold.draft) as Draft;
    const rules = await loadRules(env);
    const stillOurs = hold.status === "converted" || (await bookingsRepo.isFree(env.DB, hold.date, hold.start_min, hold.end_min, rules.buffer, now, "", hold.id));

    if (!stillOurs) {
      // The hold lapsed and someone else took the slot before this payment arrived: refund in full.
      const p = (await paymentsRepo.byReference(env.DB, reference))!;
      await provider.refund(reference, p.amount_kobo);
      await env.DB.batch([paymentsRepo.markRefunded(env.DB, p.id), paymentsRepo.addRefund(env.DB, { id: uuid(), paymentId: p.id, bookingId: null, amount: p.amount_kobo, reason: "Slot taken after hold expired" })]);
      await notifyUser(env, p.user_id, "Payment refunded", `The slot on ${prettyDate(hold.date)} was taken after your hold expired. ${naira(p.amount_kobo)} is on its way back.`);
      await audit(env.DB, null, "Auto refund", reference, "Hold expired and slot was taken");
      return { status: "refunded" as const, booking: null };
    }

    const id = uuid();
    const yymm = hold.date.slice(2, 4) + hold.date.slice(5, 7);
    await env.DB.batch([
      stmt(env.DB, `INSERT OR IGNORE INTO bookings (id, ref, user_id, hold_id, service_name, package_id, package_name, package_price_kobo, extras, total_kobo,
        date, start_min, end_min, people, artist_name, contact_name, contact_email, contact_phone, notes, status, policy_version)
        VALUES (?, 'SS-' || ? || '-' || printf('%04d', (SELECT COUNT(*) + 1 FROM bookings)), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?)`,
        id, yymm, payment.user_id, hold.id, draft.serviceName, draft.packageId, draft.packageName, draft.packagePrice,
        JSON.stringify([...draft.extrasList, ...(draft.extraHours ? [{ slug: "extra-hours", name: `Extra time (${draft.extraHours} hr)`, price: draft.extraHoursPrice }] : [])]),
        draft.total, hold.date, hold.start_min, hold.end_min, draft.people, draft.artistName, draft.contactName, draft.contactEmail, draft.contactPhone, draft.notes, draft.policyVersion),
      stmt(env.DB, "UPDATE holds SET status = 'converted' WHERE id = ?", hold.id),
      stmt(env.DB, "UPDATE payments SET booking_id = (SELECT id FROM bookings WHERE hold_id = ?) WHERE reference = ?", hold.id, reference),
    ]);
    const booking = (await bookingsRepo.byHold(env.DB, hold.id))!;
    if (booking.id === id) {
      await sendEmail(env, booking.contact_email, `You're booked · ${booking.ref} · ${prettyDate(booking.date)}`, bookingEmail(env, booking));
      await notifyUser(env, booking.user_id, "Booking confirmed", `${booking.ref} · ${when(booking)}`);
      await notifyStaff(env, "manage_bookings", `New booking · ${booking.artist_name} · ${booking.ref}`,
        `New paid booking ${booking.ref}\nClient: ${booking.contact_name} (${booking.contact_email}, ${booking.contact_phone})\nWhen: ${when(booking)}\nPackage: ${booking.service_name} · ${booking.package_name}\nPayment: ${naira(booking.total_kobo)} · verified via ${via}`);
      await audit(env.DB, null, "Booking confirmed", booking.ref, `Payment ${reference} verified via ${via}`);
    }
    return { status: "confirmed" as const, booking };
  },

  async forClient(env: Env, user: SessionUser) {
    const [bookings, requests] = await Promise.all([bookingsRepo.forUser(env.DB, user.id), changeRequestsRepo.forUser(env.DB, user.id)]);
    return bookings.map((b) => ({ ...b, extras: JSON.parse(b.extras), pendingRequest: requests.find((r) => r.booking_id === b.id && r.status === "pending") ?? null }));
  },

  async detailForClient(env: Env, user: SessionUser, id: string) {
    const b = await bookingsRepo.byId(env.DB, id);
    if (!b || b.user_id !== user.id) throw notFound();
    const [payment, pending] = await Promise.all([paymentsRepo.forBooking(env.DB, id), changeRequestsRepo.pendingForBooking(env.DB, id)]);
    const mins = minutesUntil(b.date, b.start_min);
    return {
      booking: { ...b, extras: JSON.parse(b.extras) }, payment, pendingRequest: pending,
      policy: { freeReschedule: b.status === "confirmed" && mins >= 48 * 60 && b.reschedules_used < 1, refundShare: refundShare(mins), refundAmount: Math.round(b.total_kobo * refundShare(mins)) },
    };
  },

  async requestChange(env: Env, user: SessionUser, bookingId: string, input: { kind: "reschedule" | "cancel"; newDate?: string; newStart?: number; reason: string }) {
    const b = await bookingsRepo.byId(env.DB, bookingId);
    if (!b || b.user_id !== user.id) throw notFound();
    if (b.status !== "confirmed") throw badRequest("Only upcoming bookings can be changed.");
    if (await changeRequestsRepo.pendingForBooking(env.DB, bookingId)) throw conflict("You already have a request waiting for the studio.");
    if (input.kind === "reschedule") {
      if (!input.newDate || input.newStart == null) throw badRequest("Pick a new date and time.");
      const rules = await loadRules(env);
      const free = await bookingsRepo.isFree(env.DB, input.newDate, input.newStart, input.newStart + (b.end_min - b.start_min), rules.buffer, new Date().toISOString(), b.id);
      if (!free) throw conflict("That time is no longer free.");
    }
    await changeRequestsRepo.create(env.DB, { id: uuid(), booking_id: b.id, user_id: user.id, kind: input.kind, new_date: input.newDate ?? null, new_start_min: input.newStart ?? null, reason: input.reason });
    await notifyStaff(env, "manage_bookings", `${input.kind === "cancel" ? "Cancellation" : "Reschedule"} request · ${b.ref}`,
      `${b.contact_name} asked to ${input.kind === "cancel" ? "cancel" : `move to ${input.newDate} ${label12(input.newStart!)}`} booking ${b.ref} (${when(b)}).\nReason: ${input.reason || "None given"}`);
    await audit(env.DB, user, `Requested ${input.kind}`, b.ref, input.reason);
  },

  async decideRequest(env: Env, actor: SessionUser, requestId: string, approve: boolean) {
    const r = await changeRequestsRepo.byId(env.DB, requestId);
    if (!r || r.status !== "pending") throw notFound("Request not found.");
    const b = (await bookingsRepo.byId(env.DB, r.booking_id))!;
    if (approve) {
      if (r.kind === "reschedule") await this.reschedule(env, actor, b.id, r.new_date!, r.new_start_min!, true);
      else await this.cancel(env, actor, b.id, "Cancelled at client request");
    } else {
      await notifyUser(env, b.user_id, "Request declined", `Your ${r.kind} request for ${b.ref} was declined. Your booking stays as it is.`);
      await sendEmail(env, b.contact_email, `Your ${r.kind} request · ${b.ref}`, `Hi ${b.contact_name},\n\nYour ${r.kind} request for ${b.ref} was declined. Your booking stays on ${when(b)}.${studioFooter(env)}`);
    }
    await changeRequestsRepo.decide(env.DB, requestId, approve ? "approved" : "declined", actor.id);
    await audit(env.DB, actor, `${approve ? "Approved" : "Declined"} ${r.kind} request`, b.ref);
  },

  async reschedule(env: Env, actor: SessionUser, bookingId: string, date: string, start: number, fromRequest = false) {
    const b = await bookingsRepo.byId(env.DB, bookingId);
    if (!b) throw notFound();
    if (b.status !== "confirmed") throw badRequest("Only confirmed bookings can be moved.");
    const rules = await loadRules(env);
    const duration = b.end_min - b.start_min;
    const hours = await settingsRepo.hoursFor(env.DB, weekday(date));
    if (!hours?.is_open || start < hours.open_min || start + duration > hours.close_min) throw badRequest("That time is outside opening hours.");
    if (!(await bookingsRepo.isFree(env.DB, date, start, start + duration, rules.buffer, new Date().toISOString(), b.id))) throw conflict("That time is not free.");
    const before = when(b);
    await bookingsRepo.move(env.DB, b.id, date, start, start + duration, fromRequest);
    const after = when({ date, start_min: start, end_min: start + duration });
    await notifyUser(env, b.user_id, "Session rescheduled", `${b.ref} moved to ${after}`);
    await sendEmail(env, b.contact_email, `Your session has moved · ${b.ref}`, `Hi ${b.contact_name},\n\nYour session ${b.ref} has moved.\nWas: ${before}\nNow: ${after}\nPackage and price are unchanged.${studioFooter(env)}`);
    await audit(env.DB, actor, "Rescheduled booking", b.ref, `${before} → ${after}`);
  },

  async cancel(env: Env, actor: SessionUser, bookingId: string, reason: string, overrideShare?: number) {
    const b = await bookingsRepo.byId(env.DB, bookingId);
    if (!b) throw notFound();
    if (b.status !== "confirmed") throw badRequest("Only confirmed bookings can be cancelled.");
    const payment = await paymentsRepo.forBooking(env.DB, b.id);
    const share = overrideShare ?? refundShare(minutesUntil(b.date, b.start_min));
    const amount = Math.round(b.total_kobo * share);
    await bookingsRepo.setStatus(env.DB, b.id, "cancelled");
    if (payment && amount > 0) {
      await paymentProvider(env).refund(payment.reference, amount);
      await env.DB.batch([paymentsRepo.addRefund(env.DB, { id: uuid(), paymentId: payment.id, bookingId: b.id, amount, reason }), ...(share === 1 ? [paymentsRepo.markRefunded(env.DB, payment.id)] : [])]);
    }
    const refundLine = amount > 0 ? `${naira(amount)} is being refunded to your original payment method within 5 to 10 working days.` : "Under the cancellation policy this booking is not refunded.";
    await notifyUser(env, b.user_id, "Booking cancelled", `${b.ref} was cancelled. ${refundLine}`);
    await sendEmail(env, b.contact_email, `Booking cancelled · ${b.ref}`, `Hi ${b.contact_name},\n\nYour booking ${b.ref} (${when(b)}) has been cancelled.\n${refundLine}${studioFooter(env)}`);
    await audit(env.DB, actor, "Cancelled booking", b.ref, `${reason}. Refund ${naira(amount)}`);
  },

  async calendar(env: Env, from: string, to: string) {
    const [bookings, holds, blocks] = await Promise.all([
      bookingsRepo.list(env.DB, { from, to }), bookingsRepo.holdsBetween(env.DB, from, to, new Date().toISOString()), settingsRepo.blocks(env.DB, from),
    ]);
    return {
      bookings: bookings.filter((b) => b.status !== "cancelled").map((b) => ({ id: b.id, ref: b.ref, date: b.date, start: b.start_min, end: b.end_min, title: b.artist_name, subtitle: b.package_name, status: b.status })),
      holds: holds.map((h) => ({ id: h.id, date: h.date, start: h.start_min, end: h.end_min, expiresAt: h.expires_at })),
      blocks: blocks.filter((x) => x.date <= to).map((x) => ({ id: x.id, date: x.date, start: x.start_min, end: x.end_min, reason: x.reason })),
    };
  },

  async housekeeping(env: Env) {
    const now = new Date().toISOString();
    await bookingsRepo.releaseExpired(env.DB, now);
    await paymentsRepo.failPendingForExpiredHolds(env.DB, now);
    await bookingsRepo.markCompleted(env.DB, studioNow().date);
  },
};
