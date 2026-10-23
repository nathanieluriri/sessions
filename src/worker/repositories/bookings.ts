import { all, first, run, stmt } from "./db";

export type BookingStatus = "pending" | "approved" | "confirmed" | "completed" | "cancelled" | "no_show" | "rejected";

export interface HoldRow { id: string; date: string; start_min: number; end_min: number; expires_at: string; status: string; draft: string; user_id: string | null; room_id: string | null; created_at: string }
export interface BookingRow {
  id: string; ref: string; user_id: string | null; hold_id: string | null; room_id: string | null; room_name: string; category: string;
  service_name: string; package_id: string; package_name: string; package_price_kobo: number; extras: string; total_kobo: number;
  deposit_kobo: number; amount_paid_kobo: number; refunded_kobo: number; date: string; start_min: number; end_min: number; people: number;
  artist_name: string; contact_name: string; contact_email: string; contact_phone: string; project: string; notes: string; reference_links: string;
  status: BookingStatus; source: string; created_by: string | null; pay_token: string | null; expires_at: string | null;
  decided_by: string | null; decided_at: string | null; decision_note: string; cancel_reason: string; rescheduled_at: string | null;
  reminder_sent_at: string | null; policy_version: number; reschedules_used: number; created_at: string; updated_at: string;
  scheduling: "flex" | "slot" | "day" | "project"; slot_kind: string; slot_label: string; due_date: string | null;
  revision_limit: number; revisions_used: number; delivered_final_at: string | null; delivery_notified_at: string | null;
}
export interface PaymentRow {
  id: string; reference: string; hold_id: string | null; booking_id: string | null; user_id: string | null; amount_kobo: number;
  provider: "paystack" | "demo" | "manual"; kind: "full" | "deposit" | "balance" | "manual"; status: "pending" | "success" | "failed" | "refunded";
  channel: string | null; verified_via: string | null; note: string; recorded_by: string | null; refunded_kobo: number; paid_at: string | null; created_at: string;
  checked_by: string | null; checked_at: string | null;
}
export interface ChangeRequestRow { id: string; booking_id: string; user_id: string; kind: "reschedule" | "cancel"; new_date: string | null; new_start_min: number | null; reason: string; status: string; decided_by: string | null; decided_at: string | null; created_at: string }

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

/** Bookings that hold their room: confirmed ones, plus requests and approvals until they expire. ?5 is the current time. */
const OCCUPIES = `(b.status = 'confirmed' OR (b.status IN ('pending', 'approved') AND (b.expires_at IS NULL OR b.expires_at > ?5)))`;

// Overlap with a buffer on both sides, per room: [start - buffer, end + buffer) must not intersect. Blocks without a room close every room.
// Rows from the neighbouring dates are shifted by whole days, so a session that ends after midnight (end_min above 1440) still holds the room the next morning.
const SHIFT = (col: string) => `CAST(julianday(${col}) - julianday(?1) AS INTEGER) * 1440`;
const NEAR = (col: string) => `${col} BETWEEN date(?1, '-1 day') AND date(?1, '+1 day')`;
const CLASH = `
  NOT EXISTS (SELECT 1 FROM bookings b WHERE ${NEAR("b.date")} AND b.room_id = ?8 AND ${OCCUPIES} AND b.id != ?6 AND ${SHIFT("b.date")} + b.start_min < ?3 + ?4 AND ${SHIFT("b.date")} + b.end_min + ?4 > ?2)
  AND NOT EXISTS (SELECT 1 FROM holds h WHERE ${NEAR("h.date")} AND h.room_id = ?8 AND h.status = 'active' AND h.expires_at > ?5 AND h.id != ?7 AND ${SHIFT("h.date")} + h.start_min < ?3 + ?4 AND ${SHIFT("h.date")} + h.end_min + ?4 > ?2)
  AND NOT EXISTS (SELECT 1 FROM blocked_periods x WHERE ${NEAR("x.date")} AND (x.room_id IS NULL OR x.room_id = ?8) AND ${SHIFT("x.date")} + x.start_min < ?3 AND ${SHIFT("x.date")} + x.end_min > ?2)`;

/** Booking references read PR-YYMM-0001. Bookings are never deleted, so the running count stays unique. */
export const REF_SQL = (yymmParam: string) => `'PR-' || ${yymmParam} || '-' || printf('%04d', (SELECT COUNT(*) + 1 FROM bookings))`;

export interface NewBooking {
  id: string; userId: string | null; holdId: string | null; roomId: string; roomName: string; category: string; serviceName: string;
  packageId: string; packageName: string; packagePrice: number; extras: string; total: number; deposit: number; date: string; start: number; end: number;
  people: number; artistName: string; contactName: string; contactEmail: string; contactPhone: string; project: string; notes: string; links: string;
  status: BookingStatus; source: string; createdBy: string | null; payToken: string; expiresAt: string | null; policyVersion: number;
  scheduling: BookingRow["scheduling"]; slotKind: string; slotLabel: string; dueDate: string | null; revisionLimit: number;
}

const COLS = ["id", "user_id", "hold_id", "room_id", "room_name", "category", "service_name", "package_id", "package_name", "package_price_kobo", "extras",
  "total_kobo", "deposit_kobo", "date", "start_min", "end_min", "people", "artist_name", "contact_name", "contact_email", "contact_phone", "project", "notes",
  "reference_links", "status", "source", "created_by", "pay_token", "expires_at", "policy_version", "scheduling", "slot_kind", "slot_label", "due_date", "revision_limit"];
// Remote orders have no room, and an empty string would break the foreign key.
const values = (b: NewBooking) => [b.id, b.userId, b.holdId, b.roomId || null, b.roomName, b.category, b.serviceName, b.packageId, b.packageName, b.packagePrice, b.extras,
  b.total, b.deposit, b.date, b.start, b.end, b.people, b.artistName, b.contactName, b.contactEmail, b.contactPhone, b.project, b.notes,
  b.links, b.status, b.source, b.createdBy, b.payToken, b.expiresAt, b.policyVersion, b.scheduling, b.slotKind, b.slotLabel, b.dueDate, b.revisionLimit];
const params = (from: number) => COLS.map((_, i) => `?${from + i}`).join(", ");
const yymm = (date: string) => date.slice(2, 4) + date.slice(5, 7);

export const bookingsRepo = {
  busyBetween: (db: D1Database, from: string, to: string, roomId: string, now: string) => all<{ date: string; start_min: number; end_min: number; kind: string }>(db,
    `SELECT b.date, b.start_min, b.end_min, 'booking' kind FROM bookings b WHERE b.date BETWEEN ?1 AND ?2 AND b.room_id = ?3 AND ${OCCUPIES.replace(/\?5/g, "?4")}
     UNION ALL SELECT date, start_min, end_min, 'hold' FROM holds WHERE date BETWEEN ?1 AND ?2 AND room_id = ?3 AND status = 'active' AND expires_at > ?4
     UNION ALL SELECT date, start_min, end_min, 'block' FROM blocked_periods WHERE date BETWEEN ?1 AND ?2 AND (room_id IS NULL OR room_id = ?3)`, from, to, roomId, now),

  /** Atomic: the insert only happens if nothing clashes. D1 runs each statement serially, so two clients cannot both win. Remote orders (no room) hold nothing and never clash. */
  createHoldIfFree: async (db: D1Database, h: { id: string; date: string; start: number; end: number; expiresAt: string; draft: string; userId: string | null; roomId: string }, buffer: number, now: string) => {
    const r = await run(db, `INSERT INTO holds (id, date, start_min, end_min, expires_at, status, draft, user_id, room_id)
      SELECT ?9, ?1, ?2, ?3, ?10, 'active', ?11, ?12, ?8 WHERE ${h.roomId ? CLASH : "1"}`,
      h.date, h.start, h.end, buffer, now, "", "", h.roomId || null, h.id, h.expiresAt, h.draft, h.userId);
    return r.meta.changes === 1;
  },
  isFree: async (db: D1Database, p: { date: string; start: number; end: number; roomId: string }, buffer: number, now: string, ignoreBooking = "", ignoreHold = "") =>
    !!(await first<{ ok: number }>(db, `SELECT 1 ok WHERE ${CLASH}`, p.date, p.start, p.end, buffer, now, ignoreBooking, ignoreHold, p.roomId)),

  /** Inserts a booking only if its room is still free. Returns false when the slot was taken. Remote orders have no room to clash with. */
  insertIfFree: async (db: D1Database, b: NewBooking, buffer: number, now: string) => {
    const r = await run(db, `INSERT INTO bookings (ref, ${COLS.join(", ")}) SELECT ${REF_SQL(`?${9 + COLS.length}`)}, ${params(9)} WHERE ${b.roomId ? CLASH : "1"}`,
      b.date, b.start, b.end, buffer, now, "", "", b.roomId || null, ...values(b), yymm(b.date));
    return r.meta.changes === 1;
  },
  /** Used when a paid hold becomes a booking: idempotent on hold_id, so the webhook and the verify page cannot both create one. */
  insertFromHold: (db: D1Database, b: NewBooking) =>
    stmt(db, `INSERT OR IGNORE INTO bookings (ref, ${COLS.join(", ")}) VALUES (${REF_SQL("?1")}, ${params(2)})`, yymm(b.date), ...values(b)),

  hold: (db: D1Database, id: string) => first<HoldRow>(db, "SELECT * FROM holds WHERE id = ?", id),
  attachHoldUser: (db: D1Database, id: string, userId: string) => run(db, "UPDATE holds SET user_id = ? WHERE id = ? AND (user_id IS NULL OR user_id = ?)", userId, id, userId),
  releaseHold: (db: D1Database, id: string) => run(db, "UPDATE holds SET status = 'released' WHERE id = ? AND status = 'active'", id),
  releaseExpired: (db: D1Database, now: string) => run(db, "UPDATE holds SET status = 'released' WHERE status = 'active' AND expires_at <= ?", now),

  byId: (db: D1Database, id: string) => first<BookingRow>(db, "SELECT * FROM bookings WHERE id = ?", id),
  byHold: (db: D1Database, holdId: string) => first<BookingRow>(db, "SELECT * FROM bookings WHERE hold_id = ?", holdId),
  forUser: (db: D1Database, userId: string) => all<BookingRow>(db, "SELECT * FROM bookings WHERE user_id = ? ORDER BY date DESC, start_min DESC", userId),
  forContact: (db: D1Database, email: string, userId: string | null) => all<BookingRow>(db,
    "SELECT * FROM bookings WHERE (contact_email != '' AND lower(contact_email) = lower(?)) OR (? IS NOT NULL AND user_id = ?) ORDER BY date DESC, start_min DESC LIMIT 100", email, userId, userId),
  list: (db: D1Database, f: { from?: string; to?: string; status?: string; q?: string; room?: string }) => all<BookingRow>(db,
    `SELECT * FROM bookings WHERE (?1 IS NULL OR date >= ?1) AND (?2 IS NULL OR date <= ?2)
     AND (?3 IS NULL OR status = ?3 OR (?3 = 'balance' AND status IN ('confirmed', 'completed') AND amount_paid_kobo - refunded_kobo < total_kobo))
     AND (?4 IS NULL OR ref LIKE ?4 OR contact_name LIKE ?4 OR contact_email LIKE ?4 OR artist_name LIKE ?4 OR contact_phone LIKE ?4)
     AND (?5 IS NULL OR room_id = ?5)
     ORDER BY CASE WHEN status = 'pending' THEN 0 ELSE 1 END, date DESC, start_min DESC LIMIT 300`,
    f.from ?? null, f.to ?? null, f.status ?? null, f.q ? `%${f.q}%` : null, f.room ?? null),
  holdsBetween: (db: D1Database, from: string, to: string, now: string) =>
    all<HoldRow>(db, "SELECT * FROM holds WHERE date BETWEEN ? AND ? AND status = 'active' AND expires_at > ?", from, to, now),
  expiring: (db: D1Database, now: string) => all<BookingRow>(db, "SELECT * FROM bookings WHERE status IN ('pending', 'approved') AND expires_at IS NOT NULL AND expires_at <= ?", now),
  dueReminders: (db: D1Database, from: string, to: string) =>
    all<BookingRow>(db, "SELECT * FROM bookings WHERE status = 'confirmed' AND scheduling != 'project' AND reminder_sent_at IS NULL AND date BETWEEN ? AND ?", from, to),

  setStatus: (db: D1Database, id: string, status: BookingStatus, extra: { cancelReason?: string; expiresAt?: string | null } = {}) =>
    run(db, `UPDATE bookings SET status = ?, cancel_reason = COALESCE(?, cancel_reason), expires_at = CASE WHEN ? THEN ? ELSE expires_at END, updated_at = ${NOW} WHERE id = ?`,
      status, extra.cancelReason ?? null, "expiresAt" in extra ? 1 : 0, extra.expiresAt ?? null, id),
  decide: (db: D1Database, id: string, d: { status: BookingStatus; by: string; note: string; expiresAt: string | null }) =>
    run(db, `UPDATE bookings SET status = ?, decided_by = ?, decided_at = ${NOW}, decision_note = ?, expires_at = ?, updated_at = ${NOW} WHERE id = ?`, d.status, d.by, d.note, d.expiresAt, id),
  /** Atomic like the inserts: the booking only moves if the new time clears every other booking, hold and block in its room. */
  move: async (db: D1Database, m: { id: string; roomId: string; date: string; start: number; end: number; slotLabel: string; dueDate: string | null }, buffer: number, now: string, countAsReschedule: boolean) => {
    const r = await run(db, `UPDATE bookings SET date = ?1, start_min = ?2, end_min = ?3, slot_label = ?9, due_date = ?10, reschedules_used = reschedules_used + ?11,
        rescheduled_at = ${NOW}, reminder_sent_at = NULL, updated_at = ${NOW} WHERE id = ?6 AND ${CLASH}`,
      m.date, m.start, m.end, buffer, now, m.id, "", m.roomId, m.slotLabel, m.dueDate, countAsReschedule ? 1 : 0);
    return r.meta.changes === 1;
  },
  updateDetails: (db: D1Database, id: string, d: { people: number; artist_name: string; contact_phone: string; notes: string; project: string; reference_links: string }) =>
    run(db, `UPDATE bookings SET people = ?, artist_name = ?, contact_phone = ?, notes = ?, project = ?, reference_links = ?, updated_at = ${NOW} WHERE id = ?`,
      d.people, d.artist_name, d.contact_phone, d.notes, d.project, d.reference_links, id),
  addPaid: (db: D1Database, id: string, amount: number) =>
    stmt(db, `UPDATE bookings SET amount_paid_kobo = amount_paid_kobo + ?, status = CASE WHEN status IN ('pending', 'approved') THEN 'confirmed' ELSE status END,
      expires_at = CASE WHEN status IN ('pending', 'approved') THEN NULL ELSE expires_at END, updated_at = ${NOW} WHERE id = ?`, amount, id),
  addRefunded: (db: D1Database, id: string, amount: number) => stmt(db, `UPDATE bookings SET refunded_kobo = refunded_kobo + ?, updated_at = ${NOW} WHERE id = ?`, amount, id),
  markReminded: (db: D1Database, id: string) => run(db, `UPDATE bookings SET reminder_sent_at = ${NOW} WHERE id = ?`, id),
  linkGuestBookings: (db: D1Database, userId: string, email: string) => run(db, "UPDATE bookings SET user_id = ? WHERE user_id IS NULL AND lower(contact_email) = lower(?)", userId, email),
  /** Sessions complete once their end has passed. An end above 1440 belongs to the next day, so a Saturday 11pm to 5am session finishes on Sunday at 5am. Remote orders finish when the final delivery is approved. */
  markCompleted: (db: D1Database, today: string, minute: number) => run(db,
    `UPDATE bookings SET status = 'completed', updated_at = ${NOW} WHERE status = 'confirmed' AND scheduling != 'project'
     AND CAST(julianday(date) - julianday(?1) AS INTEGER) * 1440 + end_min <= ?2`, today, minute),
  /** Confirmed remote orders still waiting for their final delivery. */
  openOrders: async (db: D1Database) => (await first<{ n: number }>(db, "SELECT COUNT(*) n FROM bookings WHERE scheduling = 'project' AND status = 'confirmed' AND delivered_final_at IS NULL"))?.n ?? 0,
  /** Published deliveries on a booking: once the studio has delivered work, a remote order is no longer refunded in full. */
  deliveredCount: async (db: D1Database, id: string) =>
    (await first<{ n: number }>(db, "SELECT COUNT(*) n FROM booking_files WHERE booking_id = ? AND direction = 'delivery' AND state = 'ready' AND delivered_at IS NOT NULL", id))?.n ?? 0,
};

export const paymentsRepo = {
  create: (db: D1Database, p: { id: string; reference: string; holdId: string | null; bookingId: string | null; userId: string | null; amount: number; provider: PaymentRow["provider"]; kind: PaymentRow["kind"] }) =>
    run(db, "INSERT INTO payments (id, reference, hold_id, booking_id, user_id, amount_kobo, provider, kind, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')",
      p.id, p.reference, p.holdId, p.bookingId, p.userId, p.amount, p.provider, p.kind),
  manual: (db: D1Database, p: { id: string; reference: string; bookingId: string; userId: string | null; amount: number; channel: string; note: string; by: string }) =>
    stmt(db, `INSERT INTO payments (id, reference, booking_id, user_id, amount_kobo, provider, kind, status, channel, verified_via, note, recorded_by, paid_at)
      VALUES (?, ?, ?, ?, ?, 'manual', 'manual', 'success', ?, 'staff', ?, ?, ${NOW})`, p.id, p.reference, p.bookingId, p.userId, p.amount, p.channel, p.note, p.by),
  byReference: (db: D1Database, ref: string) => first<PaymentRow>(db, "SELECT * FROM payments WHERE reference = ?", ref),
  lookup: (db: D1Database, ref: string) => first<PaymentRow & { booking_ref: string | null; client: string | null; checked_by_name: string | null }>(db,
    `SELECT p.*, b.ref booking_ref, COALESCE(u.name, b.contact_name) client, s.name checked_by_name FROM payments p LEFT JOIN bookings b ON b.id = p.booking_id
     LEFT JOIN users u ON u.id = p.user_id LEFT JOIN users s ON s.id = p.checked_by WHERE upper(p.reference) = upper(?)`, ref),
  markChecked: (db: D1Database, ref: string, by: string) =>
    run(db, `UPDATE payments SET checked_by = ?, checked_at = ${NOW} WHERE reference = ? AND checked_by IS NULL`, by, ref),
  forBooking: (db: D1Database, bookingId: string) => all<PaymentRow>(db, "SELECT * FROM payments WHERE booking_id = ? AND status IN ('success', 'refunded') ORDER BY paid_at", bookingId),
  forUser: (db: D1Database, userId: string) => all<PaymentRow & { booking_ref: string | null; package_name: string | null; booking_id: string | null }>(db,
    "SELECT p.*, b.ref booking_ref, b.package_name FROM payments p LEFT JOIN bookings b ON b.id = p.booking_id WHERE (p.user_id = ? OR b.user_id = ?) AND p.status != 'pending' ORDER BY p.created_at DESC", userId, userId),
  list: (db: D1Database) => all<PaymentRow & { booking_ref: string | null; client: string | null }>(db,
    `SELECT p.*, b.ref booking_ref, COALESCE(u.name, b.contact_name) client FROM payments p LEFT JOIN bookings b ON b.id = p.booking_id
     LEFT JOIN users u ON u.id = p.user_id ORDER BY p.created_at DESC LIMIT 300`),
  markFailed: (db: D1Database, ref: string) => run(db, "UPDATE payments SET status = 'failed' WHERE reference = ? AND status = 'pending'", ref),
  failPendingForExpiredHolds: (db: D1Database, now: string) =>
    run(db, "UPDATE payments SET status = 'failed' WHERE status = 'pending' AND hold_id IS NOT NULL AND hold_id IN (SELECT id FROM holds WHERE status = 'released' OR expires_at <= ?)", now),
  addRefunded: (db: D1Database, id: string, amount: number) =>
    stmt(db, "UPDATE payments SET refunded_kobo = refunded_kobo + ?, status = CASE WHEN refunded_kobo + ? >= amount_kobo THEN 'refunded' ELSE status END WHERE id = ?", amount, amount, id),
  addRefund: (db: D1Database, r: { id: string; paymentId: string; bookingId: string | null; amount: number; reason: string }) =>
    stmt(db, "INSERT INTO refunds (id, payment_id, booking_id, amount_kobo, reason) VALUES (?, ?, ?, ?, ?)", r.id, r.paymentId, r.bookingId, r.amount, r.reason),
  demoCreate: (db: D1Database, ref: string, amount: number) => run(db, "INSERT INTO demo_transactions (reference, amount_kobo, status) VALUES (?, ?, 'pending')", ref, amount),
  demoGet: (db: D1Database, ref: string) => first<{ reference: string; amount_kobo: number; status: string; channel: string | null }>(db, "SELECT * FROM demo_transactions WHERE reference = ?", ref),
  demoSet: (db: D1Database, ref: string, status: "success" | "failed", channel: string) => run(db, "UPDATE demo_transactions SET status = ?, channel = ? WHERE reference = ? AND status = 'pending'", status, channel, ref),
};

export const changeRequestsRepo = {
  create: (db: D1Database, r: Omit<ChangeRequestRow, "status" | "decided_by" | "decided_at" | "created_at">) =>
    run(db, "INSERT INTO change_requests (id, booking_id, user_id, kind, new_date, new_start_min, reason, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')", r.id, r.booking_id, r.user_id, r.kind, r.new_date, r.new_start_min, r.reason),
  pendingForBooking: (db: D1Database, bookingId: string) => first<ChangeRequestRow>(db, "SELECT * FROM change_requests WHERE booking_id = ? AND status = 'pending'", bookingId),
  byId: (db: D1Database, id: string) => first<ChangeRequestRow>(db, "SELECT * FROM change_requests WHERE id = ?", id),
  pending: (db: D1Database) => all<ChangeRequestRow & { ref: string; artist_name: string; date: string; start_min: number; end_min: number; package_name: string; total_kobo: number; room_name: string }>(db,
    "SELECT c.*, b.ref, b.artist_name, b.date, b.start_min, b.end_min, b.package_name, b.total_kobo, b.room_name FROM change_requests c JOIN bookings b ON b.id = c.booking_id WHERE c.status = 'pending' ORDER BY c.created_at"),
  forUser: (db: D1Database, userId: string) => all<ChangeRequestRow>(db, "SELECT * FROM change_requests WHERE user_id = ? ORDER BY created_at DESC", userId),
  decide: (db: D1Database, id: string, status: "approved" | "declined", by: string) =>
    run(db, "UPDATE change_requests SET status = ?, decided_by = ?, decided_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND status = 'pending'", status, by, id),
};
