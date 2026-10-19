import { all, first, run } from "./db";
import type { Role } from "../env";

export interface UserRow {
  id: string; email: string; name: string; phone: string; password_hash: string; role: Role; level: string; title: string;
  permissions: string; email_verified_at: string | null; active: number; created_at: string;
}

export const usersRepo = {
  byEmail: (db: D1Database, email: string) => first<UserRow>(db, "SELECT * FROM users WHERE email = ?", email.toLowerCase()),
  byId: (db: D1Database, id: string) => first<UserRow>(db, "SELECT * FROM users WHERE id = ?", id),
  create: (db: D1Database, u: { id: string; email: string; name: string; phone: string; passwordHash: string; role: Role; level?: string; title?: string; permissions?: string[] }) =>
    run(db, "INSERT INTO users (id, email, name, phone, password_hash, role, level, title, permissions) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      u.id, u.email.toLowerCase(), u.name, u.phone, u.passwordHash, u.role, u.level ?? "", u.title ?? "", JSON.stringify(u.permissions ?? [])),
  updateProfile: (db: D1Database, id: string, p: { name: string; phone: string }) => run(db, "UPDATE users SET name = ?, phone = ? WHERE id = ?", p.name, p.phone, id),
  setPassword: (db: D1Database, id: string, hash: string) => run(db, "UPDATE users SET password_hash = ? WHERE id = ?", hash, id),
  markVerified: (db: D1Database, id: string) => run(db, "UPDATE users SET email_verified_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND email_verified_at IS NULL", id),
  staff: (db: D1Database) => all<UserRow>(db, "SELECT * FROM users WHERE role IN ('ceo','admin') ORDER BY role DESC, created_at"),
  setStaff: (db: D1Database, id: string, p: { level: string; permissions: string[]; active: boolean; title: string }) =>
    run(db, "UPDATE users SET level = ?, permissions = ?, active = ?, title = ? WHERE id = ? AND role = 'admin'", p.level, JSON.stringify(p.permissions), p.active ? 1 : 0, p.title, id),
  clientCount: (db: D1Database) => first<{ n: number }>(db, "SELECT COUNT(*) n FROM users WHERE role = 'client'"),
};

export const sessionsRepo = {
  create: (db: D1Database, id: string, userId: string, expiresAt: string) => run(db, "INSERT INTO auth_sessions (id, user_id, expires_at) VALUES (?, ?, ?)", id, userId, expiresAt),
  user: (db: D1Database, id: string, now: string) =>
    first<UserRow>(db, "SELECT u.* FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ? AND u.active = 1", id, now),
  remove: (db: D1Database, id: string) => run(db, "DELETE FROM auth_sessions WHERE id = ?", id),
  removeOthers: (db: D1Database, userId: string, keep: string) => run(db, "DELETE FROM auth_sessions WHERE user_id = ? AND id != ?", userId, keep),
};

export const tokensRepo = {
  create: (db: D1Database, id: string, userId: string, kind: "verify" | "reset", expiresAt: string) =>
    run(db, "INSERT INTO auth_tokens (id, user_id, kind, expires_at) VALUES (?, ?, ?, ?)", id, userId, kind, expiresAt),
  consume: (db: D1Database, id: string, kind: "verify" | "reset", now: string) =>
    first<{ user_id: string }>(db, "UPDATE auth_tokens SET used_at = ? WHERE id = ? AND kind = ? AND used_at IS NULL AND expires_at > ? RETURNING user_id", now, id, kind, now),
};

export const loginAttemptsRepo = {
  add: (db: D1Database, email: string, at: string) => run(db, "INSERT INTO login_attempts (email, at) VALUES (?, ?)", email, at),
  countSince: (db: D1Database, email: string, since: string) => first<{ n: number }>(db, "SELECT COUNT(*) n FROM login_attempts WHERE email = ? AND at > ?", email, since),
  clear: (db: D1Database, email: string) => run(db, "DELETE FROM login_attempts WHERE email = ?", email),
};
