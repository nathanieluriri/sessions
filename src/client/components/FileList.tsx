import { useState } from "react";
import { TactileAnchor, TactileLink, Tactile } from "./kitchen";
import { Icon } from "./brand";
import { Tag, toast } from "./ui";
import { api } from "../lib/api";
import { dateTime, naira } from "../lib/format";
import { downloadUrl, fmtBytes, isAudioFile, type PortalFile } from "../lib/files";

export const DownIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11m0 0-4-4m4 4 4-4M4 17v3h16v-3" /></svg>
);

const groupKey = (f: PortalFile) => f.group ?? f.title.trim().toLowerCase();

/** Newest version of each title first, with older versions behind it. */
export function versions(files: PortalFile[]) {
  const by = new Map<string, PortalFile[]>();
  for (const f of files) by.set(groupKey(f), [...(by.get(groupKey(f)) ?? []), f]);
  const out = [...by.values()].map((g) => g.sort((a, b) => b.version - a.version || (b.delivered_at ?? "").localeCompare(a.delivered_at ?? "")));
  return out.sort((a, b) => (b[0].delivered_at ?? "").localeCompare(a[0].delivered_at ?? ""));
}

export function Listen({ f }: { f: PortalFile }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Tactile variant="light" size="md" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={`${open ? "Hide player for" : "Listen to"} ${f.title}`}><Icon name="play" size={16} /> {open ? "Hide" : "Listen"}</Tactile>
      {open && <audio className="player" controls autoPlay preload="none" src={downloadUrl("/account", f.id, true)} aria-label={`Preview of ${f.title}`} />}
    </>
  );
}

export function DeliveryRow({ f, onOpened, old }: { f: PortalFile; onOpened?: () => void; old?: boolean }) {
  const fresh = !f.first_downloaded_at && !old;
  return (
    <div className={`dlrow ${old ? "old" : ""}`}>
      <div className="dlmain">
        <span className="dlicon" aria-hidden="true"><Icon name="music" size={20} /></span>
        <div className="grow">
          <div className="row gap8 wrapflex"><b className="dltitle">{f.title}</b>{f.version > 1 && <Tag tone="brand">v{f.version}</Tag>}{fresh && <Tag tone="success">New</Tag>}</div>
          <div className="caption">{fmtBytes(f.size)}{f.delivered_at ? ` · Delivered ${dateTime(f.delivered_at)}` : ""}</div>
          {f.note && !old && <div className="small muted dlnote">{f.note}</div>}
        </div>
      </div>
      <div className="dlactions">
        {isAudioFile(f) && <Listen f={f} />}
        <TactileAnchor variant={old ? "light" : "neon"} size={old ? "md" : "lg"} href={downloadUrl("/account", f.id)} download={f.name} onClick={() => onOpened && setTimeout(onOpened, 2500)} aria-label={`Download ${f.title}`}><DownIcon /> Download</TactileAnchor>
      </div>
    </div>
  );
}

/** Locked files show the title and what unlocks them, never a link. */
export function LockedBlock({ bookingId, balance, files }: { bookingId: string; balance: number; files: PortalFile[] }) {
  return (
    <div className="lockblock" role="group" aria-label="Locked files">
      <div className="row gap12" style={{ alignItems: "flex-start" }}>
        <span className="dlicon lock" aria-hidden="true"><Icon name="lock" size={20} /></span>
        <div className="grow stack gap4">
          <b>Pay {naira(balance)} to unlock your files</b>
          <span className="small muted">The studio has finished {files.length === 1 ? "this file" : `these ${files.length} files`}. They open as soon as your balance is paid.</span>
          <ul className="lockfiles">{files.map((f) => <li key={f.id}><Icon name="lock" size={14} /> <span>{f.title}</span>{f.version > 1 && <Tag tone="brand">v{f.version}</Tag>}<span className="caption">{fmtBytes(f.size)}</span></li>)}</ul>
        </div>
      </div>
      <TactileLink to={`/pay/${bookingId}`} size="lg" block>Pay now <Icon name="arrow" size={18} /></TactileLink>
    </div>
  );
}

/** Delivered work for one booking: unlocked files with Download, locked ones behind a single pay prompt, earlier versions folded away. */
export function Deliveries({ bookingId, balance, files, onOpened, limit }: { bookingId: string; balance: number; files: PortalFile[]; onOpened?: () => void; limit?: number }) {
  const groups = versions(files);
  const open = groups.filter((g) => !g[0].locked);
  const locked = groups.filter((g) => g[0].locked).map((g) => g[0]);
  const shown = limit ? open.slice(0, limit) : open;
  return (
    <div className="stack gap12">
      {shown.map((g) => (
        <div key={g[0].id} className="stack gap8">
          <DeliveryRow f={g[0]} onOpened={onOpened} />
          {g.length > 1 && <details className="olderv"><summary>Earlier versions ({g.length - 1})</summary><div className="stack gap8">{g.slice(1).map((o) => (o.locked ? <div key={o.id} className="small muted">v{o.version} is locked until the balance is paid.</div> : <DeliveryRow key={o.id} f={o} old onOpened={onOpened} />))}</div></details>}
        </div>
      ))}
      {limit && open.length > limit && <span className="small muted">and {open.length - limit} more in your files.</span>}
      {locked.length > 0 && <LockedBlock bookingId={bookingId} balance={balance} files={locked} />}
    </div>
  );
}

/** The artist's own uploads, with remove. */
export function UploadsList({ files, canRemove, onChanged }: { files: PortalFile[]; canRemove: boolean; onChanged: () => void }) {
  const [asking, setAsking] = useState<string | null>(null);
  const remove = async (f: PortalFile) => {
    try { await api(`/account/files/${f.id}`, { method: "DELETE" }); toast("File removed"); setAsking(null); onChanged(); } catch (e: any) { toast(e.message); }
  };
  if (!files.length) return <span className="small muted">Nothing uploaded yet.</span>;
  return (
    <div className="stack gap8">
      {files.map((f) => (
        <div key={f.id} className="uprow">
          <div className="grow" style={{ minWidth: 0 }}>
            <b className="small upname">{f.name}</b>
            <div className="caption">{fmtBytes(f.size)} · Sent {dateTime(f.created_at)}</div>
          </div>
          <Tag tone={f.first_downloaded_at ? "success" : ""}>{f.first_downloaded_at ? "Studio has it" : "Sent"}</Tag>
          {canRemove && (asking === f.id
            ? <span className="row gap8"><button type="button" className="linkbtn danger" onClick={() => remove(f)}>Yes, remove</button><button type="button" className="linkbtn" onClick={() => setAsking(null)}>Keep</button></span>
            : <button type="button" className="linkbtn" onClick={() => setAsking(f.id)} aria-label={`Remove ${f.name}`}>Remove</button>)}
        </div>
      ))}
    </div>
  );
}
