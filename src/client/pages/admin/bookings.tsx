import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Empty, SlotPicker } from "../../components/Dash";
import { Area, Btn, ErrorBox, Field, Loading, Modal, Seg, Tag, toast } from "../../components/ui";
import { HoldToConfirm, TactileAnchor } from "../../components/kitchen";
import { ReceiptCard, type ReceiptData } from "../../components/receipt";
import { api } from "../../lib/api";
import { can, useAuth, type User } from "../../lib/auth";
import { canSeeContacts } from "../../../shared/permissions";
import { FilesPanel } from "./files";
import { useCatalog } from "../../lib/catalog";
import { addDays, dateTime, endsNextDay, hm, hrs, lagosToday, naira, payState, shortDate, statusLabel, statusTone, t12, timeRange } from "../../lib/format";
import { act, useApi } from "./kit";

const SOURCE: Record<string, string> = { online: "Online", phone: "Phone", whatsapp: "WhatsApp", walk_in: "Walk-in", email: "Email", instagram: "Instagram", other: "Other" };
const toMin = (v: string) => { const [h, m] = v.split(":").map(Number); return h * 60 + (m || 0); };

const Hidden = ({ why }: { why: string }) => <span className="hiddenval" title={why}>Hidden<span className="caption"> {why}</span></span>;

function RoomChips({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const cat = useCatalog();
  return <div className="chips">{[["", "All rooms"], ...(cat?.rooms.map((r) => [r.id, r.name]) ?? [])].map(([id, n]) => <button key={id} className={`chip ${value === id ? "on" : ""}`} onClick={() => onChange(id)}>{n}</button>)}</div>;
}

export function Calendar() {
  const [from, setFrom] = useState(lagosToday());
  const [room, setRoom] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const { user } = useAuth();
  const [d, load] = useApi<any>(`/admin/calendar?from=${from}&to=${addDays(from, 6)}&room=${room}`);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropDay, setDropDay] = useState<string | null>(null);
  const [pending, setPending] = useState<{ id: string; date: string; start: number } | null>(null);
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const START = 480, END = 1380, PX = 0.8;
  const manage = can(user, "manage_bookings");
  const pos = (s: number, e: number) => ({ top: (Math.max(s, START) - START) * PX + 4, height: Math.max((Math.min(e, END) - Math.max(s, START)) * PX - 4, 18) });
  // Overlapping items (different rooms) sit side by side in lanes.
  const lanes = (items: { id: string; start: number; end: number }[]) => {
    const ends: number[] = [], lane: Record<string, number> = {};
    for (const it of [...items].sort((a, b) => a.start - b.start)) {
      let i = ends.findIndex((e) => e <= it.start);
      if (i < 0) { i = ends.length; ends.push(0); }
      ends[i] = it.end; lane[it.id] = i;
    }
    return { lane, count: Math.max(1, ends.length) };
  };
  const place = (l: { lane: Record<string, number>; count: number }, id: string, s: number, e: number) =>
    ({ ...pos(s, e), left: `calc(${(l.lane[id] / l.count) * 100}% + 4px)`, width: `calc(${100 / l.count}% - 8px)`, right: "auto" });
  const dropOn = (date: string, e: React.DragEvent) => {
    e.preventDefault(); setDropDay(null);
    const id = e.dataTransfer.getData("text/booking-id") || dragId;
    const src = d?.bookings.find((x: any) => x.id === id);
    setDragId(null);
    if (!src) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = Math.min(Math.max(e.clientY - rect.top, 0), (END - START) * PX);
    const dur = src.end - src.start;
    const maxStart = endsNextDay(src.end) ? END : Math.max(START, 1440 - dur);
    const start = Math.min(Math.max(Math.round((START + y / PX) / 30) * 30, START), maxStart);
    if (date === src.date && start === src.start) return;
    setPending({ id: src.id, date, start });
  };
  const moved = () => { setPending(null); load(); };
  return <>
    <div className="row between wrapflex gap12">
      <div className="row gap8"><Btn size="sm" kind="neutral" onClick={() => setFrom(addDays(from, -7))}>Previous</Btn><Btn size="sm" kind="neutral" onClick={() => setFrom(lagosToday())}>This week</Btn><Btn size="sm" kind="neutral" onClick={() => setFrom(addDays(from, 7))}>Next</Btn></div>
      <div className="row gap8 small wrapflex"><Tag tone="brand">Confirmed</Tag><Tag tone="warning">Request</Tag><Tag tone="success">Awaiting payment</Tag><Tag>Hold or block</Tag></div>
    </div>
    {manage && <span className="hint">Drag a session to another day or time to reschedule it, or open it and use Reschedule.</span>}
    <RoomChips value={room} onChange={setRoom} />
    {!d ? <Loading /> : (
      <div className="scrollx"><div className="week" style={{ minWidth: 900 }}>
        <div className="head" />
        {days.map((x) => <div key={x} className={`head small ${x === lagosToday() ? "today" : ""}`}><b>{shortDate(x)}</b></div>)}
        <div style={{ position: "relative", height: (END - START) * PX }}>{Array.from({ length: 15 }, (_, i) => <span key={i} className="caption" style={{ position: "absolute", top: i * 60 * PX, right: 6 }}>{hm(START + i * 60)}</span>)}</div>
        {days.map((x) => {
          const bs = d.bookings.filter((b: any) => b.date === x), hs = d.holds.filter((h: any) => h.date === x), ks = d.blocks.filter((k: any) => k.date === x);
          const l = lanes([...bs, ...hs, ...ks]);
          return (
            <div key={x} className={`col${manage && dropDay === x ? " drop" : ""}`} style={{ height: (END - START) * PX }}
              onDragOver={manage ? (e) => { if (dragId) { e.preventDefault(); setDropDay(x); } } : undefined}
              onDragLeave={manage ? () => setDropDay((v) => (v === x ? null : v)) : undefined}
              onDrop={manage ? (e) => dropOn(x, e) : undefined}>
              {bs.map((b: any) => (
                <button key={b.id} type="button" draggable={manage} title={manage ? "Click to open, drag to reschedule" : ""}
                  className={`ev ${b.status}${dragId === b.id ? " drag" : ""}`} style={place(l, b.id, b.start, b.end)}
                  onDragStart={manage ? (e) => { e.dataTransfer.setData("text/booking-id", b.id); e.dataTransfer.effectAllowed = "move"; setDragId(b.id); } : undefined}
                  onDragEnd={manage ? () => { setDragId(null); setDropDay(null); } : undefined}
                  onClick={() => setOpen(b.id)}><b>{t12(b.start)} {b.title}</b><div style={{ opacity: .75 }}>{b.subtitle}</div></button>
              ))}
              {hs.map((h: any) => <div key={h.id} className="ev hold" style={place(l, h.id, h.start, h.end)}><b>Hold</b><div>Checkout in progress</div></div>)}
              {ks.map((k: any) => <div key={k.id} className="ev block" style={place(l, k.id, k.start, k.end)}><b>Blocked · {k.room}</b><div>{k.reason}</div></div>)}
            </div>
          );
        })}
      </div></div>
    )}
    {open && <BookingDrawer id={open} user={user} onClose={() => setOpen(null)} onChange={load} />}
    {pending && <RescheduleModal id={pending.id} pick={{ date: pending.date, start: pending.start }} onClose={() => setPending(null)} onDone={moved} />}
  </>;
}

const FILTERS: [string, string][] = [["", "All"], ["pending", "Needs approval"], ["approved", "Awaiting payment"], ["confirmed", "Confirmed"], ["balance", "Balance due"], ["completed", "Completed"], ["cancelled", "Cancelled"], ["rejected", "Declined"]];

export function Bookings() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [room, setRoom] = useState("");
  const [list, load] = useApi<any[]>(`/admin/bookings?q=${encodeURIComponent(q)}&status=${status}&room=${room}`);
  const [open, setOpen] = useState<string | null>(params.get("open"));
  const [resched, setResched] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const manage = can(user, "manage_bookings");
  const close = () => { setOpen(null); if (params.get("open")) setParams({}, { replace: true }); };
  return <>
    <div className="row between wrapflex gap12">
      <input className="input" style={{ maxWidth: 340 }} placeholder="Search name, email, phone or reference" value={q} onChange={(e) => setQ(e.target.value)} />
      {manage && <Btn size="sm" onClick={() => setCreating(true)}>New booking</Btn>}
    </div>
    <div className="chips">{FILTERS.map(([v, l]) => <button key={v} className={`chip ${status === v ? "on" : ""}`} onClick={() => setStatus(v)}>{l}</button>)}</div>
    <RoomChips value={room} onChange={setRoom} />
    {!list ? <Loading /> : list.length === 0 ? <Empty>No bookings match.</Empty> : (
      <div className="scrollx"><table className="table">
        <thead><tr><th>Ref</th><th>Date</th><th>Room</th><th>Client</th><th>Package</th><th>Total</th><th>Paid</th><th>Status</th>{manage && <th></th>}</tr></thead>
        <tbody>{list.map((b) => {
          const paid = b.amount_paid_kobo - b.refunded_kobo;
          return (
            <tr key={b.id} className="click" onClick={() => setOpen(b.id)}>
              <td className="mono nowrap">{b.ref}</td><td className="nowrap">{shortDate(b.date)} · {t12(b.start_min)}</td><td>{b.room_name}</td>
              <td>{b.artist_name}<div className="caption">{b.contact_name}{b.source !== "online" ? ` · ${SOURCE[b.source] ?? b.source}` : ""}</div></td>
              <td>{b.package_name}</td><td>{naira(b.total_kobo)}</td>
              <td>{naira(paid)}{["confirmed", "completed"].includes(b.status) && paid < b.total_kobo && <div className="caption" style={{ color: "#9a5b00" }}>{naira(b.total_kobo - paid)} due</div>}</td>
              <td><Tag tone={statusTone(b.status)}>{statusLabel(b.status)}</Tag></td>
              {manage && <td className="nowrap" onClick={(e) => e.stopPropagation()}>
                {["pending", "approved", "confirmed"].includes(b.status) && <button className="link small" onClick={() => setResched(b.id)}>Reschedule</button>}
              </td>}
            </tr>
          );
        })}</tbody>
      </table></div>
    )}
    {open && <BookingDrawer id={open} user={user} onClose={close} onChange={load} />}
    {resched && <RescheduleModal id={resched} onClose={() => setResched(null)} onDone={() => { setResched(null); load(); }} />}
    {creating && <NewBooking onClose={() => setCreating(false)} onDone={(id) => { setCreating(false); load(); setOpen(id); }} />}
  </>;
}

export function BookingDrawer({ id, user, tab: first = "details", onClose, onChange }: { id: string; user: User | null; tab?: "details" | "files"; onClose: () => void; onChange: () => void }) {
  const [d, load] = useApi<any>(`/admin/bookings/${id}`);
  const [tab, setTab] = useState<"details" | "files">(first);
  const [mode, setMode] = useState<"" | "edit" | "move" | "cancel" | "approve" | "reject" | "confirm" | "pay" | "receipt">("");
  const [f, setF] = useState<any>(null);
  const [text, setText] = useState("");
  const [full, setFull] = useState(false);
  const [pay, setPay] = useState({ amount: 0, method: "transfer", note: "" });
  const refresh = () => { load(); onChange(); setMode(""); setText(""); };
  if (!d) return <Modal title="Booking" onClose={onClose}><Loading /></Modal>;
  const b = d.booking;
  const manage = can(user, "manage_bookings"), money = can(user, "record_payments");
  const showFiles = can(user, "deliver_files"), contacts = !!user && canSeeContacts(user), remote = b.scheduling === "project", onFiles = showFiles && tab === "files";
  const started = new Date(`${b.date}T${hm(b.start_min)}:00+01:00`).getTime() <= Date.now();
  const copy = async () => { await navigator.clipboard?.writeText(d.payLink).catch(() => {}); toast("Payment link copied"); };
  const post = (path: string, body: unknown, ok: string) => act(() => api(`/admin/bookings/${id}/${path}`, { body }), ok, refresh);
  return (
    <Modal title={`Booking ${b.ref}`} onClose={onClose}>
      <div className="row gap8 wrapflex"><Tag tone={statusTone(b.status)}>{statusLabel(b.status)}</Tag>{["confirmed", "completed", "approved"].includes(b.status) && (d.payments ? <Tag tone={b.balance_kobo > 0 ? "warning" : "success"}>{payState(b)}</Tag> : b.balance_kobo > 0 && <Tag tone="warning">Balance due</Tag>)}{b.source !== "online" && <Tag>{SOURCE[b.source] ?? b.source}</Tag>}{b.rescheduled_at && <Tag>Rescheduled</Tag>}</div>
      <span className="small muted">{remote ? `${b.category === "exclusive" ? "Remote order" : `Starts ${shortDate(b.date)}`}${b.due_date ? ` · due ${shortDate(b.due_date)}` : ""}${b.category === "exclusive" ? ` · placed ${shortDate(b.date)}` : ""}` : `${shortDate(b.date)} · ${timeRange(b.date, b.start_min, b.end_min)} · ${hrs(b.end_min - b.start_min)} · ${b.room_name}`}</span>
      {showFiles && <div className="drawtabs" role="tablist" aria-label="Booking sections">{(["details", "files"] as const).map((k) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{k === "files" ? "Files and delivery" : "Details"}</button>)}</div>}
      {onFiles && <FilesPanel id={id} user={user} onChange={() => { load(); onChange(); }} />}
      {!onFiles && <>
      {b.status === "pending" && b.expires_at && <div className="notice small">Request waiting for a decision. The slot is held until {dateTime(b.expires_at)}.</div>}
      {b.status === "approved" && b.expires_at && <div className="notice small">Approved. The client has until {dateTime(b.expires_at)} to pay.</div>}
      <div className="grid cols-2" style={{ gap: 12 }}>
        {[["Service", b.service_name], ["Package", b.package_name], ["Artist or project", b.artist_name], ...(remote ? [] : [["People", b.people]]), ["Contact", b.contact_name], ["Phone", contacts ? b.contact_phone : <Hidden why="Client contact details are for the front desk" />], ["Email", contacts ? b.contact_email || "None" : <Hidden why="Client contact details are for the front desk" />], ["Total", d.payments ? naira(b.total_kobo) : <Hidden why="Payments are not part of your role" />], ["Paid", d.payments ? naira(b.paid_kobo) : <Hidden why="Payments are not part of your role" />], ["Balance", d.payments ? naira(b.balance_kobo) : <Hidden why="Payments are not part of your role" />]].map(([k, v]) => <div key={String(k)}><div className="mono faint">{k}</div><span className="small" style={{ overflowWrap: "anywhere" }}>{v}</span></div>)}
      </div>
      {b.project && <div className="panel small"><span className="mono faint">Project</span><br />{b.project}</div>}
      {b.notes && <div className="panel small"><span className="mono faint">Requirements</span><br />{b.notes}</div>}
      {b.reference_links && <div className="small" style={{ overflowWrap: "anywhere" }}><span className="mono faint">Links</span><br />{b.reference_links}</div>}
      {b.decision_note && <div className="small muted">Studio note: {b.decision_note}</div>}
      {b.cancel_reason && <div className="small muted">Cancelled: {b.cancel_reason}</div>}
      {mode === "" && (
        <div className="row gap8 wrapflex">
          {b.status === "pending" && manage && <><Btn size="sm" onClick={() => setMode("approve")}>Approve</Btn><Btn size="sm" kind="neutral" onClick={() => setMode("reject")}>Decline</Btn></>}
          {["pending", "approved"].includes(b.status) && manage && <Btn size="sm" kind="neutral" onClick={() => setMode("confirm")}>Confirm without payment</Btn>}
          {b.status === "approved" && manage && <Btn size="sm" kind="neutral" onClick={() => setMode("reject")}>Decline</Btn>}
          {["pending", "approved", "confirmed", "completed"].includes(b.status) && can(user, "update_booking_details") && <Btn size="sm" kind="neutral" onClick={() => { setF({ people: b.people, artist_name: b.artist_name, contact_phone: b.contact_phone, contact_email: "", notes: b.notes, project: b.project, reference_links: b.reference_links }); setMode("edit"); }}>Edit details</Btn>}
          {["pending", "approved", "confirmed"].includes(b.status) && manage && b.category !== "exclusive" && <Btn size="sm" kind="neutral" onClick={() => setMode("move")}>{remote ? "Change start date" : "Reschedule"}</Btn>}
          {!["cancelled", "rejected"].includes(b.status) && money && b.balance_kobo > 0 && <Btn size="sm" kind="neutral" onClick={() => { setPay({ amount: b.balance_kobo, method: "transfer", note: "" }); setMode("pay"); }}>Record payment</Btn>}
          {d.payments && d.payments.length > 0 && can(user, "print_receipts") && <Btn size="sm" kind="neutral" onClick={() => setMode("receipt")}>Print receipt</Btn>}
          {["approved", "confirmed", "completed"].includes(b.status) && money && b.balance_kobo > 0 && <Btn size="sm" kind="neutral" onClick={() => act(() => api(`/admin/bookings/${id}/payment-link`, { method: "POST" }), "Payment link emailed")}>Email payment link</Btn>}
          {d.payLink && b.balance_kobo > 0 && !["cancelled", "rejected"].includes(b.status) && <Btn size="sm" kind="neutral" onClick={copy}>Copy link</Btn>}
          {["confirmed", "completed", "no_show"].includes(b.status) && manage && started && !remote && <>
            {b.status !== "completed" && <Btn size="sm" kind="neutral" onClick={() => post("outcome", { outcome: "completed" }, "Marked completed")}>Mark completed</Btn>}
            {b.status !== "no_show" && <Btn size="sm" kind="neutral" onClick={() => post("outcome", { outcome: "no_show" }, "Marked as no-show")}>No-show</Btn>}
          </>}
          {["pending", "approved", "confirmed"].includes(b.status) && manage && <Btn size="sm" kind="danger" onClick={() => setMode("cancel")}>Cancel</Btn>}
        </div>
      )}
      {mode === "approve" && <div className="stack gap12">
        <Area label="Note to the client (optional)" name="note" rows={2} value={text} onChange={(e) => setText(e.target.value)} />
        <span className="caption">The client gets an email with a secure payment link and a deadline to pay.</span>
        <div className="row gap8"><Btn onClick={() => post("approve", { note: text }, "Approved, payment link sent")}>Approve and send payment link</Btn><Btn kind="neutral" onClick={() => setMode("")}>Back</Btn></div>
      </div>}
      {mode === "reject" && <div className="stack gap12">
        <Field label="Reason the client will see" name="reason" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="row gap8"><Btn kind="danger" disabled={!text.trim()} onClick={() => post("reject", { reason: text }, "Request declined")}>Decline request</Btn><Btn kind="neutral" onClick={() => setMode("")}>Back</Btn></div>
      </div>}
      {mode === "confirm" && <div className="stack gap12">
        <Field label="Note, for example pay on arrival" name="note" value={text} onChange={(e) => setText(e.target.value)} />
        <span className="caption">Only confirm without payment when studio policy allows it. The balance stays on the booking.</span>
        <div className="row gap8"><Btn onClick={() => post("confirm", { note: text }, "Booking confirmed")}>Confirm booking</Btn><Btn kind="neutral" onClick={() => setMode("")}>Back</Btn></div>
      </div>}
      {mode === "pay" && <div className="stack gap12">
        <div className="grid cols-2" style={{ gap: 12 }}>
          <Field label="Amount (₦)" name="amount" type="number" value={pay.amount / 100} onChange={(e) => setPay({ ...pay, amount: Math.round(Number(e.target.value) * 100) })} />
          <div className="field"><label>Method</label><Seg value={pay.method} onChange={(v) => setPay({ ...pay, method: v })} options={[["transfer", "Transfer"], ["cash", "Cash"], ["pos", "POS"]]} /></div>
        </div>
        <Field label="Note (optional)" name="paynote" value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} placeholder="Bank reference or receipt number" />
        <div className="row gap8"><Btn disabled={pay.amount <= 0} onClick={() => act(async () => { await api(`/admin/bookings/${id}/payments`, { body: pay }); }, "Payment recorded, receipt ready", refresh)}>Record {naira(pay.amount)}</Btn><Btn kind="neutral" onClick={() => setMode("")}>Back</Btn></div>
      </div>}
      {mode === "receipt" && <ReceiptPane id={id} receipts={d.receipts ?? []} onBack={() => setMode("")} />}
      {mode === "edit" && <div className="stack gap12">
        <Field label="Artist or project" name="artist_name" value={f.artist_name} onChange={(e) => setF({ ...f, artist_name: e.target.value })} />
        <div className="grid cols-2" style={{ gap: 12 }}><Field label="People" name="people" type="number" value={f.people} onChange={(e) => setF({ ...f, people: Number(e.target.value) })} /><Field label="Phone" name="contact_phone" value={f.contact_phone} onChange={(e) => setF({ ...f, contact_phone: e.target.value })} /></div>
        <Field label="Client email" name="contact_email" type="email" value={f.contact_email} onChange={(e) => setF({ ...f, contact_email: e.target.value })} placeholder={b.contact_email || "No email on this booking"} hint={`${b.contact_email ? `Now ${b.contact_email}. Leave blank to keep it.` : "Add one so the client can sign in and get their files."} If they already have an account with this email, the booking links to it.`} />
        <Area label="Project" name="project" rows={2} value={f.project} onChange={(e) => setF({ ...f, project: e.target.value })} />
        <Area label="Requirements" name="notes" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        <Field label="Reference links" name="reference_links" value={f.reference_links} onChange={(e) => setF({ ...f, reference_links: e.target.value })} />
        <div className="row gap8"><Btn onClick={() => act(async () => { const r = await api(`/admin/bookings/${id}/details`, { method: "PUT", body: f }); if (f.contact_email) toast(r.linked ? "Email saved and linked to the client's account" : "Email saved. The client sees their files after registering with it"); }, "Details saved", refresh)}>Save details</Btn><Btn kind="neutral" onClick={() => setMode("")}>Back</Btn></div>
      </div>}
      {mode === "move" && (
        <RescheduleForm id={id} booking={b} backLabel="Back" onDone={() => { load(); onChange(); setMode(""); }} onBack={() => setMode("")} />
      )}
      {mode === "cancel" && <div className="stack gap12">
        <Field label="Reason" name="reason" value={text} onChange={(e) => setText(e.target.value)} />
        {b.paid_kobo > 0 && <label className="row gap8 small"><input type="checkbox" checked={full} onChange={(e) => setFull(e.target.checked)} /> Refund the full {naira(b.paid_kobo)} anyway. Cancelling does not refund unless you tick this.</label>}
        <HoldToConfirm block disabled={!text.trim()} confirmed="Cancelled" onConfirm={() => act(async () => { const r = await api(`/admin/bookings/${id}/cancel`, { body: { reason: text, fullRefund: full } }); if (r.manual) toast(`${naira(r.manual)} was paid in cash or transfer. Return it by hand.`); }, "Booking cancelled", refresh)}>Hold to cancel booking</HoldToConfirm>
        <Btn kind="neutral" onClick={() => setMode("")}>Back</Btn>
      </div>}
      {d.payments && d.payments.length > 0 && <div className="stack gap8" style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
        <span className="mono faint">Payments</span>
        {d.payments.map((p: any) => <div key={p.id} className="row between small"><span>{p.kind} · {p.provider === "manual" ? `${p.channel} at the studio` : `${p.provider} · ${p.channel ?? ""}`} · {p.paid_at ? dateTime(p.paid_at) : ""}</span><b>{naira(p.amount_kobo)}{p.refunded_kobo > 0 ? ` (${naira(p.refunded_kobo)} refunded)` : ""}</b></div>)}
      </div>}
      {d.history.length > 0 && <div className="stack gap8" style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
        <span className="mono faint">Client history · {d.history.length} other booking{d.history.length === 1 ? "" : "s"}</span>
        {d.history.slice(0, 6).map((h: any) => <div key={h.id} className="row between small"><span>{h.ref} · {shortDate(h.date)} · {h.package_name}</span><Tag tone={statusTone(h.status)}>{statusLabel(h.status)}</Tag></div>)}
      </div>}
      </>}
    </Modal>
  );
}

/** Pick one of the booking's payments and print or share its receipt. */
function ReceiptPane({ id, receipts, onBack }: { id: string; receipts: { reference: string; url: string }[]; onBack: () => void }) {
  const [ref, setRef] = useState(receipts[0]?.reference ?? "");
  const [d, setD] = useState<ReceiptData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const link = receipts.find((r) => r.reference === ref)?.url ?? "";
  useEffect(() => {
    if (!ref) return;
    setD(null); setError(null);
    api<ReceiptData>(`/admin/receipts?reference=${encodeURIComponent(ref)}`).then(setD, (e) => setError(e.message));
  }, [ref, id]);
  return (
    <div className="stack gap12">
      {receipts.length > 1 && (
        <div className="field"><label>Payment</label>
          <select className="select" value={ref} onChange={(e) => setRef(e.target.value)}>{receipts.map((r) => <option key={r.reference} value={r.reference}>{r.reference}</option>)}</select>
        </div>
      )}
      {error ? <ErrorBox error={error} /> : !d ? <Loading /> : <ReceiptCard d={d} />}
      <div className="row gap8 wrapflex noprint">
        {d && <Btn kind="neutral" onClick={() => window.print()}>Print</Btn>}
        {link && <Btn kind="neutral" onClick={async () => { await navigator.clipboard?.writeText(link).catch(() => {}); toast("Receipt link copied"); }}>Copy receipt link</Btn>}
        <Btn kind="neutral" onClick={onBack}>Back</Btn>
      </div>
    </div>
  );
}

const QUICK_DAYS: [string, number][] = [["Today", 0], ["Tomorrow", 1], ["Next week", 7], ["In 2 weeks", 14]];

function RescheduleForm({ id, booking: b, initial, backLabel, onDone, onBack }: { id: string; booking: any; initial?: { date: string; start: number }; backLabel: string; onDone: () => void; onBack: () => void }) {
  const remote = b.scheduling === "project" && b.category !== "exclusive";
  const today = lagosToday();
  const [pick, setPick] = useState<{ date: string; start: number } | null>(initial ?? null);
  const [startDate, setStartDate] = useState(initial?.date ?? b.date);
  const [days, setDays] = useState(14);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (body: { date: string; start: number }) => {
    setBusy(true); setError(null);
    try { await api(`/admin/bookings/${id}/reschedule`, { body }); toast(remote ? "Start date moved, client emailed" : "Booking moved, client emailed"); onDone(); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  if (remote) return <div className="stack gap12">
    <div className="notice small">This order now starts <b>{shortDate(b.date)}</b>.</div>
    <Field label="New start date" name="startDate" type="date" value={startDate} min={today} onChange={(e) => setStartDate(e.target.value)} />
    <ErrorBox error={error} />
    <div className="row gap8"><Btn disabled={busy || !startDate} onClick={() => save({ date: startDate, start: 0 })}>{busy ? "Saving…" : "Save start date"}</Btn><Btn kind="neutral" onClick={onBack}>{backLabel}</Btn></div>
  </div>;
  return <div className="stack gap12">
    <div className="notice small">Now: <b>{shortDate(b.date)} at {timeRange(b.date, b.start_min, b.end_min)}</b> in {b.room_name}.</div>
    <div className="chips">{QUICK_DAYS.map(([l, n]) => <button key={l} type="button" className="chip" onClick={() => setPick({ date: addDays(today, n), start: b.start_min })}>{l}</button>)}</div>
    <SlotPicker duration={b.end_min - b.start_min} room={b.room_id} value={pick} onChange={setPick} days={days} current={{ date: b.date, start: b.start_min, end: b.end_min }} />
    {days < 60 && <button className="link small" onClick={() => setDays(60)}>Show 60 days</button>}
    <ErrorBox error={error} />
    <div className="row gap8 wrapflex">
      <Btn disabled={busy || !pick} onClick={() => save(pick!)}>{busy ? "Moving…" : pick ? `Move to ${shortDate(pick.date)} at ${t12(pick.start)}` : "Pick a new time"}</Btn>
      <Btn kind="neutral" onClick={onBack}>{backLabel}</Btn>
    </div>
  </div>;
}

function RescheduleModal({ id, pick, onClose, onDone }: { id: string; pick?: { date: string; start: number }; onClose: () => void; onDone: () => void }) {
  const [d] = useApi<any>(`/admin/bookings/${id}`);
  if (!d) return <Modal title="Reschedule" onClose={onClose}><Loading /></Modal>;
  return (
    <Modal title={`Reschedule ${d.booking.ref}`} onClose={onClose}>
      <RescheduleForm id={id} booking={d.booking} initial={pick} backLabel="Cancel" onDone={onDone} onBack={onClose} />
    </Modal>
  );
}

function NewBooking({ onClose, onDone }: { onClose: () => void; onDone: (id: string) => void }) {
  const cat = useCatalog();
  const { user } = useAuth();
  const [f, setF] = useState({ serviceSlug: "", packageId: "", extraHours: 0, people: 1, artistName: "", contactName: "", contactEmail: "", contactPhone: "", project: "", notes: "", links: "", source: "phone", status: "confirmed", notify: true });
  const [slot, setSlot] = useState<{ date: string; start: number } | null>(null);
  const [manual, setManual] = useState(false);
  const [mt, setMt] = useState({ date: addDays(lagosToday(), 1), time: "10:00" });
  const [pay, setPay] = useState({ on: false, amount: 0, method: "transfer", note: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const svc = cat?.services.find((s) => s.slug === f.serviceSlug);
  const pkgs = cat?.packages.filter((p) => p.service_category === svc?.category && p.pricing === "fixed") ?? [];
  const pkg = pkgs.find((p) => p.id === f.packageId);
  useEffect(() => { if (pkg) setPay((p) => ({ ...p, amount: p.amount || pkg.price_kobo })); }, [pkg]);
  if (!cat) return <Modal title="New booking" onClose={onClose}><Loading /></Modal>;
  const room = cat.rooms.find((r) => r.id === pkg?.room_id);
  const duration = (pkg?.duration_min ?? 0) + f.extraHours * 60;
  const total = (pkg?.price_kobo ?? 0) + f.extraHours * (room?.hourly_kobo || cat.rules.extraHourKobo);
  const when = manual ? { date: mt.date, start: toMin(mt.time) } : slot;
  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api("/admin/bookings", { body: { ...f, extras: [], date: when?.date, start: when?.start, ignoreHours: manual, payment: pay.on && pay.amount > 0 ? { amount: pay.amount, method: pay.method, note: pay.note } : null } });
      toast(`Booking ${r.ref} created`);
      onDone(r.id);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title="New booking" onClose={onClose}>
      <span className="small muted">For clients who book by phone, WhatsApp or in person. Clash checks still apply.</span>
      <div className="field"><label>Service</label>
        <select className="select" value={f.serviceSlug} onChange={(e) => setF({ ...f, serviceSlug: e.target.value, packageId: "" })}>
          <option value="">Choose a service</option>
          {cat.categories.map((c) => <optgroup key={c.slug} label={c.name}>{cat.services.filter((s) => s.category === c.slug).map((s) => <option key={s.id} value={s.slug}>{s.name}</option>)}</optgroup>)}
        </select>
      </div>
      {svc && <div className="field"><label>Package</label>
        <select className="select" value={f.packageId} onChange={(e) => { setF({ ...f, packageId: e.target.value }); setSlot(null); }}>
          <option value="">Choose a package</option>
          {pkgs.map((p) => <option key={p.id} value={p.id}>{p.name} · {cat.rooms.find((r) => r.id === p.room_id)?.name} · {naira(p.price_kobo)}</option>)}
        </select>
      </div>}
      {pkg && <>
        <div className="field"><label>Duration</label><Seg value={String(f.extraHours)} onChange={(v) => { setF({ ...f, extraHours: Number(v) }); setSlot(null); }} options={[0, 1, 2, 3].map((x) => [String(x), hrs(pkg.duration_min + x * 60)] as [string, string])} /></div>
        <label className="row gap8 small"><input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} /> Enter a time manually (allows times outside opening hours)</label>
        {manual
          ? <div className="grid cols-2" style={{ gap: 12 }}><Field label="Date" name="mdate" type="date" value={mt.date} onChange={(e) => setMt({ ...mt, date: e.target.value })} /><Field label="Start time" name="mtime" type="time" value={mt.time} onChange={(e) => setMt({ ...mt, time: e.target.value })} /></div>
          : <SlotPicker duration={duration} room={pkg.room_id} value={slot} onChange={setSlot} days={30} from={lagosToday()} />}
        <div className="grid cols-2" style={{ gap: 12 }}>
          <Field label="Client name" name="cname" value={f.contactName} onChange={(e) => setF({ ...f, contactName: e.target.value })} />
          <Field label="Phone" name="cphone" value={f.contactPhone} onChange={(e) => setF({ ...f, contactPhone: e.target.value })} />
          <Field label="Email (optional)" name="cemail" type="email" value={f.contactEmail} onChange={(e) => setF({ ...f, contactEmail: e.target.value })} hint="Needed for emails and online payment links." />
          <Field label="Artist or project" name="artist" value={f.artistName} onChange={(e) => setF({ ...f, artistName: e.target.value })} />
          <Field label="People" name="people" type="number" value={f.people} onChange={(e) => setF({ ...f, people: Number(e.target.value) })} />
          <div className="field"><label>Booked via</label><select className="select" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}>{Object.entries(SOURCE).filter(([k]) => k !== "online").map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        </div>
        <Area label="Project and requirements" name="project" rows={2} value={f.project} onChange={(e) => setF({ ...f, project: e.target.value })} />
        <div className="field"><label>Status</label><Seg value={f.status} onChange={(v) => setF({ ...f, status: v })} options={[["confirmed", "Confirmed"], ["approved", "Awaiting payment"]]} /><span className="hint">{f.status === "approved" ? "Holds the slot and emails a payment link. It is released if not paid in time." : "Confirmed now. Any unpaid amount shows as a balance."}</span></div>
        {can(user, "record_payments") && <>
          <label className="row gap8 small"><input type="checkbox" checked={pay.on} onChange={(e) => setPay({ ...pay, on: e.target.checked })} /> Record a payment now</label>
          {pay.on && <div className="grid cols-2" style={{ gap: 12 }}>
            <Field label="Amount (₦)" name="pamount" type="number" value={pay.amount / 100} onChange={(e) => setPay({ ...pay, amount: Math.round(Number(e.target.value) * 100) })} />
            <div className="field"><label>Method</label><Seg value={pay.method} onChange={(v) => setPay({ ...pay, method: v })} options={[["transfer", "Transfer"], ["cash", "Cash"], ["pos", "POS"]]} /></div>
          </div>}
        </>}
        <label className="row gap8 small"><input type="checkbox" checked={f.notify} onChange={(e) => setF({ ...f, notify: e.target.checked })} /> Email the client a confirmation</label>
        <div className="panel small row between"><span>{room?.name} · {hrs(duration)}</span><b>{naira(total)}</b></div>
      </>}
      <ErrorBox error={error} />
      <Btn disabled={busy || !pkg || !when || !f.contactName || !f.contactPhone || !f.artistName} onClick={submit}>{busy ? "Saving…" : "Create booking"}</Btn>
    </Modal>
  );
}

export function Clients() {
  const [q, setQ] = useState("");
  const [list] = useApi<any[]>(`/admin/clients?q=${encodeURIComponent(q)}`);
  const [open, setOpen] = useState<string | null>(null);
  const [hist] = useApi<any>(open ? `/admin/clients/history?key=${encodeURIComponent(open)}` : null);
  const { user } = useAuth();
  const [booking, setBooking] = useState<string | null>(null);
  return <>
    <input className="input" style={{ maxWidth: 340 }} placeholder="Search name, email or phone" value={q} onChange={(e) => setQ(e.target.value)} />
    {!list ? <Loading /> : list.length === 0 ? <Empty>No clients match.</Empty> : (
      <div className="scrollx"><table className="table">
        <thead><tr><th>Client</th><th>Contact</th><th>Bookings</th><th>Booked value</th><th>Paid</th><th>Balance</th><th>Last session</th></tr></thead>
        <tbody>{list.map((c) => (
          <tr key={c.key} className="click" onClick={() => setOpen(c.key)}>
            <td><b>{c.name || "Unnamed"}</b>{c.account && <div className="caption">Has an account</div>}</td><td className="small">{c.email || "No email"}<div className="caption">{c.phone}</div></td>
            <td>{c.bookings}</td><td>{naira(c.value)}</td><td>{naira(c.paid)}</td><td>{c.balance > 0 ? <b style={{ color: "#9a5b00" }}>{naira(c.balance)}</b> : naira(0)}</td><td>{c.last_date ? shortDate(c.last_date) : "None"}</td>
          </tr>
        ))}</tbody>
      </table></div>
    )}
    {open && <Modal title={hist?.client.name || "Client"} onClose={() => setOpen(null)}>
      {!hist ? <Loading /> : <>
        <span className="small muted">{[hist.client.email, hist.client.phone].filter(Boolean).join(" · ")}{hist.client.account ? ` · account since ${shortDate(hist.client.since.slice(0, 10))}` : " · no account"}</span>
        {hist.client.phone && <TactileAnchor href={`https://wa.me/${hist.client.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" variant="light" size="md">WhatsApp {hist.client.name.split(" ")[0]}</TactileAnchor>}
        {hist.bookings.length === 0 ? <span className="muted small">No bookings yet.</span> : hist.bookings.map((b: any) => (
          <button key={b.id} type="button" className="row between gap8 histrow" onClick={() => setBooking(b.id)}>
            <span className="small"><b>{b.ref}</b> · {shortDate(b.date)} · {b.package_name} · {b.room_name}</span>
            <span className="row gap8">{b.balance_kobo > 0 && ["confirmed", "completed"].includes(b.status) && <Tag tone="warning">{naira(b.balance_kobo)} due</Tag>}<Tag tone={statusTone(b.status)}>{statusLabel(b.status)}</Tag></span>
          </button>
        ))}
      </>}
    </Modal>}
    {booking && <BookingDrawer id={booking} user={user} onClose={() => setBooking(null)} onChange={() => {}} />}
  </>;
}

export function Availability() {
  const [d, load] = useApi<any>("/admin/availability");
  const [f, setF] = useState<any>(null);
  const [blk, setBlk] = useState({ date: addDays(lagosToday(), 1), start: "10:00", end: "14:00", reason: "", roomId: "" });
  const [error, setError] = useState<string | null>(null);
  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  useEffect(() => { if (d) setF({ hours: d.hours, buffer: Number(d.settings.buffer_min), hold: Number(d.settings.hold_min), minNotice: Number(d.settings.min_notice_min), bookAhead: Number(d.settings.book_ahead_days) }); }, [d]);
  if (!d || !f) return <Loading />;
  const setH = (i: number, patch: any) => setF({ ...f, hours: f.hours.map((h: any, k: number) => (k === i ? { ...h, ...patch } : h)) });
  const addBlock = async () => {
    setError(null);
    try { await api("/admin/blocks", { body: { date: blk.date, start: toMin(blk.start), end: toMin(blk.end), reason: blk.reason, roomId: blk.roomId || null } }); toast("Time blocked"); load(); }
    catch (e: any) { setError(e.message); }
  };
  return (
    <div className="grid cols-2" style={{ alignItems: "start" }}>
      <div className="card stack gap12">
        <h3 className="h4">Opening hours</h3>
        {f.hours.map((h: any, i: number) => (
          <div key={h.weekday} className="row between gap8 small wrapflex">
            <label className="row gap8" style={{ width: 130 }}><input type="checkbox" checked={!!h.is_open} onChange={(e) => setH(i, { is_open: e.target.checked ? 1 : 0 })} />{DAYS[h.weekday]}</label>
            <div className="row gap8"><input className="input" type="time" style={{ width: 120 }} value={hm(h.open_min)} disabled={!h.is_open} onChange={(e) => setH(i, { open_min: toMin(e.target.value) })} /><input className="input" type="time" style={{ width: 120 }} value={hm(h.close_min)} disabled={!h.is_open} onChange={(e) => setH(i, { close_min: toMin(e.target.value) })} /></div>
          </div>
        ))}
        <div className="grid cols-2" style={{ gap: 12 }}>
          <Field label="Buffer between sessions (min)" name="buffer" type="number" value={f.buffer} onChange={(e) => setF({ ...f, buffer: Number(e.target.value) })} />
          <Field label="Checkout hold (min)" name="hold" type="number" value={f.hold} onChange={(e) => setF({ ...f, hold: Number(e.target.value) })} />
          <Field label="Minimum notice (min)" name="minNotice" type="number" value={f.minNotice} onChange={(e) => setF({ ...f, minNotice: Number(e.target.value) })} />
          <Field label="Book ahead (days)" name="bookAhead" type="number" value={f.bookAhead} onChange={(e) => setF({ ...f, bookAhead: Number(e.target.value) })} />
        </div>
        <Btn onClick={() => act(() => api("/admin/availability", { method: "PUT", body: f }), "Availability saved", load)}>Save hours and rules</Btn>
      </div>
      <div className="card stack gap12">
        <h3 className="h4">Block time</h3>
        <div className="grid cols-2" style={{ gap: 12 }}>
          <Field label="Date" name="bdate" type="date" value={blk.date} onChange={(e) => setBlk({ ...blk, date: e.target.value })} />
          <div className="field"><label>Room</label><select className="select" value={blk.roomId} onChange={(e) => setBlk({ ...blk, roomId: e.target.value })}><option value="">All rooms</option>{d.rooms.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
          <Field label="From" name="bstart" type="time" value={blk.start} onChange={(e) => setBlk({ ...blk, start: e.target.value })} />
          <Field label="To" name="bend" type="time" value={blk.end} onChange={(e) => setBlk({ ...blk, end: e.target.value })} />
        </div>
        <Field label="Reason" name="breason" value={blk.reason} onChange={(e) => setBlk({ ...blk, reason: e.target.value })} placeholder="Maintenance, private event…" />
        <ErrorBox error={error} />
        <Btn kind="neutral" onClick={addBlock}>Block this time</Btn>
        {d.blocks.map((k: any) => (
          <div key={k.id} className="row between small" style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}><span><b>{shortDate(k.date)}</b> {t12(k.start_min)} to {t12(k.end_min)} · {k.room_name ?? "All rooms"} · {k.reason}</span><button className="link" onClick={() => act(() => api(`/admin/blocks/${k.id}`, { method: "DELETE" }), "Block removed", load)}>Remove</button></div>
        ))}
      </div>
    </div>
  );
}
