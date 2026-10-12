import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Nav, usePageTitle } from "../components/Layout";
import { Icon, Mark, Waveform } from "../components/brand";
import { Area, Btn, ErrorBox, Field, Loading, Steps } from "../components/ui";
import { ServiceCard } from "./public";
import { Barcode, ReceiptPrinter, ScrambleText, Tactile, TactileAnchor, TactileLink, type PrinterStage } from "../components/kitchen";
import { BookingTicket } from "../components/BookingTicket";
import { depositOf, needsApproval, roomOf, useCatalog, useContent, type Catalog } from "../lib/catalog";
import { loadDraft, saveDraft, clearDraft, type BookingDraft } from "../lib/draft";
import { addDays, dateTime, hrs, lagosToday, longDate, naira, shortDate, statusLabel, t12 } from "../lib/format";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";

function useDraft() {
  const [d, setD] = useState<BookingDraft>(loadDraft);
  const update = (patch: Partial<BookingDraft>) => { const next = { ...loadDraft(), ...patch }; saveDraft(next); setD(next); };
  return [d, update] as const;
}

function priced(cat: Catalog, d: BookingDraft) {
  const svc = cat.services.find((s) => s.slug === d.serviceSlug);
  const pkg = cat.packages.find((p) => p.id === d.packageId && p.service_category === svc?.category && p.pricing === "fixed");
  const room = roomOf(cat, pkg);
  const extras = cat.extras.filter((e) => d.extras.includes(e.slug) && (!e.category || e.category === svc?.category));
  const hourly = room?.hourly_kobo || cat.rules.extraHourKobo;
  const duration = (pkg?.duration_min ?? 0) + d.extraHours * 60;
  const total = (pkg?.price_kobo ?? 0) + d.extraHours * hourly + extras.reduce((s, e) => s + e.price_kobo, 0);
  const deposit = pkg ? depositOf(cat, pkg, total) : total;
  const approval = needsApproval(cat, pkg);
  const payNow = approval ? 0 : d.plan === "deposit" && deposit < total ? deposit : total;
  return { svc, pkg, room, extras, hourly, duration, total, deposit, approval, payNow };
}

const draftBody = (d: BookingDraft) => ({
  serviceSlug: d.serviceSlug, packageId: d.packageId, date: d.date, start: d.start, extraHours: d.extraHours, extras: d.extras, people: d.people,
  artistName: d.artistName, contactName: d.contactName, contactEmail: d.contactEmail, contactPhone: d.contactPhone, project: d.project, notes: d.notes, links: d.links,
});

function Summary({ cat, d, hold }: { cat: Catalog; d: BookingDraft; hold?: string | null }) {
  const { svc, pkg, room, duration, total, deposit, approval } = priced(cat, d);
  return (
    <aside className="summary desk">
      {svc && <div className="ph" style={{ backgroundImage: `url(${room?.image_url || svc.image_url})` }} />}
      <span className="mono muted">Your booking</span>
      <h3 className="h3" style={{ fontSize: 20 }}>{svc?.name ?? "Pick a service"}{pkg ? ` · ${pkg.name}` : ""}</h3>
      {[["door", "Room", room ? `${room.name} · ${room.kind}` : "Set by the package"], ["calendar", "Date", d.date ? longDate(d.date) : "Pick a date"], ["clock", "Time", d.start != null && duration ? `${t12(d.start)} to ${t12(d.start + duration)} · ${hrs(duration)}` : "Pick a start time"], ["users", "People", d.contactName ? `${d.people} ${d.people === 1 ? "person" : "people"}` : "Add in your details"]].map(([i, k, v]) => (
        <div key={k} className="row gap12"><span className="sumicon"><Icon name={i} size={18} /></span><div><div className="mono faint">{k}</div><b style={{ fontWeight: 500 }}>{v}</b></div></div>
      ))}
      <div className="divider" />
      <div className="row between"><span className="muted">Total</span><b style={{ fontSize: 22 }}>{pkg ? naira(total) : "Pick a package"}</b></div>
      {pkg && !approval && deposit < total && <div className="row between small"><span className="muted">Deposit to book</span><b>{naira(deposit)}</b></div>}
      {hold && <div className="holdmsg">{hold}</div>}
      <span className="caption">{approval ? "This package needs studio approval. You pay after it is approved." : "Payment is verified with Paystack before we confirm."}</span>
    </aside>
  );
}

function Shell({ step, title, sub, cat, d, hold, children, back, next, nextLabel, nextDisabled, busy, aside = true }: {
  step: number; title: string; sub?: string; cat: Catalog; d: BookingDraft; hold?: string | null; children: ReactNode;
  back?: string; next?: () => void; nextLabel?: string; nextDisabled?: boolean; busy?: boolean; aside?: boolean;
}) {
  usePageTitle("Book a session");
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
              {back ? <TactileLink to={back} variant="light" size="lg">Back</TactileLink> : <span />}
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
  const pick = (slug: string) => {
    const svc = cat.services.find((s) => s.slug === slug);
    const keep = cat.packages.some((p) => p.id === d.packageId && p.service_category === svc?.category);
    up({ serviceSlug: slug, ...(keep ? {} : { packageId: undefined, start: undefined }) });
  };
  return (
    <Shell step={1} title="What are you making?" sub="Pick the closest match. You choose the room and package next." cat={cat} d={d} aside={false} next={() => nav("/book/package")} nextLabel="Choose a package" nextDisabled={!d.serviceSlug}>
      {cat.categories.map((c) => {
        const list = cat.services.filter((s) => s.category === c.slug);
        if (!list.length || !cat.packages.some((p) => p.service_category === c.slug && p.pricing === "fixed")) return null;
        return (
          <div key={c.slug} className="stack gap12">
            <span className="mono faint">{c.name}</span>
            <div className="grid cols-4 svcpick">{list.map((s) => <ServiceCard key={s.id} s={s} on={d.serviceSlug === s.slug} onClick={() => pick(s.slug)} />)}</div>
          </div>
        );
      })}
      <div className="panel small row between wrapflex gap12"><span className="muted">Making a music video, commercial or something bigger?</span><Link to="/quote" className="link">Request a quote instead</Link></div>
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
  const list = cat.packages.filter((p) => p.service_category === svc?.category);
  const rooms = cat.rooms.filter((r) => list.some((p) => p.room_id === r.id && p.pricing === "fixed"));
  const quotes = list.filter((p) => p.pricing === "quote");
  const valid = list.some((p) => p.id === d.packageId && p.pricing === "fixed");
  return (
    <Shell step={2} title="Pick a package." sub={`For ${svc?.name.toLowerCase() ?? "your session"}. Crew included in every room.`} cat={cat} d={d} back="/book" next={() => nav("/book/time")} nextLabel="Choose date & time" nextDisabled={!valid}>
      <div className="card stack gap20">
        {rooms.map((r) => (
          <div key={r.id} className="stack gap12">
            <span className="mono faint">{r.name} · {r.kind}</span>
            {list.filter((p) => p.room_id === r.id && p.pricing === "fixed").map((p) => {
              const deposit = depositOf(cat, p, p.price_kobo);
              return (
                <button key={p.id} type="button" className={`opt ${d.packageId === p.id ? "on" : ""}`} onClick={() => up({ packageId: p.id, start: undefined, extraHours: 0 })}>
                  <span className="radio" />
                  <span className="grow stack gap4"><b>{p.name}</b><span className="small muted">{p.description}</span>
                    <span className="row gap8 wrapflex">{needsApproval(cat, p) ? <span className="tag warning">Studio approval</span> : <span className="tag success">Instant booking</span>}<span className="tag">{deposit < p.price_kobo ? `${naira(deposit)} deposit` : "Pay in full"}</span></span>
                  </span>
                  <span className="stack" style={{ alignItems: "flex-end" }}><b>{naira(p.price_kobo)}</b><span className="mono faint">{hrs(p.duration_min)}</span></span>
                </button>
              );
            })}
          </div>
        ))}
        {quotes.length > 0 && (
          <div className="stack gap12">
            <span className="mono faint">Priced by quote</span>
            {quotes.map((p) => (
              <Link key={p.id} to={`/quote?service=${encodeURIComponent(p.name)}`} className="opt">
                <span className="grow stack gap4"><b>{p.name}</b><span className="small muted">{p.description}</span></span>
                <span className="link small">Request a quote →</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}

type DayStatus = "available" | "limited" | "full" | "closed" | "past";
export function BookTime() {
  const cat = useCatalog();
  const [d, up] = useDraft();
  const nav = useNavigate();
  const [q] = useSearchParams();
  const { pkg, room, duration, hourly } = cat ? priced(cat, d) : { pkg: undefined, room: undefined, duration: 0, hourly: 0 };
  const [month, setMonth] = useState((d.date ?? lagosToday()).slice(0, 7));
  const [days, setDays] = useState<{ date: string; status: DayStatus }[]>([]);
  const [slots, setSlots] = useState<{ start: number; available: boolean }[] | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);
  useEffect(() => { if (cat && !pkg) nav(d.serviceSlug ? "/book/package" : "/book", { replace: true }); }, [cat, pkg, nav, d.serviceSlug]);
  useEffect(() => { if (duration && room) api(`/availability/month?month=${month}&duration=${duration}&room=${room.id}`).then((r) => setDays(r.days)); }, [month, duration, room]);
  useEffect(() => {
    if (!d.date || !duration || !room) return;
    setSlots(null);
    api(`/availability/day?date=${d.date}&duration=${duration}&room=${room.id}`).then((r) => { setSlots(r.slots); setUpdated(new Date()); });
  }, [d.date, duration, room]);
  if (!cat || !pkg || !room) return <><Nav /><Loading /></>;
  const firstDow = (new Date(`${month}-01T00:00:00Z`).getUTCDay() + 6) % 7;
  const shift = (n: number) => { const x = new Date(`${month}-01T00:00:00Z`); x.setUTCMonth(x.getUTCMonth() + n); setMonth(x.toISOString().slice(0, 7)); };
  return (
    <Shell step={3} title="Pick a date and start time." sub={`Live availability for ${room.name}. Times are in Lagos time (WAT).`} cat={cat} d={d} back="/book/package" next={() => nav("/book/details")} nextLabel="Continue to details" nextDisabled={!d.date || d.start == null}>
      {q.get("taken") && <div className="error">Someone took that time a moment ago. Please pick another.</div>}
      <div className="grid" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,340px)", gap: 20 }} data-stack>
        <div className="card stack gap12">
          <div className="row between">
            <h3 className="h3" style={{ fontSize: 20 }}>{new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}</h3>
            <div className="row gap8"><Tactile variant="light" size="sm" onClick={() => shift(-1)} disabled={month <= lagosToday().slice(0, 7)} aria-label="Previous month">‹</Tactile><Tactile variant="light" size="sm" onClick={() => shift(1)} aria-label="Next month">›</Tactile></div>
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
            <span className="hint">Extra time in {room.name} is {naira(hourly)} per hour.</span>
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
  const { room } = priced(cat, d);
  const max = room?.capacity || cat.rules.maxPeople;
  const valid = d.contactName && /\S+@\S+\.\S+/.test(d.contactEmail) && d.contactPhone && d.artistName && d.people >= 1 && d.people <= max;
  return (
    <Shell step={4} title="Tell us about the session." sub="No account needed yet. You log in or sign up at checkout and keep everything you enter here." cat={cat} d={d} back="/book/time" next={() => nav("/book/review")} nextLabel="Review booking" nextDisabled={!valid}>
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
          <Field label="Artist, brand or project name" name="artistName" value={d.artistName} onChange={(e) => up({ artistName: e.target.value })} />
          <div className="field"><label>Number of people</label>
            <div className="row stepper">
              <button type="button" className="link" onClick={() => up({ people: Math.max(1, d.people - 1) })} aria-label="Fewer people">−</button>
              <b>{d.people}</b>
              <button type="button" className="link" onClick={() => up({ people: Math.min(max, d.people + 1) })} aria-label="More people">+</button>
            </div>
            <span className="hint">{room?.name ?? "The room"} takes up to {max}, including you.</span>
          </div>
        </div>
        <Area label="Project description" name="project" rows={3} value={d.project} onChange={(e) => up({ project: e.target.value })} placeholder="What are you working on? A single, an EP, an episode, a shoot…" />
        <Area label="Special requirements" name="notes" rows={2} value={d.notes} onChange={(e) => up({ notes: e.target.value })} placeholder="Bringing your own producer or crew, gear you need, accessibility needs…" />
        <Field label="Reference links (optional)" name="links" value={d.links} onChange={(e) => up({ links: e.target.value })} placeholder="YouTube, Spotify, Instagram or Drive links" />
      </div>
    </Shell>
  );
}

export function BookReview() {
  const cat = useCatalog();
  const [d, up] = useDraft();
  const nav = useNavigate();
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!cat) return <><Nav /><Loading /></>;
  const { svc, pkg, room, extras, duration, total, deposit, approval, hourly } = priced(cat, d);
  const go = async () => {
    setBusy(true); setError(null);
    try {
      if (d.holdId) await api(`/holds/${d.holdId}`, { method: "DELETE" }).catch(() => {});
      const r = await api("/holds", { body: draftBody(d) });
      up({ holdId: r.holdId });
      nav("/book/checkout");
    } catch (e: any) {
      if (e instanceof ApiError && e.code === "slot_taken") { up({ start: undefined }); nav("/book/time?taken=1"); return; }
      setError(e.message);
    } finally { setBusy(false); }
  };
  const row = (k: string, a: string, b: string, to: string) => (
    <div className="row gap16 reviewrow">
      <div className="grow"><div className="mono faint">{k}</div><b style={{ fontWeight: 500 }}>{a}</b><div className="small muted">{b}</div></div>
      <Link to={to} className="small" style={{ fontWeight: 500, color: "var(--brand)" }}>Edit</Link>
    </div>
  );
  const available = cat.extras.filter((e) => !e.category || e.category === svc?.category);
  return (
    <Shell step={5} title="Review your booking." sub="Check the details and price. We hold your slot while you check out." cat={cat} d={d} back="/book/details" next={go} nextLabel={approval ? "Continue to send request" : "Continue to checkout"} nextDisabled={!agree} busy={busy}>
      <div className="card" style={{ padding: 0 }}>
        <div style={{ marginTop: -1 }}>{row("Package", `${svc?.name} · ${pkg?.name}`, `${room?.name ?? ""} · crew included`, "/book/package")}</div>
        {row("Date and time", d.date ? longDate(d.date) : "", d.start != null ? `${t12(d.start)} to ${t12(d.start + duration)} (${hrs(duration)})` : "", "/book/time")}
        {row("Your details", d.contactName, `${d.contactEmail} · ${d.contactPhone}`, "/book/details")}
        {row("Session", `${d.artistName} · ${d.people} ${d.people === 1 ? "person" : "people"}`, [d.project, d.notes].filter(Boolean).join(" · ") || "No project notes", "/book/details")}
      </div>
      <div className="card stack gap12">
        {available.length > 0 && <>
          <b className="small">Add extras</b>
          {available.map((e) => (
            <label key={e.slug} className="row gap12 small" style={{ cursor: "pointer" }}>
              <input type="checkbox" checked={d.extras.includes(e.slug)} onChange={(ev) => up({ extras: ev.target.checked ? [...d.extras, e.slug] : d.extras.filter((x) => x !== e.slug) })} />
              <span className="grow">{e.name}</span><span className="muted">+{naira(e.price_kobo)}</span>
            </label>
          ))}
        </>}
        <div className="panel stack gap8" style={{ padding: 18 }}>
          <span className="mono muted">Price details</span>
          <div className="row between small"><span>{pkg?.name}</span><span>{naira(pkg?.price_kobo ?? 0)}</span></div>
          {d.extraHours > 0 && <div className="row between small"><span>Extra time ({d.extraHours} hr at {naira(hourly)})</span><span>{naira(d.extraHours * hourly)}</span></div>}
          {extras.map((e) => <div key={e.slug} className="row between small"><span>{e.name}</span><span>{naira(e.price_kobo)}</span></div>)}
          <div className="divider" />
          <div className="row between"><b>Total</b><b style={{ fontSize: 20 }}>{naira(total)}</b></div>
        </div>
      </div>
      {approval ? (
        <div className="notice row gap12" style={{ alignItems: "flex-start" }}><Icon name="shield" /><div><b>This package needs studio approval.</b><div className="small">You send a request now and pay nothing yet. The studio replies within 24 hours, then you have {cat.rules.paymentWindowHours} hours to pay {deposit < total ? `the ${naira(deposit)} deposit or the full amount` : "the full amount"} to confirm.</div></div></div>
      ) : (
        <div className="card stack gap12">
          <b className="small">How would you like to pay?</b>
          {deposit < total ? <>
            {(["deposit", "full"] as const).map((plan) => (
              <button key={plan} type="button" className={`opt ${d.plan === plan ? "on" : ""}`} onClick={() => up({ plan })}>
                <span className="radio" />
                <span className="grow stack"><b>{plan === "deposit" ? `Pay a deposit of ${naira(deposit)}` : `Pay in full, ${naira(total)}`}</b><span className="small muted">{plan === "deposit" ? `The balance of ${naira(total - deposit)} is due before your session. Pay it online from your account or at the studio.` : "Nothing more to pay later."}</span></span>
              </button>
            ))}
          </> : <span className="small muted">This package is paid in full when you book: {naira(total)}.</span>}
        </div>
      )}
      <label className="row gap12 small" style={{ cursor: "pointer" }}>
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <span>I agree to the <Link to="/packages#policies" target="_blank" style={{ textDecoration: "underline" }}>booking policies</Link> and <Link to="/terms" target="_blank" style={{ textDecoration: "underline" }}>terms</Link>, including deposits, cancellation, rescheduling and late arrival rules.</span>
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
  const [tab, setTab] = useState<"register" | "login">("register");
  const [f, setF] = useState({ name: d.contactName, email: d.contactEmail, phone: d.contactPhone, password: "", confirmPassword: "" });
  const [channel, setChannel] = useState("card");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!d.holdId) nav("/book/review", { replace: true }); }, [d.holdId, nav]);
  useEffect(() => { if (hold?.bookingId) nav(`/book/confirmed/${hold.bookingId}`, { replace: true }); }, [hold, nav]);
  if (!cat || !hold) return <><Nav /><Loading /></>;
  const { total, deposit, approval, payNow } = priced(cat, d);
  if (expired) return (
    <Shell step={5} title="This slot is no longer held." sub="Your hold ran out before you finished, so the time was released. You have not been charged and your details are saved." cat={cat} d={d}>
      <div className="row gap12"><TactileLink to="/book/time" size="lg">Pick another time <Icon name="arrow" size={18} /></TactileLink></div>
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
  const holdMsg = `Slot held for ${label}`;
  if (!user || user.role !== "client") return (
    <Shell step={5} title={approval ? "Log in or create an account to send your request." : "Log in or create an account to pay."} sub="Your booking is saved. You come straight back here after." cat={cat} d={d} hold={holdMsg}>
      <div className="holdmsg">We are holding {d.date ? shortDate(d.date) : ""}, {d.start != null ? t12(d.start) : ""} for you. {label} left to finish.</div>
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
        <Btn arrow block disabled={busy}>{busy ? "Please wait…" : tab === "register" ? "Create account and continue" : "Log in and continue"}</Btn>
      </form>
    </Shell>
  );
  const signedIn = <div className="row gap8 small signedin"><span className="avatar" style={{ width: 24, height: 24, fontSize: 10 }}>{user.name.slice(0, 2).toUpperCase()}</span>Signed in as {user.email}</div>;
  if (approval) return (
    <Shell step={5} title="Send your booking request" sub="The studio reviews it and replies within 24 hours. Nothing is charged now." cat={cat} d={d} hold={holdMsg}>
      {signedIn}
      <div className="card stack gap12">
        {[["1", "Send the request", "We hold this time for you while the studio reviews it."], ["2", "The studio approves it", "You get an email with a secure payment link."], ["3", "Pay to confirm", `Pay ${deposit < total ? `a ${naira(deposit)} deposit or the full ${naira(total)}` : naira(total)} within ${cat.rules.paymentWindowHours} hours and you are booked.`]].map(([n, t, s]) => (
          <div key={n} className="row gap12" style={{ alignItems: "flex-start" }}><span className="stepnum">{n}</span><div><b>{t}</b><div className="small muted">{s}</div></div></div>
        ))}
      </div>
      <ErrorBox error={error} />
      <div className="row between desk-actions"><TactileLink to="/book/review" variant="light" size="lg">Back</TactileLink><Btn arrow onClick={request} disabled={busy}>{busy ? "Sending…" : "Send booking request"}</Btn></div>
      <div className="stickybar"><div><b>{naira(total)}</b><div className="caption">Nothing to pay now</div></div><Btn arrow onClick={request} disabled={busy}>Send request</Btn></div>
    </Shell>
  );
  return (
    <Shell step={5} title={`Pay ${naira(payNow)}`} sub={payNow < total ? `Deposit now, ${naira(total - payNow)} before your session. Secure checkout with Paystack.` : "Secure checkout with Paystack."} cat={cat} d={d} hold={holdMsg}>
      {signedIn}
      <ChannelPicker channel={channel} setChannel={setChannel} />
      <div className="panel row gap12" style={{ alignItems: "flex-start" }}><Icon name="lock" /><div><b>You finish payment in Paystack’s secure window.</b><div className="small muted">We confirm your booking only after Paystack verifies the payment on our server. Card details never touch our servers.</div></div></div>
      <ErrorBox error={error} />
      <div className="row between desk-actions"><TactileLink to="/book/review" variant="light" size="lg">Back</TactileLink><Btn arrow onClick={pay} disabled={busy}>{busy ? "Opening Paystack…" : `Pay ${naira(payNow)} with Paystack`}</Btn></div>
      <div className="stickybar"><div><b>{naira(payNow)}</b><div className="caption">{label} left on your hold</div></div><Btn arrow onClick={pay} disabled={busy}>Pay with Paystack</Btn></div>
    </Shell>
  );
}

export function BookRequested() {
  const { id = "" } = useParams();
  const [b, setB] = useState<any>(null);
  usePageTitle("Request sent");
  useEffect(() => { api(`/account/bookings/${id}`).then((r) => setB(r.booking)).catch(() => setB(false)); }, [id]);
  return (
    <><Nav />
      <div className="wrap stack gap24 donepage">
        <Mark size={64} />
        <span className="tag warning" style={{ alignSelf: "center" }}>Awaiting approval</span>
        <h1 className="h2">Request sent.</h1>
        <p className="muted" style={{ maxWidth: 560 }}>{b ? `Booking ${b.ref} for ${longDate(b.date)}, ${t12(b.start_min)} in ${b.room_name} is with the studio. We hold the time until they reply, usually within 24 hours, and email you a payment link once it is approved.` : "Your request is with the studio. We email you a payment link once it is approved."}</p>
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
          <div className="row between"><span className="muted small">{site?.content.business_name ?? "Psych Records Entertainment"}</span><b style={{ fontSize: 22 }}>{t ? naira(t.amount_kobo) : "…"}</b></div>
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
  const name = site?.content.business_name ?? "Psych Records Entertainment";
  if (state !== "checking") return (
    <><Nav />
      <div className="wrap stack gap24 donepage">
        <Mark size={72} />
        {state === "failed" && <><h1 className="h2">Payment did not go through</h1><p className="muted">You have not been charged. If this was a new booking the slot was released and your details are saved, so you can try again.</p><TactileLink to="/book/time" size="lg">Pick a time <Icon name="arrow" size={18} /></TactileLink></>}
        {state === "refunded" && <><h1 className="h2">This payment was refunded</h1><p className="muted">The slot was taken, or the booking had closed, before your payment arrived. Your payment is being refunded in full.</p><TactileLink to="/book" size="lg">Book another time</TactileLink></>}
      </div>
    </>
  );
  const owner = !!user && user.role === "client";
  return (
    <><Nav />
      <div className="wrap verify">
        <div className="stack gap12" style={{ alignItems: "center" }}>
          <h1 className="h2">{!done ? "Confirming your payment" : kind === "balance" ? "Balance paid. You’re all set." : booking.balance_kobo > 0 ? "You’re booked. Deposit received." : "You’re booked."}</h1>
          <p className="muted" style={{ maxWidth: 560 }}>{done ? `Booking ${booking.ref} is ${statusLabel(booking.status).toLowerCase()}.${booking.balance_kobo > 0 ? ` ${naira(booking.balance_kobo)} is due before your session.` : ""} The receipt is in your inbox${owner ? " and your dashboard" : ""}.` : "Paystack has your payment. We verify it on our server before we confirm your booking."}</p>
        </div>
        {done && owner && (
          <div className="row gap12 wrapflex" style={{ justifyContent: "center" }}>
            <TactileLink to={`/book/confirmed/${booking.id}`} variant="neon" size="lg">See your ticket <Icon name="arrow" size={18} /></TactileLink>
            <TactileLink to={`/account/bookings/${booking.id}`} variant="light" size="lg">Go to my booking</TactileLink>
          </div>
        )}
        <ReceiptPrinter stage={stage} labels={{ processing: "Verifying with Paystack", printing: "Printing your receipt", complete: "Payment verified" }}
          header={<><Mark tone="neon" size={30} /><span className="pr-ref">{ref}</span></>}
          screen={<div className="pr-row"><div><p>{booking?.package_name ?? "Your booking"}</p><p className="dim">{booking ? `${shortDate(booking.date)} · ${t12(booking.start_min)}` : "Checking"}</p></div><div className="right"><p className="dim">Paid</p><strong>{booking ? naira(booking.paid_kobo) : "…"}</strong></div></div>}>
          {booking && <>
            <div className="rc-logo"><Mark tone="ink" size={44} /></div>
            <p className="rc-head" style={{ textAlign: "center" }}>{name}</p>
            {site?.content.studio_address && <p className="rc-dim" style={{ textAlign: "center" }}>{site.content.studio_address}</p>}
            <hr className="rc-hr" />
            <div className="rc-row"><span className="rc-head">{booking.package_name}</span><span>{naira(booking.package_price_kobo)}</span></div>
            <div className="rc-dim">{shortDate(booking.date)} · {t12(booking.start_min)} to {t12(booking.end_min)} · {booking.room_name}</div>
            {booking.extras.map((e: any) => <div key={e.name} className="rc-row" style={{ marginTop: 8 }}><span className="rc-head">{e.name}</span><span>{naira(e.price)}</span></div>)}
            <hr className="rc-hr" />
            <div className="rc-row rc-dim"><span>Total</span><span>{naira(booking.total_kobo)}</span></div>
            <div className="rc-row rc-dim"><span>Paid with</span><span>Paystack · {channel}</span></div>
            <div className="rc-row" style={{ marginTop: 8 }}><span className="rc-head">Total paid</span><span className="rc-total">{naira(booking.paid_kobo)}</span></div>
            {booking.balance_kobo > 0 && <div className="rc-row rc-dim" style={{ marginTop: 4 }}><span>Balance due</span><span>{naira(booking.balance_kobo)}</span></div>}
            <hr className="rc-hr" />
            <Barcode />
            <p className="rc-note">Ref <ScrambleText>{booking.ref}</ScrambleText></p>
            <p className="rc-note rc-dim">See you in {booking.room_name}.</p>
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
  const name = site?.content.business_name ?? "Psych Records Entertainment";
  const ics = useMemo(() => {
    if (!b) return "";
    const dt = (m: number) => `${b.date.replace(/-/g, "")}T${String(Math.floor(m / 60)).padStart(2, "0")}${String(m % 60).padStart(2, "0")}00`;
    return `data:text/calendar;charset=utf-8,${encodeURIComponent(`BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nDTSTART;TZID=Africa/Lagos:${dt(b.start_min)}\nDTEND;TZID=Africa/Lagos:${dt(b.end_min)}\nSUMMARY:${b.package_name} at ${name}\nLOCATION:${b.room_name}${site?.content.studio_address ? `, ${site.content.studio_address}` : ""}\nDESCRIPTION:Booking ${b.ref}\nEND:VEVENT\nEND:VCALENDAR`)}`;
  }, [b, name, site]);
  if (!b) return <><Nav dark /><Loading /></>;
  return (
    <div className="confpage">
      <Nav dark />
      <div className="wrap grid cols-2" style={{ paddingTop: 72, paddingBottom: 120, alignItems: "center", gap: 64 }}>
        <div className="stack gap24">
          <h1 className="display">You’re <span className="neon">booked.</span></h1>
          <p style={{ fontSize: 18, opacity: .78 }}>Booking {b.ref} is confirmed. Your receipt is on its way to {b.contact_email} and saved in your dashboard.</p>
          <div className="grid cols-2 confgrid">
            {[["Reference", b.ref], ["Package", b.package_name], ["Room", b.room_name], ["Date", shortDate(b.date)], ["Start time", t12(b.start_min)], ["Duration", hrs(b.end_min - b.start_min)], ["Paid", naira(b.paid_kobo)], ["Balance due", b.balance_kobo > 0 ? naira(b.balance_kobo) : "Nothing"]].map(([k, v]) => (
              <div key={k}><div className="mono" style={{ opacity: .55 }}>{k}</div><b style={{ fontWeight: 500 }}>{v}</b></div>
            ))}
          </div>
          <div className="row gap12 wrapflex"><TactileLink to={`/account/bookings/${b.id}`} variant="neon" size="lg">Go to my booking <Icon name="arrow" size={18} /></TactileLink><TactileAnchor href={ics} download={`${b.ref}.ics`} variant="light" size="lg">Add to calendar</TactileAnchor></div>
        </div>
        <div className="conf-art">
          <div className="conf-photo" />
          <div className="conf-ticket"><BookingTicket kind={b.service_name.split(" ")[0]} date={b.date} start={b.start_min} duration={b.end_min - b.start_min} artist={b.artist_name} people={b.people} reference={b.ref} room={b.room_name} /></div>
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
  if (error && !data) return <><Nav /><div className="wrap stack gap16 donepage"><Mark size={64} /><h1 className="h2">We could not open this payment.</h1><p className="muted">{error} Contact the studio if you think this is a mistake.</p><TactileLink to="/contact" size="lg">Contact the studio</TactileLink></div></>;
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
            <span className="small muted">{longDate(b.date)} · {t12(b.start_min)} to {t12(b.end_min)} · {b.room_name}</span>
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
                {([["deposit", `Deposit, ${naira(due.deposit)}`, `${naira(due.full - due.deposit)} is due before your session.`], ["full", `Full amount, ${naira(due.full)}`, "Nothing more to pay later."]] as const).map(([v, t, s]) => (
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
