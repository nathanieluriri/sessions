import { all, first, run } from "./db";

export const auditRepo = {
  add: (db: D1Database, a: { id: string; actorId: string | null; actorLabel: string; action: string; target?: string; detail?: string; ip?: string }) =>
    run(db, "INSERT INTO audit_logs (id, actor_id, actor_label, action, target, detail, ip) VALUES (?, ?, ?, ?, ?, ?, ?)", a.id, a.actorId, a.actorLabel, a.action, a.target ?? "", a.detail ?? "", a.ip ?? ""),
  list: (db: D1Database, limit = 200) => all<{ id: string; actor_label: string; action: string; target: string; detail: string; ip: string; created_at: string }>(db, "SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?", limit),
};

export const notificationsRepo = {
  add: (db: D1Database, n: { id: string; userId: string; title: string; body: string }) => run(db, "INSERT INTO notifications (id, user_id, title, body) VALUES (?, ?, ?, ?)", n.id, n.userId, n.title, n.body),
  forUser: (db: D1Database, userId: string) => all<{ id: string; title: string; body: string; read_at: string | null; created_at: string }>(db, "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30", userId),
  markRead: (db: D1Database, userId: string) => run(db, "UPDATE notifications SET read_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id = ? AND read_at IS NULL", userId),
};

export const outboxRepo = {
  add: (db: D1Database, e: { id: string; to: string; subject: string; body: string; status: "sent" | "logged" | "failed" }) =>
    run(db, "INSERT INTO email_outbox (id, to_email, subject, body, status) VALUES (?, ?, ?, ?, ?)", e.id, e.to, e.subject, e.body, e.status),
  list: (db: D1Database) => all<{ id: string; to_email: string; subject: string; body: string; status: string; created_at: string }>(db, "SELECT * FROM email_outbox ORDER BY created_at DESC LIMIT 100"),
  latestFor: (db: D1Database, to: string, subjectLike: string) => first<{ body: string }>(db, "SELECT body FROM email_outbox WHERE to_email = ? AND subject LIKE ? ORDER BY created_at DESC LIMIT 1", to, subjectLike),
};

export const enquiriesRepo = {
  add: (db: D1Database, e: { id: string; name: string; email: string; phone: string; topic: string; message: string }) =>
    run(db, "INSERT INTO enquiries (id, name, email, phone, topic, message) VALUES (?, ?, ?, ?, ?, ?)", e.id, e.name, e.email, e.phone, e.topic, e.message),
  list: (db: D1Database) => all<{ id: string; name: string; email: string; phone: string; topic: string; message: string; status: string; created_at: string }>(db, "SELECT * FROM enquiries ORDER BY created_at DESC LIMIT 100"),
  setStatus: (db: D1Database, id: string, status: string) => run(db, "UPDATE enquiries SET status = ? WHERE id = ?", status, id),
  recentFromEmail: (db: D1Database, email: string, since: string) => first<{ n: number }>(db, "SELECT COUNT(*) n FROM enquiries WHERE email = ? AND created_at > ?", email, since),
};

export const reportsRepo = {
  totals: (db: D1Database, from: string, to: string) => first<{ bookings: number; cancelled: number; revenue: number; minutes: number }>(db,
    `SELECT COUNT(*) bookings, SUM(status = 'cancelled') cancelled,
       COALESCE(SUM(CASE WHEN status != 'cancelled' THEN total_kobo END), 0) revenue,
       COALESCE(SUM(CASE WHEN status != 'cancelled' THEN end_min - start_min END), 0) minutes
     FROM bookings WHERE date BETWEEN ? AND ?`, from, to),
  received: (db: D1Database, from: string, to: string) => first<{ n: number }>(db,
    "SELECT COALESCE(SUM(amount_kobo), 0) n FROM payments WHERE status IN ('success','refunded') AND substr(paid_at, 1, 10) BETWEEN ? AND ?", from, to),
  refunds: (db: D1Database, from: string, to: string) => first<{ n: number; total: number }>(db,
    "SELECT COUNT(*) n, COALESCE(SUM(amount_kobo), 0) total FROM refunds WHERE substr(created_at, 1, 10) BETWEEN ? AND ?", from, to),
  popular: (db: D1Database, from: string, to: string) => all<{ package_name: string; n: number; revenue: number }>(db,
    "SELECT package_name, COUNT(*) n, SUM(total_kobo) revenue FROM bookings WHERE date BETWEEN ? AND ? AND status != 'cancelled' GROUP BY package_name ORDER BY n DESC", from, to),
  byWeek: (db: D1Database, from: string, to: string) => all<{ week: string; n: number; revenue: number }>(db,
    "SELECT strftime('%Y-W%W', date) week, COUNT(*) n, SUM(total_kobo) revenue FROM bookings WHERE date BETWEEN ? AND ? AND status != 'cancelled' GROUP BY week ORDER BY week", from, to),
  repeat: (db: D1Database) => first<{ clients: number; repeaters: number }>(db,
    "SELECT COUNT(*) clients, SUM(n > 1) repeaters FROM (SELECT user_id, COUNT(*) n FROM bookings WHERE status != 'cancelled' GROUP BY user_id)"),
  openMinutes: (db: D1Database) => all<{ weekday: number; is_open: number; open_min: number; close_min: number }>(db, "SELECT * FROM opening_hours"),
};
