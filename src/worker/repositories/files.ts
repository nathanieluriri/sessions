import { all, first, run, stmt } from "./db";
import type { BookingRow } from "./bookings";

export type FileDirection = "delivery" | "upload";
export type FileState = "uploading" | "ready" | "removed";
export type QueueTab = "todo" | "revisions" | "client" | "delivered";

export interface FileRow {
  id: string; booking_id: string; direction: FileDirection; title: string; name: string; r2_key: string; content_type: string; size: number; declared_size: number;
  version: number; note: string; upload_id: string | null; parts: string; state: FileState; released: number; delivered_at: string | null;
  download_count: number; first_downloaded_at: string | null; uploaded_by: string | null; created_at: string; completed_at: string | null;
}
export interface RevisionRow { id: string; booking_id: string; user_id: string; note: string; status: "open" | "done"; created_at: string; resolved_at: string | null; resolved_by: string | null }
export interface PartRow { partNumber: number; etag: string; size: number }
export type QueueRow = BookingRow & {
  delivered: number; staged: number; uploads: number; uploads_new: number; last_delivered_at: string | null;
  rev_id: string | null; rev_note: string | null; rev_created_at: string | null;
};

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const PUBLISHED = "f.direction = 'delivery' AND f.state = 'ready' AND f.delivered_at IS NOT NULL";
const UNSEEN = "f.direction = 'upload' AND f.state = 'ready' AND f.first_downloaded_at IS NULL";
const has = (where: string) => `EXISTS (SELECT 1 FROM booking_files f WHERE f.booking_id = b.id AND ${where})`;
const count = (where: string) => `(SELECT COUNT(*) FROM booking_files f WHERE f.booking_id = b.id AND ${where})`;

/** Who the production queue shows under each tab. Counts and rows use the same conditions so the badges always match the lists. */
const TABS: Record<QueueTab, string> = {
  todo: `b.status IN ('confirmed', 'completed') AND b.delivered_final_at IS NULL AND NOT ${has(PUBLISHED)} AND (b.scheduling = 'project' OR b.due_date IS NOT NULL)`,
  revisions: "r.id IS NOT NULL",
  client: `b.status NOT IN ('cancelled', 'rejected') AND ${has(UNSEEN)}`,
  delivered: has(PUBLISHED),
};
const AGE: Record<QueueTab, string> = {
  todo: "b.created_at", revisions: "r.created_at", client: `(SELECT MIN(f.completed_at) FROM booking_files f WHERE f.booking_id = b.id AND ${UNSEEN})`, delivered: "b.created_at",
};
const QUEUE_FROM = "FROM bookings b LEFT JOIN revision_requests r ON r.booking_id = b.id AND r.status = 'open'";
const NEWEST = "COALESCE(f.delivered_at, f.completed_at, f.created_at) DESC, f.title, f.name";

export const filesRepo = {
  byId: (db: D1Database, id: string) => first<FileRow>(db, "SELECT * FROM booking_files WHERE id = ?", id),
  byIds: (db: D1Database, bookingId: string, ids: string[]) =>
    all<FileRow>(db, `SELECT * FROM booking_files WHERE booking_id = ?1 AND id IN (${ids.map((_, i) => `?${i + 2}`).join(", ")})`, bookingId, ...ids),

  /** What a client may see: their own finished uploads and the deliveries staff have published. */
  visibleForUser: (db: D1Database, userId: string) => all<FileRow>(db,
    `SELECT f.* FROM booking_files f JOIN bookings b ON b.id = f.booking_id
     WHERE b.user_id = ? AND f.state = 'ready' AND (f.direction = 'upload' OR f.delivered_at IS NOT NULL) ORDER BY ${NEWEST}`, userId),
  visibleForBooking: (db: D1Database, bookingId: string) => all<FileRow>(db,
    `SELECT f.* FROM booking_files f WHERE f.booking_id = ? AND f.state = 'ready' AND (f.direction = 'upload' OR f.delivered_at IS NOT NULL) ORDER BY ${NEWEST}`, bookingId),
  /** Everything finished on a booking, staged deliveries first. */
  forStaff: (db: D1Database, bookingId: string) => all<FileRow>(db,
    `SELECT f.* FROM booking_files f WHERE f.booking_id = ? AND f.state = 'ready' ORDER BY (f.direction = 'delivery' AND f.delivered_at IS NULL) DESC, ${NEWEST}`, bookingId),
  publishedCount: async (db: D1Database, bookingId: string) =>
    (await first<{ n: number }>(db, `SELECT COUNT(*) n FROM booking_files f WHERE f.booking_id = ? AND ${PUBLISHED}`, bookingId))?.n ?? 0,
  readyUploads: (db: D1Database, bookingId: string) => all<{ id: string }>(db, "SELECT id FROM booking_files WHERE booking_id = ? AND direction = 'upload' AND state = 'ready'", bookingId),
  titles: (db: D1Database, bookingId: string) => all<{ title: string; version: number }>(db,
    "SELECT title, version FROM booking_files WHERE booking_id = ? AND direction = 'delivery' AND delivered_at IS NOT NULL", bookingId),

  usage: (db: D1Database, bookingId: string, direction: FileDirection) => first<{ files: number; bytes: number; active: number }>(db,
    `SELECT COUNT(*) files, COALESCE(SUM(declared_size), 0) bytes, COALESCE(SUM(state = 'uploading'), 0) active
     FROM booking_files WHERE booking_id = ? AND direction = ? AND state != 'removed'`, bookingId, direction),

  /** One statement, so two uploads started together cannot both slip past a limit or past a booking that has just been closed. */
  start: async (db: D1Database, f: { id: string; bookingId: string; direction: FileDirection; title: string; name: string; key: string; type: string; size: number; uploadId: string; userId: string },
    cap: { files: number; bytes: number; active: number; statuses: string[] }) => {
    const marks = cap.statuses.map((_, i) => `?${14 + i}`).join(", ");
    const r = await run(db,
      `INSERT INTO booking_files (id, booking_id, direction, title, name, r2_key, content_type, declared_size, upload_id, uploaded_by)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10
       WHERE EXISTS (SELECT 1 FROM bookings WHERE id = ?2 AND delivered_final_at IS NULL AND status IN (${marks}))
         AND (SELECT COUNT(*) FROM booking_files WHERE booking_id = ?2 AND direction = ?3 AND state != 'removed') < ?11
         AND (SELECT COUNT(*) FROM booking_files WHERE booking_id = ?2 AND direction = ?3 AND state = 'uploading') < ?12
         AND (SELECT COALESCE(SUM(declared_size), 0) FROM booking_files WHERE booking_id = ?2 AND direction = ?3 AND state != 'removed') + ?8 <= ?13`,
      f.id, f.bookingId, f.direction, f.title, f.name, f.key, f.type, f.size, f.uploadId, f.userId, cap.files, cap.active, cap.bytes, ...cap.statuses);
    return r.meta.changes === 1;
  },

  /** Records a part in one statement. Parts uploaded in parallel cannot overwrite each other, and a re-sent part replaces the old entry. */
  addPart: async (db: D1Database, id: string, p: PartRow) => (await run(db,
    `UPDATE booking_files SET parts = (
       SELECT json_group_array(json(value)) FROM (
         SELECT value FROM json_each(booking_files.parts) WHERE json_extract(value, '$.partNumber') != ?2
         UNION ALL SELECT json_object('partNumber', CAST(?2 AS INTEGER), 'etag', ?3, 'size', CAST(?4 AS INTEGER))
       )
     ) WHERE id = ?1 AND state = 'uploading'`, id, p.partNumber, p.etag, p.size)).meta.changes === 1,
  markReady: async (db: D1Database, id: string, size: number) => (await run(db,
    `UPDATE booking_files SET state = 'ready', size = ?, completed_at = ${NOW}, upload_id = NULL, parts = '[]' WHERE id = ? AND state = 'uploading'`, size, id)).meta.changes === 1,
  /** Only a file still uploading may be swept, so a file finished a moment ago is never removed by the job. */
  markStale: async (db: D1Database, id: string) => (await run(db, "UPDATE booking_files SET state = 'removed', upload_id = NULL WHERE id = ? AND state = 'uploading'", id)).meta.changes === 1,
  markRemoved: async (db: D1Database, id: string) => (await run(db, "UPDATE booking_files SET state = 'removed', upload_id = NULL WHERE id = ? AND state != 'removed'", id)).meta.changes === 1,
  /** A removed row keeps its size until its object is really gone from R2, so the sweep knows what is left to delete. */
  emptied: (db: D1Database, id: string) => run(db, "UPDATE booking_files SET size = 0 WHERE id = ? AND state = 'removed'", id),
  counted: (db: D1Database, id: string) =>
    run(db, `UPDATE booking_files SET download_count = download_count + 1, first_downloaded_at = COALESCE(first_downloaded_at, ${NOW}) WHERE id = ?`, id),
  /** One audit row per person and file per window: true for the request that wrote it, false for repeats inside the window. */
  claimDownload: async (db: D1Database, a: { id: string; actorId: string; actorLabel: string; action: string; target: string; detail: string; since: string }) => (await run(db,
    `INSERT INTO audit_logs (id, actor_id, actor_label, action, target, detail)
     SELECT ?1, ?2, ?3, ?4, ?5, ?6 WHERE NOT EXISTS (SELECT 1 FROM audit_logs WHERE actor_id = ?2 AND action = ?4 AND target = ?5 AND detail = ?6 AND created_at > ?7)`,
    a.id, a.actorId, a.actorLabel, a.action, a.target, a.detail, a.since)).meta.changes === 1,
  releasedCount: async (db: D1Database, bookingId: string) =>
    (await first<{ n: number }>(db, `SELECT COUNT(*) n FROM booking_files f WHERE f.booking_id = ? AND ${PUBLISHED} AND f.released = 1`, bookingId))?.n ?? 0,
  markNotified: (db: D1Database, bookingId: string) => run(db, `UPDATE bookings SET delivery_notified_at = ${NOW} WHERE id = ?`, bookingId),
  published: (db: D1Database, bookingId: string) => all<FileRow>(db, `SELECT f.* FROM booking_files f WHERE f.booking_id = ? AND ${PUBLISHED} ORDER BY f.delivered_at, f.title`, bookingId),
  /** Bookings of this client with published work they were never told about (delivered before they had an email or account). */
  unnotifiedForUser: (db: D1Database, userId: string) => all<BookingRow>(db,
    `SELECT b.* FROM bookings b WHERE b.user_id = ? AND b.delivery_notified_at IS NULL AND EXISTS (SELECT 1 FROM booking_files f WHERE f.booking_id = b.id AND ${PUBLISHED})`, userId),
  /** Delivered, paid, no open revision, and the newest delivery is old enough: these complete by themselves. */
  settled: (db: D1Database, before: string, limit: number) => all<BookingRow>(db,
    `SELECT b.* FROM bookings b WHERE b.status IN ('confirmed', 'completed') AND b.delivered_final_at IS NULL AND b.total_kobo - (b.amount_paid_kobo - b.refunded_kobo) <= 0
       AND NOT EXISTS (SELECT 1 FROM revision_requests r WHERE r.booking_id = b.id AND r.status = 'open')
       AND EXISTS (SELECT 1 FROM booking_files f WHERE f.booking_id = b.id AND ${PUBLISHED})
       AND (SELECT MAX(f.delivered_at) FROM booking_files f WHERE f.booking_id = b.id AND ${PUBLISHED}) <= ? ORDER BY b.created_at LIMIT ?`, before, limit),
  setReleased: async (db: D1Database, id: string, released: boolean) =>
    (await run(db, "UPDATE booking_files SET released = ? WHERE id = ? AND direction = 'delivery' AND state = 'ready'", released ? 1 : 0, id)).meta.changes === 1,

  publish: (db: D1Database, f: { id: string; bookingId: string; title: string; version: number; note: string; released: boolean; at: string }) =>
    stmt(db, `UPDATE booking_files SET title = ?, version = ?, note = ?, released = ?, delivered_at = ?
      WHERE id = ? AND booking_id = ? AND direction = 'delivery' AND state = 'ready' AND delivered_at IS NULL`, f.title, f.version, f.note, f.released ? 1 : 0, f.at, f.id, f.bookingId),
  /** The `at` stamp marks the files this call published, so the follow-up statements only run when it really published something. */
  resolveOpen: (db: D1Database, bookingId: string, by: string, at: string) =>
    stmt(db, `UPDATE revision_requests SET status = 'done', resolved_at = ${NOW}, resolved_by = ?1 WHERE booking_id = ?2 AND status = 'open'
      AND EXISTS (SELECT 1 FROM booking_files WHERE booking_id = ?2 AND delivered_at = ?3)`, by, bookingId, at),
  finish: (db: D1Database, bookingId: string, at: string, marker: string | null) =>
    stmt(db, `UPDATE bookings SET delivered_final_at = ?1, status = 'completed', updated_at = ${NOW}
      WHERE id = ?2 AND delivered_final_at IS NULL AND status IN ('confirmed', 'completed')
      AND (?3 IS NULL OR EXISTS (SELECT 1 FROM booking_files WHERE booking_id = ?2 AND delivered_at = ?3))`, at, bookingId, marker),
  closeOpen: (db: D1Database, bookingId: string, by: string | null) =>
    stmt(db, `UPDATE revision_requests SET status = 'done', resolved_at = ${NOW}, resolved_by = ?1 WHERE booking_id = ?2 AND status = 'open'
      AND EXISTS (SELECT 1 FROM bookings WHERE id = ?2 AND delivered_final_at IS NOT NULL)`, by, bookingId),

  openRevision: (db: D1Database, bookingId: string) => first<RevisionRow>(db, "SELECT * FROM revision_requests WHERE booking_id = ? AND status = 'open'", bookingId),
  openRevisionsForUser: (db: D1Database, userId: string) => all<RevisionRow>(db,
    "SELECT r.* FROM revision_requests r JOIN bookings b ON b.id = r.booking_id WHERE b.user_id = ? AND r.status = 'open'", userId),
  revisions: (db: D1Database, bookingId: string) => all<RevisionRow>(db, "SELECT * FROM revision_requests WHERE booking_id = ? ORDER BY created_at DESC", bookingId),
  /** The request and the counter move together or not at all: both carry the same guards, and the counter only moves when the request row exists. */
  requestRevision: (db: D1Database, r: { id: string; bookingId: string; userId: string; note: string }) => [
    stmt(db, `INSERT INTO revision_requests (id, booking_id, user_id, note)
      SELECT ?1, ?2, ?3, ?4
      WHERE EXISTS (SELECT 1 FROM bookings WHERE id = ?2 AND revision_limit > 0 AND revisions_used < revision_limit AND delivered_final_at IS NULL AND status IN ('confirmed', 'completed'))
        AND EXISTS (SELECT 1 FROM booking_files f WHERE f.booking_id = ?2 AND ${PUBLISHED})
        AND NOT EXISTS (SELECT 1 FROM revision_requests WHERE booking_id = ?2 AND status = 'open')`, r.id, r.bookingId, r.userId, r.note),
    stmt(db, `UPDATE bookings SET revisions_used = revisions_used + 1, updated_at = ${NOW}
      WHERE id = ?1 AND revisions_used < revision_limit AND delivered_final_at IS NULL AND EXISTS (SELECT 1 FROM revision_requests WHERE id = ?2)`, r.bookingId, r.id),
  ],

  setContact: (db: D1Database, bookingId: string, email: string, userId: string | null) =>
    run(db, `UPDATE bookings SET contact_email = ?1, user_id = COALESCE(user_id, ?2), updated_at = ${NOW} WHERE id = ?3`, email, userId, bookingId),

  /** Writes the audit row only if none with the same action and target exists since `since`, so a burst of calls leaves one row and sends one notice. */
  claimNotice: async (db: D1Database, a: { id: string; actorId: string; actorLabel: string; action: string; target: string; detail: string; since: string }) => (await run(db,
    `INSERT INTO audit_logs (id, actor_id, actor_label, action, target, detail)
     SELECT ?1, ?2, ?3, ?4, ?5, ?6 WHERE NOT EXISTS (SELECT 1 FROM audit_logs WHERE action = ?4 AND target = ?5 AND created_at > ?7)`,
    a.id, a.actorId, a.actorLabel, a.action, a.target, a.detail, a.since)).meta.changes === 1,

  queue: (db: D1Database, tab: QueueTab, limit = 200) => all<QueueRow>(db,
    `SELECT b.*, ${count(PUBLISHED)} delivered, ${count("f.direction = 'delivery' AND f.state = 'ready' AND f.delivered_at IS NULL")} staged,
       ${count("f.direction = 'upload' AND f.state = 'ready'")} uploads, ${count(UNSEEN)} uploads_new,
       (SELECT MAX(f.delivered_at) FROM booking_files f WHERE f.booking_id = b.id AND ${PUBLISHED}) last_delivered_at,
       r.id rev_id, r.note rev_note, r.created_at rev_created_at
     ${QUEUE_FROM} WHERE ${TABS[tab]}
     ORDER BY ${tab === "delivered" ? "last_delivered_at DESC" : `b.due_date IS NULL, b.due_date, ${AGE[tab]}`} LIMIT ?`, limit),
  queueCounts: async (db: D1Database) => (await first<Record<QueueTab, number>>(db,
    `SELECT ${(Object.keys(TABS) as QueueTab[]).map((t) => `COALESCE(SUM(${TABS[t]}), 0) ${t}`).join(", ")} ${QUEUE_FROM}`))!,

  stale: (db: D1Database, before: string, limit: number) => all<FileRow>(db, "SELECT * FROM booking_files WHERE state = 'uploading' AND created_at < ? ORDER BY created_at LIMIT ?", before, limit),
  leftovers: (db: D1Database, before: string, limit: number) => all<FileRow>(db, "SELECT * FROM booking_files WHERE state = 'removed' AND size > 0 AND created_at < ? ORDER BY created_at LIMIT ?", before, limit),
};
