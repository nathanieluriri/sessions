import { hasPermission, isOwner } from "../../shared/permissions";
import type { Env, SessionUser } from "../env";
import { bookingsRepo, type BookingRow } from "../repositories/bookings";
import { filesRepo, type FileDirection, type FileRow, type PartRow, type QueueTab, type RevisionRow } from "../repositories/files";
import { usersRepo } from "../repositories/users";
import { uuid } from "../lib/crypto";
import { AppError, badRequest, conflict, forbidden, notFound } from "../lib/errors";
import { naira } from "../lib/money";
import { studioNow } from "../lib/time";
import {
  AUTO_COMPLETE_DAYS, DELIVER_STATUSES, EXTENSIONS, LIMITS, MAX_FILE_SIZE, PART_SIZE, UPLOAD_STATUSES, canDownload, cleanName, cleanNote, cleanText, contentDisposition,
  contentTypeFor, extensionOf, isAudio, parseRange, partCount, partLength, titleFromName, type ByteRange,
} from "../lib/files";
import { audit } from "./audit";
import { notifyStaff, notifyUser, sendEmail } from "./notifications";
import { balanceOf, emails } from "./emails";

/** Which set of routes the caller came through. Clients act on their own bookings, staff need deliver_files. */
export type Side = "client" | "staff";

export interface DeliverInput { items: { fileId: string; title: string }[]; note: string; released: boolean; final: boolean; resolvesRevision: boolean }

const NOTICE = "Sent files to the studio";
const NOTICE_GAP_MS = 2 * 60_000;
const DOWNLOAD_WINDOW_MS = 10 * 60_000;
const STALE_UPLOAD_MS = 24 * 3_600_000;
const KEEP_REMOVED_MS = 7 * 86_400_000;
const SWEEP_BATCH = 10;

const groupOf = (f: FileRow) => (f.title || titleFromName(f.name)).trim().toLowerCase();
/** Tells which files are the newest version of their title among the published deliveries. Uploads always count as latest. */
const latestOf = (files: FileRow[]) => {
  const top = new Map<string, number>();
  for (const f of files) if (f.direction === "delivery" && f.delivered_at) top.set(groupOf(f), Math.max(top.get(groupOf(f)) ?? 0, f.version));
  return (f: FileRow) => f.direction === "upload" || (!!f.delivered_at && f.version >= (top.get(groupOf(f)) ?? 0));
};

export const fileView = (f: FileRow, locked = false, latest = true) => ({
  id: f.id, booking_id: f.booking_id, direction: f.direction, title: f.title || titleFromName(f.name), name: f.name, size: f.size, content_type: f.content_type,
  version: f.version, note: f.note, delivered_at: f.delivered_at, created_at: f.created_at, released: !!f.released, locked, downloads: f.download_count,
  first_downloaded_at: f.first_downloaded_at, group: f.direction === "delivery" ? groupOf(f) : null, latest,
});
const lockedFor = (b: BookingRow, f: FileRow) => f.direction === "delivery" && !f.released && balanceOf(b) > 0;
const clientView = (b: BookingRow, f: FileRow, latest = true) => fileView(f, lockedFor(b, f), latest);
const revisionView = (r: RevisionRow) => ({ id: r.id, note: r.note, status: r.status, created_at: r.created_at, resolved_at: r.resolved_at });

const isFinal = (b: BookingRow) => !!b.delivered_final_at;
const canUpload = (b: BookingRow) => !isFinal(b) && UPLOAD_STATUSES.includes(b.status);
const canDeliver = (b: BookingRow) => !isFinal(b) && DELIVER_STATUSES.includes(b.status);

/** `opened` is false while every published delivery is still locked by an unpaid balance. */
function revisionState(b: BookingRow, open: RevisionRow | null, delivered: number, opened = true) {
  return {
    limit: b.revision_limit, used: b.revisions_used, left: Math.max(0, b.revision_limit - b.revisions_used), final: isFinal(b), open: open ? revisionView(open) : null,
    canRequest: b.revision_limit > 0 && b.revisions_used < b.revision_limit && delivered > 0 && opened && !open && canDeliver(b),
    canApprove: delivered > 0 && opened && canDeliver(b),
  };
}

function assertStaff(u: SessionUser) {
  if (u.role === "client" || !hasPermission(u, "deliver_files")) throw forbidden();
}

/** The booking for this caller. A client's unknown and foreign ids are indistinguishable: both are a plain 404. */
async function bookingFor(env: Env, user: SessionUser, side: Side, id: string) {
  if (side === "staff") assertStaff(user);
  const b = await bookingsRepo.byId(env.DB, id);
  if (!b || (side === "client" && b.user_id !== user.id)) throw notFound();
  return b;
}

async function fileFor(env: Env, user: SessionUser, side: Side, id: string) {
  if (side === "staff") assertStaff(user);
  const f = await filesRepo.byId(env.DB, id);
  const b = f ? await bookingsRepo.byId(env.DB, f.booking_id) : null;
  if (!f || !b || (side === "client" && b.user_id !== user.id)) throw notFound();
  return { f, b };
}

/** A file this side is allowed to write to: clients their own uploads, staff the deliveries. */
async function writableFile(env: Env, user: SessionUser, side: Side, id: string) {
  const r = await fileFor(env, user, side, id);
  if (r.f.state === "removed" || (side === "client" && r.f.direction !== "upload")) throw notFound();
  if (side === "staff" && r.f.direction !== "delivery") throw forbidden("Client files can only be sent by the client.");
  return r;
}

function assertOpen(b: BookingRow, side: Side) {
  if (isFinal(b)) throw badRequest(side === "client" ? "This order is complete, so no more files can be added. Contact the studio for new work." : "This order is complete. Nothing more can be delivered on it.");
  if (!(side === "client" ? UPLOAD_STATUSES : DELIVER_STATUSES).includes(b.status)) throw badRequest(side === "client" ? "This booking is closed, so files can't be added to it." : "Only confirmed bookings can receive deliveries.");
  if (side === "client" && ["pending", "approved"].includes(b.status) && b.expires_at && b.expires_at <= new Date().toISOString()) throw badRequest("This request has expired, so files can't be added to it.");
}

const gone = (e: unknown) => /does not exist|10024/.test(String((e as Error)?.message ?? e));
const unsatisfiable = (e: unknown) => /not satisfiable|10039/.test(String((e as Error)?.message ?? e));
const storageError = (m: string) => new AppError(502, m, "storage_error");

function limitError(use: { files: number; bytes: number; active: number }, size: number, direction: FileDirection) {
  const cap = LIMITS[direction];
  if (use.active >= LIMITS.active) return "Too many uploads are in progress. Let them finish first.";
  if (use.files >= cap.files) return `This booking already holds ${cap.files} files. Remove some or zip them together.`;
  if (use.bytes + size > cap.bytes) return `That would take this booking over its ${Math.round(cap.bytes / MAX_FILE_SIZE)} GB limit. Remove some files first.`;
  return null;
}

async function readExactly(req: Request, want: number, n: number) {
  const wrong = () => badRequest(`Part ${n} must be exactly ${want} bytes.`);
  const declared = req.headers.get("content-length");
  if (declared !== null && Number(declared) !== want) throw wrong();
  const reader = req.body?.getReader();
  if (!reader) throw wrong();
  const out = new Uint8Array(want);
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (got + value.length > want) { await reader.cancel().catch(() => {}); throw wrong(); }
    out.set(value, got);
    got += value.length;
  }
  if (got !== want) throw wrong();
  return out;
}

/** Notifications must never undo work that is already saved. */
async function safely<T>(fn: () => Promise<T>, fallback: T) {
  try { return await fn(); } catch (e) { console.error(e); return fallback; }
}

type Told = { notified: boolean; reason?: string; notified_via?: "email" | "outbox" | "app" };

async function tellClient(env: Env, b: BookingRow, mail: { subject: string; text: string }, notice: { title: string; body: string }): Promise<Told> {
  const account = b.user_id ? await usersRepo.byId(env.DB, b.user_id) : null;
  const to = b.contact_email || account?.email || "";
  if (!to && !account) return { notified: false, reason: "no_contact" };
  const status = await sendEmail(env, to, mail.subject, mail.text);
  await notifyUser(env, b.user_id, notice.title, notice.body, b.id);
  if (status === "failed") return { notified: false, reason: "send_failed" };
  return { notified: true, notified_via: status === "logged" ? "outbox" : status === "sent" ? "email" : "app" };
}

/** Sends the "your files are ready" email for these published files and remembers that the client was told. */
async function announce(env: Env, b: BookingRow, rows: FileRow[], o: { note: string; released: boolean; final: boolean }): Promise<Told> {
  const out = await safely<Told>(async () => {
    const mail = emails.delivered(env, b, {
      files: rows.map((f) => ({ title: f.title, version: f.version })), note: o.note, released: o.released, final: o.final,
      revisionsLeft: Math.max(0, b.revision_limit - b.revisions_used), account: !!b.user_id, autoDays: AUTO_COMPLETE_DAYS,
    });
    return tellClient(env, b, mail, { title: mail.subject.split(" · ")[0], body: `${b.ref} · ${rows.length} file${rows.length === 1 ? "" : "s"}` });
  }, { notified: false, reason: "send_failed" });
  if (out.notified) await filesRepo.markNotified(env.DB, b.id);
  return out;
}

/** Sends the ready notice for deliveries the client was never told about, once there is a way to reach them. */
async function catchUp(env: Env, b: BookingRow) {
  const fresh = (await bookingsRepo.byId(env.DB, b.id))!;
  if (fresh.delivery_notified_at || (!fresh.user_id && !fresh.contact_email)) return;
  const rows = await filesRepo.published(env.DB, fresh.id);
  if (rows.length) await announce(env, fresh, rows, { note: "", released: rows.every((f) => f.released === 1), final: isFinal(fresh) });
}

/** Marks the order complete. Safe to repeat: a second call changes nothing and tells nobody. `actor` is null for the automatic completion. */
async function closeOrder(env: Env, actor: SessionUser | null, b: BookingRow, side: Side | "auto") {
  if (isFinal(b)) return { ok: true, final: true, changed: false };
  if (!DELIVER_STATUSES.includes(b.status)) throw badRequest("Only confirmed bookings can be completed.");
  if ((await filesRepo.publishedCount(env.DB, b.id)) === 0) throw badRequest("Nothing has been delivered yet.");
  if (side === "client") await assertOpened(env, b, "approve");
  const [done] = await env.DB.batch([filesRepo.finish(env.DB, b.id, new Date().toISOString(), null), filesRepo.closeOpen(env.DB, b.id, actor?.id ?? null)]);
  if (done.meta.changes !== 1) return { ok: true, final: true, changed: false };
  const fresh = (await bookingsRepo.byId(env.DB, b.id))!;
  await audit(env.DB, actor, side === "client" ? "Approved delivery" : side === "staff" ? "Completed order" : "Completed order automatically", b.ref, side === "auto" ? `No reply within ${AUTO_COMPLETE_DAYS} days of the last delivery` : b.package_name);
  await safely(async () => {
    if (side === "client") await notifyStaff(env, "deliver_files", `Delivery approved · ${b.ref}`, `${b.artist_name} approved the delivery for ${b.ref} (${b.package_name}). The order is complete.\nOpen the production queue: ${env.APP_URL}/admin/deliveries`, b.id);
    else {
      await tellClient(env, fresh, emails.orderComplete(env, fresh), { title: "Your order is complete", body: b.ref });
      if (side === "auto") await notifyStaff(env, "deliver_files", `Order completed automatically · ${b.ref}`, `${b.ref} (${b.package_name}) was paid and delivered ${AUTO_COMPLETE_DAYS} days ago with no reply, so it is now complete.\nOpen the production queue: ${env.APP_URL}/admin/deliveries`, b.id);
    }
  }, undefined);
  return { ok: true, final: true, changed: true };
}

/** Approving or asking for a revision needs at least one delivery the client can actually open. */
async function assertOpened(env: Env, b: BookingRow, what: "approve" | "ask for a revision") {
  if (balanceOf(b) > 0 && (await filesRepo.releasedCount(env.DB, b.id)) === 0) throw badRequest(`Pay the balance to open your files before you ${what}.`);
}

export const filesService = {
  /** Every booking of the client that has files or can still receive uploads. */
  async clientFiles(env: Env, user: SessionUser) {
    const [bookings, files, open] = await Promise.all([bookingsRepo.forUser(env.DB, user.id), filesRepo.visibleForUser(env.DB, user.id), filesRepo.openRevisionsForUser(env.DB, user.id)]);
    const rows = bookings.map((b) => {
      const mine = files.filter((f) => f.booking_id === b.id);
      const deliveries = mine.filter((f) => f.direction === "delivery");
      const latest = latestOf(mine);
      const revisions = revisionState(b, open.find((r) => r.booking_id === b.id) ?? null, deliveries.length, deliveries.some((f) => !lockedFor(b, f)));
      return {
        id: b.id, ref: b.ref, package_name: b.package_name, service_name: b.service_name, status: b.status, scheduling: b.scheduling, due_date: b.due_date,
        balance_kobo: balanceOf(b), revision_limit: b.revision_limit, revisions_used: b.revisions_used, final: isFinal(b), openRevision: revisions.open,
        canUpload: canUpload(b), canRequest: revisions.canRequest, canApprove: revisions.canApprove,
        deliveries: deliveries.map((f) => clientView(b, f, latest(f))), uploads: mine.filter((f) => f.direction === "upload").map((f) => clientView(b, f)),
      };
    });
    return { bookings: rows.filter((r) => r.deliveries.length || r.uploads.length || r.canUpload) };
  },

  /** The file and revision parts of the client's booking page. */
  async portalForClient(env: Env, user: SessionUser, bookingId: string) {
    const b = await bookingFor(env, user, "client", bookingId);
    const [files, open] = await Promise.all([filesRepo.visibleForBooking(env.DB, b.id), filesRepo.openRevision(env.DB, b.id)]);
    const deliveries = files.filter((f) => f.direction === "delivery");
    const latest = latestOf(files);
    return {
      files: { deliveries: deliveries.map((f) => clientView(b, f, latest(f))), uploads: files.filter((f) => f.direction === "upload").map((f) => clientView(b, f)), canUpload: canUpload(b) },
      revisions: revisionState(b, open, deliveries.length, deliveries.some((f) => !lockedFor(b, f))),
    };
  },

  async staffFiles(env: Env, user: SessionUser, bookingId: string) {
    const b = await bookingFor(env, user, "staff", bookingId);
    const [files, revisions] = await Promise.all([filesRepo.forStaff(env.DB, b.id), filesRepo.revisions(env.DB, b.id)]);
    const deliveries = files.filter((f) => f.direction === "delivery");
    const published = deliveries.filter((f) => f.delivered_at).length;
    return {
      booking: {
        id: b.id, ref: b.ref, status: b.status, artist_name: b.artist_name, service_name: b.service_name, package_name: b.package_name, scheduling: b.scheduling, due_date: b.due_date,
        balance_kobo: balanceOf(b), final: isFinal(b), canDeliver: canDeliver(b), canFinalize: canDeliver(b) && published > 0,
      },
      deliveries: deliveries.map((f) => fileView(f, false, latestOf(files)(f))), uploads: files.filter((f) => f.direction === "upload").map((f) => fileView(f)),
      revisions: { ...revisionState(b, revisions.find((r) => r.status === "open") ?? null, published), history: revisions.map(revisionView) },
      client: { hasAccount: !!b.user_id, hasEmail: !!b.contact_email },
    };
  },

  /** Starts a multipart upload. Clients create uploads on their own booking, staff create staged deliveries. */
  async begin(env: Env, user: SessionUser, side: Side, bookingId: string, input: { name: string; size: number }) {
    const b = await bookingFor(env, user, side, bookingId);
    if (!env.MEDIA) throw new AppError(400, "File storage is not set up on this deployment yet.", "storage_unavailable");
    assertOpen(b, side);
    const name = cleanName(input.name);
    if (!name || !EXTENSIONS[extensionOf(name)]) throw badRequest("That file type is not accepted. Send audio, video, images, documents or a zip archive.");
    if (!Number.isInteger(input.size) || input.size < 1) throw badRequest("That file is empty.");
    if (input.size > MAX_FILE_SIZE) throw badRequest("Files can be up to 1 GB. Zip or split larger files.");
    const direction: FileDirection = side === "client" ? "upload" : "delivery";
    const tooMany = limitError((await filesRepo.usage(env.DB, b.id, direction))!, input.size, direction);
    if (tooMany) throw badRequest(tooMany);
    const id = uuid(), key = `portal/${b.id}/${id}`;
    const upload = await env.MEDIA.createMultipartUpload(key, { httpMetadata: { contentType: contentTypeFor(name) } }).catch(() => { throw storageError("Could not start the upload. Try again in a moment."); });
    const cap = { ...LIMITS[direction], active: LIMITS.active, statuses: side === "client" ? UPLOAD_STATUSES : DELIVER_STATUSES };
    const started = await filesRepo.start(env.DB, { id, bookingId: b.id, direction, title: titleFromName(name), name, key, type: contentTypeFor(name), size: input.size, uploadId: upload.uploadId, userId: user.id }, cap);
    if (!started) {
      await upload.abort().catch(() => {});
      throw badRequest(limitError((await filesRepo.usage(env.DB, b.id, direction))!, input.size, direction) ?? "This booking cannot take files right now.");
    }
    return { id, partSize: PART_SIZE, parts: partCount(input.size) };
  },

  /** Stores one part. The server fixes each part's length, so a lying size or an oversized body is refused before it reaches R2. */
  async putPart(env: Env, user: SessionUser, side: Side, fileId: string, n: number, req: Request) {
    const { f, b } = await writableFile(env, user, side, fileId);
    if (f.state === "ready") throw conflict("This file is already uploaded.");
    if (!f.upload_id || !env.MEDIA) throw notFound();
    assertOpen(b, side);
    const total = partCount(f.declared_size);
    if (!Number.isInteger(n) || n < 1 || n > total) throw badRequest(`Part numbers run from 1 to ${total} for this file.`);
    const want = partLength(f.declared_size, n);
    const data = await readExactly(req, want, n);
    const part = await env.MEDIA.resumeMultipartUpload(f.r2_key, f.upload_id).uploadPart(n, data)
      .catch((e) => { throw gone(e) ? conflict("This upload was cancelled or has already finished.") : storageError("Could not store that part. Send it again."); });
    if (!(await filesRepo.addPart(env.DB, f.id, { partNumber: n, etag: part.etag, size: want }))) throw conflict("This upload was cancelled or has already finished.");
    return { ok: true, size: want };
  },

  /** Finishes the upload. Repeating it, or running two at once, returns the same finished file. */
  async complete(env: Env, user: SessionUser, side: Side, fileId: string) {
    const { f, b } = await writableFile(env, user, side, fileId);
    const show = (row: FileRow) => (side === "client" ? clientView(b, row) : fileView(row));
    if (f.state === "ready") return show(f);
    if (!f.upload_id || !env.MEDIA) throw notFound();
    assertOpen(b, side);
    const parts = new Map((JSON.parse(f.parts) as PartRow[]).map((p) => [p.partNumber, p]));
    const missing = Array.from({ length: partCount(f.declared_size) }, (_, i) => i + 1).filter((n) => !parts.has(n));
    if (missing.length) throw badRequest(`Some parts have not arrived yet (${missing.slice(0, 5).join(", ")}${missing.length > 5 ? " and more" : ""}). Send them, then finish again.`);
    let object: R2Object | null;
    try {
      object = await env.MEDIA.resumeMultipartUpload(f.r2_key, f.upload_id).complete([...parts.values()].sort((a, c) => a.partNumber - c.partNumber).map(({ partNumber, etag }) => ({ partNumber, etag })));
    } catch (e) {
      if (!gone(e)) throw storageError("Could not finish the upload. Try again in a moment.");
      object = await env.MEDIA.head(f.r2_key);
    }
    if (!object) {
      const again = await filesRepo.byId(env.DB, f.id);
      if (again?.state === "ready") return show(again);
      throw notFound();
    }
    if (object.size !== f.declared_size) {
      await env.MEDIA.delete(f.r2_key).catch(() => {});
      await filesRepo.markRemoved(env.DB, f.id);
      throw badRequest("The file that arrived is not the size it was announced with. Please upload it again.");
    }
    const won = await filesRepo.markReady(env.DB, f.id, object.size);
    const row = (await filesRepo.byId(env.DB, f.id))!;
    if (row.state === "removed") {
      await env.MEDIA.delete(f.r2_key).catch(() => {});
      await filesRepo.emptied(env.DB, f.id);
      throw notFound();
    }
    if (won) await audit(env.DB, user, side === "client" ? "Uploaded file" : "Uploaded delivery file", b.ref, `${f.name} (${Math.round(object.size / 1024)} KB)`);
    return show(row);
  },

  /** Clients remove their own uploads until the order is complete. Staff can remove any file on a booking to free space. */
  async remove(env: Env, user: SessionUser, side: Side, fileId: string) {
    const { f, b } = await fileFor(env, user, side, fileId);
    if (side === "client") {
      if (f.direction !== "upload") throw notFound();
      if (isFinal(b)) throw badRequest("This order is complete, so its files can no longer be changed.");
    }
    if (side === "staff" && f.direction === "delivery" && f.delivered_at && f.state === "ready" && !isOwner(user)) throw forbidden("Only the CEO or COO can remove a file the client has already been given.");
    if (f.state === "removed" || !(await filesRepo.markRemoved(env.DB, f.id))) return { ok: true };
    if (env.MEDIA) {
      if (f.state === "uploading" && f.upload_id) await env.MEDIA.resumeMultipartUpload(f.r2_key, f.upload_id).abort().catch(() => {});
      if (await env.MEDIA.delete(f.r2_key).then(() => true, () => false)) await filesRepo.emptied(env.DB, f.id);
    }
    if (f.state === "ready") await audit(env.DB, user, "Removed file", b.ref, `${f.title || f.name} (${f.direction})`);
    return { ok: true };
  },

  /** Staff switch: lets the client download this delivery before the balance is paid, or locks it again. */
  async setReleased(env: Env, user: SessionUser, fileId: string, released: boolean) {
    const { f, b } = await fileFor(env, user, "staff", fileId);
    if (f.direction !== "delivery" || f.state !== "ready") throw badRequest("Only finished deliveries can be released.");
    await filesRepo.setReleased(env.DB, f.id, released);
    await audit(env.DB, user, released ? "Released file before payment" : "Locked file until paid", b.ref, f.title || f.name);
    return fileView({ ...f, released: released ? 1 : 0 }, false, latestOf(await filesRepo.published(env.DB, b.id))(f));
  },

  /** Publishes staged deliveries as one batch and tells the client once. */
  async deliver(env: Env, user: SessionUser, bookingId: string, input: DeliverInput) {
    const b = await bookingFor(env, user, "staff", bookingId);
    assertOpen(b, "staff");
    const ids = input.items.map((i) => i.fileId);
    if (new Set(ids).size !== ids.length) throw badRequest("Each file can only be listed once.");
    const found = await filesRepo.byIds(env.DB, b.id, ids);
    if (found.length !== ids.length || found.some((f) => f.direction !== "delivery" || f.state !== "ready" || f.delivered_at)) {
      throw badRequest("Some of those files are not waiting to be delivered. Upload them first, or refresh the page.");
    }
    const titles = new Map(input.items.map((i) => [i.fileId, cleanText(i.title, 120)]));
    if ([...titles.values()].some((t) => !t)) throw badRequest("Give every file a title.");
    const latest = new Map<string, number>();
    for (const t of await filesRepo.titles(env.DB, b.id)) latest.set(t.title.toLowerCase(), Math.max(latest.get(t.title.toLowerCase()) ?? 0, t.version));
    const at = new Date().toISOString();
    const note = cleanNote(input.note, 1000);
    const hadOpen = !!(await filesRepo.openRevision(env.DB, b.id));
    const resolves = hadOpen && (input.resolvesRevision || input.final);
    const results = await env.DB.batch([
      ...ids.map((id) => { const title = titles.get(id)!; return filesRepo.publish(env.DB, { id, bookingId: b.id, title, version: (latest.get(title.toLowerCase()) ?? 0) + 1, note, released: input.released, at }); }),
      ...(resolves && !input.final ? [filesRepo.resolveOpen(env.DB, b.id, user.id, at)] : []),
      ...(input.final ? [filesRepo.finish(env.DB, b.id, at, at), filesRepo.closeOpen(env.DB, b.id, user.id)] : []),
    ]);
    const delivered = ids.filter((_, i) => results[i].meta.changes === 1);
    if (!delivered.length) throw conflict("Those files were just delivered by someone else. Refresh the page.");
    const rows = await filesRepo.byIds(env.DB, b.id, delivered);
    const fresh = (await bookingsRepo.byId(env.DB, b.id))!;
    const final = input.final && isFinal(fresh);
    await audit(env.DB, user, final ? "Delivered final files" : "Delivered files", b.ref, `${rows.map((f) => f.title).join(", ")}${input.released ? " (released before payment)" : ""}`.slice(0, 500));
    const outcome = await announce(env, fresh, rows, { note, released: input.released, final });
    const newest = latestOf(await filesRepo.published(env.DB, b.id));
    return { ok: true, delivered: rows.map((f) => fileView(f, false, newest(f))), final, resolvedRevision: resolves, ...outcome };
  },

  async finalize(env: Env, user: SessionUser, bookingId: string) {
    const b = await bookingFor(env, user, "staff", bookingId);
    const { ok, final } = await closeOrder(env, user, b, "staff");
    return { ok, final };
  },

  /** The client accepts the delivery: the order completes and revisions close. */
  async approve(env: Env, user: SessionUser, bookingId: string) {
    const b = await bookingFor(env, user, "client", bookingId);
    const { ok, final } = await closeOrder(env, user, b, "client");
    return { ok, final };
  },

  async requestRevision(env: Env, user: SessionUser, bookingId: string, note: string) {
    const b = await bookingFor(env, user, "client", bookingId);
    const text = cleanNote(note, 2000);
    if (text.length < 3) throw badRequest("Tell the studio what to change (at least 3 characters).");
    if (isFinal(b)) throw badRequest("This order is complete, so revisions are closed. Contact the studio for new work.");
    if (!DELIVER_STATUSES.includes(b.status)) throw badRequest("Revisions open once your booking is confirmed and the studio has delivered.");
    if (b.revision_limit < 1) throw badRequest("This package does not include revisions.");
    if ((await filesRepo.publishedCount(env.DB, b.id)) === 0) throw badRequest("Revisions open once the studio has delivered your files.");
    await assertOpened(env, b, "ask for a revision");
    if (b.revisions_used >= b.revision_limit) throw badRequest(`You have used all ${b.revision_limit} revisions on this order.`);
    if (await filesRepo.openRevision(env.DB, b.id)) throw conflict("You already have a revision request waiting for the studio.");
    const id = uuid();
    const [created, counted] = await env.DB.batch(filesRepo.requestRevision(env.DB, { id, bookingId: b.id, userId: user.id, note: text }));
    if (created.meta.changes !== 1 || counted.meta.changes !== 1) throw conflict("Your request could not be saved because the order just changed. Refresh the page and try again.");
    const fresh = (await bookingsRepo.byId(env.DB, b.id))!;
    await audit(env.DB, user, "Requested revision", b.ref, `Revision ${fresh.revisions_used} of ${fresh.revision_limit}`);
    await safely(() => notifyStaff(env, "deliver_files", `Revision requested · ${b.ref}`,
      `${b.artist_name} asked for revision ${fresh.revisions_used} of ${fresh.revision_limit} on ${b.ref} (${b.package_name}).\nOpen the production queue: ${env.APP_URL}/admin/deliveries`, b.id), undefined);
    const request = (await filesRepo.openRevision(env.DB, b.id))!;
    return { ok: true, request: revisionView(request), revisions: revisionState(fresh, request, await filesRepo.publishedCount(env.DB, b.id)) };
  },

  /** Tells staff once that a batch of uploads is waiting. Only this booking's finished uploads count, and at most one notice per two minutes. */
  async notifyUploads(env: Env, user: SessionUser, bookingId: string, fileIds: string[]) {
    const b = await bookingFor(env, user, "client", bookingId);
    const wanted = new Set(fileIds);
    const ready = (await filesRepo.readyUploads(env.DB, b.id)).filter((f) => wanted.has(f.id));
    if (!ready.length) throw badRequest("Upload at least one file before letting the studio know.");
    const sent = await filesRepo.claimNotice(env.DB, {
      id: uuid(), actorId: user.id, actorLabel: `${user.name} (CLIENT)`, action: NOTICE, target: b.ref, detail: `${ready.length} file${ready.length === 1 ? "" : "s"}`,
      since: new Date(Date.now() - NOTICE_GAP_MS).toISOString(),
    });
    if (!sent) throw new AppError(429, "The studio was told about your files a moment ago. They can see everything you have uploaded.", "rate_limited");
    await safely(() => notifyStaff(env, "deliver_files", `Files from ${b.artist_name} · ${b.ref}`,
      `${b.artist_name} sent ${ready.length} file${ready.length === 1 ? "" : "s"} for ${b.ref} (${b.package_name}).\nOpen the production queue: ${env.APP_URL}/admin/deliveries`, b.id), undefined);
    return { ok: true, notified: ready.length };
  },

  /** Streams a file after the one access rule. Ranges, inline play and plain downloads all pass through here. */
  async download(env: Env, user: SessionUser, side: Side, fileId: string, q: { range: string | null; ifRange: string | null; inline: boolean; head: boolean }) {
    const { f, b } = await fileFor(env, user, side, fileId);
    const verdict = canDownload({ staff: side === "staff", owner: b.user_id === user.id, direction: f.direction, state: f.state, delivered: !!f.delivered_at, released: !!f.released, balanceKobo: balanceOf(b) });
    if (verdict === "locked") throw new AppError(403, `This file unlocks when the remaining ${naira(balanceOf(b))} is paid.`, "locked");
    if (verdict === "missing") throw notFound();
    if (!env.MEDIA) throw new AppError(400, "File storage is not set up on this deployment yet.", "storage_unavailable");
    const type = contentTypeFor(f.name);
    const headers: Record<string, string> = {
      "Content-Type": type, "Content-Disposition": contentDisposition(f.name, q.inline && isAudio(type)), "Accept-Ranges": "bytes", "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store", "Content-Security-Policy": "default-src 'none'; sandbox",
    };
    if (q.head) {
      const head = await env.MEDIA.head(f.r2_key);
      if (!head) throw notFound();
      return new Response(null, { headers: { ...headers, "Content-Length": String(head.size), ETag: head.httpEtag } });
    }
    const refuse = (size: number) => new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}`, "Cache-Control": "private, no-store" } });
    let range: ByteRange = parseRange(q.range, f.size);
    if (range.kind === "unsatisfiable") return refuse(f.size);
    const open = (r: ByteRange) => env.MEDIA!.get(f.r2_key, r.kind === "range" ? { range: { offset: r.start, length: r.end - r.start + 1 } } : undefined);
    let object: R2ObjectBody | null;
    try {
      object = await open(range);
      if (object && range.kind === "range" && q.ifRange && q.ifRange.trim() !== object.httpEtag) {
        range = { kind: "all" };
        object = await open(range);
      }
    } catch (e) {
      if (unsatisfiable(e)) return refuse(f.size);
      throw e;
    }
    if (!object) throw notFound();
    const slice = range.kind === "range" ? range : null;
    const first = await filesRepo.claimDownload(env.DB, {
      id: uuid(), actorId: user.id, actorLabel: `${user.name} (${user.role.toUpperCase()})`, action: f.direction === "delivery" ? "Downloaded delivery" : "Downloaded client file", target: b.ref,
      detail: `${f.title || f.name} (${f.name}) [${f.id.slice(0, 8)}]`, since: new Date(Date.now() - DOWNLOAD_WINDOW_MS).toISOString(),
    });
    if (first && (side === "client" ? f.direction === "delivery" : f.direction === "upload")) await filesRepo.counted(env.DB, f.id);
    return new Response(object.body, {
      status: slice ? 206 : 200,
      headers: {
        ...headers, ETag: object.httpEtag, "Content-Length": String(slice ? slice.end - slice.start + 1 : object.size),
        ...(slice ? { "Content-Range": `bytes ${slice.start}-${slice.end}/${object.size}` } : {}),
      },
    });
  },

  /** The production queue for staff who deliver. Rows carry no client contact details. */
  async queue(env: Env, user: SessionUser, tab: QueueTab) {
    assertStaff(user);
    const [rows, counts] = await Promise.all([filesRepo.queue(env.DB, tab), filesRepo.queueCounts(env.DB)]);
    const today = studioNow().date;
    return {
      tab, counts,
      rows: rows.map((r) => ({
        id: r.id, ref: r.ref, artist_name: r.artist_name, service_name: r.service_name, package_name: r.package_name, status: r.status, scheduling: r.scheduling, date: r.date,
        due_date: r.due_date, overdue: !!r.due_date && r.due_date < today && !isFinal(r) && r.delivered === 0, balance_kobo: balanceOf(r), total_kobo: r.total_kobo, revision_limit: r.revision_limit,
        revisions_used: r.revisions_used, final: isFinal(r), created_at: r.created_at, last_delivered_at: r.last_delivered_at,
        counts: { delivered: r.delivered, staged: r.staged, uploads: r.uploads, uploads_new: r.uploads_new },
        open_revision: r.rev_id ? { id: r.rev_id, note: r.rev_note, created_at: r.rev_created_at } : null,
      })),
    };
  },

  /** Gives a walk-in client a way into the portal: sets the booking email and links an existing verified account that uses it. */
  async setContactEmail(env: Env, actor: SessionUser, b: BookingRow, email: string) {
    const account = await usersRepo.byEmail(env.DB, email);
    const match = account && account.role === "client" && account.active && account.email_verified_at ? account.id : null;
    await filesRepo.setContact(env.DB, b.id, email, match);
    const linked = !b.user_id && !!match;
    await audit(env.DB, actor, "Set booking contact email", b.ref, linked ? "Linked to the client's account" : b.user_id ? "Booking already belongs to an account" : "No account with this email yet");
    await safely(() => catchUp(env, b), undefined);
    return { linked };
  },

  /** Called when a guest's bookings are linked to a freshly verified account: tells them about work delivered before they could be reached. */
  async catchUpForUser(env: Env, userId: string) {
    for (const b of await filesRepo.unnotifiedForUser(env.DB, userId)) await safely(() => catchUp(env, b), undefined);
  },

  /** Staff resend of the "ready" notice, for a client who missed it. At most once every two minutes per booking. */
  async notifyDelivery(env: Env, user: SessionUser, bookingId: string) {
    const b = await bookingFor(env, user, "staff", bookingId);
    const rows = await filesRepo.published(env.DB, b.id);
    if (!rows.length) throw badRequest("Nothing has been delivered on this booking yet.");
    if (!b.user_id && !b.contact_email) return { ok: true, notified: false, reason: "no_contact" };
    const sent = await filesRepo.claimNotice(env.DB, {
      id: uuid(), actorId: user.id, actorLabel: `${user.name} (${user.role.toUpperCase()})`, action: "Resent delivery notice", target: b.ref, detail: `${rows.length} file${rows.length === 1 ? "" : "s"}`,
      since: new Date(Date.now() - NOTICE_GAP_MS).toISOString(),
    });
    if (!sent) throw new AppError(429, "The client was told a moment ago. Give it a couple of minutes.", "rate_limited");
    return { ok: true, ...(await announce(env, b, rows, { note: "", released: rows.every((f) => f.released === 1), final: isFinal(b) })) };
  },

  /** Cron: aborts uploads nobody finished and retries the R2 delete of removed files. Staged deliveries that were never published stay. */
  async housekeeping(env: Env) {
    const before = new Date(Date.now() - AUTO_COMPLETE_DAYS * 86_400_000).toISOString();
    for (const b of await filesRepo.settled(env.DB, before, SWEEP_BATCH)) await safely(() => closeOrder(env, null, b, "auto"), undefined);
    if (!env.MEDIA) return;
    const stale = await filesRepo.stale(env.DB, new Date(Date.now() - STALE_UPLOAD_MS).toISOString(), SWEEP_BATCH);
    for (const f of stale) {
      if (await filesRepo.markStale(env.DB, f.id) && f.upload_id) await env.MEDIA.resumeMultipartUpload(f.r2_key, f.upload_id).abort().catch(() => {});
    }
    const left = await filesRepo.leftovers(env.DB, new Date(Date.now() - KEEP_REMOVED_MS).toISOString(), SWEEP_BATCH);
    for (const f of left) if (await env.MEDIA.delete(f.r2_key).then(() => true, () => false)) await filesRepo.emptied(env.DB, f.id);
    if (stale.length || left.length) await audit(env.DB, null, "Cleared stored files", "", `${stale.length} unfinished upload${stale.length === 1 ? "" : "s"} aborted, ${left.length} removed file${left.length === 1 ? "" : "s"} deleted`);
  },
};
