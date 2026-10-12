import { all, first, run, stmt } from "./db";

export interface HoldRow { id: string; date: string; start_min: number; end_min: number; expires_at: string; status: string; draft: string; user_id: string | null; created_at: string }
export interface BookingRow {
  id: string; ref: string; user_id: string; hold_id: string | null; service_name: string; package_id: string; package_name: string;
  package_price_kobo: number; extras: string; total_kobo: number; date: string; start_min: number; end_min: number; people: number;
  artist_name: string; contact_name: string; contact_email: string; contact_phone: string; notes: string;
  status: "confirmed" | "completed" | "cancelled" | "no_show"; policy_version: number; reschedules_used: number; created_at: string; updated_at: string;
}
export interface PaymentRow {
  id: string; reference: string; hold_id: string; booking_id: string | null; user_id: string; amount_kobo: number; provider: "paystack" | "demo";
  status: "pending" | "success" | "failed" | "refunded"; channel: string | null; verified_via: string | null; paid_at: string | null; created_at: string;
}
export interface ChangeRequestRow { id: string; booking_id: string; user_id: string; kind: "reschedule" | "cancel"; new_date: string | null; new_start_min: number | null; reason: string; status: string; decided_by: string | null; decided_at: string | null; created_at: string }

// Overlap with a buffer on both sides: [start - buffer, end + buffer) must not intersect.
const CLASH = `
  NOT EXISTS (SELECT 1 FROM bookings b WHERE b.date = ?1 AND b.status = 'confirmed' AND b.id != ?6 AND b.start_min < ?3 + ?4 AND b.end_min + ?4 > ?2)
  AND NOT EXISTS (SELECT 1 FROM holds h WHERE h.date = ?1 AND h.status = 'active' AND h.expires_at > ?5 AND h.id != ?7 AND h.start_min < ?3 + ?4 AND h.end_min + ?4 > ?2)
  AND NOT EXISTS (SELECT 1 FROM blocked_periods x WHERE x.date = ?1 AND x.start_min < ?3 AND x.end_min > ?2)`;

export const bookingsRepo = {
  busyOn: (db: D1Database, date: string, now: string) => all<{ start_min: number; end_min: number; kind: string }>(db,
    `SELECT start_min, end_min, 'booking' kind FROM bookings WHERE date = ? AND status = 'confirmed'
     UNION ALL SELECT start_min, end_min, 'hold' FROM holds WHERE date = ? AND status = 'active' AND expires_at > ?
     UNION ALL SELECT start_min, end_min, 'block' FROM blocked_periods WHERE date = ?`, date, date, now, date),

  /** Atomic: the insert only happens if nothing clashes. D1 runs each statement serially, so two clients cannot both win. */
  createHoldIfFree: async (db: D1Database, h: { id: string; date: string; start: number; end: number; expiresAt: string; draft: string; userId: string | null }, buffer: number, now: string) => {
    const r = await run(db, `INSERT INTO holds (id, date, start_min, end_min, expires_at, status, draft, user_id)
      SELECT ?8, ?1, ?2, ?3, ?9, 'active', ?10, ?11 WHERE ${CLASH}`,
      h.date, h.start, h.end, buffer, now, "", "", h.id, h.expiresAt, h.draft, h.userId);
    return r.meta.changes === 1;
  },
  isFree: async (db: D1Database, date: string, start: number, end: number, buffer: number, now: string, ignoreBooking = "", ignoreHold = "") =>
    !!(await first<{ ok: number }>(db, `SELECT 1 ok WHERE ${CLASH}`, date, start, end, buffer, now, ignoreBooking, ignoreHold)),

  hold: (db: D1Database, id: string) => first<HoldRow>(db, "SELECT * FROM holds WHERE id = ?", id),
  attachHoldUser: (db: D1Database, id: string, userId: string) => run(db, "UPDATE holds SET user_id = ? WHERE id = ? AND (user_id IS NULL OR user_id = ?)", userId, id, userId),
  releaseHold: (db: D1Database, id: string) => run(db, "UPDATE holds SET status = 'released' WHERE id = ? AND status = 'active'", id),
  releaseExpired: (db: D1Database, now: string) => run(db, "UPDATE holds SET status = 'released' WHERE status = 'active' AND expires_at <= ?", now),

  byId: (db: D1Database, id: string) => first<BookingRow>(db, "SELECT * FROM bookings WHERE id = ?", id),
  byRef: (db: D1Database, ref: string) => first<BookingRow>(db, "SELECT * FROM bookings WHERE ref = ?", ref),
  byHold: (db: D1Database, holdId: string) => first<BookingRow>(db, "SELECT * FROM bookings WHERE hold_id = ?", holdId),
  forUser: (db: D1Database, userId: string) => all<BookingRow>(db, "SELECT * FROM bookings WHERE user_id = ? ORDER BY date DESC, start_min DESC", userId),
  list: (db: D1Database, f: { from?: string; to?: string; status?: string; q?: string }) => all<BookingRow>(db,
    `SELECT * FROM bookings WHERE (?1 IS NULL OR date >= ?1) AND (?2 IS NULL OR date <= ?2) AND (?3 IS NULL OR status = ?3)
     AND (?4 IS NULL OR ref LIKE ?4 OR contact_name LIKE ?4 OR contact_email LIKE ?4 OR artist_name LIKE ?4)
     ORDER BY date DESC, start_min DESC LIMIT 200`, f.from ?? null, f.to ?? null, f.status ?? null, f.q ? `%${f.q}%` : null),
  holdsBetween: (db: D1Database, from: string, to: string, now: string) =>
    all<HoldRow>(db, "SELECT * FROM holds WHERE date BETWEEN ? AND ? AND status = 'active' AND expires_at > ?", from, to, now),
  countOnDay: (db: D1Database, date: string) => first<{ n: number }>(db, "SELECT COUNT(*) n FROM bookings WHERE ref LIKE ?", `SS-${date.slice(2, 4)}${date.slice(5, 7)}-%`),
  setStatus: (db: D1Database, id: string, status: BookingRow["status"]) => run(db, "UPDATE bookings SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?", status, id),
  move: (db: D1Database, id: string, date: string, start: number, end: number, countAsReschedule: boolean) =>
    run(db, "UPDATE bookings SET date = ?, start_min = ?, end_min = ?, reschedules_used = reschedules_used + ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?", date, start, end, countAsReschedule ? 1 : 0, id),
  updateDetails: (db: D1Database, id: string, d: { people: number; artist_name: string; contact_phone: string; notes: string }) =>
    run(db, "UPDATE bookings SET people = ?, artist_name = ?, contact_phone = ?, notes = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?", d.people, d.artist_name, d.contact_phone, d.notes, id),
  markCompleted: (db: D1Database, today: string) => run(db, "UPDATE bookings SET status = 'completed' WHERE status = 'confirmed' AND date < ?", today),
};

export const paymentsRepo = {
  create: (db: D1Database, p: { id: string; reference: string; holdId: string; userId: string; amount: number; provider: "paystack" | "demo" }) =>
    run(db, "INSERT INTO payments (id, reference, hold_id, user_id, amount_kobo, provider, status) VALUES (?, ?, ?, ?, ?, ?, 'pending')", p.id, p.reference, p.holdId, p.userId, p.amount, p.provider),
  byReference: (db: D1Database, ref: string) => first<PaymentRow>(db, "SELECT * FROM payments WHERE reference = ?", ref),
  forBooking: (db: D1Database, bookingId: string) => first<PaymentRow>(db, "SELECT * FROM payments WHERE booking_id = ? AND status IN ('success','refunded')", bookingId),
  forUser: (db: D1Database, userId: string) => all<PaymentRow & { booking_ref: string | null; package_name: string | null }>(db,
    "SELECT p.*, b.ref booking_ref, b.package_name FROM payments p LEFT JOIN bookings b ON b.id = p.booking_id WHERE p.user_id = ? AND p.status != 'pending' ORDER BY p.created_at DESC", userId),
  list: (db: D1Database) => all<PaymentRow & { booking_ref: string | null; client: string }>(db,
    "SELECT p.*, b.ref booking_ref, u.name client FROM payments p LEFT JOIN bookings b ON b.id = p.booking_id JOIN users u ON u.id = p.user_id ORDER BY p.created_at DESC LIMIT 200"),
  /** Moves pending to success exactly once; returns false if another request already processed it. */
  markSuccess: async (db: D1Database, ref: string, via: string, channel: string | null, at: string) =>
    (await run(db, "UPDATE payments SET status = 'success', verified_via = ?, channel = ?, paid_at = ? WHERE reference = ? AND status IN ('pending', 'failed')", via, channel, at, ref)).meta.changes === 1,
  markFailed: (db: D1Database, ref: string) => run(db, "UPDATE payments SET status = 'failed' WHERE reference = ? AND status = 'pending'", ref),
  failPendingForExpiredHolds: (db: D1Database, now: string) =>
    run(db, "UPDATE payments SET status = 'failed' WHERE status = 'pending' AND hold_id IN (SELECT id FROM holds WHERE status = 'released' OR expires_at <= ?)", now),
  linkBooking: (db: D1Database, ref: string, bookingId: string) => stmt(db, "UPDATE payments SET booking_id = ? WHERE reference = ?", bookingId, ref),
  markRefunded: (db: D1Database, id: string) => stmt(db, "UPDATE payments SET status = 'refunded' WHERE id = ?", id),
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
  pending: (db: D1Database) => all<ChangeRequestRow & { ref: string; artist_name: string; date: string; start_min: number; end_min: number; package_name: string; total_kobo: number }>(db,
    "SELECT c.*, b.ref, b.artist_name, b.date, b.start_min, b.end_min, b.package_name, b.total_kobo FROM change_requests c JOIN bookings b ON b.id = c.booking_id WHERE c.status = 'pending' ORDER BY c.created_at"),
  forUser: (db: D1Database, userId: string) => all<ChangeRequestRow>(db, "SELECT * FROM change_requests WHERE user_id = ? ORDER BY created_at DESC", userId),
  decide: (db: D1Database, id: string, status: "approved" | "declined", by: string) =>
    run(db, "UPDATE change_requests SET status = ?, decided_by = ?, decided_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND status = 'pending'", status, by, id),
};
