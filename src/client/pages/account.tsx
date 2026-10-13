import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { DashShell, Empty, SlotPicker, Stat, type NavEntry } from "../components/Dash";
import { Area, Btn, ErrorBox, Loading, Modal, Tag, toast } from "../components/ui";
import { Icon } from "../components/brand";
import { HoldToConfirm, TactileLink } from "../components/kitchen";
import { ProfileForms } from "../components/ProfileForms";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { dateTime, hrs, lagosToday, longDate, naira, payState, shortDate, statusLabel, statusTone, t12 } from "../lib/format";

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

const ACTIVE = ["pending", "approved", "confirmed"];
const upcoming = (b: any[]) => b.filter((x) => ACTIVE.includes(x.status) && x.date >= lagosToday()).sort((a, b) => (a.date + String(a.start_min).padStart(4, "0")).localeCompare(b.date + String(b.start_min).padStart(4, "0")));
const PAY_KIND: Record<string, string> = { full: "Full payment", deposit: "Deposit", balance: "Balance", manual: "Paid at the studio" };

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  const { user, ready } = useAuth();
  if (!ready) return <Loading />;
  if (!user) return <Navigate to="/login?next=/account" replace />;
  if (user.role !== "client") return <Navigate to="/admin" replace />;
  return <DashShell items={ITEMS} title={title} action={<TactileLink to="/book" size="md">Book a session</TactileLink>}>{children}</DashShell>;
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
        <div><b>{b.package_name}</b><div className="small muted">{b.service_name} · {b.room_name} · {t12(b.start_min)} to {t12(b.end_min)}</div></div>
      </div>
      <div className="row gap8 wrapflex">{b.pendingRequest && <Tag tone="warning">Request pending</Tag>}{["confirmed", "completed"].includes(b.status) && b.balance_kobo > 0 && <Tag tone="warning">{naira(b.balance_kobo)} due</Tag>}<Tag tone={statusTone(b.status)}>{statusLabel(b.status)}</Tag><Icon name="arrow" size={18} /></div>
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
        const next = upcoming(d.bookings).find((b) => b.status === "confirmed");
        const waiting = upcoming(d.bookings).filter((b) => b.status !== "confirmed");
        const unread = d.notifications.filter((n) => !n.read_at).length;
        const due = d.bookings.filter((b) => ["confirmed", "completed"].includes(b.status)).reduce((s, b) => s + b.balance_kobo, 0);
        return <>
          {waiting.map((w) => (
            <div key={w.id} className="panel row between wrapflex gap12" style={{ background: w.status === "approved" ? "var(--neon-soft)" : "var(--cream)" }}>
              <span><b>{w.status === "approved" ? `Approved: pay to confirm ${w.ref}` : `Waiting for the studio to approve ${w.ref}`}</b> <span className="muted">{w.package_name} · {shortDate(w.date)} · {t12(w.start_min)}</span></span>
              <TactileLink to={w.status === "approved" ? `/pay/${w.id}` : `/account/bookings/${w.id}`} size="md" variant={w.status === "approved" ? "neon" : "light"}>{w.status === "approved" ? "Pay now" : "View request"}</TactileLink>
            </div>
          ))}
          {next ? (
            <div className="card row between wrapflex gap24 nextcard">
              <div className="stack gap8"><span className="mono" style={{ color: "var(--neon)" }}>Next session · {next.ref}</span><h2 className="h2">{longDate(next.date)}</h2><span style={{ opacity: .75 }}>{t12(next.start_min)} to {t12(next.end_min)} · {next.package_name} · {next.room_name}</span>{next.balance_kobo > 0 && <span className="mono" style={{ color: "var(--yellow)" }}>{naira(next.balance_kobo)} balance due before the session</span>}</div>
              <TactileLink to={`/account/bookings/${next.id}`} variant="neon" size="lg">View booking <Icon name="arrow" size={18} /></TactileLink>
            </div>
          ) : !waiting.length && <Empty>No upcoming sessions. <Link to="/book" className="link">Book one</Link></Empty>}
          <div className="grid cols-4">
            <Stat label="Upcoming" value={upcoming(d.bookings).length} />
            <Stat label="Bookings" value={d.bookings.length} />
            <Stat label="Paid to date" value={naira(d.payments.filter((p) => p.status !== "failed").reduce((s, p) => s + p.amount_kobo - p.refunded_kobo, 0))} />
            <Stat label="Balance due" value={naira(due)} />
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
                <div key={p.id} className="row between" style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}><div><b className="small">{p.package_name ?? "Booking"}</b><div className="caption">{PAY_KIND[p.kind] ?? p.kind} · {p.reference}</div></div><div className="row gap8"><b className="small">{naira(p.amount_kobo)}</b><Tag tone={statusTone(p.status)}>{p.status}</Tag></div></div>
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
  const list = d ? (tab === "upcoming" ? upcoming(d.bookings) : d.bookings.filter((b) => !upcoming(d.bookings).includes(b))) : [];
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
  const withdraw = async () => { try { await api(`/account/bookings/${id}/withdraw`, { method: "POST" }); toast("Request withdrawn"); load(); } catch (e: any) { toast(e.message); } };
  if (!d) return <Shell title="Booking"><Loading /></Shell>;
  const { booking: b, payments, policy, pendingRequest, due } = d;
  const canChange = b.status === "confirmed" && !pendingRequest;
  return (
    <Shell title={`Booking ${b.ref}`}>
      <Link to="/account/bookings" className="link small noprint">← All bookings</Link>
      {b.status === "pending" && <div className="panel" style={{ background: "var(--cream)" }}><b>Waiting for studio approval.</b> <span className="muted">We hold this time for you{b.expires_at ? ` until ${dateTime(b.expires_at)}` : ""}. You will get an email with a payment link once it is approved. Nothing has been charged.</span></div>}
      {b.status === "approved" && <div className="panel row between wrapflex gap12" style={{ background: "var(--neon-soft)" }}><span><b>Approved.</b> <span className="muted">Pay {due.deposit ? `the ${naira(due.deposit)} deposit or the full ${naira(due.full)}` : naira(due.full)}{b.expires_at ? ` by ${dateTime(b.expires_at)}` : ""} to confirm.{b.decision_note ? ` Note from the studio: ${b.decision_note}` : ""}</span></span><TactileLink to={`/pay/${b.id}`} size="lg">Pay now <Icon name="arrow" size={18} /></TactileLink></div>}
      {b.status === "rejected" && <div className="panel" style={{ background: "var(--danger-soft)" }}><b>The studio could not take this booking.</b> <span className="muted">{b.decision_note}</span></div>}
      {b.status === "cancelled" && b.cancel_reason && <div className="panel"><b>Cancelled.</b> <span className="muted">{b.cancel_reason}</span></div>}
      <div className="grid" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,360px)", alignItems: "start" }} data-stack>
        <div className="card stack gap16">
          <div className="row between wrapflex gap12"><h2 className="h3">{b.package_name}</h2><div className="row gap8"><Tag tone={statusTone(b.status)}>{statusLabel(b.status)}</Tag>{b.rescheduled_at && <Tag>Rescheduled</Tag>}</div></div>
          <div className="grid cols-2" style={{ gap: 16 }}>
            {[["Service", b.service_name], ["Room", b.room_name], ["Date", longDate(b.date)], ["Time", `${t12(b.start_min)} to ${t12(b.end_min)}`], ["Duration", hrs(b.end_min - b.start_min)], ["Artist or project", b.artist_name], ["People", b.people], ["Contact", `${b.contact_name} · ${b.contact_phone}`]].map(([k, v]) => (
              <div key={k}><div className="mono faint">{k}</div><b style={{ fontWeight: 500 }}>{v}</b></div>
            ))}
          </div>
          {b.project && <div className="panel small"><span className="mono faint">Project</span><br />{b.project}</div>}
          {b.notes && <div className="panel small"><span className="mono faint">Special requirements</span><br />{b.notes}</div>}
          {b.reference_links && <div className="small"><span className="mono faint">Reference links</span><br /><span style={{ overflowWrap: "anywhere" }}>{b.reference_links}</span></div>}
          {pendingRequest && <div className="panel" style={{ background: "var(--cream)" }}><b>{pendingRequest.kind === "cancel" ? "Cancellation" : "Reschedule"} request pending.</b> <span className="muted">The studio will reply by email{pendingRequest.new_date ? `. Requested ${shortDate(pendingRequest.new_date)} at ${t12(pendingRequest.new_start_min)}` : ""}.</span></div>}
          <div className="row gap12 wrapflex noprint">
            {canChange && <Btn kind="neutral" onClick={() => { setModal("reschedule"); setPick(null); setReason(""); }}>Request reschedule</Btn>}
            {canChange && <Btn kind="danger" onClick={() => { setModal("cancel"); setReason(""); }}>Request cancellation</Btn>}
            {["pending", "approved"].includes(b.status) && b.paid_kobo === 0 && <HoldToConfirm onConfirm={withdraw} confirmed="Withdrawn">Hold to withdraw request</HoldToConfirm>}
          </div>
          {b.status === "confirmed" && <span className="caption">{policy.freeReschedule ? "You can reschedule once for free, up to 48 hours before." : "Free rescheduling has closed for this booking."} If cancelled now, {Math.round(policy.refundShare * 100)}% of what you paid ({naira(policy.refundAmount)}) is refunded.</span>}
        </div>
        <Receipt b={b} payments={payments} due={due} />
      </div>
      {modal && (
        <Modal title={modal === "cancel" ? "Request cancellation" : "Request a new time"} onClose={() => setModal(null)}>
          {modal === "reschedule" ? <SlotPicker duration={b.end_min - b.start_min} room={b.room_id} value={pick} onChange={setPick} /> : <div className="panel small">Under the policy you accepted, cancelling now refunds {Math.round(policy.refundShare * 100)}% of what you paid, which is {naira(policy.refundAmount)}.</div>}
          <Area label="Reason (optional)" name="reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          <ErrorBox error={error} />
          {modal === "cancel"
            ? <HoldToConfirm block onConfirm={send} disabled={busy} confirmed="Request sent">Hold to request cancellation</HoldToConfirm>
            : <Btn arrow onClick={send} disabled={busy || !pick}>Send request</Btn>}
        </Modal>
      )}
    </Shell>
  );
}

function Receipt({ b, payments, due }: { b: any; payments: any[]; due: any }) {
  return (
    <div className="card stack gap12">
      <div className="row between"><h3 className="h4">Receipt</h3><button className="link small noprint" onClick={() => window.print()}>Print</button></div>
      <div className="row between small"><span className="muted">{b.package_name}</span><span>{naira(b.package_price_kobo)}</span></div>
      {b.extras.map((e: any) => <div key={e.slug ?? e.name} className="row between small"><span className="muted">{e.name}</span><span>{naira(e.price)}</span></div>)}
      <div className="divider" />
      <div className="row between"><b>Total</b><b>{naira(b.total_kobo)}</b></div>
      <div className="row between small"><span className="muted">Paid</span><span>{naira(b.paid_kobo)}</span></div>
      {b.refunded_kobo > 0 && <div className="row between small"><span className="muted">Refunded</span><span>{naira(b.refunded_kobo)}</span></div>}
      {["confirmed", "completed", "approved"].includes(b.status) && <div className="row between"><b>{b.balance_kobo > 0 ? "Balance due" : "Payment"}</b><b>{b.balance_kobo > 0 ? naira(b.balance_kobo) : payState(b)}</b></div>}
      {due.kind === "balance" && due.full > 0 && <TactileLink to={`/pay/${b.id}`} size="lg" block className="noprint">Pay {naira(due.full)} balance</TactileLink>}
      {payments.length > 0 && <div className="stack gap8" style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
        {payments.map((p: any) => (
          <div key={p.id} className="stack small"><div className="row between"><b>{PAY_KIND[p.kind] ?? p.kind}</b><span>{naira(p.amount_kobo)}</span></div>
            <span className="caption">{p.provider === "manual" ? `Recorded at the studio · ${p.channel}` : `${p.provider === "demo" ? "Test payment" : "Paystack"} · ${p.channel ?? "card"}`} · {p.paid_at ? dateTime(p.paid_at) : ""} · {p.reference}{p.refunded_kobo > 0 ? ` · ${naira(p.refunded_kobo)} refunded` : ""}</span></div>
        ))}
      </div>}
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
          <thead><tr><th>Date</th><th>Booking</th><th>Type</th><th>Reference</th><th>Amount</th><th>Status</th><th /></tr></thead>
          <tbody>{d.payments.map((p) => {
            const b = d.bookings.find((x) => x.ref === p.booking_ref);
            return <tr key={p.id}><td>{dateTime(p.paid_at ?? p.created_at)}</td><td>{p.booking_ref ?? "None"}<div className="caption">{p.package_name}</div></td><td>{PAY_KIND[p.kind] ?? p.kind}</td><td className="mono">{p.reference}</td><td>{naira(p.amount_kobo)}{p.refunded_kobo > 0 && <div className="caption">{naira(p.refunded_kobo)} refunded</div>}</td><td><Tag tone={statusTone(p.status)}>{p.status}</Tag></td><td>{b && <Link to={`/account/bookings/${b.id}`} className="link small">Receipt</Link>}</td></tr>;
          })}</tbody>
        </table></div>
      )}
    </Shell>
  );
}

export function AccountProfile() {
  return <Shell title="Profile"><VerifyBanner /><ProfileForms /></Shell>;
}
