export const PART_SIZE = 8 * 1024 * 1024;
export const MAX_FILE_SIZE = 1024 * 1024 * 1024;

/** Per booking: files that are not removed, bytes declared, and uploads in flight. */
export const LIMITS = {
  upload: { files: 100, bytes: 10 * MAX_FILE_SIZE },
  delivery: { files: 200, bytes: 20 * MAX_FILE_SIZE },
  active: 20,
};

/** A fully delivered, paid order with no open revision completes by itself after this many days. */
export const AUTO_COMPLETE_DAYS = 7;

export const UPLOAD_STATUSES = ["pending", "approved", "confirmed", "completed"];
export const DELIVER_STATUSES = ["confirmed", "completed"];

const group = (type: string, exts: string) => Object.fromEntries(exts.split(" ").map((e) => [e, type]));

/** Allowed extensions and the content type each one is served as. The browser's own type is never used. */
export const EXTENSIONS: Record<string, string> = {
  ...group("audio/wav", "wav wave"), mp3: "audio/mpeg", flac: "audio/flac", ...group("audio/aiff", "aif aiff"), m4a: "audio/mp4", aac: "audio/aac",
  ...group("audio/ogg", "ogg oga opus"), wma: "audio/x-ms-wma", caf: "audio/x-caf", ...group("audio/midi", "mid midi"),
  mp4: "video/mp4", mov: "video/quicktime", m4v: "video/x-m4v", avi: "video/x-msvideo", mkv: "video/x-matroska", webm: "video/webm",
  zip: "application/zip", rar: "application/vnd.rar", "7z": "application/x-7z-compressed", tar: "application/x-tar", ...group("application/gzip", "gz tgz"),
  pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", txt: "text/plain",
  rtf: "application/rtf", odt: "application/vnd.oasis.opendocument.text", xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", csv: "text/csv", ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ...group("image/jpeg", "jpg jpeg"), png: "image/png", webp: "image/webp", gif: "image/gif", heic: "image/heic", ...group("image/tiff", "tif tiff"),
  psd: "image/vnd.adobe.photoshop", ai: "application/postscript", eps: "application/postscript",
  ...group("application/octet-stream", "ptx ptf als flp cpr rpp song aup3 sesx bwproject"),
};

const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;
const INVISIBLE = /[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff\ufff9-\ufffb]/g;
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;
const NOT_IN_NAMES = /[<>:"|?*]/g;

const clip = (s: string, max: number) => (s.length <= max ? s : Array.from(s).slice(0, max).join(""));

/** Single line text: no control characters, direction overrides or lone surrogates, collapsed spaces. */
export const cleanText = (raw: string, max: number) => clip(raw.normalize("NFC").replace(LONE_SURROGATE, "\ufffd").replace(INVISIBLE, "").replace(CONTROL, " ").replace(/\s+/g, " ").trim(), max);

/** Free text that may span lines (notes): each line is cleaned like cleanText and the line breaks stay. */
export const cleanNote = (raw: string, max: number) =>
  clip(raw.replace(/\r\n?|[\u2028\u2029]/g, "\n").split("\n").map((l) => cleanText(l, max)).join("\n").replace(/\n{3,}/g, "\n\n").trim(), max);

export function extensionOf(name: string) {
  const m = /\.([A-Za-z0-9]{1,10})$/.exec(name);
  return m ? m[1].toLowerCase() : "";
}

/** A name that is safe to store, show and put in a header: no path, no control characters, no lone dots, at most 200 characters, extension kept. */
export function cleanName(raw: string, max = 200) {
  let s = (raw.split(/[\\/]/).pop() ?? "").normalize("NFC").replace(LONE_SURROGATE, "_").replace(INVISIBLE, "").replace(CONTROL, " ").replace(NOT_IN_NAMES, "_").replace(/\s+/g, " ").trim();
  s = s.replace(/^[. ]+/, "").replace(/[. ]+$/, "");
  const ext = extensionOf(s);
  if (Array.from(s).length > max) {
    const stem = ext ? s.slice(0, -(ext.length + 1)) : s;
    s = Array.from(stem).slice(0, max - (ext ? ext.length + 1 : 0)).join("").trimEnd() + (ext ? `.${ext}` : "");
  }
  return s;
}

export const contentTypeFor = (name: string) => EXTENSIONS[extensionOf(name)] ?? "application/octet-stream";
export const titleFromName = (name: string) => cleanText(name.replace(/\.[A-Za-z0-9]{1,10}$/, ""), 120) || "File";
export const isAudio = (type: string) => type.startsWith("audio/");

/** Attachment by default. The ASCII name is a fallback for old browsers, filename* carries the real name (RFC 5987). */
export function contentDisposition(name: string, inline = false) {
  const safe = cleanName(name) || "file";
  const ascii = safe.replace(/[^\x20-\x7e]/g, "_").replace(/["\\%;,]/g, "_");
  const star = encodeURIComponent(safe).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${star}`;
}

export const partCount = (size: number) => Math.max(1, Math.ceil(size / PART_SIZE));
/** R2 needs every part but the last to be the same size, so the server dictates the length of each one. */
export const partLength = (size: number, n: number) => (n < partCount(size) ? PART_SIZE : size - (partCount(size) - 1) * PART_SIZE);

export type ByteRange = { kind: "all" } | { kind: "range"; start: number; end: number } | { kind: "unsatisfiable" };

/** One byte range, as sent by audio players and download managers. Anything else is ignored and the whole file is served. */
export function parseRange(header: string | null | undefined, size: number): ByteRange {
  const m = /^bytes=(\d*)-(\d*)$/.exec((header ?? "").trim());
  if (!m || (!m[1] && !m[2])) return { kind: "all" };
  if (!m[1]) {
    const n = Number(m[2]);
    return n === 0 || size === 0 ? { kind: "unsatisfiable" } : { kind: "range", start: Math.max(0, size - n), end: size - 1 };
  }
  const start = Number(m[1]);
  if (start >= size) return { kind: "unsatisfiable" };
  const end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  return end < start ? { kind: "all" } : { kind: "range", start, end };
}

export interface DownloadCheck {
  /** The caller came through the staff routes and holds deliver_files. */
  staff: boolean;
  /** The caller owns the booking the file belongs to. */
  owner: boolean;
  direction: "delivery" | "upload";
  state: "uploading" | "ready" | "removed";
  delivered: boolean;
  released: boolean;
  balanceKobo: number;
}

/** The one rule behind every download, inline play and range request. "missing" is shown as a 404, "locked" as a 403. */
export function canDownload(c: DownloadCheck): "ok" | "locked" | "missing" {
  if (c.state !== "ready") return "missing";
  if (c.staff) return "ok";
  if (!c.owner) return "missing";
  if (c.direction === "upload") return "ok";
  if (!c.delivered) return "missing";
  return c.released || c.balanceKobo <= 0 ? "ok" : "locked";
}
