import { EXTENSIONS, MAX_FILE_SIZE, PART_SIZE, partCount, partLength } from "../../worker/lib/files";
import { api, ApiError } from "./api";

export { MAX_FILE_SIZE, PART_SIZE };
export const PARALLEL_PARTS = 3;
export const PART_RETRIES = 3;

export interface PortalFile {
  id: string; booking_id: string; direction: "delivery" | "upload"; title: string; name: string; size: number; content_type: string; version: number; note: string;
  delivered_at: string | null; created_at: string; released: boolean; locked: boolean; downloads: number; first_downloaded_at: string | null; group?: string | null; latest?: boolean;
}

export function fmtBytes(n: number) {
  if (!Number.isFinite(n) || n < 0) return "0 B";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024, i = 0;
  while (v >= 1000 && i < units.length - 1) { v /= 1024; i++; }
  return `${v >= 100 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, "")} ${units[i]}`;
}

export const extOf = (name: string) => { const m = /\.([A-Za-z0-9]{1,10})$/.exec(name); return m ? m[1].toLowerCase() : ""; };
export const titleOf = (name: string) => name.replace(/\.[A-Za-z0-9]{1,10}$/, "").replace(/\s+/g, " ").trim() || "File";
export const isAudioFile = (f: { content_type: string; name: string }) => f.content_type.startsWith("audio/");

export const ALLOWED_TEXT = "audio (wav, mp3, flac, aiff, m4a), video, images, documents, zip and other archives, and DAW project files";

/** Why a file is refused before any request is made, or null when it can go. */
export function checkFile(name: string, size: number): string | null {
  if (size === 0) return `${name} is empty (0 bytes), so it was skipped.`;
  if (size > MAX_FILE_SIZE) return `${name} is ${fmtBytes(size)}. Files can be up to 1 GB, so zip or split it first.`;
  if (!EXTENSIONS[extOf(name)]) return `${name} was not sent: that file type is not accepted. You can send ${ALLOWED_TEXT}.`;
  return null;
}

export const planParts = (size: number) => Array.from({ length: partCount(size) }, (_, i) => ({ n: i + 1, start: i * PART_SIZE, end: i * PART_SIZE + partLength(size, i + 1) }));

/** Whole percent, never 100 until the server has confirmed the finished file. */
export function percent(loaded: number, size: number, finished = false) {
  if (finished) return 100;
  if (size <= 0) return 0;
  return Math.max(0, Math.min(99, Math.floor((loaded / size) * 100)));
}

export const backoffMs = (attempt: number) => Math.min(8000, 600 * 2 ** attempt);

/** 4xx answers other than "slow down" will not change by asking again. */
export const retryable = (status: number) => status === 0 || status === 408 || status === 425 || status === 429 || status >= 500;

export type FailKind = "offline" | "expired" | "storage" | "busy" | "other";
export class UploadError extends Error {
  constructor(message: string, public kind: FailKind, public retriable: boolean) { super(message); }
}

export function explain(status: number, code: string, fallback: string): UploadError {
  if (status === 0) return new UploadError("The connection dropped. Reconnect and press Try again: the upload carries on from where it stopped.", "offline", true);
  if (status === 401 || code === "unauthorized") return new UploadError("You were signed out. Sign in again, then press Try again.", "expired", false);
  if (code === "storage_unavailable") return new UploadError("File uploads are not switched on yet. Please contact the studio.", "storage", false);
  if (status === 429 || status >= 500) return new UploadError("The studio server is busy. Wait a moment and press Try again: nothing was lost.", "busy", true);
  return new UploadError(fallback, "other", false);
}

export interface Job {
  file: File;
  id?: string;
  parts: number;
  done: Set<number>;
  inflight: Map<number, number>;
}
export const newJob = (file: File): Job => ({ file, parts: partCount(file.size), done: new Set(), inflight: new Map() });
export const loadedBytes = (j: Job) => {
  let n = 0;
  for (const p of j.done) n += partLength(j.file.size, p);
  for (const v of j.inflight.values()) n += v;
  return n;
};

const wait = (ms: number, signal: AbortSignal) => new Promise<void>((res, rej) => {
  const t = setTimeout(res, ms);
  signal.addEventListener("abort", () => { clearTimeout(t); rej(new DOMException("Aborted", "AbortError")); }, { once: true });
});

function putPart(url: string, body: Blob, signal: AbortSignal, onProgress: (loaded: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("PUT", url);
    x.withCredentials = true;
    x.upload.onprogress = (e) => onProgress(e.loaded);
    x.onload = () => {
      if (x.status >= 200 && x.status < 300) return resolve();
      let data: any = {};
      try { data = JSON.parse(x.responseText); } catch { /* not json */ }
      reject(Object.assign(new Error(data.error ?? "Something went wrong."), { status: x.status, code: data.code ?? "error" }));
    };
    x.onerror = x.ontimeout = () => reject(Object.assign(new Error("offline"), { status: 0, code: "offline" }));
    const stop = () => x.abort();
    x.onabort = () => reject(new DOMException("Aborted", "AbortError"));
    if (signal.aborted) return reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", stop, { once: true });
    x.send(body);
  });
}

const aborted = (e: unknown) => e instanceof DOMException && e.name === "AbortError";
const statusOf = (e: any) => (e instanceof ApiError ? e.status : typeof e?.status === "number" ? e.status : 0);
const codeOf = (e: any) => (e instanceof ApiError ? e.code : e?.code ?? "error");

async function withRetry<T>(run: () => Promise<T>, signal: AbortSignal): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await run(); } catch (e: any) {
      if (aborted(e)) throw e;
      const status = statusOf(e);
      if (!retryable(status) || attempt >= PART_RETRIES) throw explain(status, codeOf(e), e.message);
      await wait(backoffMs(attempt), signal);
    }
  }
}

/**
 * Sends one file in 8 MiB parts, three at a time. Parts that already arrived are kept on the job,
 * so calling this again after a failure carries on from the parts still missing.
 */
export async function uploadFile(base: string, bookingId: string, job: Job, signal: AbortSignal, onProgress: () => void): Promise<PortalFile> {
  const { file } = job;
  if (!job.id) {
    const begun = await withRetry(() => api<{ id: string; parts: number }>(`${base}/bookings/${bookingId}/files`, { body: { name: file.name, size: file.size } }), signal);
    job.id = begun.id;
    job.parts = begun.parts;
  }
  const todo = planParts(file.size).filter((p) => !job.done.has(p.n));
  let next = 0, failure: unknown = null;
  const lane = async () => {
    while (!failure) {
      const p = todo[next++];
      if (!p) return;
      try {
        await withRetry(() => putPart(`/api${base}/files/${job.id}/parts/${p.n}`, file.slice(p.start, p.end), signal, (l) => { job.inflight.set(p.n, l); onProgress(); }).finally(() => job.inflight.delete(p.n)), signal);
        job.done.add(p.n);
        onProgress();
      } catch (e) { failure ??= e; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL_PARTS, todo.length) }, lane));
  if (failure) throw failure;
  return withRetry(() => api<PortalFile>(`${base}/files/${job.id}/complete`, { body: {} }), signal);
}

export const dueLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

export interface StateLine { text: string; sub?: string; tone: "" | "success" | "warning" }

/** Where the job is, in one sentence. Null when the booking has no job yet (waiting for approval or payment, cancelled). */
export function stateLine(
  b: { status: string; scheduling: string; date: string; due_date: string | null; balance_kobo: number },
  c: { deliveries: Pick<PortalFile, "locked">[]; uploads: unknown[] },
  r: { final: boolean; open: unknown | null },
  today: string,
): StateLine | null {
  if (!["confirmed", "completed"].includes(b.status)) return null;
  if (r.final) return { text: "Approved and finished", sub: "Your files stay here to download.", tone: "success" };
  if (r.open) return { text: "Revision requested, the studio is on it", sub: "The updated version appears here when it is ready.", tone: "warning" };
  if (c.deliveries.length) {
    return c.deliveries.some((f) => !f.locked)
      ? { text: "Delivered, take a look", sub: "Download it, then approve it or ask for a revision.", tone: "success" }
      : { text: "Delivered, your files are waiting", sub: "Pay the balance to open them.", tone: "warning" };
  }
  const due = b.due_date ? `, due ${dueLabel(b.due_date)}` : "";
  if (b.scheduling === "project") {
    return c.uploads.length
      ? { text: `In production${due}`, sub: "You can keep adding files below.", tone: "" }
      : { text: "Waiting for your files", sub: "Upload your stems, references or lyrics so the studio can start.", tone: "warning" };
  }
  return b.date >= today ? { text: `Session on ${dueLabel(b.date)}`, sub: "Finished work is delivered here after the session.", tone: "" } : { text: `In production${due}`, sub: "Finished work is delivered here.", tone: "" };
}

export const discardUpload = (base: string, id: string) => api(`${base}/files/${id}`, { method: "DELETE" }).catch(() => {});

export const downloadUrl = (base: string, id: string, inline = false) => `/api${base}/files/${id}/download${inline ? "?inline=1" : ""}`;

export { aborted as isAbort };
