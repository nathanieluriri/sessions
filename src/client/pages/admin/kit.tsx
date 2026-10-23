import { useEffect, useState, type ReactNode } from "react";
import { Area, Btn, Field, Loading, Modal, Tag, toast } from "../../components/ui";
import { HoldToConfirm } from "../../components/kitchen";
import { Icon } from "../../components/brand";
import { api } from "../../lib/api";

export function useApi<T = any>(path: string | null) {
  const [d, setD] = useState<T | null>(null);
  const load = () => { if (path) api<T>(path).then(setD).catch((e) => toast(e.message)); };
  useEffect(load, [path]); // eslint-disable-line
  return [d, load] as const;
}

export async function act(fn: () => Promise<unknown>, ok: string, done?: () => void) {
  try { await fn(); toast(ok); done?.(); } catch (e: any) { toast(e.message); }
}

/** Resizes photos in the browser before upload so stored images stay small and fast. */
async function shrink(file: File, max = 2000): Promise<Blob> {
  if (file.type === "image/gif" || !("createImageBitmap" in window)) return file;
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const type = file.type === "image/png" ? "image/png" : "image/jpeg";
  return new Promise((res) => canvas.toBlob((b) => res(b ?? file), type, 0.84));
}

export function ImageField({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  const [busy, setBusy] = useState(false);
  const upload = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const blob = await shrink(file);
      const fd = new FormData();
      fd.append("file", new File([blob], file.name, { type: blob.type || file.type }));
      const res = await fetch("/api/admin/uploads", { method: "POST", body: fd, credentials: "same-origin" });
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Upload failed.");
      onChange(data.url);
      toast("Image uploaded");
    } catch (e: any) { toast(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="field">
      <label>{label}</label>
      <div className="row gap8 imagefield">
        {value ? <img src={value} alt="" className="thumb" /> : <span className="thumb empty"><Icon name="image" size={18} /></span>}
        <input className="input grow" value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://… or upload" />
        <label className={`uploadbtn ${busy ? "busy" : ""}`}><Icon name="upload" size={16} />{busy ? "Uploading" : "Upload"}<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden disabled={busy} onChange={(e) => upload(e.target.files?.[0])} /></label>
      </div>
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export interface FieldDef {
  key: string; label: string; type?: "text" | "textarea" | "number" | "money" | "bool" | "image" | "list" | "select" | "date" | "time"; options?: [string, string][]; hint?: string; rows?: number;
  numeric?: boolean; nextDay?: boolean;
}

/** Hours and minutes for a time of day stored as minutes; with `nextDay` a tick adds 1440 so 23:00 to 05:00 can be entered. */
function TimeField({ f, value, onChange }: { f: FieldDef; value: number; onChange: (v: number) => void }) {
  const next = !!f.nextDay && value >= 1440, m = value % 1440;
  const hh = String(Math.floor(m / 60)).padStart(2, "0"), mm = String(m % 60).padStart(2, "0");
  const set = (time: string, plus: boolean) => { const [h, n] = time.split(":").map(Number); if (!Number.isNaN(h) && !Number.isNaN(n)) onChange(h * 60 + n + (plus ? 1440 : 0)); };
  return (
    <div className="field"><label htmlFor={f.key}>{f.label}</label>
      <input id={f.key} className="input" type="time" value={`${hh}:${mm}`} onChange={(e) => set(e.target.value, next)} />
      {f.nextDay && <label className="row gap8 small"><input type="checkbox" checked={next} onChange={(e) => set(`${hh}:${mm}`, e.target.checked)} /> Ends the next day</label>}
      {f.hint && <span className="hint">{f.hint}</span>}
    </div>
  );
}

export function FormFields({ fields, value, onChange }: { fields: FieldDef[]; value: Record<string, any>; onChange: (v: Record<string, any>) => void }) {
  const set = (k: string, v: unknown) => onChange({ ...value, [k]: v });
  return <>{fields.map((f) => {
    const v = value[f.key];
    switch (f.type) {
      case "textarea": return <Area key={f.key} label={f.label} name={f.key} rows={f.rows ?? 3} value={v ?? ""} onChange={(e) => set(f.key, e.target.value)} />;
      case "number": return <Field key={f.key} label={f.label} name={f.key} type="number" hint={f.hint} value={v ?? 0} onChange={(e) => set(f.key, Number(e.target.value))} />;
      case "money": return <Field key={f.key} label={f.label} name={f.key} type="number" hint={f.hint} value={(v ?? 0) / 100} onChange={(e) => set(f.key, Math.round(Number(e.target.value) * 100))} />;
      case "bool": return <label key={f.key} className="row gap8 small"><input type="checkbox" checked={!!v} onChange={(e) => set(f.key, e.target.checked ? 1 : 0)} /> {f.label}</label>;
      case "image": return <ImageField key={f.key} label={f.label} hint={f.hint} value={v ?? ""} onChange={(x) => set(f.key, x)} />;
      case "list": return <Area key={f.key} label={`${f.label} (one per line)`} name={f.key} rows={f.rows ?? 3} value={(v ?? []).join("\n")} onChange={(e) => set(f.key, e.target.value.split("\n").map((x) => x.trimStart()).filter(Boolean))} />;
      case "date": return <Field key={f.key} label={f.label} name={f.key} type="date" hint={f.hint} value={v ?? ""} onChange={(e) => set(f.key, e.target.value || null)} />;
      case "time": return <TimeField key={f.key} f={f} value={v ?? 0} onChange={(x) => set(f.key, x)} />;
      case "select": return (
        <div key={f.key} className="field"><label htmlFor={f.key}>{f.label}</label>
          <select id={f.key} className="select" value={v ?? ""} onChange={(e) => set(f.key, e.target.value === "" ? null : f.numeric ? Number(e.target.value) : e.target.value)}>{f.options!.map(([o, l]) => <option key={o} value={o}>{l}</option>)}</select>
          {f.hint && <span className="hint">{f.hint}</span>}
        </div>
      );
      default: return <Field key={f.key} label={f.label} name={f.key} hint={f.hint} value={v ?? ""} onChange={(e) => set(f.key, e.target.value)} />;
    }
  })}</>;
}

/** List, add, edit and remove rows of a content collection. */
export function CollectionEditor({ name, noun, fields, blank, row, intro, sortable = true, check }: {
  name: string; noun: string; fields: FieldDef[]; blank: Record<string, any>; row: (r: any) => ReactNode; intro?: ReactNode; sortable?: boolean; check?: (e: Record<string, any>) => string | null;
}) {
  const [list, load] = useApi<any[]>(`/admin/collections/${name}`);
  const [edit, setEdit] = useState<Record<string, any> | null>(null);
  const keyOf = (r: any) => r.id ?? r.slug ?? r.path;
  if (!list) return <Loading />;
  const payload = (e: Record<string, any>) => Object.fromEntries([...fields.map((f) => f.key), ...(sortable ? ["sort"] : [])].map((k) => [k, e[k] ?? (k === "sort" ? 0 : blank[k])]));
  const save = () => {
    const key = edit!.__key;
    const problem = check?.(edit!);
    if (problem) return toast(problem);
    act(() => api(`/admin/collections/${name}${key ? `/${encodeURIComponent(key)}` : ""}`, { method: key ? "PUT" : "POST", body: payload(edit!) }), `${noun[0].toUpperCase()}${noun.slice(1)} saved`, () => { setEdit(null); load(); });
  };
  return <>
    <div className="row between wrapflex gap12">{intro ?? <span />}<Btn size="sm" onClick={() => setEdit({ ...blank, sort: 0 })}><Icon name="plus" size={16} /> Add {noun}</Btn></div>
    {list.length === 0 ? <div className="panel muted">Nothing here yet.</div> : (
      <div className="stack gap8">{list.map((r) => (
        <div key={keyOf(r)} className="card row between gap12 crow">
          <div className="grow">{row(r)}</div>
          <div className="row gap8">{"published" in r && !r.published && <Tag>Hidden</Tag>}{"active" in r && !r.active && <Tag>Hidden</Tag>}<button className="link small" onClick={() => setEdit({ ...r, __key: keyOf(r) })}>Edit</button></div>
        </div>
      ))}</div>
    )}
    {edit && (
      <Modal title={edit.__key ? `Edit ${noun}` : `Add ${noun}`} onClose={() => setEdit(null)}>
        <FormFields fields={fields} value={edit} onChange={setEdit} />
        {sortable && <Field label="Order" name="sort" type="number" hint="Lower numbers show first." value={edit.sort ?? 0} onChange={(e) => setEdit({ ...edit, sort: Number(e.target.value) })} />}
        <div className="row gap8 wrapflex">
          <Btn onClick={save}>Save {noun}</Btn>
          {edit.__key && <HoldToConfirm confirmed="Removed" onConfirm={() => act(() => api(`/admin/collections/${name}/${encodeURIComponent(edit.__key)}`, { method: "DELETE" }), `${noun[0].toUpperCase()}${noun.slice(1)} removed`, () => { setEdit(null); load(); })}>Hold to remove</HoldToConfirm>}
        </div>
      </Modal>
    )}
  </>;
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: [T, string][] }) {
  return <div className="admintabs">{tabs.map(([k, l]) => <button key={k} className={value === k ? "on" : ""} onClick={() => onChange(k)}>{l}</button>)}</div>;
}
