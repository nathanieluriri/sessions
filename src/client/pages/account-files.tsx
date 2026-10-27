import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Empty } from "../components/Dash";
import { Deliveries, UploadsList } from "../components/FileList";
import { ClientUploader } from "../components/Uploader";
import { Area, Btn, ErrorBox, Modal, Tag, toast } from "../components/ui";
import { HoldToConfirm, TactileLink } from "../components/kitchen";
import { Icon } from "../components/brand";
import { api } from "../lib/api";
import { dateTime, naira } from "../lib/format";
import { stateLine, type PortalFile } from "../lib/files";

export interface FilesBooking {
  id: string; ref: string; package_name: string; service_name: string; status: string; scheduling: string; due_date: string | null; balance_kobo: number;
  revision_limit: number; revisions_used: number; final: boolean; openRevision: any; canUpload: boolean; canRequest: boolean; canApprove: boolean;
  deliveries: PortalFile[]; uploads: PortalFile[];
}

export function useClientFiles() {
  const [d, setD] = useState<FilesBooking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => api<{ bookings: FilesBooking[] }>("/account/files").then((r) => { setD(r.bookings); setError(null); }).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);
  return [d, load, error] as const;
}

const newest = (b: FilesBooking) => b.deliveries.reduce((m, f) => ((f.delivered_at ?? "") > m ? f.delivered_at! : m), "");
const label = (b: FilesBooking) => `${b.package_name} · ${b.ref}`;

export function ReadyForYou({ bookings, reload }: { bookings: FilesBooking[]; reload: () => void }) {
  const ready = bookings.filter((b) => b.deliveries.length).sort((a, b) => newest(b).localeCompare(newest(a)));
  const fresh = ready.reduce((n, b) => n + b.deliveries.filter((f) => f.latest !== false && !f.locked && !f.first_downloaded_at).length, 0);
  return (
    <section className="card ready stack gap16" aria-labelledby="ready-h">
      <div className="row between wrapflex gap8"><h2 className="h3" id="ready-h">Ready for you</h2>{fresh > 0 && <Tag tone="success">{fresh} new</Tag>}</div>
      {ready.length === 0
        ? <div className="stack gap8"><b>Nothing to download yet.</b><span className="muted small">When the studio finishes your songs they appear right here, and we email you. You can also upload your own files below.</span></div>
        : ready.slice(0, 3).map((b) => (
          <div key={b.id} className="stack gap12">
            {ready.length > 1 && <div className="row between gap8 wrapflex"><span className="mono faint">{label(b)}</span></div>}
            <Deliveries bookingId={b.id} balance={b.balance_kobo} files={b.deliveries} onOpened={reload} limit={3} />
            {!b.final && b.deliveries.some((f) => !f.locked) && <Link to={`/account/bookings/${b.id}#files`} className="link small">Happy with it? Approve it or ask for a revision <Icon name="arrow" size={14} /></Link>}
          </div>
        ))}
      {ready.length > 3 && <Link to="/account/files" className="link small">See all {ready.length} orders with files</Link>}
    </section>
  );
}

export function UploadCard({ bookings, reload }: { bookings: FilesBooking[]; reload: () => void }) {
  const can = bookings.filter((b) => b.canUpload);
  if (!can.length) return null;
  const one = can.length === 1 ? can[0] : null;
  return (
    <section className="card stack gap12" aria-labelledby="upload-h">
      <div><h2 className="h4" id="upload-h">Upload your files</h2><span className="small muted">Send stems, references or lyrics to the studio{one ? ` for ${label(one)}` : ""}.</span></div>
      {one ? <ClientUploader bookingId={one.id} onChanged={reload} /> : <div><TactileLink to="/account/files#upload" size="lg">Choose files <Icon name="arrow" size={18} /></TactileLink></div>}
    </section>
  );
}

function UploadSection({ bookings, reload }: { bookings: FilesBooking[]; reload: () => void }) {
  const can = bookings.filter((b) => b.canUpload);
  const [pick, setPick] = useState(can[0]?.id ?? "");
  const cur = bookings.find((b) => b.id === pick && b.canUpload) ?? can[0];
  if (!cur) return <Empty>You can upload files once you have a booking. <Link to="/book" className="link">Book a session</Link></Empty>;
  return (
    <div className="stack gap16">
      {can.length > 1 ? (
        <div className="field"><label htmlFor="which">Which booking are these for?</label>
          <select id="which" className="select" value={cur.id} onChange={(e) => setPick(e.target.value)}>{can.map((b) => <option key={b.id} value={b.id}>{label(b)}</option>)}</select></div>
      ) : <span className="small muted">For {label(cur)}</span>}
      <ClientUploader key={cur.id} bookingId={cur.id} onChanged={reload} />
      <div className="stack gap8"><b className="small">Files you have uploaded</b><UploadsList files={cur.uploads} canRemove={cur.canUpload} onChanged={reload} /></div>
    </div>
  );
}

export function FilesPage({ bookings, reload }: { bookings: FilesBooking[]; reload: () => void }) {
  const mine = bookings.filter((b) => b.deliveries.length).sort((a, b) => newest(b).localeCompare(newest(a)));
  return (
    <>
      <section className="stack gap16" aria-labelledby="from-h">
        <h2 className="h3" id="from-h">From the studio</h2>
        {mine.length === 0
          ? <Empty>Nothing from the studio yet. Finished songs show up here, and we email you the moment they do.</Empty>
          : mine.map((b) => (
            <div key={b.id} className="card stack gap16">
              <div className="row between wrapflex gap8"><div><b>{b.package_name}</b><div className="caption">{b.ref}</div></div><Link to={`/account/bookings/${b.id}#files`} className="link small">{b.final ? "Finished" : "Review or ask for a revision"}</Link></div>
              <Deliveries bookingId={b.id} balance={b.balance_kobo} files={b.deliveries} onOpened={reload} />
            </div>
          ))}
      </section>
      <section className="stack gap16" id="upload" aria-labelledby="up-h">
        <h2 className="h3" id="up-h">Your uploads</h2>
        <div className="card"><UploadSection bookings={bookings} reload={reload} /></div>
      </section>
    </>
  );
}

function Review({ rev, bookingId, balance, reload }: { rev: any; bookingId: string; balance: number; reload: () => void }) {
  const [ask, setAsk] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [round, setRound] = useState(0);
  const send = async () => {
    setBusy(true); setError(null);
    try { await api(`/account/bookings/${bookingId}/revisions`, { body: { note: note.trim() } }); setAsk(false); setNote(""); toast("Revision requested"); reload(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const approve = async () => {
    try { await api(`/account/bookings/${bookingId}/approve`, { method: "POST" }); toast("Approved, your order is finished"); reload(); } catch (e: any) { toast(e.message); setRound((n) => n + 1); }
  };
  if (rev.final) return <div className="panel review done"><b>Approved and finished.</b><span className="small muted"> This order is complete. Your files stay here to download. For more work, start a new booking.</span></div>;
  if (rev.open) {
    return (
      <div className="panel review open stack gap8">
        <b>Revision requested {dateTime(rev.open.created_at)}</b>
        <span className="small muted">Your note: “{rev.open.note}”</span>
        <span className="small muted">The studio will upload an updated version here and we will tell you. You have {rev.left} revision{rev.left === 1 ? "" : "s"} left after this one.</span>
      </div>
    );
  }
  if (!rev.canApprove && !rev.canRequest) {
    return balance > 0 ? <div className="panel review"><b>Pay {naira(balance)} to unlock your files.</b><span className="small muted"> Once you have opened them you can approve them or ask for a revision.</span></div> : null;
  }
  return (
    <div className="panel review stack gap16">
      <div><b>Happy with it?</b><div className="small muted">{rev.limit > 0 ? `${rev.used} of ${rev.limit} revisions used.` : "This package does not include revision rounds."}</div></div>
      <div className="row gap12 wrapflex reviewbtns">
        {rev.limit > 0 && (rev.canRequest
          ? <Btn kind="neutral" onClick={() => setAsk(true)}>Request a revision ({rev.left} left)</Btn>
          : <span className="small"><b>No revisions left.</b> You have used all {rev.limit}.</span>)}
        {rev.canApprove && <HoldToConfirm key={round} block onConfirm={approve} confirmed="Approving...">Hold to approve and finish</HoldToConfirm>}
      </div>
      <ul className="fine">
        <li>Approving finishes the order. Under the studio's terms there are no further adjustments once work is delivered in all agreed formats, and no refunds after job completion.</li>
        <li>Extra work after that needs a new booking and payment.</li>
        <li>If you do nothing, the order finishes by itself 7 days after the latest delivery, once your balance is paid and no revision is open.</li>
      </ul>
      {ask && (
        <Modal title="Request a revision" onClose={() => setAsk(false)}>
          <div className="notice small"><b>{rev.left} of {rev.limit} left.</b> A round can cover any of your tracks, so put everything in one note. Nothing is charged.</div>
          <Area label="What should change?" name="revnote" rows={5} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="Name the track and what to change, for example: vocals too quiet in verse 2." />
          <span className="caption">{note.trim().length} of 2000 characters. At least 3.</span>
          <ErrorBox error={error} />
          <Btn disabled={busy || note.trim().length < 3} onClick={send}>{busy ? "Sending..." : "Send revision request"}</Btn>
        </Modal>
      )}
    </div>
  );
}

/** The booking page: where the job is, what came back, the review controls, and the upload area. */
export function BookingFiles({ d, reload }: { d: any; reload: () => void }) {
  const { booking: b, files, revisions: rev } = d;
  const [list, setList] = useState<PortalFile[] | null>(null);
  const [ups, setUps] = useState<PortalFile[] | null>(null);
  const refresh = useCallback(async () => {
    const r = await api<{ bookings: FilesBooking[] }>("/account/files").catch(() => null);
    const mine = r?.bookings.find((x) => x.id === b.id);
    if (mine) { setList(mine.deliveries); setUps(mine.uploads); }
    reload();
  }, [b.id, reload]);
  const deliveries: PortalFile[] = list ?? files.deliveries;
  const uploads: PortalFile[] = ups ?? files.uploads;
  useEffect(() => { setList(null); setUps(null); }, [d]);
  const line = stateLine(b, { deliveries, uploads }, rev, new Date(Date.now() + 3600000).toISOString().slice(0, 10));
  return (
    <>
      {line && (
        <div className={`stateline ${line.tone}`} role="status">
          <span className="sdot" aria-hidden="true" />
          <div><b>{line.text}</b>{line.sub && <div className="small muted">{line.sub}</div>}</div>
        </div>
      )}
      <section className="card stack gap20" id="files" aria-labelledby="files-h">
        <h2 className="h3" id="files-h">Files</h2>
        <div className="stack gap12">
          <b>From the studio</b>
          {deliveries.length === 0
            ? <span className="small muted">Nothing delivered yet. Finished work appears here and we email you when it does.</span>
            : <Deliveries bookingId={b.id} balance={b.balance_kobo} files={deliveries} onOpened={refresh} />}
        </div>
        {deliveries.length > 0 && <Review rev={rev} bookingId={b.id} balance={b.balance_kobo} reload={refresh} />}
        <div className="stack gap12">
          <b>Your uploads</b>
          {files.canUpload
            ? <><ClientUploader bookingId={b.id} onChanged={refresh} /><UploadsList files={uploads} canRemove onChanged={refresh} /></>
            : uploads.length ? <UploadsList files={uploads} canRemove={false} onChanged={refresh} /> : <span className="small muted">{rev.final ? "This order is finished, so uploads are closed." : "Uploads are closed for this booking."}</span>}
        </div>
      </section>
    </>
  );
}
