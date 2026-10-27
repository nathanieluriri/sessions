import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { Icon } from "./brand";
import { Tactile } from "./kitchen";
import { ApiError, api } from "../lib/api";
import { checkFile, discardUpload, fmtBytes, isAbort, loadedBytes, newJob, percent, uploadFile, UploadError, type Job, type PortalFile } from "../lib/files";

type State = "queued" | "uploading" | "failed" | "done";
interface Item { key: number; name: string; size: number; state: State; loaded: number; error: string | null; kind?: string }

let seq = 0;

/** Queue of chunked uploads for one booking. Files go one after another, three parts at a time, and a failed file resumes from its missing parts. */
export function useUploads(base: string, bookingId: string, onUploaded: (f: PortalFile) => void | Promise<void>, onSettled?: (done: PortalFile[]) => void) {
  const [items, setItems] = useState<Item[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const jobs = useRef(new Map<number, { job: Job; ctl: AbortController | null }>());
  const order = useRef<number[]>([]);
  const running = useRef(false);
  const batch = useRef<PortalFile[]>([]);
  const cb = useRef({ onUploaded, onSettled });
  cb.current = { onUploaded, onSettled };

  const patch = useCallback((key: number, p: Partial<Item>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x))), []);
  const drop = useCallback((key: number) => { jobs.current.delete(key); order.current = order.current.filter((k) => k !== key); setItems((xs) => xs.filter((x) => x.key !== key)); }, []);

  const pump = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    while (order.current.length) {
      const key = order.current.shift()!;
      const entry = jobs.current.get(key);
      if (!entry) continue;
      const ctl = new AbortController();
      entry.ctl = ctl;
      patch(key, { state: "uploading", error: null, loaded: loadedBytes(entry.job) });
      try {
        const f = await uploadFile(base, bookingId, entry.job, ctl.signal, () => patch(key, { loaded: loadedBytes(entry.job) }));
        batch.current.push(f);
        await cb.current.onUploaded(f);
        drop(key);
      } catch (e: any) {
        if (isAbort(e)) { drop(key); continue; }
        const err = e instanceof UploadError ? e : new UploadError(e instanceof ApiError ? e.message : "The upload stopped. Press Try again.", "other", false);
        patch(key, { state: "failed", error: err.message, kind: err.kind });
      } finally { entry.ctl = null; }
    }
    running.current = false;
    if (batch.current.length && !order.current.length) {
      const done = batch.current;
      batch.current = [];
      cb.current.onSettled?.(done);
    }
  }, [base, bookingId, drop, patch]);

  const add = useCallback((files: File[]) => {
    const skipped: string[] = [];
    const fresh: Item[] = [];
    for (const file of files) {
      const why = checkFile(file.name, file.size);
      if (why) { skipped.push(why); continue; }
      const key = ++seq;
      jobs.current.set(key, { job: newJob(file), ctl: null });
      order.current.push(key);
      fresh.push({ key, name: file.name, size: file.size, state: "queued", loaded: 0, error: null });
    }
    setNotes(skipped);
    if (fresh.length) { setItems((xs) => [...xs, ...fresh]); void pump(); }
  }, [pump]);

  const retry = useCallback((key: number) => {
    if (!jobs.current.has(key) || order.current.includes(key)) return;
    patch(key, { state: "queued", error: null });
    order.current.push(key);
    void pump();
  }, [patch, pump]);

  const cancel = useCallback((key: number) => {
    const entry = jobs.current.get(key);
    if (!entry) return;
    const id = entry.job.id;
    if (entry.ctl) entry.ctl.abort(); else drop(key);
    if (id) void discardUpload(base, id);
  }, [base, drop]);

  const busy = items.some((x) => x.state === "queued" || x.state === "uploading");
  useEffect(() => {
    if (!busy) return;
    const guard = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [busy]);

  useEffect(() => {
    const back = () => items.filter((x) => x.state === "failed" && x.kind === "offline").forEach((x) => retry(x.key));
    window.addEventListener("online", back);
    return () => window.removeEventListener("online", back);
  }, [items, retry]);

  useEffect(() => () => { for (const e of jobs.current.values()) e.ctl?.abort(); }, []);

  return { items, notes, busy, add, retry, cancel, dismiss: drop };
}

export function Dropzone({ onFiles, disabled, title = "Drop your files here", hint, cta = "Choose files", multiple = true }: { onFiles: (f: File[]) => void; disabled?: boolean; title?: string; hint?: string; cta?: string; multiple?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const drop = (e: DragEvent) => { e.preventDefault(); setOver(false); if (!disabled) onFiles(Array.from(e.dataTransfer.files)); };
  return (
    <div className={`dropzone ${over ? "over" : ""} ${disabled ? "off" : ""}`} onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}>
      <input ref={input} type="file" multiple={multiple} hidden tabIndex={-1} aria-hidden="true" onChange={(e) => { onFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
      <button type="button" className="dz-btn" disabled={disabled} onClick={() => input.current?.click()}>
        <span className="dz-icon" aria-hidden="true"><Icon name="upload" size={26} /></span>
        <b className="dz-title">{title}</b>
        {hint && <span className="dz-hint">{hint}</span>}
        <span className="tactile t-neon t-lg dz-cta" aria-hidden="true"><span className="tb" /><span className="tf">{cta}</span></span>
      </button>
    </div>
  );
}

export function UploadQueue({ items, notes, onRetry, onCancel, onDismiss }: { items: Item[]; notes: string[]; onRetry: (k: number) => void; onCancel: (k: number) => void; onDismiss: (k: number) => void }) {
  if (!items.length && !notes.length) return null;
  return (
    <div className="stack gap8" aria-live="polite">
      {notes.map((n) => <div key={n} className="error" role="alert">{n}</div>)}
      {items.map((x) => {
        const pct = percent(x.loaded, x.size);
        const failed = x.state === "failed";
        return (
          <div key={x.key} className={`upitem ${failed ? "failed" : ""}`}>
            <div className="row between gap12">
              <div className="grow"><b className="small upname">{x.name}</b><div className="caption">{fmtBytes(x.size)} · {x.state === "queued" ? "Waiting" : failed ? "Stopped" : `${pct}%`}</div></div>
              <div className="row gap8">
                {failed && <Tactile variant="neon" size="md" onClick={() => onRetry(x.key)}>Try again</Tactile>}
                <button type="button" className="linkbtn" onClick={() => (failed ? onDismiss(x.key) : onCancel(x.key))} aria-label={`${failed ? "Remove" : "Cancel"} ${x.name}`}>{failed ? "Remove" : "Cancel"}</button>
              </div>
            </div>
            <div className="pbar" role="progressbar" aria-label={`Uploading ${x.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={failed ? pct : x.state === "queued" ? 0 : pct}><i style={{ width: `${pct}%` }} /></div>
            {x.error && <div className="uperr" role="alert">{x.error}</div>}
          </div>
        );
      })}
    </div>
  );
}

/** The client side: one drop area, the queue, and a single notice to the studio once a batch has finished. */
export function ClientUploader({ bookingId, onChanged, disabled }: { bookingId: string; onChanged: () => void | Promise<void>; disabled?: boolean }) {
  const [sent, setSent] = useState<string | null>(null);
  const notify = async (done: PortalFile[]) => {
    try {
      await api(`/account/bookings/${bookingId}/files/notify`, { body: { fileIds: done.map((f) => f.id) } });
      setSent("Sent to the studio. They will download your files from this booking.");
    } catch (e: any) {
      setSent(e instanceof ApiError && e.status === 429 ? "Uploaded. The studio was told about your last batch a moment ago, and these files are on your booking for them." : "Uploaded and saved on your booking. We could not ping the studio just now, so tell them if it is urgent.");
    }
  };
  const up = useUploads("/account", bookingId, async () => { await onChanged(); }, notify);
  const add = (files: File[]) => { setSent(null); up.add(files); };
  return (
    <div className="stack gap12">
      <Dropzone onFiles={add} disabled={disabled} hint="Stems, references, lyrics, artwork. Up to 1 GB each." />
      <UploadQueue items={up.items} notes={up.notes} onRetry={up.retry} onCancel={up.cancel} onDismiss={up.dismiss} />
      {sent && !up.busy && <div className="sent" role="status"><Icon name="check" size={18} /> {sent}</div>}
    </div>
  );
}
