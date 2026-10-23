import type { Env } from "../env";
import type { BookingRow } from "../repositories/bookings";
import { prettyDate, timeRange } from "../lib/time";
import { naira } from "../lib/money";

type Moment = { date: string; start_min: number; end_min: number; scheduling?: string };

/** Remote orders have no session time, only the day they were placed. */
export const when = (b: Moment) => (b.scheduling === "project" ? `ordered ${prettyDate(b.date)}` : `${prettyDate(b.date)}, ${timeRange(b.date, b.start_min, b.end_min)}`);
export const paidNet = (b: BookingRow) => b.amount_paid_kobo - b.refunded_kobo;
export const balanceOf = (b: BookingRow) => Math.max(0, b.total_kobo - paidNet(b));
export const payLink = (env: Env, b: BookingRow) => `${env.APP_URL}/pay/${b.id}?t=${b.pay_token ?? ""}`;
export const bookingLink = (env: Env, b: BookingRow) => (b.user_id ? `${env.APP_URL}/account/bookings/${b.id}` : payLink(env, b));

const isOrder = (b: BookingRow) => b.scheduling === "project";

const addOns = (b: BookingRow) =>
  (JSON.parse(b.extras) as { name: string; price: number; quote?: boolean }[]).map((e) => `${e.name} (${e.quote ? "price on request" : naira(e.price)})`).join(", ");

const details = (b: BookingRow) =>
  [
    `Booking reference: ${b.ref}`, `Service: ${b.service_name} · ${b.package_name}`,
    ...(isOrder(b) ? [`Order placed: ${prettyDate(b.date)}`] : [`Room: ${b.room_name}`, `Date: ${prettyDate(b.date)}`, `Time: ${timeRange(b.date, b.start_min, b.end_min)}`]),
    ...(b.due_date ? [`Delivery due: ${prettyDate(b.due_date)}`] : []),
    ...(addOns(b) ? [`Add-ons: ${addOns(b)}`] : []),
  ].join("\n");

const money = (b: BookingRow) => {
  const bal = balanceOf(b);
  return `Total: ${naira(b.total_kobo)}\nPaid: ${naira(paidNet(b))}${bal > 0 ? `\nBalance due before ${isOrder(b) ? "your finished files are released" : "your session"}: ${naira(bal)}` : "\nPayment status: paid in full"}`;
};

/** Where a remote order's client goes next. Walk-in clients without an account are told to register with the booking email. */
const orderSteps = (env: Env, b: BookingRow) =>
  `What happens next:\n1. ${b.user_id ? `Upload your files (stems, references or lyrics) in your portal: ${bookingLink(env, b)}` : `Create a free account with ${b.contact_email} at ${env.APP_URL}/register, then upload your files (stems, references or lyrics) in your portal`}\n` +
  `2. We work on your order and deliver the finished files in your portal. We never send finished work by email.\n` +
  `3. You get an email when it is ready. Sign in and download it${balanceOf(b) > 0 ? `. Finished files unlock once your balance is paid: ${payLink(env, b)}` : ""}.`;

export const emails = {
  confirmed: (env: Env, b: BookingRow) =>
    isOrder(b)
      ? { subject: `Order confirmed · ${b.ref}`, text: `Hi ${b.contact_name},\n\nThanks, your order is confirmed.\n\n${details(b)}\n${money(b)}\n\n${orderSteps(env, b)}\n\nManage your order: ${bookingLink(env, b)}` }
      : {
        subject: `You're booked · ${b.ref} · ${prettyDate(b.date)}`,
        text: `Hi ${b.contact_name},\n\nYour session is confirmed.\n\n${details(b)}\n${money(b)}\n\nArrive 10 minutes early. ${balanceOf(b) > 0 ? `Pay the balance any time here: ${payLink(env, b)}\n` : ""}Manage your booking: ${bookingLink(env, b)}`,
      },
  requestReceived: (env: Env, b: BookingRow) => ({
    subject: `Request received · ${b.ref}`,
    text: `Hi ${b.contact_name},\n\nThanks for your booking request. This package needs studio approval, so nothing has been charged yet. ${isOrder(b) ? "We" : "We hold the time for you and"} reply within 24 hours.\n\n${details(b)}\nEstimated total: ${naira(b.total_kobo)}\n\nTrack your request: ${bookingLink(env, b)}`,
  }),
  approved: (env: Env, b: BookingRow) => ({
    subject: `Approved, pay to confirm · ${b.ref}`,
    text: `Hi ${b.contact_name},\n\nGood news: the studio approved your booking.${b.decision_note ? `\nNote from the studio: ${b.decision_note}` : ""}\n\n${details(b)}\nTotal: ${naira(b.total_kobo)}${b.deposit_kobo && b.deposit_kobo < b.total_kobo ? `\nDeposit to secure it: ${naira(b.deposit_kobo)}` : ""}\n\nPay to confirm your booking: ${payLink(env, b)}\n${isOrder(b) ? "The offer" : "The time"} is held until ${b.expires_at ? new Date(b.expires_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" }) : "your payment"}.`,
  }),
  rejected: (_env: Env, b: BookingRow) => ({
    subject: `About your booking request · ${b.ref}`,
    text: `Hi ${b.contact_name},\n\nSorry, the studio could not take your request for ${isOrder(b) ? b.package_name : when(b)}.${b.decision_note ? `\nReason: ${b.decision_note}` : ""}\n\nNothing was charged. Reply to this email or book another time on the website.`,
  }),
  expired: (_env: Env, b: BookingRow, reason: string) => ({
    subject: `Booking released · ${b.ref}`,
    text: `Hi ${b.contact_name},\n\n${reason} ${isOrder(b) ? `Your order for ${b.package_name}` : `The time on ${when(b)}`} has been released and nothing was charged.\n\nYou can book again on the website at any time.`,
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
  delivered: (env: Env, b: BookingRow, d: { files: { title: string; version: number }[]; note: string; released: boolean; final: boolean; revisionsLeft: number; account: boolean }) => {
    const owed = balanceOf(b);
    const list = d.files.map((f) => `  ${f.title}${f.version > 1 ? ` (version ${f.version})` : ""}`).join("\n");
    const balance = owed > 0 ? `\nA balance of ${naira(owed)} is still due on this booking. ${d.released ? "You can pay it here" : "Your files unlock as soon as it is paid"}: ${payLink(env, b)}\n` : "";
    const where = d.account
      ? `Download from your portal: ${env.APP_URL}/account/bookings/${b.id}`
      : `To get your files, create a free account with this email address at ${env.APP_URL}/register and confirm your email. Your booking and files will then appear in your portal.`;
    const next = d.final ? "\nThis is the final delivery, so this order is now complete." : d.revisionsLeft > 0 ? `\nNot quite right? You have ${d.revisionsLeft} revision${d.revisionsLeft === 1 ? "" : "s"} left. Ask for one from your portal.` : "";
    return {
      subject: `${b.category === "music" || b.category === "exclusive" ? "Your music is ready" : "Your files are ready"} · ${b.ref}`,
      text: `Hi ${b.contact_name},\n\nYour finished work is ready in your portal.\n\n${list}\n${d.note ? `\nNote from the studio: ${d.note}\n` : ""}\n${where}\n${balance}${next}`,
    };
  },
  orderComplete: (env: Env, b: BookingRow) => ({
    subject: `Your order is complete · ${b.ref}`,
    text: `Hi ${b.contact_name},\n\nYour order ${b.ref} is now complete. Your files stay in your portal: ${bookingLink(env, b)}\n\nComplete orders are closed to further changes. For anything new, book again or message the studio.`,
  }),
};
