import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Nav } from "../components/Layout";
import { Icon, Mark, Waveform } from "../components/brand";
import { Area, Btn, ErrorBox, Field, Loading, Steps } from "../components/ui";
import { ServiceCard } from "./public";
import { useCatalog, useContent, type Catalog } from "../lib/catalog";
import { loadDraft, saveDraft, clearDraft, type BookingDraft } from "../lib/draft";
import { addDays, hrs, lagosToday, longDate, naira, shortDate, t12 } from "../lib/format";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";

function useDraft() {
  const [d, setD] = useState<BookingDraft>(loadDraft);
  const update = (patch: Partial<BookingDraft>) => { const next = { ...loadDraft(), ...patch }; saveDraft(next); setD(next); };
  return [d, update] as const;
}

function priced(cat: Catalog, d: BookingDraft) {
  const svc = cat.services.find((s) => s.slug === d.serviceSlug);
  const pkg = cat.packages.find((p) => p.id === d.packageId);
  const extras = cat.extras.filter((e) => d.extras.includes(e.slug));
  const duration = (pkg?.duration_min ?? 0) + d.extraHours * 60;
  const total = (pkg?.price_kobo ?? 0) + d.extraHours * cat.rules.extraHourKobo + extras.reduce((s, e) => s + e.price_kobo, 0);
  return { svc, pkg, extras, duration, total };
}

function Summary({ cat, d, hold }: { cat: Catalog; d: BookingDraft; hold?: string | null }) {
  const { svc, pkg, duration, total } = priced(cat, d);
  return (
    <aside className="summary desk">
      {svc && <div className="ph" style={{ backgroundImage: `url(${svc.image_url})` }} />}
      <span className="mono muted">Your booking</span>
      <h3 className="h3" style={{ fontSize: 20 }}>{svc?.name ?? "Pick a service"}{pkg ? ` · ${pkg.name}` : ""}</h3>
      {[["calendar", "Date", d.date ? longDate(d.date) : "Pick a date"], ["clock", "Time", d.start != null && duration ? `${t12(d.start)} to ${t12(d.start + duration)} · ${hrs(duration)}` : "Pick a start time"], ["users", "People", d.contactName ? `${d.people} ${d.people === 1 ? "person" : "people"}` : "Add in your details"]].map(([i, k, v]) => (
        <div key={k} className="row gap12"><span style={{ width: 36, height: 36, borderRadius: 10, background: "#fff", display: "grid", placeItems: "center", color: "var(--brand)" }}><Icon name={i} size={18} /></span><div><div className="mono faint">{k}</div><b style={{ fontWeight: 500 }}>{v}</b></div></div>
      ))}
      <div className="divider" />
      <div className="row between"><span className="muted">Total</span><b style={{ fontSize: 22 }}>{pkg ? naira(total) : "Pick a package"}</b></div>
      {hold && <div className="hold">{hold}</div>}
      <span className="caption">Payment is verified with Paystack before we confirm.</span>
    </aside>
  );
}

function Shell({ step, title, sub, cat, d, hold, children, back, next, nextLabel, nextDisabled, busy, aside = true }: {
  step: number; title: string; sub?: string; cat: Catalog; d: BookingDraft; hold?: string | null; children: ReactNode;
  back?: string; next?: () => void; nextLabel?: string; nextDisabled?: boolean; busy?: boolean; aside?: boolean;
}) {
  const { total, pkg } = priced(cat, d);
  return (
    <>
      <Nav />
      <div className="wrap booklayout" style={aside ? undefined : { gridTemplateColumns: "1fr" }}>
        <div className="stack gap24">
          <Steps step={step} />
          <div className="stack gap8"><h1 className="h1" style={{ fontSize: "clamp(30px,3.6vw,46px)" }}>{title}</h1>{sub && <p className="muted">{sub}</p>}</div>
          {children}
          {next && (
            <div className="row between desk-actions">
              {back ? <Link to={back} className="btn neutral">Back</Link> : <span />}
              <Btn arrow onClick={next} disabled={nextDisabled || busy}>{busy ? "Please wait…" : nextLabel}</Btn>
            </div>
          )}
        </div>
        {aside && <Summary cat={cat} d={d} hold={hold} />}
      </div>
      {next && (
        <div className="stickybar">
          <div><b>{pkg ? naira(total) : "Choose"}</b><div className="caption">{d.date && d.start != null ? `${shortDate(d.date)} · ${t12(d.start)}` : "Book a session"}</div></div>
          <Btn arrow onClick={next} disabled={nextDisabled || busy}>{nextLabel}</Btn>
        </div>
      )}
    </>
  );
}

export function BookService() {
  const cat = useCatalog();
  const [d, up] = useDraft();
  const nav = useNavigate();
  if (!cat) return <><Nav /><Loading /></>;
  return (
    <Shell step={1} title="What are you making?" cat={cat} d={d} aside={false} next={() => nav("/book/package")} nextLabel="Choose a package" nextDisabled={!d.serviceSlug}>
      <div className="grid cols-4">{cat.services.map((s) => <ServiceCard key={s.id} s={s} on={d.serviceSlug === s.slug} onClick={() => up({ serviceSlug: s.slug })} />)}</div>
    </Shell>
  );
}

export function BookPackage() {
  const cat = useCatalog();
  const [d, up] = useDraft();
  const nav = useNavigate();
  useEffect(() => { if (cat && !d.serviceSlug) nav("/book", { replace: true }); }, [cat, d.serviceSlug, nav]);
  if (!cat) return <><Nav /><Loading /></>;
  const svc = cat.services.find((s) => s.slug === d.serviceSlug);
  const group = (c: "session" | "post", label: string) => (
    <div className="stack gap12">
      <span className="mono faint">{label}</span>
      {cat.packages.filter((p) => p.category === c).map((p) => (
        <button key={p.id} type="button" className={`opt ${d.packageId === p.id ? "on" : ""}`} onClick={() => up({ packageId: p.id, start: undefined })}>
          <span className="radio" />
          <span className="grow stack"><b>{p.name}</b><span className="small muted">{p.description}</span></span>
          <span className="stack" style={{ alignItems: "flex-end" }}><b>{naira(p.price_kobo)}</b><span className="mono faint">{hrs(p.duration_min)}</span></span>
        </button>
      ))}
    </div>
  );
  return (
    <Shell step={2} title="Pick a package." sub={`For ${svc?.name.toLowerCase() ?? "your session"}. Engineer included.`} cat={cat} d={d} back="/book" next={() => nav("/book/time")} nextLabel="Choose date & time" nextDisabled={!d.packageId}>
      <div className="card stack gap20">{group("session", "Session time")}{group("post", "Recording + post")}</div>
    </Shell>
  );
}

type DayStatus = "available" | "limited" | "full" | "closed" | "past";
export function BookTime() {
  const cat = useCatalog();
  const [d, up] = useDraft();
  const nav = useNavigate();
  const { pkg, duration } = cat ? priced(cat, d) : { pkg: undefined, duration: 0 };
  const [month, setMonth] = useState((d.date ?? lagosToday()).slice(0, 7));
  const [days, setDays] = useState<{ date: string; status: DayStatus }[]>([]);
  const [slots, setSlots] = useState<{ start: number; available: boolean }[] | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);
  useEffect(() => { if (cat && !pkg) nav("/book/package", { replace: true }); }, [cat, pkg, nav]);
  useEffect(() => { if (duration) api(`/availability/month?month=${month}&duration=${duration}`).then((r) => setDays(r.days)); }, [month, duration]);
  useEffect(() => {
    if (!d.date || !duration) return;
    setSlots(null);
    api(`/availability/day?date=${d.date}&duration=${duration}`).then((r) => { setSlots(r.slots); setUpdated(new Date()); });
  }, [d.date, duration]);
  if (!cat || !pkg) return <><Nav /><Loading /></>;
  const firstDow = (new Date(`${month}-01T00:00:00Z`).getUTCDay() + 6) % 7;
  const shift = (n: number) => { const x = new Date(`${month}-01T00:00:00Z`); x.setUTCMonth(x.getUTCMonth() + n); setMonth(x.toISOString().slice(0, 7)); };
  return (
    <Shell step={3} title="Pick a date and start time." sub="Live availability for Studio A. Times are in Lagos time (WAT)." cat={cat} d={d} back="/book/package" next={() => nav("/book/details")} nextLabel="Continue to details" nextDisabled={!d.date || d.start == null}>
      <div className="grid" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,340px)", gap: 20 }} data-stack>
        <div className="card stack gap12">
          <div className="row between">
            <h3 className="h3" style={{ fontSize: 20 }}>{new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}</h3>
            <div className="row gap8"><button className="btn sm neutral" onClick={() => shift(-1)} disabled={month <= lagosToday().slice(0, 7)} aria-label="Previous month">‹</button><button className="btn sm neutral" onClick={() => shift(1)} aria-label="Next month">›</button></div>
          </div>
          <div className="cal">
            {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((w) => <div key={w} className="wd">{w}</div>)}
            {Array.from({ length: firstDow }, (_, i) => <div key={`b${i}`} className="day blank" />)}
            {days.map((x) => {
              const ok = x.status === "available" || x.status === "limited";
              return <button key={x.date} type="button" disabled={!ok} className={`day ${x.status} ${d.date === x.date ? "on" : ""}`} onClick={() => up({ date: x.date, start: undefined })} aria-label={`${x.date} ${x.status}`}><span>{+x.date.slice(8)}</span><i /></button>;
            })}
          </div>
          <div className="row gap16 wrapflex caption">
            <span className="row gap4"><i style={{ width: 14, height: 3, background: "var(--success)", borderRadius: 2 }} />Open</span>
            <span className="row gap4"><i style={{ width: 14, height: 3, background: "var(--coral)", borderRadius: 2 }} />Few slots left</span>
            <span>Fully booked days are crossed out</span>
          </div>
        </div>
        <div className="card stack gap16">
          <div><h3 className="h3" style={{ fontSize: 20 }}>{d.date ? longDate(d.date).replace(/ \d{4}$/, "") : "Pick a day"}</h3></div>
          <div className="field">
            <label>Duration</label>
            <div className="seg">{[0, 1, 2].map((x) => <button key={x} className={d.extraHours === x ? "on" : ""} onClick={() => up({ extraHours: x, start: undefined })}>{hrs(pkg.duration_min + x * 60)}</button>)}</div>
            <span className="hint">Extra hours are {naira(cat.rules.extraHourKobo)} each.</span>
          </div>
          <div className="field">
            <label>Start time</label>
            {!d.date ? <span className="small muted">Choose a day to see open times.</span> : !slots ? <span className="small muted">Checking…</span> : slots.length === 0 ? <span className="small muted">No times fit this duration.</span> : (
              <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 8 }}>{slots.map((s) => <button key={s.start} type="button" className={`slot ${d.start === s.start ? "on" : ""}`} disabled={!s.available} onClick={() => up({ start: s.start })}>{t12(s.start)}</button>)}</div>
            )}
          </div>
          {updated && <span className="caption">Updated {updated.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} · {cat.rules.buffer} min changeover included</span>}
        </div>
      </div>
    </Shell>
  );
}

export function BookDetails() {
  const cat = useCatalog();
  const [d, up] = useDraft();
  const nav = useNavigate();
  const { user } = useAuth();
  useEffect(() => { if (user && !d.contactName) up({ contactName: user.name, contactEmail: user.email, contactPhone: user.phone }); }, [user]); // eslint-disable-line
  if (!cat) return <><Nav /><Loading /></>;
  const valid = d.contactName && /\S+@\S+\.\S+/.test(d.contactEmail) && d.contactPhone && d.artistName && d.people >= 1;
  return (
    <Shell step={4} title="Tell us about the session." sub="No account needed yet. You will log in or sign up at checkout and keep everything you enter here." cat={cat} d={d} back="/book/time" next={() => nav("/book/review")} nextLabel="Review booking" nextDisabled={!valid}>
      <div className="card stack gap16">
        <h3 className="h4">Contact details</h3>
        <Field label="Full name" name="contactName" value={d.contactName} onChange={(e) => up({ contactName: e.target.value })} />
        <div className="grid cols-2" style={{ gap: 16 }}>
          <Field label="Email" name="contactEmail" type="email" value={d.contactEmail} onChange={(e) => up({ contactEmail: e.target.value })} />
          <Field label="Phone number" name="contactPhone" value={d.contactPhone} onChange={(e) => up({ contactPhone: e.target.value })} />
        </div>
      </div>
      <div className="card stack gap16">
        <h3 className="h4">Session</h3>
        <div className="grid cols-2" style={{ gap: 16 }}>
          <Field label="Artist or group name" name="artistName" value={d.artistName} onChange={(e) => up({ artistName: e.target.value })} />
          <div className="field"><label>Number of people</label>
            <div className="row" style={{ border: "1px solid var(--line)", borderRadius: 12, alignSelf: "flex-start" }}>
              <button type="button" className="link" style={{ width: 44, height: 44, color: "var(--fg)" }} onClick={() => up({ people: Math.max(1, d.people - 1) })} aria-label="Fewer people">−</button>
              <b style={{ width: 40, textAlign: "center" }}>{d.people}</b>
              <button type="button" className="link" style={{ width: 44, height: 44, color: "var(--fg)" }} onClick={() => up({ people: Math.min(cat.rules.maxPeople, d.people + 1) })} aria-label="More people">+</button>
            </div>
            <span className="hint">Up to {cat.rules.maxPeople}, including you.</span>
          </div>
        </div>
        <Area label="Additional requirements" name="notes" value={d.notes} onChange={(e) => up({ notes: e.target.value })} placeholder="Bringing your own beat, references, gear you need…" />
      </div>
    </Shell>
  );
}

export function BookReview() {
  const cat = useCatalog();
  const content = useContent();
  const [d, up] = useDraft();
  const nav = useNavigate();
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!cat) return <><Nav /><Loading /></>;
  const { svc, pkg, extras, duration, total } = priced(cat, d);
  const go = async () => {
    setBusy(true); setError(null);
    try {
      if (d.holdId) await api(`/holds/${d.holdId}`, { method: "DELETE" }).catch(() => {});
      const r = await api("/holds", { body: { serviceSlug: d.serviceSlug, packageId: d.packageId, date: d.date, start: d.start, extraHours: d.extraHours, extras: d.extras, people: d.people, artistName: d.artistName, contactName: d.contactName, contactEmail: d.contactEmail, contactPhone: d.contactPhone, notes: d.notes } });
      up({ holdId: r.holdId });
      nav("/book/checkout");
    } catch (e: any) {
      if (e instanceof ApiError && e.code === "slot_taken") { up({ start: undefined }); nav("/book/time?taken=1"); return; }
      setError(e.message);
    } finally { setBusy(false); }
  };
  const row = (k: string, a: string, b: string, to: string) => (
    <div className="row gap16" style={{ padding: "18px 24px", borderTop: "1px solid var(--line)", alignItems: "flex-start" }}>
      <div className="grow"><div className="mono faint">{k}</div><b style={{ fontWeight: 500 }}>{a}</b><div className="small muted">{b}</div></div>
      <Link to={to} className="small" style={{ fontWeight: 500, color: "var(--brand)" }}>Edit</Link>
    </div>
  );
  return (
    <Shell step={5} title="Review your booking." sub="Check the details and price. We hold your slot while you check out." cat={cat} d={d} back="/book/details" next={go} nextLabel="Continue to checkout" nextDisabled={!agree} busy={busy}>
      <div className="card" style={{ padding: 0 }}>
        <div style={{ marginTop: -1 }}>{row("Package", `${svc?.name} · ${pkg?.name}`, "Engineer included · Studio A", "/book/package")}</div>
        {row("Date and time", d.date ? longDate(d.date) : "", d.start != null ? `${t12(d.start)} to ${t12(d.start + duration)} (${hrs(duration)})` : "", "/book/time")}
        {row("Your details", d.contactName, `${d.contactEmail} · ${d.contactPhone}`, "/book/details")}
        {row("Session", `${d.artistName} · ${d.people} ${d.people === 1 ? "person" : "people"}`, d.notes || "No extra requirements", "/book/details")}
      </div>
      <div className="card stack gap12">
        <b className="small">Add extras</b>
        {cat.extras.map((e) => (
          <label key={e.slug} className="row gap12 small" style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={d.extras.includes(e.slug)} onChange={(ev) => up({ extras: ev.target.checked ? [...d.extras, e.slug] : d.extras.filter((x) => x !== e.slug) })} />
            <span className="grow">{e.name}</span><span className="muted">+{naira(e.price_kobo)}</span>
          </label>
        ))}
        <div className="panel stack gap8" style={{ padding: 18 }}>
          <span className="mono muted">Price details</span>
          <div className="row between small"><span>{pkg?.name}</span><span>{naira(pkg?.price_kobo ?? 0)}</span></div>
          {d.extraHours > 0 && <div className="row between small"><span>Extra time ({d.extraHours} hr)</span><span>{naira(d.extraHours * cat.rules.extraHourKobo)}</span></div>}
          {extras.map((e) => <div key={e.slug} className="row between small"><span>{e.name}</span><span>{naira(e.price_kobo)}</span></div>)}
          <div className="divider" />
          <div className="row between"><b>Total due today</b><b style={{ fontSize: 20 }}>{naira(total)}</b></div>
        </div>
      </div>
      <label className="row gap12 small" style={{ cursor: "pointer" }}>
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <span>I agree to the <Link to="/packages#policies" target="_blank" style={{ textDecoration: "underline" }}>booking policies</Link>, including payment, cancellation, rescheduling and late arrival rules{content ? "" : ""}.</span>
      </label>
      <ErrorBox error={error} />
    </Shell>
  );
}

function useHoldCountdown(holdId?: string) {
  const [hold, setHold] = useState<{ status: string; expiresAt: string; bookingId: string | null } | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (holdId) api(`/holds/${holdId}`).then(setHold).catch(() => setHold({ status: "expired", expiresAt: "", bookingId: null })); }, [holdId]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const left = hold?.expiresAt ? Math.max(0, Date.parse(hold.expiresAt) - now) : 0;
  const label = `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, "0")}`;
  return { hold, left, label, expired: hold ? hold.status !== "active" || left === 0 : false };
}

export function BookCheckout() {
  const cat = useCatalog();
  const [d] = useDraft();
  const nav = useNavigate();
  const { user, setUser } = useAuth();
  const { hold, label, expired } = useHoldCountdown(d.holdId);
  const [tab, setTab] = useState<"register" | "login">("register");
  const [f, setF] = useState({ name: d.contactName, email: d.contactEmail, phone: d.contactPhone, password: "", confirmPassword: "" });
  const [channel, setChannel] = useState("card");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!d.holdId) nav("/book/review", { replace: true }); }, [d.holdId, nav]);
  useEffect(() => { if (hold?.bookingId) nav(`/book/confirmed/${hold.bookingId}`, { replace: true }); }, [hold, nav]);
  if (!cat || !hold) return <><Nav /><Loading /></>;
  const { total } = priced(cat, d);
  if (expired) return (
    <Shell step={5} title="This slot is no longer held." sub="Your hold ran out before payment, so the time was released. You have not been charged and your details are saved." cat={cat} d={d}>
      <div className="row gap12"><Link to="/book/time" className="btn">Pick another time <Icon name="arrow" size={18} /></Link></div>
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
      const r = await api("/checkout", { body: { holdId: d.holdId } });
      sessionStorage.setItem("sessions.channel", channel);
      window.location.assign(r.authorizationUrl);
    } catch (err: any) { setError(err.message); setBusy(false); }
  };
  const holdMsg = `Slot held for ${label}`;
  if (!user || user.role !== "client") return (
    <Shell step={5} title="Log in or create an account to pay." sub="Your booking is saved. You come straight back to this checkout after." cat={cat} d={d} hold={holdMsg}>
      <div className="hold">We are holding {d.date ? shortDate(d.date) : ""}, {d.start != null ? t12(d.start) : ""} for you. {label} left to finish checkout.</div>
      <form className="card stack gap16" onSubmit={auth} style={{ padding: 32 }}>
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
        {tab === "register" && <div className="panel small muted" style={{ padding: 14 }}>We will email you a link to verify your address. Verify any time before your session.</div>}
        {tab === "login" && <Link to="/forgot-password" className="small" style={{ color: "var(--brand)", fontWeight: 500 }}>Forgot password?</Link>}
        <ErrorBox error={error} />
        <Btn arrow className="block" disabled={busy}>{busy ? "Please wait…" : tab === "register" ? "Create account and continue" : "Log in and continue"}</Btn>
      </form>
    </Shell>
  );
  return (
    <Shell step={5} title={`Pay ${naira(total)}`} sub="Secure checkout with Paystack." cat={cat} d={d} hold={holdMsg}>
      <div className="row gap8 small" style={{ border: "1px solid var(--line)", borderRadius: 999, padding: "8px 14px", alignSelf: "flex-start" }}><span className="avatar" style={{ width: 24, height: 24, fontSize: 10 }}>{user.name.slice(0, 2).toUpperCase()}</span>Signed in as {user.email}</div>
      <div className="card stack gap12">
        <h3 className="h4">Pay with</h3>
        {[["card", "Card", "Visa, Mastercard and Verve", "card"], ["bank_transfer", "Bank transfer", "Pay from any Nigerian bank app", "receipt"], ["ussd", "USSD", "Dial a code from your phone", "phone"]].map(([v, t, s, i]) => (
          <button key={v} type="button" className={`opt ${channel === v ? "on" : ""}`} onClick={() => setChannel(v)}>
            <span style={{ width: 40, height: 40, borderRadius: 10, background: "var(--surface)", display: "grid", placeItems: "center", color: "var(--brand)" }}><Icon name={i} /></span>
            <span className="grow stack"><b>{t}</b><span className="small muted">{s}</span></span><span className="radio" />
          </button>
        ))}
      </div>
      <div className="panel row gap12" style={{ alignItems: "flex-start" }}><Icon name="lock" /><div><b>You finish payment in Paystack’s secure window.</b><div className="small muted">We confirm your booking only after Paystack verifies the payment on our server. Please keep this tab open.</div></div></div>
      <ErrorBox error={error} />
      <div className="row between desk-actions"><Link to="/book/review" className="btn neutral">Back</Link><Btn arrow onClick={pay} disabled={busy}>{busy ? "Opening Paystack…" : `Pay ${naira(total)} with Paystack`}</Btn></div>
      <div className="stickybar"><div><b>{naira(total)}</b><div className="caption">{label} left on your hold</div></div><Btn arrow onClick={pay} disabled={busy}>Pay with Paystack</Btn></div>
    </Shell>
  );
}

/** Stand-in for Paystack's hosted checkout when no Paystack key is configured. */
export function DemoPay() {
  const [q] = useSearchParams();
  const ref = q.get("reference") ?? "";
  const [t, setT] = useState<{ amount_kobo: number; status: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const channel = sessionStorage.getItem("sessions.channel") ?? "card";
  useEffect(() => { api(`/payments/demo/${ref}`).then(setT).catch(() => setT(null)); }, [ref]);
  const finish = async (outcome: "success" | "failed") => {
    setBusy(true);
    await api(`/payments/demo/${ref}`, { body: { outcome, channel } });
    window.location.assign(`/book/verify?reference=${ref}`);
  };
  return (
    <div style={{ minHeight: "100vh", background: "#eef1f4", display: "grid", placeItems: "center", padding: 20 }}>
      <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 420, boxShadow: "0 20px 50px rgba(0,0,0,.12)", overflow: "hidden" }}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #eee" }} className="row between">
          <b>Test checkout</b><span className="tag warning">Simulated Paystack</span>
        </div>
        <div className="stack gap16" style={{ padding: 22 }}>
          <div className="row between"><span className="muted small">Sessions Studio</span><b style={{ fontSize: 22 }}>{t ? naira(t.amount_kobo) : "…"}</b></div>
          <div className="small muted">Reference {ref}</div>
          <div className="panel small" style={{ padding: 14 }}>This screen stands in for Paystack until live keys are added. The booking is still confirmed only after the server verifies this transaction.</div>
          <Btn kind="primary" className="block" onClick={() => finish("success")} disabled={busy || t?.status !== "pending"}>Pay {t ? naira(t.amount_kobo) : ""}</Btn>
          <button className="link small" style={{ color: "var(--danger)" }} onClick={() => finish("failed")} disabled={busy}>Simulate a failed payment</button>
        </div>
      </div>
    </div>
  );
}

export function BookVerify() {
  const [q] = useSearchParams();
  const ref = q.get("reference") ?? q.get("trxref") ?? "";
  const nav = useNavigate();
  const [state, setState] = useState<"checking" | "failed" | "refunded">("checking");
  useEffect(() => {
    let tries = 0;
    const run = async () => {
      const r = await api(`/payments/verify?reference=${encodeURIComponent(ref)}`).catch(() => ({ status: "failed" }));
      if (r.status === "confirmed") { clearDraft(); nav(`/book/confirmed/${r.booking.id}`, { replace: true }); }
      else if (r.status === "pending" && tries++ < 10) setTimeout(run, 2500);
      else setState(r.status === "refunded" ? "refunded" : "failed");
    };
    setTimeout(run, 900);
  }, [ref, nav]);
  return (
    <><Nav />
      <div className="wrap stack gap24" style={{ maxWidth: 620, padding: "88px 20px", textAlign: "center", alignItems: "center" }}>
        <Mark size={72} />
        {state === "checking" && <><h1 className="h2">Confirming your payment</h1><p className="muted">Paystack has your payment. We are verifying it on our server before we confirm your booking. This usually takes a few seconds.</p>
          <div className="card stack" style={{ padding: 0, width: "100%", textAlign: "left" }}>
            {[["check", "Payment received by Paystack", `Ref ${ref}`], ["clock", "Verifying on our server", "Not the browser"], ["calendar", "Confirming your booking", "One moment"]].map(([i, t, s], k) => (
              <div key={t} className="row gap12" style={{ padding: "14px 20px", borderTop: k ? "1px solid var(--line)" : 0, background: k === 1 ? "var(--neon-soft)" : undefined }}><Icon name={i} /><div><b>{t}</b><div className="small faint">{s}</div></div></div>
            ))}
          </div></>}
        {state === "failed" && <><h1 className="h2">Payment did not go through</h1><p className="muted">You have not been charged and the slot was released. Your details are saved, so you can pick a time and try again.</p><Link to="/book/time" className="btn">Pick a time <Icon name="arrow" size={18} /></Link></>}
        {state === "refunded" && <><h1 className="h2">This slot was taken</h1><p className="muted">Your hold expired and another client booked the time before your payment arrived. Your payment is being refunded in full.</p><Link to="/book/time" className="btn">Pick another time</Link></>}
      </div>
    </>
  );
}

export function BookConfirmed({ id }: { id: string }) {
  const [data, setData] = useState<any>(null);
  useEffect(() => { api(`/account/bookings/${id}`).then(setData); }, [id]);
  const b = data?.booking;
  const ics = useMemo(() => {
    if (!b) return "";
    const dt = (m: number) => `${b.date.replace(/-/g, "")}T${String(Math.floor(m / 60)).padStart(2, "0")}${String(m % 60).padStart(2, "0")}00`;
    return `data:text/calendar;charset=utf-8,${encodeURIComponent(`BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nDTSTART;TZID=Africa/Lagos:${dt(b.start_min)}\nDTEND;TZID=Africa/Lagos:${dt(b.end_min)}\nSUMMARY:${b.package_name} at Sessions Studio\nLOCATION:14 Admiralty Way, Lekki Phase 1, Lagos\nDESCRIPTION:Booking ${b.ref}\nEND:VEVENT\nEND:VCALENDAR`)}`;
  }, [b]);
  if (!b) return <><Nav dark /><Loading /></>;
  return (
    <div style={{ background: "var(--brand)", color: "#fff", minHeight: "100vh" }}>
      <Nav dark />
      <div className="wrap grid cols-2" style={{ padding: "72px 64px 120px", alignItems: "center", gap: 64 }}>
        <div className="stack gap24">
          <h1 className="display" style={{ fontSize: "clamp(48px,7vw,96px)" }}>You’re <span className="neon">booked.</span></h1>
          <p style={{ fontSize: 18, opacity: .78 }}>Booking {b.ref} is confirmed. Your receipt is on its way to {b.contact_email} and saved in your dashboard.</p>
          <div className="grid cols-2" style={{ background: "var(--brand-2)", borderRadius: 20, padding: 24, gap: 18 }}>
            {[["Reference", b.ref], ["Package", b.package_name], ["Date", shortDate(b.date)], ["Start time", t12(b.start_min)], ["Duration", hrs(b.end_min - b.start_min)], ["Amount paid", naira(b.total_kobo)], ["Studio", "14 Admiralty Way, Lekki Phase 1"], ["Questions", "+234 812 555 0142"]].map(([k, v]) => (
              <div key={k}><div className="mono" style={{ opacity: .55 }}>{k}</div><b style={{ fontWeight: 500 }}>{v}</b></div>
            ))}
          </div>
          <div className="row gap12 wrapflex"><Link to={`/account/bookings/${b.id}`} className="btn neon">Go to my booking <Icon name="arrow" size={18} /></Link><a href={ics} download={`${b.ref}.ics`} className="btn neutral">Add to calendar</a></div>
        </div>
        <div style={{ position: "relative", minHeight: 520 }}>
          <div style={{ position: "absolute", inset: "20px 80px 0 0", borderRadius: 28, background: `center/cover url(https://images.unsplash.com/photo-1647881602319-f3e5964bae06?w=1000&q=70&auto=format&fit=crop)`, filter: "grayscale(1)" }} />
          <div className="ticket" style={{ position: "absolute", right: 0, top: 90 }}>
            <div className="row between mono"><span>{b.ref}</span><span>Lagos · NG</span></div>
            <div style={{ fontSize: 34, fontWeight: 600, letterSpacing: "-.03em", lineHeight: 1, margin: "120px 0 12px" }}>{b.service_name.split(" ")[0].toUpperCase()}<br />SESSION</div>
            <div className="small">{hrs(b.end_min - b.start_min)} in Studio A · {b.artist_name}</div>
            <div className="row gap24" style={{ marginTop: 24, borderTop: "1px dashed rgba(16,34,0,.4)", paddingTop: 16 }}>
              <div><div className="mono">Date</div><b style={{ fontSize: 22 }}>{b.date.slice(8)}.{b.date.slice(5, 7)}</b></div>
              <div><div className="mono">Time</div><b style={{ fontSize: 22 }}>{`${String(Math.floor(b.start_min / 60)).padStart(2, "0")}:${String(b.start_min % 60).padStart(2, "0")}`}</b></div>
            </div>
          </div>
          <Waveform className="" bars={40} />
        </div>
      </div>
    </div>
  );
}

export { addDays };
