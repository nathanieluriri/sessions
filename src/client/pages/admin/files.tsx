import { useEffect, useState } from "react";
import { DownIcon, versions } from "../../components/FileList";
import { Dropzone, UploadQueue, useUploads } from "../../components/Uploader";
import { Area, Btn, ErrorBox, Field, Loading, Tag, toast } from "../../components/ui";
import { HoldToConfirm, TactileAnchor } from "../../components/kitchen";
import { api } from "../../lib/api";
import { can, type User } from "../../lib/auth";
import { dateTime, naira, shortDate } from "../../lib/format";
import { fmtBytes, titleOf, type PortalFile } from "../../lib/files";
import { isOwner } from "../../../shared/permissions";
import { useApi } from "./kit";

const dl = (id: string) => `/api/admin/files/${id}/download`;

interface Outcome { notified: boolean; reason?: string; final: boolean; count: number }

function Why({ o, copy }: { o: Outcome; copy: () => void }) {
  if (o.notified) return <div className="notice small" role="status">Delivered. The artist has been told.{o.final ? " The order is now complete." : ""}</div>;
  return (
    <div className="warnbox" role="alert">
      <b>Delivered, but the artist could not be told.</b>
      {o.reason === "send_failed"
        ? <span className="small"> The email provider refused the message. The files are on their portal, and the notice can be sent again from Resend notice below in a few minutes.</span>
        : <span className="small"> This booking has no account or email on it, so nobody was notified. Ask the front desk to add the client's email under Edit details, then press Resend notice, or send the client the portal link yourself.</span>}
      <div className="row gap8 wrapflex"><Btn size="sm" kind="neutral" onClick={copy}>Copy portal link</Btn></div>
    </div>
  );
}

function StagedRow({ f, title, onTitle, onRemove }: { f: PortalFile; title: string; onTitle: (v: string) => void; onRemove: () => void }) {
  return (
    <div className="stagedrow">
      <Field label="Title the artist sees" name={`t-${f.id}`} value={title} onChange={(e) => onTitle(e.target.value)} maxLength={120} />
      <div className="row between gap8 wrapflex"><span className="caption">{f.name} · {fmtBytes(f.size)}</span><button type="button" className="linkbtn" onClick={onRemove} aria-label={`Remove ${f.name}`}>Remove</button></div>
    </div>
  );
}

export function FilesPanel({ id, user, onChange }: { id: string; user: User | null; onChange: () => void }) {
  const [d, load] = useApi<any>(`/admin/bookings/${id}/files`);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [released, setReleased] = useState(false);
  const [final, setFinal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const refresh = async () => { load(); onChange(); };
  const stage = useUploads("/admin", id, async () => { load(); });
  useEffect(() => {
    if (!d) return;
    setTitles((t) => Object.fromEntries(d.deliveries.filter((f: PortalFile) => !f.delivered_at).map((f: PortalFile) => [f.id, t[f.id] ?? (f.title || titleOf(f.name))])));
  }, [d]);
  if (!d) return <Loading />;
  const b = d.booking, rev = d.revisions;
  const staged: PortalFile[] = d.deliveries.filter((f: PortalFile) => !f.delivered_at);
  const given: PortalFile[] = d.deliveries.filter((f: PortalFile) => f.delivered_at);
  const mayRelease = can(user, "record_payments");
  const due = b.balance_kobo > 0;
  const fresh: PortalFile[] = d.uploads;
  const untitled = staged.some((f) => !(titles[f.id] ?? "").trim());
  const portalLink = `${location.origin}/account`;

  const deliver = async () => {
    setBusy(true); setError(null); setOutcome(null);
    try {
      const r = await api(`/admin/bookings/${id}/deliver`, { body: { items: staged.map((f) => ({ fileId: f.id, title: (titles[f.id] ?? "").trim() })), note, released: released && due, final, resolvesRevision: true } });
      setOutcome({ notified: !!r.notified, reason: r.reason, final: !!r.final, count: r.delivered.length });
      setNote(""); setReleased(false); setFinal(false);
      refresh();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const act = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast(ok); setAsking(null); refresh(); } catch (e: any) { toast(e.message); } };
  const removeFile = (f: PortalFile) => act(() => api(`/admin/files/${f.id}`, { method: "DELETE" }), "File removed");
  const finish = async () => { try { await api(`/admin/bookings/${id}/finalize`, { method: "POST" }); toast("Job marked complete"); refresh(); } catch (e: any) { toast(e.message); setRound((n) => n + 1); } };
  const resend = () => act(async () => { const r = await api(`/admin/bookings/${id}/notify-delivery`, { method: "POST" }); if (!r.notified) throw new Error(r.reason === "no_contact" ? "Still no email or account on this booking, so nobody could be told." : "The email provider refused the message. Try again in a few minutes."); }, "Notice sent to the artist");
  const copy = async () => { await navigator.clipboard?.writeText(portalLink).catch(() => {}); toast("Portal link copied"); };

  return (
    <div className="stack gap20 filespanel">
      <div className="row gap8 wrapflex">
        {b.final ? <Tag tone="success">Finished</Tag> : rev.open ? <Tag tone="warning">Revision requested</Tag> : given.length ? <Tag>Delivered</Tag> : <Tag>In production</Tag>}
        {b.due_date && <Tag>Due {shortDate(b.due_date)}</Tag>}
        {due && <Tag tone="warning">{naira(b.balance_kobo)} balance due</Tag>}
        {rev.limit > 0 && <Tag>{rev.used} of {rev.limit} revisions used</Tag>}
        {!d.client.hasAccount && !d.client.hasEmail && <Tag tone="danger">No client email</Tag>}
      </div>

      {rev.open && (
        <div className="warnbox">
          <b>The artist asked for a revision · {dateTime(rev.open.created_at)}</b>
          <p className="revnote">{rev.open.note}</p>
          <span className="small">Upload the updated files below and press Deliver. That marks this request as done.</span>
        </div>
      )}

      <section className="stack gap12" aria-labelledby={`up-${id}`}>
        <h3 className="h4" id={`up-${id}`}>From the artist {fresh.length > 0 && <span className="caption">({fresh.length})</span>}</h3>
        {fresh.length === 0 ? <span className="small muted">The artist has not uploaded anything yet.</span> : fresh.map((f) => (
          <div key={f.id} className="uprow">
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="row gap8 wrapflex"><b className="small upname">{f.name}</b>{!f.first_downloaded_at && <Tag tone="success">New</Tag>}</div>
              <div className="caption">{fmtBytes(f.size)} · Sent by {b.artist_name} on {dateTime(f.created_at)}{f.first_downloaded_at ? ` · First downloaded ${dateTime(f.first_downloaded_at)}` : ""}</div>
            </div>
            <TactileAnchor variant="light" size="md" href={dl(f.id)} download={f.name} onClick={() => setTimeout(load, 2500)} aria-label={`Download ${f.name}`}><DownIcon /> Download</TactileAnchor>
            {asking === f.id
              ? <span className="row gap8"><button type="button" className="linkbtn danger" onClick={() => removeFile(f)}>Yes, remove</button><button type="button" className="linkbtn" onClick={() => setAsking(null)}>Keep</button></span>
              : <button type="button" className="linkbtn" onClick={() => setAsking(f.id)} aria-label={`Remove ${f.name}`}>Remove</button>}
          </div>
        ))}
      </section>

      {b.final ? (
        <div className="panel small">This job is finished. No more files can be delivered and revisions are closed.</div>
      ) : !b.canDeliver ? (
        <div className="panel small">Deliveries open once the booking is confirmed.</div>
      ) : (
        <section className="stack gap12" aria-labelledby={`dv-${id}`}>
          <h3 className="h4" id={`dv-${id}`}>Deliver to the artist</h3>
          <Dropzone onFiles={stage.add} title="Add the finished files" hint="Staged files stay hidden from the artist until you press Deliver." cta="Choose files" />
          <UploadQueue items={stage.items} notes={stage.notes} onRetry={stage.retry} onCancel={stage.cancel} onDismiss={stage.dismiss} />
          {staged.length > 0 && <div className="stack gap12">
            {staged.map((f) => <StagedRow key={f.id} f={f} title={titles[f.id] ?? ""} onTitle={(v) => setTitles({ ...titles, [f.id]: v })} onRemove={() => removeFile(f)} />)}
            <Area label="Note to the artist (optional)" name="dnote" rows={2} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
            {due && (
              <div className="stack gap8">
                <label className="row gap8 small checkrow2"><input type="checkbox" disabled={!mayRelease} checked={released && mayRelease} onChange={(e) => setReleased(e.target.checked)} /> Release before the balance is paid</label>
                {!mayRelease && <span className="caption">Only staff who record payments can open files early. These stay locked until the {naira(b.balance_kobo)} balance is paid.</span>}
                {released && mayRelease && <div className="warnbox small">The artist will be able to download these files without paying the {naira(b.balance_kobo)} still owing. Only do this if the CEO or front desk agreed.</div>}
                {!released && <span className="caption">The artist sees the files locked and a Pay {naira(b.balance_kobo)} button until the balance is paid.</span>}
              </div>
            )}
            <div className="stack gap4">
              <label className="row gap8 small checkrow2"><input type="checkbox" checked={final} onChange={(e) => setFinal(e.target.checked)} /> This is the final delivery in all agreed formats</label>
              {final && <span className="caption">The order is marked complete and revisions close for good, as the studio's terms say once everything is delivered in all agreed formats. The artist is told it is complete.</span>}
            </div>
            <ErrorBox error={error} />
            <Btn disabled={busy || stage.busy || untitled} onClick={deliver}>{busy ? "Delivering..." : `Deliver ${staged.length} file${staged.length === 1 ? "" : "s"} to artist`}</Btn>
            {stage.busy && <span className="caption">Wait for the uploads above to finish.</span>}
          </div>}
        </section>
      )}

      {outcome && <Why o={outcome} copy={copy} />}

      <section className="stack gap12" aria-labelledby={`pub-${id}`}>
        <h3 className="h4" id={`pub-${id}`}>Delivered {given.length > 0 && <span className="caption">({given.length})</span>}</h3>
        {given.length === 0 ? <span className="small muted">Nothing delivered yet.</span> : versions(given).flat().map((f) => {
          const open = f.released || !due;
          return (
            <div key={f.id} className="uprow pubrow">
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="row gap8 wrapflex"><b className="small">{f.title}</b>{f.version > 1 && <Tag tone="brand">v{f.version}</Tag>}
                  {f.released && due ? <Tag tone="warning">Released early</Tag> : open ? <Tag tone="success">Open to artist</Tag> : <Tag>Locked until paid</Tag>}</div>
                <div className="caption">{fmtBytes(f.size)} · Delivered {f.delivered_at ? dateTime(f.delivered_at) : ""} · {f.downloads === 0 ? "Not downloaded yet" : `Downloaded ${f.downloads} time${f.downloads === 1 ? "" : "s"}, first ${f.first_downloaded_at ? dateTime(f.first_downloaded_at) : ""}`}</div>
              </div>
              <div className="row gap8 wrapflex">
                <TactileAnchor variant="light" size="md" href={dl(f.id)} download={f.name} aria-label={`Download ${f.title}`}><DownIcon /></TactileAnchor>
                {due && mayRelease && <Btn size="sm" kind="neutral" onClick={() => act(() => api(`/admin/files/${f.id}/release`, { body: { released: !f.released } }), f.released ? "Locked until paid" : "Released to the artist")}>{f.released ? "Lock again" : "Release early"}</Btn>}
                {isOwner(user!) && (asking === f.id
                  ? <span className="row gap8"><button type="button" className="linkbtn danger" onClick={() => removeFile(f)}>Yes, remove</button><button type="button" className="linkbtn" onClick={() => setAsking(null)}>Keep</button></span>
                  : <button type="button" className="linkbtn" onClick={() => setAsking(f.id)} aria-label={`Remove ${f.title}`}>Remove</button>)}
              </div>
            </div>
          );
        })}
        {given.length > 0 && <div className="row gap12 wrapflex"><Btn size="sm" kind="neutral" onClick={resend}>Resend notice</Btn><Btn size="sm" kind="neutral" onClick={copy}>Copy portal link</Btn></div>}
        {rev.history.filter((r: any) => r.status === "done").length > 0 && (
          <details className="olderv"><summary>Earlier revision requests ({rev.history.filter((r: any) => r.status === "done").length})</summary>
            <div className="stack gap8">{rev.history.filter((r: any) => r.status === "done").map((r: any) => <div key={r.id} className="small"><span className="caption">{dateTime(r.created_at)}{r.resolved_at ? `, done ${dateTime(r.resolved_at)}` : ""}</span><div className="revnote">{r.note}</div></div>)}</div></details>
        )}
      </section>

      {!b.final && b.canFinalize && (
        <section className="stack gap8">
          <HoldToConfirm key={round} block onConfirm={finish} confirmed="Completing...">Hold to mark job complete</HoldToConfirm>
          <span className="caption">Closes revisions and tells the artist the order is complete. Use it when the work is done and the artist wants no further changes.{rev.open ? " This also closes their open revision request." : ""}</span>
        </section>
      )}
    </div>
  );
}
