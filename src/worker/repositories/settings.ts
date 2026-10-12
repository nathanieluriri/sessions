import { all, first, run, stmt } from "./db";

export interface HoursRow { weekday: number; is_open: number; open_min: number; close_min: number }
export interface BlockRow { id: string; date: string; start_min: number; end_min: number; reason: string; created_by: string | null; created_at: string }

export const settingsRepo = {
  all: async (db: D1Database) => Object.fromEntries((await all<{ key: string; value: string }>(db, "SELECT key, value FROM settings")).map((r) => [r.key, r.value])),
  set: (db: D1Database, key: string, value: string) => run(db, "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, value),
  hours: (db: D1Database) => all<HoursRow>(db, "SELECT * FROM opening_hours ORDER BY weekday"),
  hoursFor: (db: D1Database, weekday: number) => first<HoursRow>(db, "SELECT * FROM opening_hours WHERE weekday = ?", weekday),
  saveHours: (db: D1Database, rows: HoursRow[]) =>
    db.batch(rows.map((r) => stmt(db, "UPDATE opening_hours SET is_open = ?, open_min = ?, close_min = ? WHERE weekday = ?", r.is_open, r.open_min, r.close_min, r.weekday))),
  blocks: (db: D1Database, from: string) => all<BlockRow>(db, "SELECT * FROM blocked_periods WHERE date >= ? ORDER BY date, start_min", from),
  blocksOn: (db: D1Database, date: string) => all<BlockRow>(db, "SELECT * FROM blocked_periods WHERE date = ?", date),
  addBlock: (db: D1Database, b: Omit<BlockRow, "created_at">) =>
    run(db, "INSERT INTO blocked_periods (id, date, start_min, end_min, reason, created_by) VALUES (?, ?, ?, ?, ?, ?)", b.id, b.date, b.start_min, b.end_min, b.reason, b.created_by),
  removeBlock: (db: D1Database, id: string) => run(db, "DELETE FROM blocked_periods WHERE id = ?", id),
};

export const contentRepo = {
  policies: (db: D1Database) => all<{ slug: string; title: string; body: string; updated_at: string }>(db, "SELECT * FROM policies ORDER BY sort"),
  savePolicy: (db: D1Database, slug: string, title: string, body: string, by: string) =>
    run(db, "UPDATE policies SET title = ?, body = ?, updated_by = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE slug = ?", title, body, by, slug),
  content: async (db: D1Database) => Object.fromEntries((await all<{ key: string; value: string }>(db, "SELECT key, value FROM content")).map((r) => [r.key, r.value])),
  setContent: (db: D1Database, key: string, value: string) => run(db, "INSERT INTO content (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, value),
};
