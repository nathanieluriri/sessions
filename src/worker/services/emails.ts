import type { Env } from "../env";
import type { BookingRow } from "../repositories/bookings";
import { label12, prettyDate } from "../lib/time";
import { naira } from "../lib/money";

export const when = (b: { date: string; start_min: number; end_min: number }) => `${prettyDate(b.date)}, ${label12(b.start_min)} to ${label12(b.end_min)}`;
export const paidNet = (b: BookingRow) => b.amount_paid_kobo - b.refunded_kobo;
export const balanceOf = (b: BookingRow) => Math.max(0, b.total_kobo - paidNet(b));
export const payLink = (env: Env, b: BookingRow) => `${env.APP_URL}/pay/${b.id}?t=${b.pay_token ?? ""}`;
export const bookingLink = (env: Env, b: BookingRow) => (b.user_id ? `${env.APP_URL}/account/bookings/${b.id}` : payLink(env, b));

const details = (b: BookingRow) =>
  `Booking reference: ${b.ref}\nService: ${b.service_name} · ${b.package_name}\nRoom: ${b.room_name}\nDate: ${prettyDate(b.date)}\nTime: ${label12(b.start_min)} to ${label12(b.end_min)}`;

const money = (b: BookingRow) => {
  const bal = balanceOf(b);
  return `Total: ${naira(b.total_kobo)}\nPaid: ${naira(paidNet(b))}${bal > 0 ? `\nBalance due before your session: ${naira(bal)}` : "\nPayment status: paid in full"}`;
};

export const emails = {
  confirmed: (env: Env, b: BookingRow) => ({
    subject: `You're booked · ${b.ref} · ${prettyDate(b.date)}`,
    text: `Hi ${b.contact_name},\n\nYour session is confirmed.\n\n${details(b)}\n${money(b)}\n\nArrive 10 minutes early. ${balanceOf(b) > 0 ? `Pay the balance any time here: ${payLink(env, b)}\n` : ""}Manage your booking: ${bookingLink(env, b)}`,
  }),
  requestReceived: (env: Env, b: BookingRow) => ({
    subject: `Request received · ${b.ref}`,
    text: `Hi ${b.contact_name},\n\nThanks for your booking request. This package needs studio approval, so nothing has been charged yet. We hold the time for you and reply within 24 hours.\n\n${details(b)}\nEstimated total: ${naira(b.total_kobo)}\n\nTrack your request: ${bookingLink(env, b)}`,
  }),
  approved: (env: Env, b: BookingRow) => ({
    subject: `Approved, pay to confirm · ${b.ref}`,
    text: `Hi ${b.contact_name},\n\nGood news: the studio approved your booking.${b.decision_note ? `\nNote from the studio: ${b.decision_note}` : ""}\n\n${details(b)}\nTotal: ${naira(b.total_kobo)}${b.deposit_kobo && b.deposit_kobo < b.total_kobo ? `\nDeposit to secure it: ${naira(b.deposit_kobo)}` : ""}\n\nPay to confirm your booking: ${payLink(env, b)}\nThe time is held until ${b.expires_at ? new Date(b.expires_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" }) : "your payment"}.`,
  }),
  rejected: (_env: Env, b: BookingRow) => ({
    subject: `About your booking request · ${b.ref}`,
    text: `Hi ${b.contact_name},\n\nSorry, the studio could not take your request for ${when(b)}.${b.decision_note ? `\nReason: ${b.decision_note}` : ""}\n\nNothing was charged. Reply to this email or book another time on the website.`,
  }),
  expired: (_env: Env, b: BookingRow, reason: string) => ({
    subject: `Booking released · ${b.ref}`,
    text: `Hi ${b.contact_name},\n\n${reason} The time on ${when(b)} has been released and nothing was charged.\n\nYou can book again on the website at any time.`,
  }),
  paymentReceived: (env: Env, b: BookingRow, amount: number) => ({
    subject: `Payment received · ${b.ref}`,
    text: `Hi ${b.contact_name},\n\nWe received ${naira(amount)} for booking ${b.ref}.\n\n${details(b)}\n${money(b)}\n\nManage your booking: ${bookingLink(env, b)}`,
  }),
  paymentLink: (env: Env, b: BookingRow, amount: number) => ({
    subject: `Payment for booking ${b.ref}`,
    text: `Hi ${b.contact_name},\n\nHere is a secure link to pay ${naira(amount)} for your booking.\n\n${details(b)}\n${money(b)}\n\nPay with Paystack: ${payLink(env, b)}`,
  }),
  reminder: (env: Env, b: BookingRow) => ({
    subject: `Reminder: your session ${prettyDate(b.date)} · ${b.ref}`,
    text: `Hi ${b.contact_name},\n\nThis is a reminder of your upcoming session.\n\n${details(b)}\n${money(b)}\n\n${balanceOf(b) > 0 ? `Pay the balance before you arrive: ${payLink(env, b)}\n` : ""}Arrive 10 minutes early. Sessions start and end on time.`,
  }),
  cancelled: (_env: Env, b: BookingRow, refund: number) => ({
    subject: `Booking cancelled · ${b.ref}`,
    text: `Hi ${b.contact_name},\n\nYour booking ${b.ref} (${when(b)}) has been cancelled.\n${refund > 0 ? `${naira(refund)} is being refunded to your original payment method within 5 to 10 working days.` : paidNet(b) > 0 ? "Under the cancellation policy this booking is not refunded." : "Nothing was charged."}`,
  }),
  moved: (_env: Env, b: BookingRow, before: string, after: string) => ({
    subject: `Your session has moved · ${b.ref}`,
    text: `Hi ${b.contact_name},\n\nYour session ${b.ref} has moved.\nWas: ${before}\nNow: ${after}\nRoom: ${b.room_name}\nPackage and price are unchanged.`,
  }),
};
