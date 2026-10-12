import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { DashShell, Empty, SlotPicker, Stat, type NavEntry } from "../components/Dash";
import { Area, Btn, ErrorBox, Field, Loading, Modal, Tag, toast } from "../components/ui";
import { Icon } from "../components/brand";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { dateTime, hrs, longDate, naira, shortDate, statusTone, t12 } from "../lib/format";

const ITEMS: NavEntry[] = [
  { to: "/account", label: "Overview", icon: "grid", end: true },
  { to: "/account/bookings", label: "Bookings", icon: "calendar" },
  { to: "/account/payments", label: "Payments", icon: "receipt" },
  { to: "/account/profile", label: "Profile", icon: "user" },
];

interface Overview { bookings: any[]; payments: any[]; notifications: any[] }

function useOverview() {
  const [d, setD] = useState<Overview | null>(null);
  const load = () => api<Overview>("/account/overview").then(setD);
  useEffect(() => { load(); }, []);
  return [d, load] as const;
}

const upcoming = (b: any[]) => b.filter((x) => x.status === "confirmed").sort((a, b) => (a.date + a.start_min).localeCompare(b.date + b.start_min));

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  const { user, ready } = useAuth();
  if (!ready) return <Loading />;
  if (!user) return <Navigate to="/login?next=/account" replace />;
  if (user.role !== "client") return <Navigate to="/admin" replace />;
  return <DashShell items={ITEMS} title={title} action={<Link to="/book" className="btn sm">Book a session</Link>}>{children}</DashShell>;
}

function VerifyBanner() {
  const { user } = useAuth();
  if (!user || user.emailVerified) return null;
  const resend = async () => { await api("/auth/resend-verification", { method: "POST" }); toast("Verification email sent"); };
  return <div className="panel row between wrapflex gap12" style={{ background: "var(--cream)" }}><span><b>Verify your email.</b> <span className="muted">We sent a link to {user.email}.</span></span><Btn size="sm" kind="neutral" onClick={resend}>Resend link</Btn></div>;
}

function BookingRow({ b }: { b: any }) {
  return (
    <Link to={`/account/bookings/${b.id}`} className="card row between gap16 wrapflex" style={{ padding: 18 }}>
      <div className="row gap16">
        <div style={{ width: 56, textAlign: "center" }}><div className="mono faint">{shortDate(b.date).split(" ")[0]}</div><b style={{ fontSize: 24 }}>{b.date.slice(8)}</b></div>
        <div><b>{b.package_name}</b><div className="small muted">{b.service_name} · {t12(b.start_min)} to {t12(b.end_min)}</div></div>
      </div>
      <div className="row gap12">{b.pendingRequest && <Tag tone="warning">Request pending</Tag>}<Tag tone={statusTone(b.status)}>{b.status.replace("_", " ")}</Tag><Icon name="arrow" size={18} /></div>
    </Link>
  );
}

export function AccountHome() {
  const { user } = useAuth();
  const [d, load] = useOverview();
  const read = async () => { await api("/account/notifications/read", { method: "POST" }); load(); };
  return (
    <Shell title={`Hi, ${user?.name.split(" ")[0] ?? ""}`}>
      <VerifyBanner />
      {!d ? <Loading /> : (() => {
        const next = upcoming(d.bookings)[0];
        const unread = d.notifications.filter((n) => !n.read_at).length;
        return <>
          {next ? (
            <div className="card row between wrapflex gap24" style={{ background: "var(--brand)", color: "#fff", border: 0, padding: 32 }}>
              <div className="stack gap8"><span className="mono" style={{ color: "var(--neon)" }}>Next session · {next.ref}</span><h2 className="h2">{longDate(next.date)}</h2><span style={{ opacity: .75 }}>{t12(next.start_min)} to {t12(next.end_min)} · {next.package_name} · Studio A</span></div>
              <Link to={`/account/bookings/${next.id}`} className="btn neon">View booking <Icon name="arrow" size={18} /></Link>
            </div>
          ) : <Empty>No upcoming sessions. <Link to="/book" className="link">Book one</Link></Empty>}
          <div className="grid cols-3">
            <Stat label="Upcoming" value={upcoming(d.bookings).length} />
            <Stat label="Sessions booked" value={d.bookings.length} />
            <Stat label="Paid to date" value={naira(d.payments.filter((p) => p.status === "success").reduce((s, p) => s + p.amount_kobo, 0))} />
          </div>
          <div className="grid cols-2" style={{ alignItems: "start" }}>
            <div className="card stack gap12">
              <div className="row between"><h3 className="h4">Notifications {unread > 0 && <Tag tone="success">{unread} new</Tag>}</h3>{unread > 0 && <button className="link small" onClick={read}>Mark all read</button>}</div>
              {d.notifications.length === 0 ? <span className="muted small">Nothing yet.</span> : d.notifications.slice(0, 6).map((n) => (
                <div key={n.id} className="stack" style={{ borderTop: "1px solid var(--line)", paddingTop: 10, opacity: n.read_at ? .6 : 1 }}><b className="small">{n.title}</b><span className="small muted">{n.body}</span><span className="caption">{dateTime(n.created_at)}</span></div>
              ))}
            </div>
            <div className="card stack gap12">
              <div className="row between"><h3 className="h4">Recent payments</h3><Link to="/account/payments" className="link small">All payments</Link></div>
              {d.payments.length === 0 ? <span className="muted small">No payments yet.</span> : d.payments.slice(0, 5).map((p) => (
                <div key={p.id} className="row between" style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}><div><b className="small">{p.package_name ?? "Booking"}</b><div className="caption">{p.reference}</div></div><div className="row gap8"><b className="small">{naira(p.amount_kobo)}</b><Tag tone={statusTone(p.status)}>{p.status}</Tag></div></div>
              ))}
            </div>
          </div>
        </>;
      })()}
    </Shell>
  );
}

export function AccountBookings() {
  const [d] = useOverview();
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const list = d ? (tab === "upcoming" ? upcoming(d.bookings) : d.bookings.filter((b) => b.status !== "confirmed")) : [];
  return (
    <Shell title="My bookings">
      <div className="seg" style={{ alignSelf: "flex-start" }}><button className={tab === "upcoming" ? "on" : ""} onClick={() => setTab("upcoming")}>Upcoming</button><button className={tab === "past" ? "on" : ""} onClick={() => setTab("past")}>Past and cancelled</button></div>
      {!d ? <Loading /> : list.length === 0 ? <Empty>No bookings here.</Empty> : <div className="stack gap12">{list.map((b) => <BookingRow key={b.id} b={b} />)}</div>}
    </Shell>
  );
}

export function AccountBooking() {
  const { id = "" } = useParams();
  const [d, setD] = useState<any>(null);
  const [modal, setModal] = useState<"reschedule" | "cancel" | null>(null);
  const [pick, setPick] = useState<{ date: string; start: number } | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => api(`/account/bookings/${id}`).then(setD);
  useEffect(() => { load(); }, [id]); // eslint-disable-line
  const send = async () => {
    setBusy(true); setError(null);
    try {
      await api(`/account/bookings/${id}/requests`, { body: { kind: modal, newDate: pick?.date, newStart: pick?.start, reason } });
      setModal(null); toast("Request sent to the studio"); load();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  if (!d) return <Shell title="Booking"><Loading /></Shell>;
  const { booking: b, payment: p, policy, pendingRequest } = d;
  const canChange = b.status === "confirmed" && !pendingRequest;
  return (
    <Shell title={`Booking ${b.ref}`}>
      <Link to="/account/bookings" className="link small noprint">← All bookings</Link>
      <div className="grid" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,360px)", alignItems: "start" }} data-stack>
        <div className="card stack gap16">
          <div className="row between wrapflex gap12"><h2 className="h3">{b.package_name}</h2><Tag tone={statusTone(b.status)}>{b.status.replace("_", " ")}</Tag></div>
          <div className="grid cols-2" style={{ gap: 16 }}>
            {[["Service", b.service_name], ["Date", longDate(b.date)], ["Time", `${t12(b.start_min)} to ${t12(b.end_min)}`], ["Duration", hrs(b.end_min - b.start_min)], ["Artist", b.artist_name], ["People", b.people], ["Contact", `${b.contact_name} · ${b.contact_phone}`], ["Studio", "14 Admiralty Way, Lekki Phase 1"]].map(([k, v]) => (
              <div key={k}><div className="mono faint">{k}</div><b style={{ fontWeight: 500 }}>{v}</b></div>
            ))}
          </div>
          {b.notes && <div className="panel small">{b.notes}</div>}
          {pendingRequest && <div className="panel" style={{ background: "var(--cream)" }}><b>{pendingRequest.kind === "cancel" ? "Cancellation" : "Reschedule"} request pending.</b> <span className="muted">The studio will reply by email{pendingRequest.new_date ? `. Requested ${shortDate(pendingRequest.new_date)} at ${t12(pendingRequest.new_start_min)}` : ""}.</span></div>}
          {canChange && (
            <div className="row gap12 wrapflex noprint">
              <Btn kind="neutral" onClick={() => { setModal("reschedule"); setPick(null); setReason(""); }}>Request reschedule</Btn>
              <Btn kind="danger" onClick={() => { setModal("cancel"); setReason(""); }}>Request cancellation</Btn>
            </div>
          )}
          {b.status === "confirmed" && <span className="caption">{policy.freeReschedule ? "You can reschedule once for free, up to 48 hours before." : "Free rescheduling has closed for this booking."} If cancelled now, {Math.round(policy.refundShare * 100)}% ({naira(policy.refundAmount)}) is refunded.</span>}
        </div>
        <Receipt b={b} p={p} />
      </div>
      {modal && (
        <Modal title={modal === "cancel" ? "Request cancellation" : "Request a new time"} onClose={() => setModal(null)}>
          {modal === "reschedule" ? <SlotPicker duration={b.end_min - b.start_min} value={pick} onChange={setPick} /> : <div className="panel small">Under the policy you accepted, cancelling now refunds {Math.round(policy.refundShare * 100)}%, which is {naira(policy.refundAmount)}.</div>}
          <Area label="Reason (optional)" name="reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          <ErrorBox error={error} />
          <Btn arrow onClick={send} disabled={busy || (modal === "reschedule" && !pick)} kind={modal === "cancel" ? "danger" : ""}>Send request</Btn>
        </Modal>
      )}
    </Shell>
  );
}

function Receipt({ b, p }: { b: any; p: any }) {
  return (
    <div className="card stack gap12">
      <div className="row between"><h3 className="h4">Receipt</h3><button className="link small noprint" onClick={() => window.print()}>Print</button></div>
      <div className="row between small"><span className="muted">{b.package_name}</span><span>{naira(b.package_price_kobo)}</span></div>
      {b.extras.map((e: any) => <div key={e.slug ?? e.name} className="row between small"><span className="muted">{e.name}</span><span>{naira(e.price)}</span></div>)}
      <div className="divider" />
      <div className="row between"><b>Total paid</b><b>{naira(b.total_kobo)}</b></div>
      {p && <div className="stack gap4 small muted"><span>Reference {p.reference}</span><span>{p.provider === "demo" ? "Test payment" : "Paystack"} · {p.channel ?? "card"} · {p.paid_at ? dateTime(p.paid_at) : ""}</span><span>Status <Tag tone={statusTone(p.status)}>{p.status}</Tag></span></div>}
      <span className="caption">Policy version {b.policy_version} accepted at booking.</span>
    </div>
  );
}

export function AccountPayments() {
  const [d] = useOverview();
  return (
    <Shell title="Payments and receipts">
      {!d ? <Loading /> : d.payments.length === 0 ? <Empty>No payments yet.</Empty> : (
        <div className="scrollx"><table className="table">
          <thead><tr><th>Date</th><th>Booking</th><th>Reference</th><th>Amount</th><th>Status</th><th /></tr></thead>
          <tbody>{d.payments.map((p) => {
            const b = d.bookings.find((x) => x.ref === p.booking_ref);
            return <tr key={p.id}><td>{dateTime(p.paid_at ?? p.created_at)}</td><td>{p.booking_ref ?? "None"}<div className="caption">{p.package_name}</div></td><td className="mono">{p.reference}</td><td>{naira(p.amount_kobo)}</td><td><Tag tone={statusTone(p.status)}>{p.status}</Tag></td><td>{b && <Link to={`/account/bookings/${b.id}`} className="link small">Receipt</Link>}</td></tr>;
          })}</tbody>
        </table></div>
      )}
    </Shell>
  );
}

export function AccountProfile() {
  const { user, refresh } = useAuth();
  const [f, setF] = useState({ name: user?.name ?? "", phone: user?.phone ?? "" });
  const [pw, setPw] = useState({ current: "", password: "", confirmPassword: "" });
  const [err, setErr] = useState<{ p?: string; w?: string }>({});
  const save = async (e: React.FormEvent) => { e.preventDefault(); try { await api("/auth/profile", { method: "PUT", body: f }); await refresh(); toast("Profile saved"); setErr({}); } catch (x: any) { setErr({ p: x.message }); } };
  const change = async (e: React.FormEvent) => { e.preventDefault(); try { await api("/auth/password", { method: "PUT", body: pw }); toast("Password changed"); setPw({ current: "", password: "", confirmPassword: "" }); setErr({}); } catch (x: any) { setErr({ w: x.message }); } };
  return (
    <Shell title="Profile">
      <VerifyBanner />
      <div className="grid cols-2" style={{ alignItems: "start" }}>
        <form className="card stack gap16" onSubmit={save}>
          <h3 className="h4">Your details</h3>
          <Field label="Full name" name="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <Field label="Email" name="email" value={user?.email ?? ""} disabled hint={user?.emailVerified ? "Verified" : "Not verified yet"} />
          <Field label="Phone number" name="phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          <ErrorBox error={err.p} /><Btn>Save details</Btn>
        </form>
        <form className="card stack gap16" onSubmit={change}>
          <h3 className="h4">Change password</h3>
          <Field label="Current password" name="current" type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
          <Field label="New password" name="password" type="password" hint="At least 8 characters, with a number" value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} />
          <Field label="Confirm new password" name="confirmPassword" type="password" value={pw.confirmPassword} onChange={(e) => setPw({ ...pw, confirmPassword: e.target.value })} />
          <ErrorBox error={err.w} /><Btn kind="neutral">Change password</Btn>
        </form>
      </div>
    </Shell>
  );
}
