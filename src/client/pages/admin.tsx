import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useParams } from "react-router-dom";
import { DashShell, Empty, Restricted, SlotPicker, Stat, type NavEntry } from "../components/Dash";
import { Area, Btn, ErrorBox, Field, Loading, Modal, Seg, Tag, toast } from "../components/ui";
import { api } from "../lib/api";
import { can, useAuth, type User } from "../lib/auth";
import { addDays, dateTime, hm, hrs, lagosToday, naira, shortDate, statusTone, t12 } from "../lib/format";

type Access = { perm?: string; ceo?: boolean };
const SECTIONS: (NavEntry & Access & { key: string; title: string })[] = [
  { key: "", to: "/admin", label: "Overview", title: "Overview", icon: "grid", end: true },
  { key: "calendar", to: "/admin/calendar", label: "Calendar", title: "Calendar", icon: "calendar", perm: "view_calendar" },
  { key: "bookings", to: "/admin/bookings", label: "Bookings", title: "Bookings", icon: "list", perm: "view_calendar" },
  { key: "availability", to: "/admin/availability", label: "Availability", title: "Availability", icon: "clock", perm: "edit_availability" },
  { key: "packages", to: "/admin/packages", label: "Packages", title: "Packages and services", icon: "music", perm: "edit_packages" },
  { key: "enquiries", to: "/admin/enquiries", label: "Enquiries", title: "Enquiries", icon: "chat", perm: "assist_clients" },
  { key: "payments", to: "/admin/payments", label: "Payments", title: "Payments", icon: "card", ceo: true },
  { key: "reports", to: "/admin/reports", label: "Reports", title: "Reports", icon: "chart", ceo: true },
  { key: "content", to: "/admin/content", label: "Website & policies", title: "Website and policies", icon: "pencil", ceo: true },
  { key: "staff", to: "/admin/staff", label: "Staff", title: "Staff and permissions", icon: "users", ceo: true },
  { key: "audit", to: "/admin/audit", label: "Audit log", title: "Audit log and email outbox", icon: "shield", ceo: true },
];
const allowed = (u: User | null, s: Access) => (s.ceo ? u?.role === "ceo" : s.perm ? can(u, s.perm) : true);

function useApi<T = any>(path: string | null) {
  const [d, setD] = useState<T | null>(null);
  const load = () => { if (path) api<T>(path).then(setD).catch((e) => toast(e.message)); };
  useEffect(load, [path]); // eslint-disable-line
  return [d, load] as const;
}

async function act(fn: () => Promise<unknown>, ok: string, done?: () => void) {
  try { await fn(); toast(ok); done?.(); } catch (e: any) { toast(e.message); }
}

export function Admin() {
  const { section = "" } = useParams();
  const { user, ready } = useAuth();
  if (!ready) return <Loading />;
  if (!user) return <Navigate to="/staff/login" replace />;
  if (user.role === "client") return <Navigate to="/account" replace />;
  const s = SECTIONS.find((x) => x.key === section) ?? SECTIONS[0];
  const ok = allowed(user, s);
  const Page = PAGES[s.key];
  return (
    <DashShell dark items={SECTIONS.map((x) => ({ ...x, locked: !allowed(user, x) }))} title={s.title}>
      {ok ? <Page /> : <Restricted what={s.title.toLowerCase()} />}
    </DashShell>
  );
}

function Overview() {
  const { user } = useAuth();
  const [d, load] = useApi<any>("/admin/overview");
  if (!d) return <Loading />;
  const r = d.report;
  return <>
    <div className="grid cols-4">
      <Stat label="Sessions today" value={d.todays.length} />
      <Stat label="Pending requests" value={d.requests.length} />
      <Stat label="New enquiries" value={d.newEnquiries} />
      {r ? <Stat label="Booked this month" value={naira(r.bookedValue)} note={`${r.bookings} bookings · ${r.utilisation}% utilised`} /> : <Stat label="Finance" value="CEO only" />}
    </div>
    <div className="grid cols-2" style={{ alignItems: "start" }}>
      <div className="card stack gap12">
        <h3 className="h4">Today · {shortDate(d.today)}</h3>
        {d.todays.length === 0 ? <span className="muted small">No sessions today.</span> : d.todays.map((b: any) => (
          <div key={b.id} className="row between" style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}><div><b className="small">{t12(b.start_min)} · {b.artist_name}</b><div className="caption">{b.package_name} · {b.ref}</div></div><Tag tone={statusTone(b.status)}>{b.status}</Tag></div>
        ))}
      </div>
      <div className="card stack gap12">
        <h3 className="h4">Client requests</h3>
        {d.requests.length === 0 ? <span className="muted small">Nothing waiting.</span> : d.requests.map((q: any) => (
          <div key={q.id} className="stack gap8" style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
            <div className="row between"><b className="small">{q.kind === "cancel" ? "Cancel" : "Reschedule"} · {q.ref} · {q.artist_name}</b><Tag tone="warning">pending</Tag></div>
            <span className="small muted">{shortDate(q.date)} {t12(q.start_min)}{q.new_date ? ` → ${shortDate(q.new_date)} ${t12(q.new_start_min)}` : ""}{q.reason ? ` · “${q.reason}”` : ""}</span>
            {can(user, "manage_bookings") && <div className="row gap8">
              <Btn size="sm" onClick={() => act(() => api(`/admin/requests/${q.id}`, { body: { approve: true } }), "Request approved", load)}>Approve</Btn>
              <Btn size="sm" kind="neutral" onClick={() => act(() => api(`/admin/requests/${q.id}`, { body: { approve: false } }), "Request declined", load)}>Decline</Btn>
            </div>}
          </div>
        ))}
      </div>
    </div>
  </>;
}

function Calendar() {
  const [from, setFrom] = useState(lagosToday());
  const [d] = useApi<any>(`/admin/calendar?from=${from}&to=${addDays(from, 6)}`);
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const START = 600, END = 1320, PX = 0.9;
  const pos = (s: number, e: number) => ({ top: (Math.max(s, START) - START) * PX + 4, height: Math.max((Math.min(e, END) - Math.max(s, START)) * PX - 4, 18) });
  return <>
    <div className="row between wrapflex gap12">
      <div className="row gap8"><Btn size="sm" kind="neutral" onClick={() => setFrom(addDays(from, -7))}>Previous</Btn><Btn size="sm" kind="neutral" onClick={() => setFrom(lagosToday())}>This week</Btn><Btn size="sm" kind="neutral" onClick={() => setFrom(addDays(from, 7))}>Next</Btn></div>
      <div className="row gap8 small"><Tag tone="brand">Booked</Tag><Tag tone="warning">Hold</Tag><Tag>Blocked</Tag></div>
    </div>
    {!d ? <Loading /> : (
      <div className="scrollx"><div className="week" style={{ minWidth: 860 }}>
        <div className="head" />
        {days.map((x) => <div key={x} className="head small"><b>{shortDate(x)}</b></div>)}
        <div style={{ position: "relative", height: (END - START) * PX }}>{Array.from({ length: 12 }, (_, i) => <span key={i} className="caption" style={{ position: "absolute", top: i * 60 * PX, right: 6 }}>{hm(START + i * 60)}</span>)}</div>
        {days.map((x) => (
          <div key={x} className="col" style={{ height: (END - START) * PX }}>
            {d.bookings.filter((b: any) => b.date === x).map((b: any) => <div key={b.id} className={`ev ${b.status}`} style={pos(b.start, b.end)}><b>{t12(b.start)} {b.title}</b><div style={{ opacity: .7 }}>{b.subtitle}</div></div>)}
            {d.holds.filter((h: any) => h.date === x).map((h: any) => <div key={h.id} className="ev hold" style={pos(h.start, h.end)}><b>Hold</b><div>Checkout in progress</div></div>)}
            {d.blocks.filter((k: any) => k.date === x).map((k: any) => <div key={k.id} className="ev block" style={pos(k.start, k.end)}><b>Blocked</b><div>{k.reason}</div></div>)}
          </div>
        ))}
      </div></div>
    )}
  </>;
}

function Bookings() {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [list, load] = useApi<any[]>(`/admin/bookings?q=${encodeURIComponent(q)}&status=${status}`);
  const [open, setOpen] = useState<string | null>(null);
  return <>
    <div className="row gap12 wrapflex">
      <input className="input" style={{ maxWidth: 320 }} placeholder="Search name, email or reference" value={q} onChange={(e) => setQ(e.target.value)} />
      <Seg value={status} onChange={setStatus} options={[["", "All"], ["confirmed", "Confirmed"], ["completed", "Completed"], ["cancelled", "Cancelled"]]} />
    </div>
    {!list ? <Loading /> : list.length === 0 ? <Empty>No bookings match.</Empty> : (
      <div className="scrollx"><table className="table">
        <thead><tr><th>Ref</th><th>Date</th><th>Client</th><th>Package</th><th>Total</th><th>Status</th></tr></thead>
        <tbody>{list.map((b) => <tr key={b.id} className="click" onClick={() => setOpen(b.id)}><td className="mono">{b.ref}</td><td>{shortDate(b.date)} · {t12(b.start_min)}</td><td>{b.artist_name}<div className="caption">{b.contact_email}</div></td><td>{b.package_name}</td><td>{naira(b.total_kobo)}</td><td><Tag tone={statusTone(b.status)}>{b.status}</Tag></td></tr>)}</tbody>
      </table></div>
    )}
    {open && <BookingDrawer id={open} user={user} onClose={() => setOpen(null)} onChange={load} />}
  </>;
}

function BookingDrawer({ id, user, onClose, onChange }: { id: string; user: User | null; onClose: () => void; onChange: () => void }) {
  const [d, load] = useApi<any>(`/admin/bookings/${id}`);
  const [mode, setMode] = useState<"" | "edit" | "move" | "cancel">("");
  const [pick, setPick] = useState<{ date: string; start: number } | null>(null);
  const [f, setF] = useState<any>(null);
  const [reason, setReason] = useState("");
  const [full, setFull] = useState(false);
  const refresh = () => { load(); onChange(); setMode(""); };
  if (!d) return <Modal title="Booking" onClose={onClose}><Loading /></Modal>;
  const b = d.booking;
  return (
    <Modal title={`Booking ${b.ref}`} onClose={onClose}>
      <div className="row gap8"><Tag tone={statusTone(b.status)}>{b.status}</Tag><span className="small muted">{shortDate(b.date)} · {t12(b.start_min)} to {t12(b.end_min)} · {hrs(b.end_min - b.start_min)}</span></div>
      <div className="grid cols-2" style={{ gap: 12 }}>
        {[["Package", b.package_name], ["Artist", b.artist_name], ["Contact", b.contact_name], ["Phone", b.contact_phone], ["Email", b.contact_email], ["People", b.people], ["Price snapshot", naira(b.total_kobo)], ["Payment", d.payment ? `${d.payment.reference} · ${d.payment.status}` : "Hidden"]].map(([k, v]) => <div key={k}><div className="mono faint">{k}</div><span className="small">{v}</span></div>)}
      </div>
      {b.notes && <div className="panel small">{b.notes}</div>}
      {b.status === "confirmed" && mode === "" && (
        <div className="row gap8 wrapflex">
          {can(user, "update_booking_details") && <Btn size="sm" kind="neutral" onClick={() => { setF({ people: b.people, artist_name: b.artist_name, contact_phone: b.contact_phone, notes: b.notes }); setMode("edit"); }}>Edit details</Btn>}
          {can(user, "manage_bookings") && <Btn size="sm" kind="neutral" onClick={() => setMode("move")}>Reschedule</Btn>}
          {can(user, "manage_bookings") && <Btn size="sm" kind="danger" onClick={() => setMode("cancel")}>Cancel</Btn>}
        </div>
      )}
      {mode === "edit" && <div className="stack gap12">
        <Field label="Artist name" name="artist_name" value={f.artist_name} onChange={(e) => setF({ ...f, artist_name: e.target.value })} />
        <Field label="People" name="people" type="number" value={f.people} onChange={(e) => setF({ ...f, people: Number(e.target.value) })} />
        <Field label="Phone" name="contact_phone" value={f.contact_phone} onChange={(e) => setF({ ...f, contact_phone: e.target.value })} />
        <Area label="Notes" name="notes" rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        <Btn onClick={() => act(() => api(`/admin/bookings/${id}/details`, { method: "PUT", body: f }), "Details saved", refresh)}>Save details</Btn>
      </div>}
      {mode === "move" && <div className="stack gap12">
        <SlotPicker duration={b.end_min - b.start_min} value={pick} onChange={setPick} />
        <Btn disabled={!pick} onClick={() => act(() => api(`/admin/bookings/${id}/reschedule`, { body: pick }), "Booking moved, client emailed", refresh)}>Move booking</Btn>
      </div>}
      {mode === "cancel" && <div className="stack gap12">
        <Field label="Reason" name="reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        <label className="row gap8 small"><input type="checkbox" checked={full} onChange={(e) => setFull(e.target.checked)} /> Full refund (studio-initiated)</label>
        <Btn kind="danger" onClick={() => act(() => api(`/admin/bookings/${id}/cancel`, { body: { reason, fullRefund: full } }), "Booking cancelled", refresh)}>Cancel booking</Btn>
      </div>}
    </Modal>
  );
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const toMin = (v: string) => { const [h, m] = v.split(":").map(Number); return h * 60 + (m || 0); };

function Availability() {
  const [d, load] = useApi<any>("/admin/availability");
  const [f, setF] = useState<any>(null);
  const [blk, setBlk] = useState({ date: addDays(lagosToday(), 1), start: "10:00", end: "14:00", reason: "" });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (d) setF({ hours: d.hours, buffer: Number(d.settings.buffer_min), hold: Number(d.settings.hold_min), minNotice: Number(d.settings.min_notice_min), bookAhead: Number(d.settings.book_ahead_days) }); }, [d]);
  if (!d || !f) return <Loading />;
  const setH = (i: number, patch: any) => setF({ ...f, hours: f.hours.map((h: any, k: number) => (k === i ? { ...h, ...patch } : h)) });
  const addBlock = async () => {
    setError(null);
    try { await api("/admin/blocks", { body: { date: blk.date, start: toMin(blk.start), end: toMin(blk.end), reason: blk.reason } }); toast("Time blocked"); load(); }
    catch (e: any) { setError(e.message); }
  };
  return <>
    <div className="grid cols-2" style={{ alignItems: "start" }}>
      <div className="card stack gap12">
        <h3 className="h4">Opening hours</h3>
        {f.hours.map((h: any, i: number) => (
          <div key={h.weekday} className="row between gap8 small">
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
          <Field label="Reason" name="breason" value={blk.reason} onChange={(e) => setBlk({ ...blk, reason: e.target.value })} placeholder="Maintenance" />
          <Field label="From" name="bstart" type="time" value={blk.start} onChange={(e) => setBlk({ ...blk, start: e.target.value })} />
          <Field label="To" name="bend" type="time" value={blk.end} onChange={(e) => setBlk({ ...blk, end: e.target.value })} />
        </div>
        <ErrorBox error={error} />
        <Btn kind="neutral" onClick={addBlock}>Block this time</Btn>
        {d.blocks.map((k: any) => (
          <div key={k.id} className="row between small" style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}><span><b>{shortDate(k.date)}</b> {t12(k.start_min)} to {t12(k.end_min)} · {k.reason}</span><button className="link" onClick={() => act(() => api(`/admin/blocks/${k.id}`, { method: "DELETE" }), "Block removed", load)}>Remove</button></div>
        ))}
      </div>
    </div>
  </>;
}

function Packages() {
  const [d, load] = useApi<any>("/admin/catalog");
  const [edit, setEdit] = useState<any>(null);
  const [svc, setSvc] = useState<any>(null);
  if (!d) return <Loading />;
  const blank = { name: "", description: "", category: "session", durationMin: 120, priceKobo: 0, includes: [], featured: false, active: true };
  const open = (p: any) => setEdit(p ? { id: p.id, name: p.name, description: p.description, category: p.category, durationMin: p.duration_min, priceKobo: p.price_kobo, includes: p.includes, featured: !!p.featured, active: !!p.active } : blank);
  return <>
    <div className="row between"><h3 className="h4">Packages</h3><Btn size="sm" onClick={() => open(null)}>New package</Btn></div>
    <div className="scrollx"><table className="table">
      <thead><tr><th>Package</th><th>Duration</th><th>Price</th><th>Status</th><th /></tr></thead>
      <tbody>{d.packages.map((p: any) => <tr key={p.id}><td><b>{p.name}</b> {p.featured ? <Tag tone="brand">Featured</Tag> : null}<div className="caption">{p.description}</div></td><td>{hrs(p.duration_min)}</td><td>{naira(p.price_kobo)}</td><td><Tag tone={p.active ? "success" : ""}>{p.active ? "Live" : "Hidden"}</Tag></td><td><button className="link small" onClick={() => open(p)}>Edit</button></td></tr>)}</tbody>
    </table></div>
    <div className="row between"><h3 className="h4">Services</h3></div>
    <div className="scrollx"><table className="table">
      <thead><tr><th>Service</th><th>Price label</th><th>Status</th><th /></tr></thead>
      <tbody>{d.services.map((s: any) => <tr key={s.id}><td><b>{s.name}</b><div className="caption">{s.description}</div></td><td>{s.price_label}</td><td><Tag tone={s.active ? "success" : ""}>{s.active ? "Live" : "Hidden"}</Tag></td><td><button className="link small" onClick={() => setSvc({ ...s, active: !!s.active })}>Edit</button></td></tr>)}</tbody>
    </table></div>
    {edit && (
      <Modal title={edit.id ? "Edit package" : "New package"} onClose={() => setEdit(null)}>
        <Field label="Name" name="pname" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
        <Area label="Description" name="pdesc" rows={2} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
        <div className="grid cols-2" style={{ gap: 12 }}>
          <Field label="Price (₦)" name="price" type="number" value={edit.priceKobo / 100} onChange={(e) => setEdit({ ...edit, priceKobo: Math.round(Number(e.target.value) * 100) })} />
          <Field label="Duration (min)" name="dur" type="number" value={edit.durationMin} onChange={(e) => setEdit({ ...edit, durationMin: Number(e.target.value) })} />
        </div>
        <Area label="What is included (one per line)" name="inc" rows={3} value={edit.includes.join("\n")} onChange={(e) => setEdit({ ...edit, includes: e.target.value.split("\n").filter(Boolean).slice(0, 6) })} />
        <Seg value={edit.category} onChange={(v) => setEdit({ ...edit, category: v })} options={[["session", "Studio session"], ["post", "Recording + post"]]} />
        <label className="row gap8 small"><input type="checkbox" checked={edit.featured} onChange={(e) => setEdit({ ...edit, featured: e.target.checked })} /> Featured</label>
        <label className="row gap8 small"><input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Live on the website</label>
        <span className="caption">Price changes apply to new bookings only. Past bookings keep the price they paid.</span>
        <div className="row gap8">
          <Btn onClick={() => act(() => api("/admin/packages", { body: edit }), "Package saved", () => { setEdit(null); load(); })}>Save package</Btn>
          {edit.id && <Btn kind="danger" onClick={() => act(() => api(`/admin/packages/${edit.id}`, { method: "DELETE" }), "Package removed", () => { setEdit(null); load(); })}>Delete</Btn>}
        </div>
      </Modal>
    )}
    {svc && (
      <Modal title="Edit service" onClose={() => setSvc(null)}>
        <Field label="Name" name="sname" value={svc.name} onChange={(e) => setSvc({ ...svc, name: e.target.value })} />
        <Area label="Description" name="sdesc" rows={3} value={svc.description} onChange={(e) => setSvc({ ...svc, description: e.target.value })} />
        <Field label="Price label" name="slabel" value={svc.price_label} onChange={(e) => setSvc({ ...svc, price_label: e.target.value })} />
        <label className="row gap8 small"><input type="checkbox" checked={svc.active} onChange={(e) => setSvc({ ...svc, active: e.target.checked })} /> Live on the website</label>
        <Btn onClick={() => act(() => api(`/admin/services/${svc.id}`, { method: "PUT", body: { name: svc.name, description: svc.description, price_label: svc.price_label, active: svc.active } }), "Service saved", () => { setSvc(null); load(); })}>Save service</Btn>
      </Modal>
    )}
  </>;
}

function Enquiries() {
  const [list, load] = useApi<any[]>("/admin/enquiries");
  const [reply, setReply] = useState<any>(null);
  const [msg, setMsg] = useState("");
  if (!list) return <Loading />;
  return <>
    {list.length === 0 ? <Empty>No enquiries yet.</Empty> : list.map((e) => (
      <div key={e.id} className="card stack gap8">
        <div className="row between wrapflex gap8"><b>{e.topic} · {e.name}</b><div className="row gap8"><span className="caption">{dateTime(e.created_at)}</span><Tag tone={statusTone(e.status)}>{e.status}</Tag></div></div>
        <span className="small muted">{e.email}{e.phone ? ` · ${e.phone}` : ""}</span>
        <p className="small">{e.message}</p>
        <Btn size="sm" kind="neutral" style={{ alignSelf: "flex-start" }} onClick={() => { setReply(e); setMsg(""); }}>Reply by email</Btn>
      </div>
    ))}
    {reply && <Modal title={`Reply to ${reply.name}`} onClose={() => setReply(null)}>
      <Area label="Message" name="msg" rows={6} value={msg} onChange={(e) => setMsg(e.target.value)} />
      <Btn onClick={() => act(() => api(`/admin/enquiries/${reply.id}/reply`, { body: { message: msg } }), "Reply sent", () => { setReply(null); load(); })}>Send reply</Btn>
    </Modal>}
  </>;
}

function Payments() {
  const [list] = useApi<any[]>("/admin/payments");
  if (!list) return <Loading />;
  const sum = (s: string) => list.filter((p) => p.status === s).reduce((a, p) => a + p.amount_kobo, 0);
  return <>
    <div className="grid cols-3"><Stat label="Received" value={naira(sum("success"))} /><Stat label="Refunded" value={naira(sum("refunded"))} /><Stat label="Failed attempts" value={list.filter((p) => p.status === "failed").length} /></div>
    <div className="scrollx"><table className="table">
      <thead><tr><th>Date</th><th>Reference</th><th>Client</th><th>Booking</th><th>Provider</th><th>Amount</th><th>Status</th></tr></thead>
      <tbody>{list.map((p) => <tr key={p.id}><td>{dateTime(p.paid_at ?? p.created_at)}</td><td className="mono">{p.reference}</td><td>{p.client}</td><td>{p.booking_ref ?? "None"}</td><td>{p.provider === "demo" ? "Test" : "Paystack"}{p.verified_via ? ` · ${p.verified_via}` : ""}</td><td>{naira(p.amount_kobo)}</td><td><Tag tone={statusTone(p.status)}>{p.status}</Tag></td></tr>)}</tbody>
    </table></div>
  </>;
}

function Reports() {
  const today = lagosToday();
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(addDays(today, 30));
  const [r] = useApi<any>(`/admin/reports?from=${from}&to=${to}`);
  const max = r ? Math.max(1, ...r.weeks.map((w: any) => w.revenue)) : 1;
  return <>
    <div className="row gap12 wrapflex" style={{ alignItems: "flex-end" }}>
      <Field label="From" name="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
      <Field label="To" name="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      <a className="btn neutral" href={`/api/admin/reports.csv?from=${from}&to=${to}`}>Export CSV</a>
    </div>
    {!r ? <Loading /> : <>
      <div className="grid cols-4">
        <Stat label="Booked value" value={naira(r.bookedValue)} /><Stat label="Bookings" value={r.bookings} note={`${r.cancellations} cancelled`} />
        <Stat label="Utilisation" value={`${r.utilisation}%`} note="Booked hours over open hours" /><Stat label="Repeat clients" value={`${r.repeatClients}%`} />
      </div>
      <div className="grid cols-2" style={{ alignItems: "start" }}>
        <div className="card stack gap16"><h3 className="h4">Revenue by week</h3>
          {r.weeks.length === 0 ? <span className="muted small">No bookings in range.</span> : <div className="bars" style={{ marginTop: 18 }}>{r.weeks.map((w: any) => <div key={w.week} style={{ height: `${(w.revenue / max) * 100}%` }}><span>{naira(w.revenue)}</span></div>)}</div>}
        </div>
        <div className="card stack gap12"><h3 className="h4">Popular packages</h3>
          {r.popular.map((p: any) => <div key={p.package_name} className="row between small" style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}><span>{p.package_name}</span><span>{p.n} · {naira(p.revenue)}</span></div>)}
          <div className="row between small"><span className="muted">Refunds</span><span>{r.refunds.count} · {naira(r.refunds.total)}</span></div>
          <div className="row between small"><span className="muted">Payments received</span><span>{r.paymentsReceived}</span></div>
        </div>
      </div>
    </>}
  </>;
}

function Content() {
  const [d, load] = useApi<any>("/admin/content");
  const [pol, setPol] = useState<any>(null);
  const [c, setC] = useState<Record<string, string> | null>(null);
  useEffect(() => { if (d) setC(d.content); }, [d]);
  if (!d || !c) return <Loading />;
  return <>
    <div className="card stack gap12">
      <h3 className="h4">Home page</h3>
      <Field label="Hero headline" name="hero_title" value={c.hero_title ?? ""} onChange={(e) => setC({ ...c, hero_title: e.target.value })} />
      <Area label="Hero text" name="hero_subtitle" rows={2} value={c.hero_subtitle ?? ""} onChange={(e) => setC({ ...c, hero_subtitle: e.target.value })} />
      <Field label="Studio address" name="studio_address" value={c.studio_address ?? ""} onChange={(e) => setC({ ...c, studio_address: e.target.value })} />
      <Btn style={{ alignSelf: "flex-start" }} onClick={() => act(() => api("/admin/content", { method: "PUT", body: c }), "Website updated", load)}>Publish changes</Btn>
    </div>
    <div className="card stack gap8">
      <h3 className="h4">Policies</h3>
      {d.policies.map((p: any) => <div key={p.slug} className="row between gap12" style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}><div><b className="small">{p.title}</b><div className="caption">{p.body.slice(0, 110)}…</div></div><button className="link small" onClick={() => setPol({ ...p })}>Edit</button></div>)}
    </div>
    {pol && <Modal title={`Edit ${pol.title}`} onClose={() => setPol(null)}>
      <Field label="Title" name="ptitle" value={pol.title} onChange={(e) => setPol({ ...pol, title: e.target.value })} />
      <Area label="Policy text" name="pbody" rows={7} value={pol.body} onChange={(e) => setPol({ ...pol, body: e.target.value })} />
      <span className="caption">Publishing creates a new policy version. Existing bookings keep the version they accepted.</span>
      <Btn onClick={() => act(() => api(`/admin/policies/${pol.slug}`, { method: "PUT", body: { title: pol.title, body: pol.body } }), "Policy published", () => { setPol(null); load(); })}>Publish policy</Btn>
    </Modal>}
  </>;
}

function Staff() {
  const { user } = useAuth();
  const [list, load] = useApi<any[]>("/admin/staff");
  const [perms] = useApi<{ permissions: Record<string, string>; ceoOnly: string[] }>("/admin/permissions");
  const [edit, setEdit] = useState<any>(null);
  if (!list || !perms) return <Loading />;
  const toggle = (p: string) => setEdit({ ...edit, permissions: edit.permissions.includes(p) ? edit.permissions.filter((x: string) => x !== p) : [...edit.permissions, p] });
  const save = () => edit.id
    ? act(() => api(`/admin/staff/${edit.id}`, { method: "PUT", body: { permissions: edit.permissions, active: edit.active, title: edit.title } }), "Access updated", () => { setEdit(null); load(); })
    : act(() => api("/admin/staff", { body: { name: edit.name, email: edit.email, title: edit.title, permissions: edit.permissions } }), "Staff account created, sign-in details emailed", () => { setEdit(null); load(); });
  return <>
    <div className="row between wrapflex gap12"><span className="small muted">Staff accounts are created here only. There is no public staff sign-up.</span><Btn size="sm" onClick={() => setEdit({ name: "", email: "", title: "", permissions: [], active: true })}>Add staff</Btn></div>
    <div className="scrollx"><table className="table">
      <thead><tr><th>Name</th><th>Role</th><th>Permissions</th><th>Status</th><th /></tr></thead>
      <tbody>{list.map((s) => <tr key={s.id}><td><b>{s.name}</b><div className="caption">{s.email}</div></td><td>{s.role === "ceo" ? "CEO" : s.title || "Admin"}</td><td className="small">{s.role === "ceo" ? "Everything" : s.permissions.length ? s.permissions.map((p: string) => p.replace(/_/g, " ")).join(", ") : "None"}</td><td><Tag tone={s.active ? "success" : "danger"}>{s.active ? "Active" : "Suspended"}</Tag></td><td>{s.id !== user?.id && s.role !== "ceo" && <button className="link small" onClick={() => setEdit({ ...s })}>Edit access</button>}</td></tr>)}</tbody>
    </table></div>
    <div className="panel small"><b>CEO only:</b> {perms.ceoOnly.join(" · ")}</div>
    {edit && <Modal title={edit.id ? `Access for ${edit.name}` : "Add staff"} onClose={() => setEdit(null)}>
      {!edit.id && <><Field label="Name" name="sname" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /><Field label="Email" name="semail" type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></>}
      <Field label="Job title" name="stitle" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
      <div className="stack gap8">{Object.entries(perms.permissions).map(([k, v]) => <label key={k} className="row gap8 small"><input type="checkbox" checked={edit.permissions.includes(k)} onChange={() => toggle(k)} />{v}</label>)}</div>
      {edit.id && <label className="row gap8 small"><input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Account active</label>}
      <Btn onClick={save}>{edit.id ? "Save access" : "Create account"}</Btn>
    </Modal>}
  </>;
}

function Audit() {
  const [tab, setTab] = useState<"audit" | "outbox">("audit");
  const [log] = useApi<any[]>("/admin/audit");
  const [box] = useApi<any[]>("/admin/outbox");
  const [mail, setMail] = useState<any>(null);
  return <>
    <Seg value={tab} onChange={setTab} options={[["audit", "Audit log"], ["outbox", "Email outbox"]]} />
    {tab === "audit" ? (!log ? <Loading /> : <div className="scrollx"><table className="table">
      <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Target</th><th>Detail</th></tr></thead>
      <tbody>{log.map((a) => <tr key={a.id}><td>{dateTime(a.created_at)}</td><td>{a.actor_label}</td><td><b className="small">{a.action}</b></td><td className="small">{a.target}</td><td className="small muted">{a.detail}</td></tr>)}</tbody>
    </table></div>) : (!box ? <Loading /> : <div className="scrollx"><table className="table">
      <thead><tr><th>When</th><th>To</th><th>Subject</th><th>Status</th></tr></thead>
      <tbody>{box.map((m) => <tr key={m.id} className="click" onClick={() => setMail(m)}><td>{dateTime(m.created_at)}</td><td>{m.to_email}</td><td>{m.subject}</td><td><Tag tone={m.status === "sent" ? "success" : m.status === "failed" ? "danger" : ""}>{m.status}</Tag></td></tr>)}</tbody>
    </table></div>)}
    {mail && <Modal title={mail.subject} onClose={() => setMail(null)}><span className="small muted">To {mail.to_email}</span><pre className="panel small" style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{mail.body}</pre></Modal>}
  </>;
}

const PAGES: Record<string, () => ReactNode> = {
  "": Overview, calendar: Calendar, bookings: Bookings, availability: Availability, packages: Packages, enquiries: Enquiries,
  payments: Payments, reports: Reports, content: Content, staff: Staff, audit: Audit,
};
