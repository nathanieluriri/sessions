import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Nav, usePageTitle } from "../components/Layout";
import { Icon, Mark, Waveform } from "../components/brand";
import { Btn, ErrorBox, Field, Loading } from "../components/ui";
import { Barcode, ReceiptPrinter, ScrambleText, TactileAnchor, TactileLink, type PrinterStage } from "../components/kitchen";
import { BookingTicket } from "../components/BookingTicket";
import { useCatalog, useContent } from "../lib/catalog";
import { loadDraft, clearDraft } from "../lib/draft";
import { addDays, dateTime, lagosToday, longDate, naira, shortDate, statusLabel, t12 } from "../lib/format";
import { whenLine, windowLabel } from "../lib/booking";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Shell, priced, useDraft, useGuard } from "./book-flow";

export { BookDetails, BookPackage, BookReview, BookService, BookTime } from "./book-flow";

function useHoldCountdown(holdId?: string) {
  const [hold, setHold] = useState<{ status: string; expiresAt: string; bookingId: string | null } | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (holdId) api(`/holds/${holdId}`).then(setHold).catch(() => setHold({ status: "expired", expiresAt: "", bookingId: null })); }, [holdId]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const left = hold?.expiresAt ? Math.max(0, Date.parse(hold.expiresAt) - now) : 0;
  const label = `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, "0")}`;
  return { hold, left, label, expired: hold ? hold.status !== "active" || left === 0 : false };
}

const CHANNELS = [["card", "Card", "Visa, Mastercard and Verve", "card"], ["bank_transfer", "Bank transfer", "Pay from any Nigerian bank app", "receipt"], ["ussd", "USSD", "Dial a code from your phone", "phone"]];

function ChannelPicker({ channel, setChannel }: { channel: string; setChannel: (v: string) => void }) {
  return (
    <div className="card stack gap12">
      <h3 className="h4">Pay with</h3>
      {CHANNELS.map(([v, t, s, i]) => (
        <button key={v} type="button" className={`opt ${channel === v ? "on" : ""}`} onClick={() => setChannel(v)}>
          <span className="sumicon light"><Icon name={i} /></span>
          <span className="grow stack"><b>{t}</b><span className="small muted">{s}</span></span><span className="radio" />
        </button>
      ))}
    </div>
  );
}

export function BookCheckout() {
  const cat = useCatalog();
  const [d] = useDraft();
  const nav = useNavigate();
  const { user, setUser } = useAuth();
  const { hold, label, expired } = useHoldCountdown(d.holdId);
  const blocked = useGuard(cat, d, "checkout");
  const [tab, setTab] = useState<"register" | "login">("register");
  const [f, setF] = useState({ name: d.contactName, email: d.contactEmail, phone: d.contactPhone, password: "", confirmPassword: "" });
  const [channel, setChannel] = useState("card");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!d.holdId) nav("/book/review", { replace: true }); }, [d.holdId, nav]);
  useEffect(() => { if (hold?.bookingId) nav(`/book/confirmed/${hold.bookingId}`, { replace: true }); }, [hold, nav]);
  if (!cat || !hold || blocked) return <><Nav /><Loading /></>;
  const { total, deposit, approval, payNow, mode, win } = priced(cat, d);
  const remote = mode === "project";
  if (expired) return (
    <Shell at="checkout" title={remote ? "This checkout timed out." : "This slot is no longer held."} sub={remote ? "Nothing has been charged and your details are saved. Review your order to start again." : "Your hold ran out before you finished, so the time was released. You have not been charged and your details are saved."} cat={cat} d={d} back="/book/review">
      <div className="row gap12"><TactileLink to={remote ? "/book/review" : "/book/time"} size="lg">{remote ? "Review your order" : "Pick another time"} <Icon name="arrow" size={18} /></TactileLink></div>
    </Shell>
  );
  const auth = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const r = tab === "register" ? await api("/auth/register", { body: f }) : await api("/auth/login", { body: { email: f.email, password: f.password } });
      setUser(r.user);
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };
  const pay = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api("/checkout", { body: { holdId: d.holdId, plan: d.plan } });
      sessionStorage.setItem("psych.channel", channel);
      window.location.assign(r.authorizationUrl);
    } catch (err: any) { setError(err.message); setBusy(false); }
  };
  const request = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api("/requests", { body: { holdId: d.holdId } });
      clearDraft();
      nav(`/book/requested/${r.booking.id}`, { replace: true });
    } catch (err: any) { setError(err.message); setBusy(false); }
  };
  const holdMsg = remote ? null : `Slot held for ${label}`;
  const heldFor = d.date ? `${shortDate(d.date)}${win && mode === "slot" ? `, ${windowLabel(d.date, win.start, win.end)}` : ""}` : "";
  if (!user || user.role !== "client") return (
    <Shell at="checkout" title={approval ? "Log in or create an account to send your request." : "Log in or create an account to pay."} sub="Your details are saved. You come straight back here after." cat={cat} d={d} hold={holdMsg} back="/book/review">
      {!remote && <div className="holdmsg">We are holding {heldFor} for you. {label} left to finish.</div>}
      <form className="card stack gap16 authcard" onSubmit={auth}>
        <div className="seg" style={{ alignSelf: "flex-start" }}><button type="button" className={tab === "register" ? "on" : ""} onClick={() => setTab("register")}>Create account</button><button type="button" className={tab === "login" ? "on" : ""} onClick={() => setTab("login")}>Log in</button></div>
        {tab === "register" && <Field label="Full name" name="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />}
        <div className="grid cols-2" style={{ gap: 16 }}>
          <Field label="Email" name="email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
          {tab === "register" && <Field label="Phone number" name="phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} required />}
        </div>
        <div className="grid cols-2" style={{ gap: 16 }}>
          <Field label="Password" name="password" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} hint={tab === "register" ? "At least 8 characters, with a number" : undefined} required />
          {tab === "register" && <Field label="Confirm password" name="confirmPassword" type="password" value={f.confirmPassword} onChange={(e) => setF({ ...f, confirmPassword: e.target.value })} required />}
        </div>
        {tab === "register" && <div className="panel small muted" style={{ padding: 14 }}>We will email you a link to verify your address. Verify any time before your {remote ? "files are ready" : "session"}.</div>}
        {tab === "login" && <Link to="/forgot-password" className="small" style={{ color: "var(--brand)", fontWeight: 500 }}>Forgot password?</Link>}
        <ErrorBox error={error} />
        <Btn arrow block disabled={busy}>{busy ? "Please wait…" : tab === "register" ? "Create account and continue" : "Log in and continue"}</Btn>
      </form>
    </Shell>
  );
  const signedIn = <div className="row gap8 small signedin"><span className="avatar" style={{ width: 24, height: 24, fontSize: 10 }}>{user.name.slice(0, 2).toUpperCase()}</span>Signed in as {user.email}</div>;
  if (approval) return (
    <Shell at="checkout" title="Send your booking request" sub="The studio reviews it and replies within 24 hours. Nothing is charged now." cat={cat} d={d} hold={holdMsg} back="/book/review">
      {signedIn}
      <div className="card stack gap12">
        {[["1", "Send the request", remote ? "The studio reviews your request." : "We hold this time for you while the studio reviews it."], ["2", "The studio approves it", "You get an email with a secure payment link."], ["3", "Pay to confirm", `Pay ${deposit < total ? `a ${naira(deposit)} deposit or the full ${naira(total)}` : naira(total)} within ${cat.rules.paymentWindowHours} hours and you are booked.`]].map(([n, t, s]) => (
          <div key={n} className="row gap12" style={{ alignItems: "flex-start" }}><span className="stepnum">{n}</span><div><b>{t}</b><div className="small muted">{s}</div></div></div>
        ))}
      </div>
      <ErrorBox error={error} />
      <div className="row between desk-actions"><TactileLink to="/book/review" variant="light" size="lg">Back</TactileLink><Btn arrow onClick={request} disabled={busy}>{busy ? "Sending…" : "Send booking request"}</Btn></div>
      <div className="stickybar"><TactileLink to="/book/review" variant="light" size="lg" className="stickyback" aria-label="Back">‹</TactileLink><div className="grow stickyinfo"><b>{naira(total)}</b><div className="caption">Nothing to pay now</div></div><Btn arrow onClick={request} disabled={busy}>Send request</Btn></div>
    </Shell>
  );
  return (
    <Shell at="checkout" title={`Pay ${naira(payNow)}`} sub={payNow < total ? `Deposit now, ${naira(total - payNow)} ${remote ? "before your finished files are released" : "before your session"}. Secure checkout with Paystack.` : "Secure checkout with Paystack."} cat={cat} d={d} hold={holdMsg} back="/book/review">
      {signedIn}
      <ChannelPicker channel={channel} setChannel={setChannel} />
      <div className="panel row gap12" style={{ alignItems: "flex-start" }}><Icon name="lock" /><div><b>You finish payment in Paystack’s secure window.</b><div className="small muted">We confirm your {remote ? "order" : "booking"} only after Paystack verifies the payment on our server. Card details never touch our servers.</div></div></div>
      <ErrorBox error={error} />
      <div className="row between desk-actions"><TactileLink to="/book/review" variant="light" size="lg">Back</TactileLink><Btn arrow onClick={pay} disabled={busy}>{busy ? "Opening Paystack…" : `Pay ${naira(payNow)} with Paystack`}</Btn></div>
      <div className="stickybar"><TactileLink to="/book/review" variant="light" size="lg" className="stickyback" aria-label="Back">‹</TactileLink><div className="grow stickyinfo"><b>{naira(payNow)}</b><div className="caption">{remote ? "Secure checkout with Paystack" : `${label} left on your hold`}</div></div><Btn arrow onClick={pay} disabled={busy}>Pay with Paystack</Btn></div>
    </Shell>
  );
}

export function BookRequested() {
  const { id = "" } = useParams();
  const [b, setB] = useState<any>(null);
  usePageTitle("Request sent");
  useEffect(() => { api(`/account/bookings/${id}`).then((r) => setB(r.booking)).catch(() => setB(false)); }, [id]);
  const stay = b?.scheduling === "day";
  return (
    <><Nav />
      <div className="wrap stack gap24 donepage">
        <Mark tone="ink" size={72} />
        <span className="tag warning" style={{ alignSelf: "center" }}>Awaiting approval</span>
        <h1 className="h2">Request sent.</h1>
        <p className="muted" style={{ maxWidth: 560 }}>{b ? `Request ${b.ref}${b.scheduling === "project" ? "" : ` to start on ${longDate(b.date)}`} is with the studio. They reply within 24 hours and email you a payment link once it is approved.` : "Your request is with the studio. We email you a payment link once it is approved."}</p>
        <div className="card stack gap12 nextlist">
          <b>What happens next</b>
          {[["1", "The studio reviews your request", "You hear back within 24 hours."], ["2", "You pay to confirm", "After approval you can pay a deposit or the full amount to secure your dates."], ...(stay ? [["3", "The studio confirms your stay", "They confirm the full schedule and accommodation with you."]] : [])].map(([n, t, s]) => (
            <div key={n} className="row gap12" style={{ alignItems: "flex-start" }}><span className="stepnum">{n}</span><div><b>{t}</b><div className="small muted">{s}</div></div></div>
          ))}
        </div>
        <div className="row gap12 wrapflex" style={{ justifyContent: "center" }}>
          {b && <TactileLink to={`/account/bookings/${b.id}`} size="lg">Track your request <Icon name="arrow" size={18} /></TactileLink>}
          <TactileLink to="/" variant="light" size="lg">Back to home</TactileLink>
        </div>
      </div>
    </>
  );
}

/** Stand-in for Paystack's hosted checkout when no Paystack key is configured. */
export function DemoPay() {
  const [q] = useSearchParams();
  const ref = q.get("reference") ?? "";
  const site = useContent();
  const [t, setT] = useState<{ amount_kobo: number; status: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const channel = sessionStorage.getItem("psych.channel") ?? "card";
  useEffect(() => { api(`/payments/demo/${ref}`).then(setT).catch(() => setT(null)); }, [ref]);
  const finish = async (outcome: "success" | "failed") => {
    setBusy(true);
    await api(`/payments/demo/${ref}`, { body: { outcome, channel } });
    window.location.assign(`/book/verify?reference=${ref}`);
  };
  return (
    <div className="demopay">
      <div className="demopay-card">
        <div className="row between demopay-head"><b>Test checkout</b><span className="tag warning">Simulated Paystack</span></div>
        <div className="stack gap16" style={{ padding: 22 }}>
          <div className="row between"><span className="muted small">{site?.content.business_name ?? "Psych Studio"}</span><b style={{ fontSize: 22 }}>{t ? naira(t.amount_kobo) : "…"}</b></div>
          <div className="small muted">Reference {ref}</div>
          <div className="panel small" style={{ padding: 14 }}>This screen stands in for Paystack until live keys are added. The booking is still confirmed only after the server verifies this transaction.</div>
          <Btn kind="primary" block onClick={() => finish("success")} disabled={busy || t?.status !== "pending"}>Pay {t ? naira(t.amount_kobo) : ""}</Btn>
          <button className="link small" style={{ color: "var(--danger)" }} onClick={() => finish("failed")} disabled={busy}>Simulate a failed payment</button>
        </div>
      </div>
    </div>
  );
}

const CHANNEL: Record<string, string> = { card: "Card", bank_transfer: "Transfer", ussd: "USSD", cash: "Cash", transfer: "Transfer", pos: "POS" };

export function BookVerify() {
  const [q] = useSearchParams();
  const ref = q.get("reference") ?? q.get("trxref") ?? "";
  const site = useContent();
  const cat = useCatalog();
  const { user } = useAuth();
  const [state, setState] = useState<"checking" | "failed" | "refunded">("checking");
  const [booking, setBooking] = useState<any>(null);
  const [kind, setKind] = useState("full");
  const [stage, setStage] = useState<PrinterStage>("processing");
  usePageTitle("Confirming payment");
  useEffect(() => {
    let tries = 0, live = true;
    const timers: number[] = [];
    const run = async () => {
      const r = await api(`/payments/verify?reference=${encodeURIComponent(ref)}`).catch(() => ({ status: "failed" }));
      if (!live) return;
      if (r.status === "confirmed") {
        if (loadDraft().holdId) clearDraft();
        setBooking(r.booking);
        setKind(r.payment?.kind ?? "full");
        setStage("printing");
        timers.push(window.setTimeout(() => setStage("complete"), 1750));
      } else if (r.status === "pending" && tries++ < 12) timers.push(window.setTimeout(run, 2500));
      else setState(r.status === "refunded" ? "refunded" : "failed");
    };
    timers.push(window.setTimeout(run, 900));
    return () => { live = false; timers.forEach((t) => window.clearTimeout(t)); };
  }, [ref]);
  const channel = CHANNEL[sessionStorage.getItem("psych.channel") ?? "card"] ?? "Card";
  const done = stage === "complete" && booking;
  const name = site?.content.business_name ?? "Psych Studio";
  if (state !== "checking") return (
    <><Nav />
      <div className="wrap stack gap24 donepage">
        <Mark tone="ink" size={72} />
        {state === "failed" && <><h1 className="h2">Payment did not go through</h1><p className="muted">You have not been charged. If this was a new booking the slot was released and your details are saved, so you can try again.</p><TactileLink to="/book/review" size="lg">Try again <Icon name="arrow" size={18} /></TactileLink></>}
        {state === "refunded" && <><h1 className="h2">This payment was refunded</h1><p className="muted">The slot was taken, or the booking had closed, before your payment arrived. Your payment is being refunded in full.</p><TactileLink to="/book" size="lg">Start again</TactileLink></>}
      </div>
    </>
  );
  const owner = !!user && user.role === "client";
  const remote = booking?.scheduling === "project";
  const unit = cat?.packages.find((x) => x.id === booking?.package_id)?.unit;
  return (
    <><Nav />
      <div className="wrap verify">
        <div className="stack gap12" style={{ alignItems: "center" }}>
          <h1 className="h2">{!done ? "Confirming your payment" : kind === "balance" ? "Balance paid. You’re all set." : booking.balance_kobo > 0 ? "You’re booked. Deposit received." : "You’re booked."}</h1>
          <p className="muted" style={{ maxWidth: 560 }}>{done ? `Booking ${booking.ref} is ${statusLabel(booking.status).toLowerCase()}.${booking.balance_kobo > 0 ? ` ${naira(booking.balance_kobo)} is due ${remote ? "before your finished files are released" : "before your session"}.` : ""} The receipt is in your inbox${owner ? " and your dashboard" : ""}.` : "Paystack has your payment. We verify it on our server before we confirm your booking."}</p>
        </div>
        {done && owner && (
          <div className="row gap12 wrapflex" style={{ justifyContent: "center" }}>
            <TactileLink to={`/book/confirmed/${booking.id}`} variant="neon" size="lg">{remote ? "See your order" : "See your ticket"} <Icon name="arrow" size={18} /></TactileLink>
            <TactileLink to={`/account/bookings/${booking.id}`} variant="light" size="lg">Go to my booking</TactileLink>
          </div>
        )}
        <ReceiptPrinter stage={stage} labels={{ processing: "Verifying with Paystack", printing: "Printing your receipt", complete: "Payment verified" }}
          header={<><Mark tone="neon" size={36} /><span className="pr-ref">{ref}</span></>}
          screen={<div className="pr-row"><div><p>{booking?.package_name ?? "Your booking"}</p><p className="dim">{booking ? whenLine(booking) : "Checking"}</p></div><div className="right"><p className="dim">Paid</p><strong>{booking ? naira(booking.paid_kobo) : "…"}</strong></div></div>}>
          {booking && <>
            <div className="rc-logo"><Mark tone="ink" size={48} /></div>
            <p className="rc-head" style={{ textAlign: "center" }}>{name}</p>
            {site?.content.studio_address && <p className="rc-dim" style={{ textAlign: "center" }}>{site.content.studio_address}</p>}
            <hr className="rc-hr" />
            <div className="rc-row"><span className="rc-head">{booking.package_name}</span><span>{naira(booking.package_price_kobo)}</span></div>
            {unit && <div className="rc-dim">{unit}</div>}
            <div className="rc-dim">{whenLine(booking)}{booking.slot_label ? ` · ${booking.slot_label}` : ""}{booking.room_name ? ` · ${booking.room_name}` : ""}</div>
            {booking.extras.map((e: any) => <div key={e.name} className="rc-row" style={{ marginTop: 8 }}><span className="rc-head">{e.name}</span><span>{e.quote ? "On request" : naira(e.price)}</span></div>)}
            <hr className="rc-hr" />
            <div className="rc-row rc-dim"><span>Total</span><span>{naira(booking.total_kobo)}</span></div>
            <div className="rc-row rc-dim"><span>Paid with</span><span>Paystack · {channel}</span></div>
            <div className="rc-row" style={{ marginTop: 8 }}><span className="rc-head">Total paid</span><span className="rc-total">{naira(booking.paid_kobo)}</span></div>
            {booking.balance_kobo > 0 && <div className="rc-row rc-dim" style={{ marginTop: 4 }}><span>Balance due</span><span>{naira(booking.balance_kobo)}</span></div>}
            <hr className="rc-hr" />
            <Barcode />
            <p className="rc-note">Ref <ScrambleText>{booking.ref}</ScrambleText></p>
            <p className="rc-note rc-dim">{remote ? "Your files are delivered in your portal." : `See you in ${booking.room_name}.`}</p>
          </>}
        </ReceiptPrinter>
      </div>
    </>
  );
}

export function BookConfirmed({ id }: { id: string }) {
  const [data, setData] = useState<any>(null);
  const site = useContent();
  usePageTitle("You’re booked");
  useEffect(() => { api(`/account/bookings/${id}`).then(setData); }, [id]);
  const b = data?.booking;
  const name = site?.content.business_name ?? "Psych Studio";
  const remote = b?.scheduling === "project";
  const ics = useMemo(() => {
    if (!b || remote) return "";
    const dt = (day: number, m: number) => `${addDays(b.date, day).replace(/-/g, "")}T${String(Math.floor((m % 1440) / 60)).padStart(2, "0")}${String(m % 60).padStart(2, "0")}00`;
    return `data:text/calendar;charset=utf-8,${encodeURIComponent(`BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nDTSTART;TZID=Africa/Lagos:${dt(0, b.start_min)}\nDTEND;TZID=Africa/Lagos:${dt(Math.floor(b.end_min / 1440), b.end_min)}\nSUMMARY:${b.package_name} at ${name}\nLOCATION:${b.room_name}${site?.content.studio_address ? `, ${site.content.studio_address}` : ""}\nDESCRIPTION:Booking ${b.ref}\nEND:VEVENT\nEND:VCALENDAR`)}`;
  }, [b, name, site, remote]);
  if (!b) return <><Nav /><Loading /></>;
  const facts: [string, string][] = remote
    ? [["Reference", b.ref], ["Package", b.package_name], ["Ordered", shortDate(b.date)], ["Delivery", b.due_date ? `Due ${shortDate(b.due_date)}, in your portal` : "In your portal"], ["Paid", naira(b.paid_kobo)], ["Balance due", b.balance_kobo > 0 ? naira(b.balance_kobo) : "Nothing"]]
    : [["Reference", b.ref], ["Package", b.package_name], ["Room", b.room_name], ["Date", shortDate(b.date)], [b.scheduling === "day" ? "Starts" : "Session", b.scheduling === "day" ? shortDate(b.date) : `${windowLabel(b.date, b.start_min, b.end_min)}${b.slot_label ? ` · ${b.slot_label}` : ""}`], ["Paid", naira(b.paid_kobo)], ["Balance due", b.balance_kobo > 0 ? naira(b.balance_kobo) : "Nothing"]];
  return (
    <div className="confpage">
      <Nav />
      <div className="wrap grid cols-2 confwrap" style={{ paddingTop: 72, paddingBottom: 120, alignItems: "center", gap: 64 }}>
        <div className="stack gap24">
          <h1 className="display">{remote ? "Order " : "You’re "}<span className="neon">{remote ? "placed." : "booked."}</span></h1>
          <p style={{ fontSize: 18, opacity: .78 }}>{remote ? `Order ${b.ref} is confirmed. Upload your stems or references from your portal. Finished work arrives in your portal, never by email.` : `Booking ${b.ref} is confirmed. Your receipt is on its way to ${b.contact_email} and saved in your dashboard.`}</p>
          <div className="grid cols-2 confgrid">
            {facts.map(([k, v]) => (
              <div key={k}><div className="mono" style={{ opacity: .55 }}>{k}</div><b style={{ fontWeight: 500 }}>{v}</b></div>
            ))}
          </div>
          <div className="row gap12 wrapflex">
            {remote
              ? <><TactileLink to={`/account/bookings/${b.id}#files`} variant="neon" size="lg">Upload your files <Icon name="arrow" size={18} /></TactileLink><TactileLink to={`/account/bookings/${b.id}`} variant="light" size="lg">Go to my order</TactileLink></>
              : <><TactileLink to={`/account/bookings/${b.id}`} variant="neon" size="lg">Go to my booking <Icon name="arrow" size={18} /></TactileLink><TactileAnchor href={ics} download={`${b.ref}.ics`} variant="light" size="lg">Add to calendar</TactileAnchor></>}
          </div>
        </div>
        <div className="conf-art">
          <div className="conf-photo" />
          <div className="conf-ticket"><BookingTicket kind={b.service_name} scheduling={b.scheduling} date={b.date} start={b.start_min} end={b.end_min} duration={b.end_min - b.start_min} slotLabel={b.slot_label} dueDate={b.due_date} artist={b.artist_name} people={b.people} reference={b.ref} room={b.room_name || undefined} /></div>
          <Waveform className="confwave" />
        </div>
      </div>
    </div>
  );
}

/** Secure payment page for approved bookings and balances. Works from the emailed link without logging in. */
export function PayBooking() {
  const { id = "" } = useParams();
  const [q] = useSearchParams();
  const token = q.get("t") ?? undefined;
  const site = useContent();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<"deposit" | "full" | "balance">("deposit");
  const [channel, setChannel] = useState("card");
  const [busy, setBusy] = useState(false);
  usePageTitle("Pay for your booking");
  useEffect(() => {
    api(`/pay/${id}${token ? `?t=${encodeURIComponent(token)}` : ""}`).then((r) => { setData(r); setPlan(r.due.kind === "balance" ? "balance" : r.due.deposit ? "deposit" : "full"); }).catch((e) => setError(e.message));
  }, [id, token]);
  const pay = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api(`/pay/${id}`, { body: { t: token, plan } });
      sessionStorage.setItem("psych.channel", channel);
      window.location.assign(r.authorizationUrl);
    } catch (e: any) { setError(e.message); setBusy(false); }
  };
  if (error && !data) return <><Nav /><div className="wrap stack gap16 donepage"><Mark tone="ink" size={72} /><h1 className="h2">We could not open this payment.</h1><p className="muted">{error} Contact the studio if you think this is a mistake.</p><TactileLink to="/contact" size="lg">Contact the studio</TactileLink></div></>;
  if (!data) return <><Nav /><Loading /></>;
  const b = data.booking, due = data.due;
  const amount = plan === "deposit" && due.deposit ? due.deposit : due.full;
  const expired = b.status === "approved" && b.expires_at && Date.parse(b.expires_at) < Date.now();
  return (
    <><Nav />
      <div className="wrap paypage">
        <div className="stack gap20">
          <span className="mono muted">{site?.content.business_name} · Booking {b.ref}</span>
          <h1 className="h1" style={{ fontSize: "clamp(30px,3.6vw,46px)" }}>{due.kind === "none" || due.full <= 0 ? "Nothing to pay." : due.kind === "balance" ? "Pay your balance." : "Pay to confirm your booking."}</h1>
          <div className="card stack gap12">
            <div className="row between wrapflex gap8"><b>{b.service_name} · {b.package_name}</b><span className="tag">{statusLabel(b.status)}</span></div>
            <span className="small muted">{b.scheduling === "project" ? `Remote order · ${shortDate(b.date)}` : b.scheduling === "day" ? `Starts ${longDate(b.date)} · ${b.room_name}` : `${longDate(b.date)} · ${windowLabel(b.date, b.start_min, b.end_min)} · ${b.room_name}`}</span>
            <div className="divider" />
            <div className="row between small"><span>Total</span><span>{naira(b.total_kobo)}</span></div>
            <div className="row between small"><span>Paid so far</span><span>{naira(b.paid_kobo)}</span></div>
            <div className="row between"><b>Due</b><b>{naira(b.balance_kobo)}</b></div>
            {b.status === "approved" && b.expires_at && <span className="caption">Approved. Pay by {dateTime(b.expires_at)} to keep this time.</span>}
          </div>
          {due.kind !== "none" && due.full > 0 && !expired && <>
            {due.deposit > 0 && (
              <div className="card stack gap12">
                <b className="small">How much would you like to pay?</b>
                {([["deposit", `Deposit, ${naira(due.deposit)}`, `${naira(due.full - due.deposit)} is due ${b.scheduling === "project" ? "before your finished files are released" : "before your session"}.`], ["full", `Full amount, ${naira(due.full)}`, "Nothing more to pay later."]] as const).map(([v, t, s]) => (
                  <button key={v} type="button" className={`opt ${plan === v ? "on" : ""}`} onClick={() => setPlan(v)}><span className="radio" /><span className="grow stack"><b>{t}</b><span className="small muted">{s}</span></span></button>
                ))}
              </div>
            )}
            <ChannelPicker channel={channel} setChannel={setChannel} />
            <ErrorBox error={error} />
            <Btn arrow block onClick={pay} disabled={busy}>{busy ? "Opening Paystack…" : `Pay ${naira(amount)} with Paystack`}</Btn>
            <span className="caption">Payments are verified with Paystack on our server. Card details never reach the studio.</span>
          </>}
          {expired && <div className="error">The payment window for this booking has closed. Contact the studio to rebook.</div>}
          <Link to="/" className="link small">Back to the website</Link>
        </div>
      </div>
    </>
  );
}

export { addDays };
