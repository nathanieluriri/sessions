import { pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";

const ITERATIONS = 100000;
const hash = (password) => {
  const salt = randomBytes(16);
  const key = pbkdf2Sync(password, salt, ITERATIONS, 32, "sha256");
  return `pbkdf2$${ITERATIONS}$${salt.toString("base64")}$${key.toString("base64")}`;
};
const q = (v) => (v === null ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const row = (table, obj) => `INSERT INTO ${table} (${Object.keys(obj).join(", ")}) VALUES (${Object.values(obj).map(q).join(", ")});`;
const img = (id) => `https://images.unsplash.com/${id}?w=1200&q=70&auto=format&fit=crop`;
const now = new Date().toISOString();
const out = [];

const password = process.env.SEED_PASSWORD || "password";
out.push(row("users", { id: randomUUID(), email: "uririnathaniel@gmail.com", name: "Nathaniel Uriri", phone: "+234 800 000 0000", password_hash: hash(password), role: "ceo", title: "Owner", permissions: "[]", email_verified_at: now }));
out.push(row("users", { id: randomUUID(), email: "dami@sessionsstudio.ng", name: "Dami Ojo", phone: "+234 809 000 1111", password_hash: hash(password), role: "admin", title: "Studio manager", permissions: JSON.stringify(["view_calendar", "manage_bookings", "update_booking_details", "assist_clients"]), email_verified_at: now }));

const services = [
  ["vocal-recording", "Vocal & rap recording", "Tracked in a treated booth with an engineer running the session and comping takes as you go.", "From ₦25,000 / hr", "photo-1638389746457-ac5ff8228bec"],
  ["beat-production", "Beat production", "Build a beat from scratch with an in-house producer, or finish one you started.", "From ₦60,000 / beat", "photo-1763480847312-7f7e97ac21a3"],
  ["mixing", "Mixing", "Balance, EQ, compression and effects so every part of the record sits right.", "From ₦40,000 / song", "photo-1610716632424-4d45990bcd48"],
  ["mastering", "Mastering", "Loudness and polish for streaming, radio and the club.", "From ₦20,000 / song", "photo-1562369083-3dc4d73a5398"],
  ["vocal-editing", "Vocal editing", "Timing, tuning and clean-up on recorded vocals, natural or hard-tuned.", "From ₦10,000 / song", "photo-1632800237110-f9c87acc2222"],
  ["podcast-recording", "Podcast recording", "Up to four guests on broadcast mics, each on a separate track.", "From ₦20,000 / hr", "photo-1694881227503-ddc502d4b4cc"],
  ["voice-over", "Voice-over recording", "Ads, narration, IVR and dubbing, with a director on talkback.", "From ₦25,000 / hr", "photo-1593697820980-a9d1a839aff7"],
];
services.forEach(([slug, name, description, price_label, photo], i) => out.push(row("services", { id: randomUUID(), slug, name, description, price_label, image_url: img(photo), sort: i })));

const packages = [
  ["1-hour", "1-Hour Session", "Quick vocal takes, a feature verse or a demo idea.", "session", 60, 2500000, ["Engineer included", "Raw files the same day", "Book back-to-back for more time"], 0],
  ["2-hour", "2-Hour Session", "Track a song or two over a finished beat.", "session", 120, 4500000, ["Engineer included", "Rough mix to take home", "Files delivered in 48 hours"], 0],
  ["half-day", "Half-Day Session", "Write, record and comp a full song with breaks built in.", "session", 240, 9000000, ["Engineer included", "Rough mix of up to 2 songs", "Files delivered in 48 hours"], 1],
  ["full-day", "Full-Day Session", "A full day lock-out for EPs, groups and long projects.", "session", 480, 16000000, ["Engineer included", "Rough mixes of the day", "Two breaks built in"], 0],
  ["record-mix", "Record & Mix", "One song recorded and professionally mixed.", "post", 120, 7500000, ["2-hour recording session", "Mix with two revisions", "Delivered in 3 working days"], 0],
  ["record-mix-master", "Record, Mix & Master", "One song recorded, mixed and mastered for release.", "post", 120, 11000000, ["2-hour recording session", "Mix with two revisions", "Master for streaming"], 0],
];
packages.forEach(([slug, name, description, category, duration_min, price_kobo, includes, featured], i) => out.push(row("packages", { id: randomUUID(), slug, name, description, category, duration_min, price_kobo, includes: JSON.stringify(includes), featured, sort: i })));

[["vocal-editing", "Vocal editing", 1000000], ["rush-delivery", "Rush delivery in 24 hours", 1500000]].forEach(([slug, name, price_kobo]) => out.push(row("extras", { id: randomUUID(), slug, name, price_kobo })));

for (let d = 0; d < 7; d++) out.push(row("opening_hours", { weekday: d, is_open: 1, open_min: d === 0 ? 840 : 600, close_min: d === 0 ? 1200 : 1320 }));

Object.entries({ buffer_min: "30", hold_min: "15", step_min: "30", min_notice_min: "180", book_ahead_days: "90", extra_hour_kobo: "2000000", max_people: "6", policy_version: "1" })
  .forEach(([key, value]) => out.push(row("settings", { key, value })));

const policies = [
  ["payment", "Payment", "Full payment is required at checkout. Pay by card, bank transfer or USSD through Paystack. Your booking is confirmed automatically once Paystack verifies the payment."],
  ["cancellations", "Cancellations", "Cancel 72 hours or more before your session for a full refund. Between 24 and 72 hours, 50% is refunded. Under 24 hours or no-shows are not refunded."],
  ["rescheduling", "Rescheduling", "Reschedule once for free, up to 48 hours before your session, to any open slot. Later changes are treated as a cancellation."],
  ["late-arrivals", "Late arrivals", "Sessions start and end at the booked time. Time lost to late arrival is not added on, so the next client is not delayed."],
  ["overtime", "Overtime", "Overtime is ₦20,000 per hour, billed in 30 minute blocks, and only when the studio is free after your session."],
  ["refunds", "Refunds", "Approved refunds go back to the original payment method within 5 to 10 working days."],
  ["guests-conduct", "Guests and conduct", "Up to 6 people per session, including the artist. No smoking, drugs or weapons. Unsafe behaviour ends a session without a refund."],
  ["files", "File delivery and storage", "Files are shared by download link within 48 hours. Project files are kept for 30 days after your session, then deleted."],
];
policies.forEach(([slug, title, body], i) => out.push(row("policies", { slug, title, body, sort: i })));

Object.entries({
  hero_title: "Your sound, recorded right.",
  hero_subtitle: "Book real studio time in Lekki, Lagos. See live availability, pay with Paystack, walk in and record.",
  studio_address: "14 Admiralty Way, Lekki Phase 1, Lagos",
  testimonial_quote: "Booked at midnight, recorded the next afternoon. The engineer was ready when I walked in.",
  testimonial_name: "Amaka Eze",
}).forEach(([key, value]) => out.push(row("content", { key, value })));

console.log(out.join("\n"));
