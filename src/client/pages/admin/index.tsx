import { useState, type ReactNode } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { DashShell, Empty, Restricted, Stat, type NavEntry } from "../../components/Dash";
import { Area, Btn, Field, Loading, Modal, Seg, Tag } from "../../components/ui";
import { TactileAnchor } from "../../components/kitchen";
import { Icon } from "../../components/brand";
import { api } from "../../lib/api";
import { can, roleLabel, useAuth, type User } from "../../lib/auth";
import { isOwner, staffChangeBlocked, type Level } from "../../../shared/permissions";
import { addDays, dateTime, lagosToday, naira, shortDate, statusLabel, statusTone, t12 } from "../../lib/format";
import { act, useApi } from "./kit";
import { useCatalog } from "../../lib/catalog";
import { Availability, BookingDrawer, Bookings, Calendar, Clients } from "./bookings";
import { Catalogue } from "./catalog";
import { Website } from "./content";

type Access = { perm?: string; any?: string[] };
const SECTIONS: (NavEntry & Access & { key: string; title: string })[] = [
  { key: "", to: "/admin", label: "Overview", title: "Overview", icon: "grid", end: true },
  { key: "calendar", to: "/admin/calendar", label: "Calendar", title: "Calendar", icon: "calendar", perm: "view_calendar" },
  { key: "bookings", to: "/admin/bookings", label: "Bookings", title: "Bookings", icon: "list", perm: "view_calendar" },
  { key: "clients", to: "/admin/clients", label: "Clients", title: "Clients and history", icon: "users", perm: "view_calendar", any: ["manage_bookings", "update_booking_details", "assist_clients", "record_payments"] },
  { key: "availability", to: "/admin/availability", label: "Availability", title: "Availability", icon: "clock", perm: "edit_availability" },
  { key: "catalogue", to: "/admin/catalogue", label: "Services and pricing", title: "Services, packages and rooms", icon: "music", perm: "edit_packages" },
  { key: "enquiries", to: "/admin/enquiries", label: "Enquiries", title: "Enquiries and quotes", icon: "chat", perm: "assist_clients" },
  { key: "website", to: "/admin/website", label: "Website", title: "Website content", icon: "pencil", perm: "edit_content" },
  { key: "online-booking", to: "/admin/online-booking", label: "Online booking", title: "What clients can book online", icon: "calendar", perm: "toggle_booking_categories" },
  { key: "verify", to: "/admin/verify", label: "Verify payment", title: "Verify a payment reference", icon: "card", perm: "verify_payments" },
  { key: "payments", to: "/admin/payments", label: "Payments", title: "Payments and balances", icon: "card", perm: "view_payments" },
  { key: "reports", to: "/admin/reports", label: "Reports", title: "Reports", icon: "chart", perm: "view_reports" },
  { key: "staff", to: "/admin/staff", label: "Staff", title: "Staff and permissions", icon: "shield", perm: "manage_staff" },
  { key: "audit", to: "/admin/audit", label: "Audit log", title: "Audit log and email outbox", icon: "receipt", perm: "view_audit" },
];
const allowed = (u: User | null, s: Access) => (s.perm ? can(u, s.perm) : true) && (s.any ? s.any.some((p) => can(u, p)) : true);

export function Admin() {
  const { section = "" } = useParams();
  const { user, ready } = useAuth();
  if (!ready) return <Loading />;
  if (!user) return <Navigate to="/staff/login" replace />;
  if (user.role === "client") return <Navigate to="/account" replace />;
  const s = SECTIONS.find((x) => x.key === section) ?? SECTIONS[0];
  const Page = PAGES[s.key];
  return (
    <DashShell dark items={SECTIONS.map((x) => ({ ...x, locked: !allowed(user, x) }))} title={s.title}>
      {allowed(user, s) ? <Page /> : <Restricted what={s.title.toLowerCase()} />}
    </DashShell>
  );
}

function Checklist({ setup }: { setup: Record<string, boolean> }) {
  const items: [boolean, string, string, string][] = [
    [setup.payments, "Connect Paystack", "Add the live secret key so clients pay through Paystack instead of the test checkout.", ""],
    [setup.email, "Turn on email delivery", "Add a Resend API key so booking emails reach clients. Until then they are logged in the outbox.", "/admin/audit"],
    [setup.domain, "Connect your domain", "Point your own domain at the site so links and emails use it.", ""],
    [setup.contact, "Check contact details", "Replace the sample phone, email, address and WhatsApp number.", "/admin/website"],
    [false, "Replace sample content", "Swap the sample team, equipment, portfolio, testimonials and photos for real ones, and send the official logo.", "/admin/website"],
    [setup.analytics, "Add analytics", "Paste a Cloudflare Web Analytics token or a Google Analytics ID.", "/admin/website"],
    [setup.indexing, "Allow search engines", "Turn on indexing once everything above is done.", "/admin/website"],
  ];
  const done = items.filter(([d]) => d).length;
  return (
    <div className="card stack gap12">
      <div className="row between"><h3 className="h4">Launch checklist</h3><span className="mono muted">{done} of {items.length} done</span></div>
      {items.map(([ok, t, d, to]) => (
        <div key={t} className="row gap12 checkrow" style={{ alignItems: "flex-start" }}>
          <span className={`checkdot ${ok ? "on" : ""}`}>{ok && <Icon name="check" size={14} />}</span>
          <div className="grow"><b className="small">{t}</b><div className="caption">{d}</div></div>
          {to && !ok && <Link to={to} className="link small">Open</Link>}
        </div>
      ))}
      <span className="caption">Keys and domains are set in Cloudflare. See OPERATIONS.md in the project for the steps.</span>
    </div>
  );
}

function Overview() {
  const { user } = useAuth();
  const [d, load] = useApi<any>("/admin/overview");
  const [open, setOpen] = useState<string | null>(null);
  if (!d) return <Loading />;
  const r = d.report;
  return <>
    <div className="grid cols-4">
      <Stat label="Sessions today" value={d.todays.length} />
      <Stat label="Waiting for approval" value={d.approvals.length} note={d.approvals.length ? "Decide before they expire" : undefined} />
      <Stat label="Client requests" value={d.requests.length} note={`${d.newEnquiries} new enquiries`} />
      {r ? <Stat label="Booked this month" value={naira(r.bookedValue)} note={`${naira(r.outstanding)} outstanding · ${r.utilisation}% utilised`} /> : <Stat label="Finance" value="CEO only" />}
    </div>
    {d.approvals.length > 0 && (
      <div className="card stack gap12">
        <div className="row between"><h3 className="h4">Booking requests to approve</h3><Link to="/admin/bookings" className="link small">All bookings</Link></div>
        {d.approvals.map((b: any) => (
          <button key={b.id} type="button" className="row between gap12 histrow" onClick={() => setOpen(b.id)}>
            <span className="small"><b>{b.ref} · {b.artist_name}</b> · {b.package_name} · {b.room_name} · {shortDate(b.date)} {t12(b.start_min)}</span>
            <span className="row gap8"><span className="caption">Expires {b.expires_at ? dateTime(b.expires_at) : "never"}</span><Tag tone="warning">Review</Tag></span>
          </button>
        ))}
      </div>
    )}
    <div className="grid cols-2" style={{ alignItems: "start" }}>
      <div className="card stack gap12">
        <h3 className="h4">Today · {shortDate(d.today)}</h3>
        {d.todays.length === 0 ? <span className="muted small">No sessions today.</span> : d.todays.map((b: any) => (
          <button key={b.id} type="button" className="row between histrow" onClick={() => setOpen(b.id)}><div style={{ textAlign: "left" }}><b className="small">{t12(b.start_min)} · {b.artist_name}</b><div className="caption">{b.package_name} · {b.room_name} · {b.ref}</div></div><Tag tone={statusTone(b.status)}>{statusLabel(b.status)}</Tag></button>
        ))}
      </div>
      <div className="card stack gap12">
        <h3 className="h4">Reschedule and cancellation requests</h3>
        {d.requests.length === 0 ? <span className="muted small">Nothing waiting.</span> : d.requests.map((q: any) => (
          <div key={q.id} className="stack gap8" style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
            <div className="row between"><b className="small">{q.kind === "cancel" ? "Cancel" : "Reschedule"} · {q.ref} · {q.artist_name}</b><Tag tone="warning">pending</Tag></div>
            <span className="small muted">{q.room_name} · {shortDate(q.date)} {t12(q.start_min)}{q.new_date ? ` → ${shortDate(q.new_date)} ${t12(q.new_start_min)}` : ""}{q.reason ? ` · “${q.reason}”` : ""}</span>
            {can(user, "manage_bookings") && <div className="row gap8">
              <Btn size="sm" onClick={() => act(() => api(`/admin/requests/${q.id}`, { body: { approve: true } }), "Request approved", load)}>Approve</Btn>
              <Btn size="sm" kind="neutral" onClick={() => act(() => api(`/admin/requests/${q.id}`, { body: { approve: false } }), "Request declined", load)}>Decline</Btn>
            </div>}
          </div>
        ))}
      </div>
    </div>
    {d.setup && <Checklist setup={d.setup} />}
    {open && <BookingDrawer id={open} user={user} onClose={() => setOpen(null)} onChange={load} />}
  </>;
}

function Enquiries() {
  const [list, load] = useApi<any[]>("/admin/enquiries");
  const [tab, setTab] = useState<"open" | "quote" | "all">("open");
  const [reply, setReply] = useState<any>(null);
  const [msg, setMsg] = useState("");
  if (!list) return <Loading />;
  const shown = list.filter((e) => (tab === "all" ? true : tab === "quote" ? e.kind === "quote" : e.status !== "closed"));
  return <>
    <Seg value={tab} onChange={setTab} options={[["open", "Open"], ["quote", "Quote requests"], ["all", "All"]]} />
    {shown.length === 0 ? <Empty>Nothing here.</Empty> : shown.map((e) => (
      <div key={e.id} className="card stack gap8">
        <div className="row between wrapflex gap8"><b>{e.kind === "quote" ? `Quote · ${e.service || "Project"}` : `${e.topic}${e.service ? ` · ${e.service}` : ""}`} · {e.name}</b><div className="row gap8"><span className="caption">{dateTime(e.created_at)}</span>{e.kind === "quote" && <Tag tone="brand">Quote</Tag>}<Tag tone={statusTone(e.status)}>{e.status}</Tag></div></div>
        <span className="small muted">{e.email}{e.phone ? ` · ${e.phone}` : ""}{e.budget ? ` · Budget ${e.budget}` : ""}{e.timeline ? ` · ${e.timeline}` : ""}</span>
        <p className="small" style={{ whiteSpace: "pre-wrap" }}>{e.message}</p>
        {e.links && <span className="small" style={{ overflowWrap: "anywhere" }}>Links: {e.links}</span>}
        <div className="row gap8 wrapflex">
          <Btn size="sm" kind="neutral" onClick={() => { setReply(e); setMsg(""); }}>Reply by email</Btn>
          {e.phone && <TactileAnchor href={`https://wa.me/${e.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" variant="light" size="md">WhatsApp</TactileAnchor>}
          {e.status !== "closed" && <Btn size="sm" kind="neutral" onClick={() => act(() => api(`/admin/enquiries/${e.id}/close`, { method: "POST" }), "Marked as closed", load)}>Close</Btn>}
        </div>
      </div>
    ))}
    {reply && <Modal title={`Reply to ${reply.name}`} onClose={() => setReply(null)}>
      <Area label="Message" name="msg" rows={7} value={msg} onChange={(e) => setMsg(e.target.value)} />
      <Btn onClick={() => act(() => api(`/admin/enquiries/${reply.id}/reply`, { body: { message: msg } }), "Reply sent", () => { setReply(null); load(); })}>Send reply</Btn>
    </Modal>}
  </>;
}

const KIND: Record<string, string> = { full: "Full", deposit: "Deposit", balance: "Balance", manual: "Recorded" };

function Payments() {
  const [d] = useApi<any>("/admin/payments");
  const [tab, setTab] = useState<"payments" | "outstanding">("payments");
  if (!d) return <Loading />;
  const list = d.payments;
  const received = list.filter((p: any) => ["success", "refunded"].includes(p.status)).reduce((a: number, p: any) => a + p.amount_kobo, 0);
  const refunded = list.reduce((a: number, p: any) => a + p.refunded_kobo, 0);
  const outstanding = d.outstanding.reduce((a: number, b: any) => a + b.balance, 0);
  return <>
    <div className="grid cols-4"><Stat label="Received" value={naira(received)} /><Stat label="Refunded" value={naira(refunded)} /><Stat label="Outstanding balances" value={naira(outstanding)} note={`${d.outstanding.length} bookings`} /><Stat label="Failed attempts" value={list.filter((p: any) => p.status === "failed").length} /></div>
    <Seg value={tab} onChange={setTab} options={[["payments", "Payments"], ["outstanding", "Outstanding balances"]]} />
    {tab === "payments" ? (
      <div className="scrollx"><table className="table">
        <thead><tr><th>Date</th><th>Reference</th><th>Client</th><th>Booking</th><th>Type</th><th>Method</th><th>Amount</th><th>Status</th></tr></thead>
        <tbody>{list.map((p: any) => <tr key={p.id}><td className="nowrap">{dateTime(p.paid_at ?? p.created_at)}</td><td className="mono">{p.reference}</td><td>{p.client}</td><td>{p.booking_ref ?? "None"}</td><td>{KIND[p.kind] ?? p.kind}</td><td>{p.provider === "manual" ? `${p.channel} (staff)` : `${p.provider === "demo" ? "Test" : "Paystack"}${p.channel ? ` · ${p.channel}` : ""}`}</td><td>{naira(p.amount_kobo)}{p.refunded_kobo > 0 && <div className="caption">{naira(p.refunded_kobo)} refunded</div>}</td><td><Tag tone={statusTone(p.status)}>{p.status}</Tag></td></tr>)}</tbody>
      </table></div>
    ) : d.outstanding.length === 0 ? <Empty>No outstanding balances.</Empty> : (
      <div className="scrollx"><table className="table">
        <thead><tr><th>Booking</th><th>Session</th><th>Client</th><th>Total</th><th>Paid</th><th>Balance</th></tr></thead>
        <tbody>{d.outstanding.map((b: any) => <tr key={b.id}><td className="mono">{b.ref}</td><td>{shortDate(b.date)} · {t12(b.start_min)}</td><td>{b.contact_name}<div className="caption">{b.package_name}</div></td><td>{naira(b.total_kobo)}</td><td>{naira(b.paid)}</td><td><b>{naira(b.balance)}</b></td></tr>)}</tbody>
      </table></div>
    )}
  </>;
}

function Reports() {
  const cat = useCatalog();
  const today = lagosToday();
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(addDays(today, 30));
  const [r] = useApi<any>(`/admin/reports?from=${from}&to=${to}`);
  const max = r ? Math.max(1, ...r.weeks.map((w: any) => w.revenue)) : 1;
  const bar = (label: string, value: number, of: number, note: string) => (
    <div key={label} className="stack gap4"><div className="row between small"><span>{label}</span><span className="muted">{note}</span></div><div className="meter"><i style={{ width: `${Math.min(100, (value / Math.max(1, of)) * 100)}%` }} /></div></div>
  );
  return <>
    <div className="row gap12 wrapflex" style={{ alignItems: "flex-end" }}>
      <Field label="From" name="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
      <Field label="To" name="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      <TactileAnchor variant="light" size="lg" href={`/api/admin/reports.csv?from=${from}&to=${to}`}>Export CSV</TactileAnchor>
    </div>
    {!r ? <Loading /> : <>
      <div className="grid cols-4">
        <Stat label="Booked value" value={naira(r.bookedValue)} note={`${r.bookings} bookings · ${r.cancellations} cancelled or declined`} />
        <Stat label="Collected" value={naira(r.collected)} note={`${naira(r.paymentsReceived)} received in range`} />
        <Stat label="Outstanding" value={naira(r.outstanding)} note={`${r.depositOnly} on a deposit`} />
        <Stat label="Utilisation" value={`${r.utilisation}%`} note={`Booked hours over open hours · ${r.repeatClients}% repeat clients`} />
      </div>
      <div className="grid cols-2" style={{ alignItems: "start" }}>
        <div className="card stack gap16"><h3 className="h4">Booked value by week</h3>
          {r.weeks.length === 0 ? <span className="muted small">No bookings in range.</span> : <div className="bars" style={{ marginTop: 18 }}>{r.weeks.map((w: any) => <div key={w.week} style={{ height: `${(w.revenue / max) * 100}%` }}><span>{naira(w.revenue)}</span></div>)}</div>}
        </div>
        <div className="card stack gap12"><h3 className="h4">Popular packages</h3>
          {r.popular.length === 0 ? <span className="muted small">No bookings in range.</span> : r.popular.map((p: any) => <div key={p.package_name} className="row between small" style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}><span>{p.package_name}</span><span>{p.n} · {naira(p.revenue)}</span></div>)}
          <div className="row between small"><span className="muted">Refunds</span><span>{r.refunds.count} · {naira(r.refunds.total)}</span></div>
        </div>
        <div className="card stack gap12"><h3 className="h4">By category</h3>
          {r.byCategory.length === 0 ? <span className="muted small">No bookings in range.</span> : r.byCategory.map((c: any) => bar(cat?.categories.find((x) => x.slug === c.category)?.name ?? (c.category || "Other"), c.revenue, r.bookedValue, `${c.n} · ${naira(c.revenue)}`))}
        </div>
        <div className="card stack gap12"><h3 className="h4">Rooms</h3>
          {r.byRoom.length === 0 ? <span className="muted small">No bookings in range.</span> : r.byRoom.map((x: any) => bar(x.room_name, x.utilisation, 100, `${x.utilisation}% used · ${naira(x.revenue)}`))}
        </div>
      </div>
    </>}
  </>;
}

function Staff() {
  const { user } = useAuth();
  const [list, load] = useApi<any[]>("/admin/staff");
  const [perms] = useApi<{ permissions: Record<string, string>; levels: Record<string, { label: string; defaults: string[] }>; ownerOnly: string[] }>("/admin/permissions");
  const [edit, setEdit] = useState<any>(null);
  if (!list || !perms || !user) return <Loading />;
  const toggle = (p: string) => setEdit({ ...edit, permissions: edit.permissions.includes(p) ? edit.permissions.filter((x: string) => x !== p) : [...edit.permissions, p] });
  const owner = isOwner(user);
  const levels = Object.entries(perms.levels).filter(([k]) => k !== "ceo" && (owner || k !== "coo"));
  const blocked = edit && staffChangeBlocked(user, edit.id ? list.find((s) => s.id === edit.id) : null, { level: edit.level as Level, permissions: edit.permissions });
  const editable = (s: any) => !staffChangeBlocked(user, s, { level: s.level || "custom", permissions: [] });
  const save = () => edit.id
    ? act(() => api(`/admin/staff/${edit.id}`, { method: "PUT", body: { level: edit.level, permissions: edit.permissions, active: edit.active, title: edit.title } }), "Access updated", () => { setEdit(null); load(); })
    : act(() => api("/admin/staff", { body: { name: edit.name, email: edit.email, title: edit.title, level: edit.level, permissions: edit.permissions } }), "Staff account created, sign-in details emailed", () => { setEdit(null); load(); });
  return <>
    <div className="row between wrapflex gap12"><span className="small muted">Staff accounts are created here only. There is no public staff sign-up.</span><Btn size="sm" onClick={() => setEdit({ name: "", email: "", title: "", level: "receptionist", permissions: [...perms.levels.receptionist.defaults], active: true })}>Add staff</Btn></div>
    <div className="scrollx"><table className="table">
      <thead><tr><th>Name</th><th>Role</th><th>Permissions</th><th>Status</th><th /></tr></thead>
      <tbody>{list.map((s) => <tr key={s.id}><td><b>{s.name}</b><div className="caption">{s.email}</div></td><td>{roleLabel(s)}</td><td className="small">{isOwner(s) ? "Everything" : s.permissions.length ? s.permissions.map((p: string) => p.replace(/_/g, " ")).join(", ") : "None"}</td><td><Tag tone={s.active ? "success" : "danger"}>{s.active ? "Active" : "Suspended"}</Tag></td><td>{editable(s) && <button className="link small" onClick={() => setEdit({ ...s, level: s.level || "custom" })}>Edit access</button>}</td></tr>)}</tbody>
    </table></div>
    <div className="panel small"><b>CEO and COO only:</b> {perms.ownerOnly.join(" · ")}</div>
    {edit && <Modal title={edit.id ? `Access for ${edit.name}` : "Add staff"} onClose={() => setEdit(null)}>
      {!edit.id && <><Field label="Name" name="sname" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /><Field label="Email" name="semail" type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></>}
      <Field label="Job title" name="stitle" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
      <div className="field"><label>Role</label><select className="select" value={edit.level} onChange={(e) => setEdit({ ...edit, level: e.target.value, permissions: [...perms.levels[e.target.value].defaults] })}>
        {levels.map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
      </select><span className="caption">Picking a role fills in its usual permissions. Adjust them below.</span></div>
      {edit.level === "coo" ? <div className="panel small">The COO has the same access as the CEO.</div>
        : <div className="stack gap8">{Object.entries(perms.permissions).map(([k, v]) => <label key={k} className="row gap8 small"><input type="checkbox" checked={edit.permissions.includes(k)} onChange={() => toggle(k)} />{v}</label>)}</div>}
      {edit.id && <label className="row gap8 small"><input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Account active</label>}
      {blocked && <div className="panel small">{blocked}</div>}
      <Btn onClick={save} disabled={!!blocked}>{edit.id ? "Save access" : "Create account"}</Btn>
    </Modal>}
  </>;
}

function OnlineBooking() {
  const [cat, load] = useApi<any>("/catalog");
  if (!cat) return <Loading />;
  const set = (slug: string, bookable: boolean) => act(() => api(`/admin/categories/${slug}/bookable`, { method: "PUT", body: { bookable } }), bookable ? "Open for online booking" : "Closed for online booking", load);
  return <>
    <span className="small muted">Closed categories stay on the website with a quote button, but clients cannot book them online. Staff can still add bookings for them by hand.</span>
    <div className="stack gap12">{cat.categories.map((c: any) => <div key={c.slug} className="card row between wrapflex gap12">
      <div><b>{c.name}</b><div className="caption">{c.bookable ? "Clients can book online" : "Quote requests only"}</div></div>
      <Btn size="sm" kind={c.bookable ? "neutral" : ""} onClick={() => set(c.slug, !c.bookable)}>{c.bookable ? "Close online booking" : "Open online booking"}</Btn>
    </div>)}</div>
  </>;
}

function Verify() {
  const [ref, setRef] = useState("");
  const [p, setP] = useState<any>(null);
  const [error, setError] = useState("");
  const run = async (fn: () => Promise<any>) => { setError(""); try { setP(await fn()); } catch (e: any) { setP(null); setError(e.message); } };
  const find = () => run(() => api(`/admin/payments/lookup?reference=${encodeURIComponent(ref.trim())}`));
  const check = () => run(() => api(`/admin/payments/${encodeURIComponent(p.reference)}/check`, { method: "POST" }));
  return <>
    <form className="row gap12 wrapflex" style={{ alignItems: "flex-end" }} onSubmit={(e) => { e.preventDefault(); find(); }}>
      <Field label="Reference code" name="ref" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="PR..." />
      <Btn type="submit" disabled={!ref.trim()}>Look up</Btn>
    </form>
    {error && <div className="panel small">{error}</div>}
    {p && <div className="card stack gap12">
      <div className="row between wrapflex gap12"><span className="mono">{p.reference}</span><Tag tone={statusTone(p.status)}>{p.status}</Tag></div>
      <div className="grid cols-4"><Stat label="Amount" value={naira(p.amount_kobo)} /><Stat label="Client" value={p.client ?? "Unknown"} /><Stat label="Booking" value={p.booking_ref ?? "Not booked yet"} /><Stat label="Method" value={p.provider === "manual" ? `${p.channel} (staff)` : p.channel ?? p.provider} /></div>
      {p.checked_by ? <span className="small muted">Validated by {p.checked_by_name} on {dateTime(p.checked_at)}</span>
        : ["pending", "success"].includes(p.status) ? <div><Btn onClick={check}>{p.status === "pending" ? "Check with the payment provider and validate" : "Validate payment"}</Btn></div>
        : <span className="small">This payment cannot be validated.</span>}
    </div>}
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
      <tbody>{log.map((a) => <tr key={a.id}><td className="nowrap">{dateTime(a.created_at)}</td><td>{a.actor_label}</td><td><b className="small">{a.action}</b></td><td className="small">{a.target}</td><td className="small muted">{a.detail}</td></tr>)}</tbody>
    </table></div>) : (!box ? <Loading /> : <div className="scrollx"><table className="table">
      <thead><tr><th>When</th><th>To</th><th>Subject</th><th>Status</th></tr></thead>
      <tbody>{box.map((m) => <tr key={m.id} className="click" onClick={() => setMail(m)}><td className="nowrap">{dateTime(m.created_at)}</td><td>{m.to_email}</td><td>{m.subject}</td><td><Tag tone={m.status === "sent" ? "success" : m.status === "failed" ? "danger" : ""}>{m.status}</Tag></td></tr>)}</tbody>
    </table></div>)}
    {mail && <Modal title={mail.subject} onClose={() => setMail(null)}><span className="small muted">To {mail.to_email}</span><pre className="panel small" style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{mail.body}</pre></Modal>}
  </>;
}

const PAGES: Record<string, () => ReactNode> = {
  "": Overview, calendar: Calendar, bookings: Bookings, clients: Clients, availability: Availability, catalogue: Catalogue, enquiries: Enquiries,
  website: Website, payments: Payments, reports: Reports, staff: Staff, audit: Audit, "online-booking": OnlineBooking, verify: Verify,
};
