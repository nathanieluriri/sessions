import { all, first, run } from "./db";

export const auditRepo = {
  add: (db: D1Database, a: { id: string; actorId: string | null; actorLabel: string; action: string; target?: string; detail?: string; ip?: string }) =>
    run(db, "INSERT INTO audit_logs (id, actor_id, actor_label, action, target, detail, ip) VALUES (?, ?, ?, ?, ?, ?, ?)", a.id, a.actorId, a.actorLabel, a.action, a.target ?? "", a.detail ?? "", a.ip ?? ""),
  list: (db: D1Database, limit = 300) => all<{ id: string; actor_label: string; action: string; target: string; detail: string; ip: string; created_at: string }>(db, "SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?", limit),
};

export const notificationsRepo = {
  add: (db: D1Database, n: { id: string; userId: string; title: string; body: string; bookingId?: string | null }) => run(db, "INSERT INTO notifications (id, user_id, title, body, booking_id) VALUES (?, ?, ?, ?, ?)", n.id, n.userId, n.title, n.body, n.bookingId ?? null),
  forUser: (db: D1Database, userId: string) => all<{ id: string; title: string; body: string; booking_id: string | null; read_at: string | null; created_at: string }>(db, "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30", userId),
  markRead: (db: D1Database, userId: string) => run(db, "UPDATE notifications SET read_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id = ? AND read_at IS NULL", userId),
};

export const outboxRepo = {
  add: (db: D1Database, e: { id: string; to: string; subject: string; body: string; status: "sent" | "logged" | "failed" }) =>
    run(db, "INSERT INTO email_outbox (id, to_email, subject, body, status) VALUES (?, ?, ?, ?, ?)", e.id, e.to, e.subject, e.body, e.status),
  list: (db: D1Database) => all<{ id: string; to_email: string; subject: string; body: string; status: string; created_at: string }>(db, "SELECT * FROM email_outbox ORDER BY created_at DESC LIMIT 150"),
  latestFor: (db: D1Database, to: string, subjectLike: string) => first<{ body: string }>(db, "SELECT body FROM email_outbox WHERE to_email = ? AND subject LIKE ? ORDER BY created_at DESC LIMIT 1", to, subjectLike),
};

export interface EnquiryRow { id: string; name: string; email: string; phone: string; topic: string; message: string; status: string; kind: string; service: string; budget: string; timeline: string; links: string; created_at: string }

export const enquiriesRepo = {
  add: (db: D1Database, e: Omit<EnquiryRow, "status" | "created_at">) =>
    run(db, "INSERT INTO enquiries (id, name, email, phone, topic, message, kind, service, budget, timeline, links) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      e.id, e.name, e.email, e.phone, e.topic, e.message, e.kind, e.service, e.budget, e.timeline, e.links),
  list: (db: D1Database) => all<EnquiryRow>(db, "SELECT * FROM enquiries ORDER BY created_at DESC LIMIT 200"),
  byId: (db: D1Database, id: string) => first<EnquiryRow>(db, "SELECT * FROM enquiries WHERE id = ?", id),
  setStatus: (db: D1Database, id: string, status: string) => run(db, "UPDATE enquiries SET status = ? WHERE id = ?", status, id),
  recentFromEmail: (db: D1Database, email: string, since: string) => first<{ n: number }>(db, "SELECT COUNT(*) n FROM enquiries WHERE email = ? AND created_at > ?", email, since),
};

const LIVE = "status IN ('confirmed', 'completed', 'no_show')";
const BALANCE = "MAX(total_kobo - amount_paid_kobo + refunded_kobo, 0)";

export const reportsRepo = {
  totals: (db: D1Database, from: string, to: string) => first<{ bookings: number; cancelled: number; revenue: number; minutes: number; paid: number; outstanding: number; deposits: number }>(db,
    `SELECT SUM(${LIVE}) bookings, SUM(status IN ('cancelled', 'rejected')) cancelled,
       COALESCE(SUM(CASE WHEN ${LIVE} THEN total_kobo END), 0) revenue,
       COALESCE(SUM(CASE WHEN ${LIVE} THEN end_min - start_min END), 0) minutes,
       COALESCE(SUM(CASE WHEN ${LIVE} THEN amount_paid_kobo - refunded_kobo END), 0) paid,
       COALESCE(SUM(CASE WHEN status IN ('confirmed', 'completed') THEN ${BALANCE} END), 0) outstanding,
       COALESCE(SUM(status IN ('confirmed', 'completed') AND amount_paid_kobo > 0 AND amount_paid_kobo - refunded_kobo < total_kobo), 0) deposits
     FROM bookings WHERE date BETWEEN ? AND ?`, from, to),
  received: (db: D1Database, from: string, to: string) => first<{ n: number; total: number }>(db,
    "SELECT COUNT(*) n, COALESCE(SUM(amount_kobo), 0) total FROM payments WHERE status IN ('success', 'refunded') AND substr(paid_at, 1, 10) BETWEEN ? AND ?", from, to),
  refunds: (db: D1Database, from: string, to: string) => first<{ n: number; total: number }>(db,
    "SELECT COUNT(*) n, COALESCE(SUM(amount_kobo), 0) total FROM refunds WHERE substr(created_at, 1, 10) BETWEEN ? AND ?", from, to),
  popular: (db: D1Database, from: string, to: string) => all<{ package_name: string; n: number; revenue: number }>(db,
    `SELECT package_name, COUNT(*) n, SUM(total_kobo) revenue FROM bookings WHERE date BETWEEN ? AND ? AND ${LIVE} GROUP BY package_name ORDER BY n DESC LIMIT 10`, from, to),
  byCategory: (db: D1Database, from: string, to: string) => all<{ category: string; n: number; revenue: number }>(db,
    `SELECT category, COUNT(*) n, SUM(total_kobo) revenue FROM bookings WHERE date BETWEEN ? AND ? AND ${LIVE} GROUP BY category ORDER BY revenue DESC`, from, to),
  byRoom: (db: D1Database, from: string, to: string) => all<{ room_name: string; n: number; minutes: number; revenue: number }>(db,
    `SELECT room_name, COUNT(*) n, SUM(end_min - start_min) minutes, SUM(total_kobo) revenue FROM bookings WHERE date BETWEEN ? AND ? AND ${LIVE} GROUP BY room_name ORDER BY revenue DESC`, from, to),
  byWeek: (db: D1Database, from: string, to: string) => all<{ week: string; n: number; revenue: number }>(db,
    `SELECT strftime('%Y-W%W', date) week, COUNT(*) n, SUM(total_kobo) revenue FROM bookings WHERE date BETWEEN ? AND ? AND ${LIVE} GROUP BY week ORDER BY week`, from, to),
  repeat: (db: D1Database) => first<{ clients: number; repeaters: number }>(db,
    `SELECT COUNT(*) clients, SUM(n > 1) repeaters FROM (SELECT lower(contact_email) e, COUNT(*) n FROM bookings WHERE ${LIVE} AND contact_email != '' GROUP BY e)`),
  openMinutes: (db: D1Database) => all<{ weekday: number; is_open: number; open_min: number; close_min: number }>(db, "SELECT * FROM opening_hours"),
  outstanding: (db: D1Database) => all<{ id: string; ref: string; date: string; start_min: number; contact_name: string; package_name: string; total_kobo: number; paid: number; balance: number; status: string }>(db,
    `SELECT id, ref, date, start_min, contact_name, package_name, total_kobo, amount_paid_kobo - refunded_kobo paid, ${BALANCE} balance, status
     FROM bookings WHERE status IN ('confirmed', 'completed') AND amount_paid_kobo - refunded_kobo < total_kobo ORDER BY date LIMIT 200`),
};

export const clientsRepo = {
  summary: (db: D1Database, q: string | null) => all<{ key: string; email: string; name: string; phone: string; user_id: string | null; bookings: number; value: number; paid: number; balance: number; last_date: string }>(db,
    `SELECT CASE WHEN contact_email != '' THEN lower(contact_email) ELSE contact_phone END key, lower(contact_email) email, MAX(contact_name) name, MAX(contact_phone) phone,
       MAX(user_id) user_id, COUNT(*) bookings, COALESCE(SUM(CASE WHEN ${LIVE} THEN total_kobo END), 0) value, COALESCE(SUM(amount_paid_kobo - refunded_kobo), 0) paid,
       COALESCE(SUM(CASE WHEN status IN ('confirmed', 'completed') THEN ${BALANCE} END), 0) balance, MAX(date) last_date
     FROM bookings WHERE ?1 IS NULL OR contact_name LIKE ?1 OR contact_email LIKE ?1 OR contact_phone LIKE ?1 OR artist_name LIKE ?1
     GROUP BY key ORDER BY last_date DESC LIMIT 300`, q ? `%${q}%` : null),
  accounts: (db: D1Database, q: string | null) => all<{ id: string; email: string; name: string; phone: string; created_at: string; email_verified_at: string | null }>(db,
    "SELECT id, email, name, phone, created_at, email_verified_at FROM users WHERE role = 'client' AND (?1 IS NULL OR name LIKE ?1 OR email LIKE ?1 OR phone LIKE ?1) ORDER BY created_at DESC LIMIT 300", q ? `%${q}%` : null),
};
