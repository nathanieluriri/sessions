import { all, first, run, stmt } from "./db";

export interface HoursRow { weekday: number; is_open: number; open_min: number; close_min: number }
export interface BlockRow { id: string; date: string; start_min: number; end_min: number; reason: string; created_by: string | null; room_id: string | null; created_at: string }
export interface PolicyRow { slug: string; title: string; body: string; kind: "booking" | "legal"; sort: number; updated_at: string }

export const settingsRepo = {
  all: async (db: D1Database) => Object.fromEntries((await all<{ key: string; value: string }>(db, "SELECT key, value FROM settings")).map((r) => [r.key, r.value])),
  set: (db: D1Database, key: string, value: string) => run(db, "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, value),
  hours: (db: D1Database) => all<HoursRow>(db, "SELECT * FROM opening_hours ORDER BY weekday"),
  hoursFor: (db: D1Database, weekday: number) => first<HoursRow>(db, "SELECT * FROM opening_hours WHERE weekday = ?", weekday),
  saveHours: (db: D1Database, rows: HoursRow[]) =>
    db.batch(rows.map((r) => stmt(db, "UPDATE opening_hours SET is_open = ?, open_min = ?, close_min = ? WHERE weekday = ?", r.is_open, r.open_min, r.close_min, r.weekday))),
  blocks: (db: D1Database, from: string) => all<BlockRow & { room_name: string | null }>(db,
    "SELECT x.*, r.name room_name FROM blocked_periods x LEFT JOIN rooms r ON r.id = x.room_id WHERE x.date >= ? ORDER BY x.date, x.start_min", from),
  addBlock: (db: D1Database, b: Omit<BlockRow, "created_at">) =>
    run(db, "INSERT INTO blocked_periods (id, date, start_min, end_min, reason, created_by, room_id) VALUES (?, ?, ?, ?, ?, ?, ?)", b.id, b.date, b.start_min, b.end_min, b.reason, b.created_by, b.room_id),
  removeBlock: (db: D1Database, id: string) => run(db, "DELETE FROM blocked_periods WHERE id = ?", id),
};

export const contentRepo = {
  policies: (db: D1Database) => all<PolicyRow>(db, "SELECT slug, title, body, kind, sort, updated_at FROM policies ORDER BY sort"),
  policy: (db: D1Database, slug: string) => first<PolicyRow>(db, "SELECT slug, title, body, kind, sort, updated_at FROM policies WHERE slug = ?", slug),
  savePolicy: (db: D1Database, slug: string, title: string, body: string, by: string) =>
    run(db, "UPDATE policies SET title = ?, body = ?, updated_by = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE slug = ?", title, body, by, slug),
  content: async (db: D1Database) => Object.fromEntries((await all<{ key: string; value: string }>(db, "SELECT key, value FROM content")).map((r) => [r.key, r.value])) as Record<string, string>,
  setContent: (db: D1Database, key: string, value: string) => stmt(db, "INSERT INTO content (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, value),
  pageMeta: (db: D1Database) => all<{ path: string; title: string; description: string; image_url: string }>(db, "SELECT * FROM page_meta"),
};
