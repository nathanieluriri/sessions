import { hasPermission, type Permission } from "../../shared/permissions";
import type { Env, SessionUser } from "../env";
import { bookingsRepo, paymentsRepo, changeRequestsRepo, type BookingRow, type BookingStatus, type NewBooking, type PaymentRow } from "../repositories/bookings";
import { catalogRepo } from "../repositories/catalog";
import { settingsRepo } from "../repositories/settings";
import { usersRepo } from "../repositories/users";
import { stmt } from "../repositories/db";
import { randomToken, safeEqual, uuid } from "../lib/crypto";
import { addDays, daysBetween, isoIn, label12, minutesUntil, studioNow, weekday } from "../lib/time";
import { naira } from "../lib/money";
import { badRequest, conflict, forbidden, notFound, AppError } from "../lib/errors";
import { loadRules } from "./availability";
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
  extrasList: { slug: string; name: string; price: number }[]; extraHourPrice: number; extraHoursPrice: number; total: number;
  depositPercent: number; deposit: number; requiresApproval: boolean; policyVersion: number;
}

type Rules = Awaited<ReturnType<typeof loadRules>>;
type Plan = "deposit" | "full" | "balance";

/** Deposits are rounded to the nearest ₦100. A percentage of 0 or 100 means the package is paid in full. */
export const depositFor = (total: number, percent: number) => (percent > 0 && percent < 100 ? Math.round((total * percent) / 1_000_000) * 10_000 : total);
export const refundShare = (minutesBefore: number) => (minutesBefore >= 72 * 60 ? 1 : minutesBefore >= 24 * 60 ? 0.5 : 0);

/** Requests and approvals hold their slot for a window, but never past the session start. */
const windowEnd = (hours: number, b: { date: string; start_min: number }) =>
  new Date(Math.min(Date.now() + hours * 3_600_000, Date.now() + minutesUntil(b.date, b.start_min) * 60_000)).toISOString();

export async function priceDraft(env: Env, input: DraftInput, rules?: Rules): Promise<Draft> {
  const [svc, pkg, extras, r] = await Promise.all([
    catalogRepo.serviceBySlug(env.DB, input.serviceSlug), catalogRepo.packageById(env.DB, input.packageId), catalogRepo.extras(env.DB), rules ?? loadRules(env),
  ]);
  if (!svc) throw badRequest("Choose a service.");
  if (!pkg || !pkg.active) throw badRequest("This package is no longer available.");
  if (pkg.pricing === "quote") throw badRequest("This package is priced by quote. Send a quote request instead.");
  if (pkg.service_category !== svc.category) throw badRequest("Pick a package that fits this service.");
  const room = pkg.room_id ? await catalogRepo.roomById(env.DB, pkg.room_id) : null;
  if (!room || !room.active) throw badRequest("This package is not linked to an open room yet.");
  const maxPeople = room.capacity || r.maxPeople;
  if (input.people < 1 || input.people > maxPeople) throw badRequest(`${room.name} takes up to ${maxPeople} people.`);
  const extrasList = extras.filter((e) => input.extras.includes(e.slug) && (!e.category || e.category === svc.category)).map((e) => ({ slug: e.slug, name: e.name, price: e.price_kobo }));
  const extraHourPrice = room.hourly_kobo || r.extraHourKobo;
  const extraHoursPrice = input.extraHours * extraHourPrice;
  const total = pkg.price_kobo + extraHoursPrice + extrasList.reduce((s, e) => s + e.price, 0);
  const depositPercent = pkg.deposit_percent ?? r.depositPercent;
  return {
    ...input, serviceName: svc.name, category: svc.category, packageName: pkg.name, packagePrice: pkg.price_kobo, duration: pkg.duration_min + input.extraHours * 60,
    roomId: room.id, roomName: room.name, extrasList, extraHourPrice, extraHoursPrice, total, depositPercent, deposit: depositFor(total, depositPercent),
    requiresApproval: !!pkg.requires_approval || r.requireApproval, policyVersion: r.policyVersion,
  };
}

function fromDraft(d: Draft, x: { id: string; userId: string | null; holdId: string | null; status: BookingStatus; source: string; createdBy: string | null; expiresAt: string | null }): NewBooking {
  return {
    ...x, roomId: d.roomId, roomName: d.roomName, category: d.category, serviceName: d.serviceName, packageId: d.packageId, packageName: d.packageName,
    packagePrice: d.packagePrice, total: d.total, deposit: d.deposit < d.total ? d.deposit : 0, date: d.date, start: d.start, end: d.start + d.duration,
    extras: JSON.stringify([...d.extrasList, ...(d.extraHours ? [{ slug: "extra-hours", name: `Extra time (${d.extraHours} hr)`, price: d.extraHoursPrice }] : [])]),
    people: d.people, artistName: d.artistName, contactName: d.contactName, contactEmail: d.contactEmail, contactPhone: d.contactPhone,
    project: d.project ?? "", notes: d.notes ?? "", links: d.links ?? "", payToken: randomToken(18), policyVersion: d.policyVersion,
  };
}

/** What the public pay page and the verify page may show: no contact details. */
export const summary = (b: BookingRow) => ({
  id: b.id, ref: b.ref, status: b.status, service_name: b.service_name, package_name: b.package_name, package_price_kobo: b.package_price_kobo,
  room_name: b.room_name, date: b.date, start_min: b.start_min, end_min: b.end_min, extras: JSON.parse(b.extras), total_kobo: b.total_kobo,
  deposit_kobo: b.deposit_kobo, paid_kobo: paidNet(b), balance_kobo: balanceOf(b), expires_at: b.expires_at,
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

async function loadBooking(env: Env, id: string) {
  const b = await bookingsRepo.byId(env.DB, id);
  if (!b) throw notFound("Booking not found.");
  return b;
}

export const bookingService = {
  priceDraft,

  /** Holds the slot for the checkout window. Fails if anyone else holds, requested or booked an overlapping time in the same room. */
  async createHold(env: Env, input: DraftInput, user: SessionUser | null) {
    const rules = await loadRules(env);
    const draft = await priceDraft(env, input, rules);
    if (!(await catalogRepo.categoryBySlug(env.DB, draft.category))?.bookable) throw badRequest("This service is not booked online right now. Send a quote request instead.");
    const hours = await settingsRepo.hoursFor(env.DB, weekday(draft.date));
    const end = draft.start + draft.duration;
    checkHours(hours, draft.start, end);
    if ((draft.start - hours!.open_min) % rules.step !== 0) throw badRequest("Invalid start time.");
    if (minutesUntil(draft.date, draft.start) < rules.minNotice) throw badRequest("That time is too soon to book.");
    if (daysBetween(studioNow().date, draft.date) > rules.bookAhead) throw badRequest("That date is too far ahead to book.");
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
    const b = fromDraft(draft, { id: uuid(), userId: user.id, holdId: hold.id, status: "pending", source: "online", createdBy: null, expiresAt: windowEnd(rules.requestExpiryHours, { date: hold.date, start_min: hold.start_min }) });
    await env.DB.batch([bookingsRepo.insertFromHold(env.DB, b), stmt(env.DB, "UPDATE holds SET status = 'converted' WHERE id = ?", hold.id)]);
    const booking = (await bookingsRepo.byHold(env.DB, hold.id))!;
    if (booking.id === b.id) {
      await mail(env, booking, emails.requestReceived(env, booking), "Request received");
      await notifyStaff(env, "manage_bookings", `Booking request · ${booking.artist_name} · ${booking.ref}`,
        `${booking.contact_name} asked for ${booking.package_name} in ${booking.room_name}.\nWhen: ${when(booking)}\nEstimated total: ${naira(booking.total_kobo)}\nProject: ${booking.project || "None given"}\nApprove or decline it in the dashboard: ${env.APP_URL}/admin/bookings?open=${booking.id}`);
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
      const closed = !booking || ["cancelled", "rejected", "no_show"].includes(booking.status);
      return { status: payment.status === "refunded" && closed ? ("refunded" as const) : booking ? ("confirmed" as const) : ("pending" as const), booking };
    }
    const provider = paymentProvider(env);
    const result = payment.provider === provider.name ? await provider.verify(reference) : { status: "failed" as const, amount: 0, channel: null };
    if (result.status === "pending") return { status: "pending" as const, booking: null };
    if (result.status === "failed" || result.amount !== payment.amount_kobo) {
      await paymentsRepo.markFailed(env.DB, reference);
      const releases = payment.hold_id && !payment.booking_id;
      if (releases) await bookingsRepo.releaseHold(env.DB, payment.hold_id!);
      await audit(env.DB, null, "Payment failed", reference, releases ? "Slot released" : "");
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
    const roomId = hold.room_id ?? draft.roomId;
    const stillOurs = hold.status === "converted" || (await bookingsRepo.isFree(env.DB, { date: hold.date, start: hold.start_min, end: hold.end_min, roomId }, rules.buffer, now, "", hold.id));
    const markApplied = stmt(env.DB, "UPDATE payments SET status = 'success', verified_via = ?, channel = ?, paid_at = ? WHERE reference = ? AND verified_via IS NULL", via, channel, now, payment.reference);

    if (!stillOurs) {
      // The hold lapsed and someone else took the slot before this payment arrived: refund in full.
      const [r] = await env.DB.batch([markApplied]);
      if (r.meta.changes === 1) {
        await paymentProvider(env).refund(payment.reference, payment.amount_kobo);
        await env.DB.batch([
          paymentsRepo.addRefund(env.DB, { id: uuid(), paymentId: payment.id, bookingId: null, amount: payment.amount_kobo, reason: "Slot taken after hold expired" }),
          paymentsRepo.addRefunded(env.DB, payment.id, payment.amount_kobo),
        ]);
        const u = payment.user_id ? await usersRepo.byId(env.DB, payment.user_id) : null;
        if (u) await sendEmail(env, u.email, "Payment refunded", `Hi ${u.name},\n\nThe slot on ${when({ date: hold.date, start_min: hold.start_min, end_min: hold.end_min })} was taken after your hold expired. ${naira(payment.amount_kobo)} is on its way back to you.`);
        await notifyUser(env, payment.user_id, "Payment refunded", `The slot was taken after your hold expired. ${naira(payment.amount_kobo)} is on its way back.`);
        await audit(env.DB, null, "Auto refund", payment.reference, "Hold expired and the slot was taken");
      }
      return { status: "refunded" as const, booking: null };
    }

    const b = fromDraft(draft, { id: uuid(), userId: payment.user_id, holdId: hold.id, status: "confirmed", source: "online", createdBy: null, expiresAt: null });
    const res = await env.DB.batch([
      bookingsRepo.insertFromHold(env.DB, b),
      stmt(env.DB, "UPDATE bookings SET amount_paid_kobo = amount_paid_kobo + ?1 WHERE hold_id = ?2 AND EXISTS (SELECT 1 FROM payments WHERE reference = ?3 AND verified_via IS NULL)", payment.amount_kobo, hold.id, payment.reference),
      stmt(env.DB, "UPDATE payments SET status = 'success', verified_via = ?1, channel = ?2, paid_at = ?3, booking_id = (SELECT id FROM bookings WHERE hold_id = ?4) WHERE reference = ?5 AND verified_via IS NULL",
        via, channel, now, hold.id, payment.reference),
      stmt(env.DB, "UPDATE holds SET status = 'converted' WHERE id = ?", hold.id),
    ]);
    const booking = (await bookingsRepo.byHold(env.DB, hold.id))!;
    if (booking.id === b.id) {
      await mail(env, booking, emails.confirmed(env, booking), "Booking confirmed");
      await notifyStaff(env, "manage_bookings", `New booking · ${booking.artist_name} · ${booking.ref}`,
        `New booking ${booking.ref} in ${booking.room_name}\nClient: ${booking.contact_name} (${booking.contact_email}, ${booking.contact_phone})\nWhen: ${when(booking)}\nPackage: ${booking.service_name} · ${booking.package_name}\nPaid: ${naira(payment.amount_kobo)} of ${naira(booking.total_kobo)} (${payment.kind}) · verified via ${via}`);
      await audit(env.DB, null, "Booking confirmed", booking.ref, `${payment.kind} payment ${payment.reference} verified via ${via}`);
    } else if (res[2].meta.changes === 1) {
      await mail(env, booking, emails.paymentReceived(env, booking, payment.amount_kobo), "Payment received");
      await audit(env.DB, null, "Payment received", booking.ref, `${naira(payment.amount_kobo)} via ${payment.reference}`);
    }
    return { status: "confirmed" as const, booking };
  },

  async applyToBooking(env: Env, payment: PaymentRow, via: string, channel: string | null) {
    const b = await loadBooking(env, payment.booking_id!);
    const now = new Date().toISOString();
    if (["cancelled", "rejected", "no_show"].includes(b.status)) {
      const [r] = await env.DB.batch([stmt(env.DB, "UPDATE payments SET status = 'success', verified_via = ?, channel = ?, paid_at = ? WHERE reference = ? AND verified_via IS NULL", via, channel, now, payment.reference)]);
      if (r.meta.changes === 1) {
        await paymentProvider(env).refund(payment.reference, payment.amount_kobo);
        await env.DB.batch([
          paymentsRepo.addRefund(env.DB, { id: uuid(), paymentId: payment.id, bookingId: b.id, amount: payment.amount_kobo, reason: "Paid after the booking closed" }),
          paymentsRepo.addRefunded(env.DB, payment.id, payment.amount_kobo),
        ]);
        await sendEmail(env, b.contact_email, `Payment refunded · ${b.ref}`, `Hi ${b.contact_name},\n\nBooking ${b.ref} was already closed when your payment arrived, so ${naira(payment.amount_kobo)} is on its way back to you.`);
        await audit(env.DB, null, "Auto refund", b.ref, `Payment ${payment.reference} arrived after the booking closed`);
      }
      return { status: "refunded" as const, booking: b };
    }
    const res = await env.DB.batch([
      stmt(env.DB, `UPDATE bookings SET amount_paid_kobo = amount_paid_kobo + ?1, status = CASE WHEN status IN ('pending', 'approved') THEN 'confirmed' ELSE status END,
        expires_at = CASE WHEN status IN ('pending', 'approved') THEN NULL ELSE expires_at END, updated_at = ?4
        WHERE id = ?2 AND EXISTS (SELECT 1 FROM payments WHERE reference = ?3 AND verified_via IS NULL)`, payment.amount_kobo, b.id, payment.reference, now),
      stmt(env.DB, "UPDATE payments SET status = 'success', verified_via = ?, channel = ?, paid_at = ? WHERE reference = ? AND verified_via IS NULL", via, channel, now, payment.reference),
    ]);
    const booking = await loadBooking(env, b.id);
    if (res[1].meta.changes === 1) {
      const confirmedNow = b.status !== "confirmed" && booking.status === "confirmed";
      await mail(env, booking, confirmedNow ? emails.confirmed(env, booking) : emails.paymentReceived(env, booking, payment.amount_kobo), confirmedNow ? "Booking confirmed" : "Payment received");
      await notifyStaff(env, "manage_bookings", `${confirmedNow ? "Booking confirmed" : "Payment received"} · ${booking.ref}`,
        `${booking.contact_name} paid ${naira(payment.amount_kobo)} for ${booking.ref} (${when(booking)}).\nPaid so far: ${naira(paidNet(booking))} of ${naira(booking.total_kobo)}`);
      await audit(env.DB, null, confirmedNow ? "Booking confirmed" : "Payment received", booking.ref, `${naira(payment.amount_kobo)} via ${payment.reference}`);
    }
    return { status: "confirmed" as const, booking };
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
    const [payments, pending] = await Promise.all([paymentsRepo.forBooking(env.DB, id), changeRequestsRepo.pendingForBooking(env.DB, id)]);
    const mins = minutesUntil(b.date, b.start_min);
    return {
      booking: { ...b, pay_token: undefined, extras: JSON.parse(b.extras), paid_kobo: paidNet(b), balance_kobo: balanceOf(b) }, payments, pendingRequest: pending, due: dueNow(b),
      policy: { freeReschedule: b.status === "confirmed" && mins >= 48 * 60 && b.reschedules_used < 1, refundShare: refundShare(mins), refundAmount: Math.round(paidNet(b) * refundShare(mins)) },
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
    if (b.user_id !== user.id) throw notFound();
    if (b.status !== "confirmed") throw badRequest("Only confirmed bookings can be changed. Withdraw a request instead.");
    if (await changeRequestsRepo.pendingForBooking(env.DB, bookingId)) throw conflict("You already have a request waiting for the studio.");
    if (input.kind === "reschedule") {
      if (!input.newDate || input.newStart == null) throw badRequest("Pick a new date and time.");
      const rules = await loadRules(env);
      const free = await bookingsRepo.isFree(env.DB, { date: input.newDate, start: input.newStart, end: input.newStart + (b.end_min - b.start_min), roomId: b.room_id ?? "" }, rules.buffer, new Date().toISOString(), b.id);
      if (!free) throw conflict("That time is no longer free.");
    }
    await changeRequestsRepo.create(env.DB, { id: uuid(), booking_id: b.id, user_id: user.id, kind: input.kind, new_date: input.newDate ?? null, new_start_min: input.newStart ?? null, reason: input.reason });
    await notifyStaff(env, "manage_bookings", `${input.kind === "cancel" ? "Cancellation" : "Reschedule"} request · ${b.ref}`,
      `${b.contact_name} asked to ${input.kind === "cancel" ? "cancel" : `move to ${input.newDate} ${label12(input.newStart!)}`} booking ${b.ref} (${when(b)}).\nReason: ${input.reason || "None given"}`);
    await audit(env.DB, user, `Requested ${input.kind}`, b.ref, input.reason);
  },

  /** A client can withdraw a request or an approved booking they have not paid for yet. */
  async withdraw(env: Env, user: SessionUser, bookingId: string) {
    const b = await loadBooking(env, bookingId);
    if (b.user_id !== user.id) throw notFound();
    if (!["pending", "approved"].includes(b.status) || paidNet(b) > 0) throw badRequest("This booking cannot be withdrawn. Request a cancellation instead.");
    await bookingsRepo.setStatus(env.DB, b.id, "cancelled", { cancelReason: "Withdrawn by client", expiresAt: null });
    await notifyStaff(env, "manage_bookings", `Request withdrawn · ${b.ref}`, `${b.contact_name} withdrew ${b.ref} (${when(b)}). The time is free again.`);
    await audit(env.DB, user, "Withdrew booking", b.ref);
  },

  async decideRequest(env: Env, actor: SessionUser, requestId: string, approve: boolean) {
    const r = await changeRequestsRepo.byId(env.DB, requestId);
    if (!r || r.status !== "pending") throw notFound("Request not found.");
    const b = await loadBooking(env, r.booking_id);
    if (approve) {
      if (r.kind === "reschedule") await this.reschedule(env, actor, b.id, r.new_date!, r.new_start_min!, true);
      else await this.cancel(env, actor, b.id, "Cancelled at client request");
    } else {
      await notifyUser(env, b.user_id, "Request declined", `Your ${r.kind} request for ${b.ref} was declined. Your booking stays as it is.`);
      await sendEmail(env, b.contact_email, `Your ${r.kind} request · ${b.ref}`, `Hi ${b.contact_name},\n\nYour ${r.kind} request for ${b.ref} was declined. Your booking stays on ${when(b)}.`);
    }
    await changeRequestsRepo.decide(env.DB, requestId, approve ? "approved" : "declined", actor.id);
    await audit(env.DB, actor, `${approve ? "Approved" : "Declined"} ${r.kind} request`, b.ref);
  },

  async approve(env: Env, actor: SessionUser, id: string, note: string) {
    const b = await loadBooking(env, id);
    if (b.status !== "pending") throw badRequest("Only requests waiting for approval can be approved.");
    if (minutesUntil(b.date, b.start_min) <= 0) throw badRequest("This session time has passed.");
    const rules = await loadRules(env);
    await bookingsRepo.decide(env.DB, b.id, { status: "approved", by: actor.id, note, expiresAt: windowEnd(rules.paymentWindowHours, b) });
    const fresh = await loadBooking(env, id);
    await mail(env, fresh, emails.approved(env, fresh), "Booking approved, pay to confirm");
    await audit(env.DB, actor, "Approved booking", b.ref, note);
  },

  async reject(env: Env, actor: SessionUser, id: string, reason: string) {
    const b = await loadBooking(env, id);
    if (!["pending", "approved"].includes(b.status)) throw badRequest("Only requests and unpaid approvals can be declined.");
    if (paidNet(b) > 0) throw badRequest("This booking has payments. Cancel it instead so the refund is handled.");
    await bookingsRepo.decide(env.DB, b.id, { status: "rejected", by: actor.id, note: reason, expiresAt: null });
    const fresh = await loadBooking(env, id);
    await mail(env, fresh, emails.rejected(env, fresh), "Booking request declined");
    await audit(env.DB, actor, "Declined booking", b.ref, reason);
  },

  /** Studio policy allows staff to confirm without payment, for example pay-on-arrival or a label account. */
  async confirmWithoutPayment(env: Env, actor: SessionUser, id: string, note: string) {
    const b = await loadBooking(env, id);
    if (!["pending", "approved"].includes(b.status)) throw badRequest("Only requests and approvals can be confirmed.");
    await bookingsRepo.decide(env.DB, b.id, { status: "confirmed", by: actor.id, note, expiresAt: null });
    const fresh = await loadBooking(env, id);
    await mail(env, fresh, emails.confirmed(env, fresh), "Booking confirmed");
    await audit(env.DB, actor, "Confirmed without payment", b.ref, note);
  },

  async setOutcome(env: Env, actor: SessionUser, id: string, outcome: "completed" | "no_show") {
    const b = await loadBooking(env, id);
    if (!["confirmed", "completed", "no_show"].includes(b.status)) throw badRequest("Only confirmed sessions can be marked.");
    if (minutesUntil(b.date, b.start_min) > 0) throw badRequest("You can mark a session once it has started.");
    await bookingsRepo.setStatus(env.DB, b.id, outcome);
    await audit(env.DB, actor, outcome === "completed" ? "Marked completed" : "Marked no-show", b.ref);
  },

  async reschedule(env: Env, actor: SessionUser, bookingId: string, date: string, start: number, fromRequest = false) {
    const b = await loadBooking(env, bookingId);
    if (!["confirmed", "approved", "pending"].includes(b.status)) throw badRequest("Only upcoming bookings can be moved.");
    const rules = await loadRules(env);
    const duration = b.end_min - b.start_min;
    checkHours(await settingsRepo.hoursFor(env.DB, weekday(date)), start, start + duration);
    if (!(await bookingsRepo.isFree(env.DB, { date, start, end: start + duration, roomId: b.room_id ?? "" }, rules.buffer, new Date().toISOString(), b.id))) throw conflict("That time is not free.");
    const before = when(b);
    await bookingsRepo.move(env.DB, b.id, date, start, start + duration, fromRequest);
    const fresh = await loadBooking(env, bookingId);
    const after = when(fresh);
    await mail(env, fresh, emails.moved(env, fresh, before, after), "Session rescheduled");
    await audit(env.DB, actor, "Rescheduled booking", b.ref, `${before} → ${after}`);
  },

  async cancel(env: Env, actor: SessionUser, bookingId: string, reason: string, overrideShare?: number) {
    const b = await loadBooking(env, bookingId);
    if (!["pending", "approved", "confirmed"].includes(b.status)) throw badRequest("This booking cannot be cancelled.");
    const share = overrideShare ?? refundShare(minutesUntil(b.date, b.start_min));
    const amount = Math.round(paidNet(b) * share);
    await bookingsRepo.setStatus(env.DB, b.id, "cancelled", { cancelReason: reason, expiresAt: null });
    const manual = amount > 0 ? await refundBooking(env, b, amount, reason) : 0;
    const fresh = await loadBooking(env, bookingId);
    await mail(env, fresh, emails.cancelled(env, fresh, amount), "Booking cancelled");
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
    await env.DB.batch([
      paymentsRepo.manual(env.DB, { id: uuid(), reference: newReference("PRM"), bookingId: b.id, userId: b.user_id, amount: p.amount, channel: p.method, note: p.note, by: actor.id }),
      bookingsRepo.addPaid(env.DB, b.id, p.amount),
    ]);
    const fresh = await loadBooking(env, id);
    const confirmedNow = b.status !== "confirmed" && fresh.status === "confirmed";
    if (notify) await mail(env, fresh, confirmedNow ? emails.confirmed(env, fresh) : emails.paymentReceived(env, fresh, p.amount), confirmedNow ? "Booking confirmed" : "Payment received");
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
  async createManual(env: Env, actor: SessionUser, input: DraftInput & { status: "confirmed" | "approved"; source: string; ignoreHours: boolean; notify: boolean; payment: { amount: number; method: string; note: string } | null }) {
    const rules = await loadRules(env);
    const draft = await priceDraft(env, input, rules);
    if (!input.ignoreHours) checkHours(await settingsRepo.hoursFor(env.DB, weekday(draft.date)), draft.start, draft.start + draft.duration);
    const user = input.contactEmail ? await usersRepo.byEmail(env.DB, input.contactEmail) : null;
    const b = fromDraft(draft, {
      id: uuid(), userId: user?.role === "client" ? user.id : null, holdId: null, status: input.status, source: input.source, createdBy: actor.id,
      expiresAt: input.status === "approved" ? windowEnd(rules.paymentWindowHours, { date: draft.date, start_min: draft.start }) : null,
    });
    if (!(await bookingsRepo.insertIfFree(env.DB, b, rules.buffer, new Date().toISOString()))) throw conflict("That time clashes with a booking, hold or blocked time in this room.");
    if (input.payment && input.payment.amount > 0) await this.recordPayment(env, actor, b.id, input.payment, false);
    const fresh = await loadBooking(env, b.id);
    if (input.notify) await mail(env, fresh, fresh.status === "approved" ? emails.approved(env, fresh) : emails.confirmed(env, fresh), fresh.status === "approved" ? "Booking approved, pay to confirm" : "Booking confirmed");
    await audit(env.DB, actor, "Created booking", fresh.ref, `${input.source} · ${fresh.status} · ${when(fresh)}`);
    return fresh;
  },

  async calendar(env: Env, from: string, to: string, room?: string) {
    const [bookings, holds, blocks] = await Promise.all([
      bookingsRepo.list(env.DB, { from, to, room }), bookingsRepo.holdsBetween(env.DB, from, to, new Date().toISOString()), settingsRepo.blocks(env.DB, from),
    ]);
    return {
      bookings: bookings.filter((b) => !["cancelled", "rejected"].includes(b.status)).map((b) => ({
        id: b.id, ref: b.ref, date: b.date, start: b.start_min, end: b.end_min, title: b.artist_name, subtitle: `${b.package_name} · ${b.room_name}`, status: b.status, room: b.room_id,
      })),
      holds: holds.filter((h) => !room || h.room_id === room).map((h) => ({ id: h.id, date: h.date, start: h.start_min, end: h.end_min, expiresAt: h.expires_at, room: h.room_id })),
      blocks: blocks.filter((x) => x.date <= to && (!room || !x.room_id || x.room_id === room)).map((x) => ({ id: x.id, date: x.date, start: x.start_min, end: x.end_min, reason: x.reason, room: x.room_name ?? "All rooms" })),
    };
  },

  async housekeeping(env: Env) {
    const now = new Date().toISOString();
    await bookingsRepo.releaseExpired(env.DB, now);
    await paymentsRepo.failPendingForExpiredHolds(env.DB, now);
    for (const b of await bookingsRepo.expiring(env.DB, now)) {
      const pending = b.status === "pending";
      await bookingsRepo.setStatus(env.DB, b.id, "cancelled", { cancelReason: pending ? "Request expired" : "Payment window expired", expiresAt: null });
      await mail(env, b, emails.expired(env, b, pending ? "The studio could not review your request in time." : "The payment window for your approved booking closed."), "Booking released");
      await audit(env.DB, null, "Released booking", b.ref, pending ? "Request expired before a decision" : "Not paid within the payment window");
    }
    const rules = await loadRules(env);
    const today = studioNow().date;
    for (const b of await bookingsRepo.dueReminders(env.DB, today, addDays(today, 2))) {
      const mins = minutesUntil(b.date, b.start_min);
      if (mins <= 0 || mins > rules.reminderHours * 60) continue;
      await mail(env, b, emails.reminder(env, b), "Session reminder");
      await bookingsRepo.markReminded(env.DB, b.id);
    }
    await bookingsRepo.markCompleted(env.DB, today);
  },
};
