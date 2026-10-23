import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Nav, usePageTitle } from "../components/Layout";
import { Icon } from "../components/brand";
import { Area, Btn, ErrorBox, Field, Loading, Steps } from "../components/ui";
import { ServiceCard } from "./public";
import { Tactile, TactileLink } from "../components/kitchen";
import { depositOf, needsApproval, roomOf, useCatalog, type Catalog } from "../lib/catalog";
import { loadDraft, saveDraft, type BookingDraft } from "../lib/draft";
import { addDays, hrs, lagosToday, longDate, naira, shortDate, t12 } from "../lib/format";
import {
  canonicalService, deliveryLabel, draftWindow, extrasFor, fixedPackages, flowGuard, isQuoteOnly, nextPath, prevPath, resolvePackage, revisionLabel, savings, sessionDays, stepsFor, windowLabel, windowsOn,
  type StepKey,
} from "../lib/booking";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";

export function useDraft() {
  const [d, setD] = useState<BookingDraft>(loadDraft);
  const update = (patch: Partial<BookingDraft>) => { const next = { ...loadDraft(), ...patch }; saveDraft(next); setD(next); };
  return [d, update] as const;
}

export function priced(cat: Catalog, d: BookingDraft) {
  const svc = cat.services.find((s) => s.slug === canonicalService(d.serviceSlug));
  const fixed = fixedPackages(cat, svc);
  const pkg = resolvePackage(fixed, d.packageId);
  const mode = pkg?.scheduling ?? "flex";
  const room = mode === "project" ? undefined : roomOf(cat, pkg);
  const extras = extrasFor(cat, svc).filter((e) => d.extras.includes(e.slug));
  const hourly = room?.hourly_kobo || cat.rules.extraHourKobo;
  const extraHours = mode === "flex" ? d.extraHours : 0;
  const win = draftWindow(cat.sessions, pkg, d);
  const duration = mode === "flex" ? (pkg?.duration_min ?? 0) + extraHours * 60 : win ? win.end - win.start : 0;
  const total = (pkg?.price_kobo ?? 0) + extraHours * hourly + extras.reduce((s, e) => s + (e.pricing === "quote" ? 0 : e.price_kobo), 0);
  const deposit = pkg ? depositOf(cat, pkg, total) : total;
  const approval = needsApproval(cat, pkg);
  const payNow = approval ? 0 : d.plan === "deposit" && deposit < total ? deposit : total;
  return { svc, fixed, pkg, mode, room, extras, hourly, extraHours, win, duration, total, deposit, approval, payNow };
}

export const draftBody = (cat: Catalog, d: BookingDraft) => {
  const { svc, pkg, mode, extras } = priced(cat, d);
  return {
    serviceSlug: svc?.slug, packageId: pkg?.id, extras: extras.map((e) => e.slug),
    ...(mode === "project" ? {} : { date: d.date, start: d.start, people: d.people }),
    ...(mode === "flex" ? { extraHours: d.extraHours } : {}),
    artistName: d.artistName, contactName: d.contactName, contactEmail: d.contactEmail, contactPhone: d.contactPhone, project: d.project, notes: d.notes, links: d.links,
  };
};

export function useGuard(cat: Catalog | null, d: BookingDraft, at: StepKey) {
  const nav = useNavigate();
  const to = cat ? flowGuard(cat, d, at, lagosToday()) : null;
  useEffect(() => { if (to) nav(to, { replace: true }); }, [to, nav]);
  return !!to;
}

const nextLabelFor = (key: StepKey | undefined) => (key === "package" ? "Choose a package" : key === "time" ? "Choose date and time" : key === "details" ? "Continue to details" : "Review");

function Summary({ cat, d, hold }: { cat: Catalog; d: BookingDraft; hold?: string | null }) {
  const { svc, pkg, mode, room, win, total, deposit, approval, extraHours } = priced(cat, d);
  const when = !d.date ? "Pick a date" : win ? windowLabel(d.date, win.start, win.end) : "Pick a time";
  const rows: [string, string, string][] = mode === "project"
    ? [["upload", "Delivery", "In your portal"], ["clock", "Turnaround", deliveryLabel(pkg?.turnaround_days ?? null) || "Set by the studio"]]
    : mode === "day"
      ? [["calendar", "Start day", d.date ? longDate(d.date) : "Pick a day"], ["door", "Room", room ? `${room.name} · ${room.kind}` : "Set by the package"], ["users", "Staying", d.contactName ? `${d.people} ${d.people === 1 ? "person" : "people"}` : "Add in your details"]]
      : [["door", "Room", room ? `${room.name} · ${room.kind}` : "Set by the package"], ["calendar", "Date", d.date ? longDate(d.date) : "Pick a date"],
        ["clock", "Time", mode === "flex" && d.start != null && win ? `${t12(d.start)} to ${t12(d.start + (win.end - win.start) + extraHours * 60)} · ${hrs(win.end - win.start + extraHours * 60)}` : when],
        ["users", "People", d.contactName ? `${d.people} ${d.people === 1 ? "person" : "people"}` : "Add in your details"]];
  return (
    <aside className="summary desk">
      {svc && <div className="ph" style={{ backgroundImage: `url(${room?.image_url || svc.image_url})` }} />}
      <h3 className="h3" style={{ fontSize: 20 }}>{svc?.name ?? "Pick a service"}{pkg && pkg.name !== svc?.name ? ` · ${pkg.name}` : ""}</h3>
      {pkg && rows.map(([i, k, v]) => (
        <div key={k} className="row gap12"><span className="sumicon"><Icon name={i} size={18} /></span><div><div className="mono faint">{k}</div><b style={{ fontWeight: 500 }}>{v}</b></div></div>
      ))}
      {pkg && <div className="divider" />}
      <div className="row between"><span className="muted">Total</span><b style={{ fontSize: 22 }}>{pkg ? naira(total) : "Pick a package"}</b></div>
      {pkg && pkg.unit && <div className="caption" style={{ marginTop: -10 }}>{pkg.unit}</div>}
      {pkg && !approval && deposit < total && <div className="row between small"><span className="muted">Deposit to book</span><b>{naira(deposit)}</b></div>}
      {hold && <div className="holdmsg">{hold}</div>}
      {pkg && <span className="caption">{approval ? "This package needs studio approval. You pay after it is approved." : "Payment is verified with Paystack before we confirm."}</span>}
    </aside>
  );
}

export function Shell({ at, title, sub, cat, d, hold, children, back, next, nextLabel, nextDisabled, busy, aside = true, stickyNote }: {
  at: StepKey; title: string; sub?: string; cat: Catalog; d: BookingDraft; hold?: string | null; children: ReactNode;
  back?: string; next?: () => void; nextLabel?: string; nextDisabled?: boolean; busy?: boolean; aside?: boolean; stickyNote?: string;
}) {
  usePageTitle("Book with Psych Records");
  const { total, pkg, fixed, mode, win, svc } = priced(cat, d);
  const steps = stepsFor(fixed, d.packageId);
  const backTo = back ?? (at === "service" ? undefined : prevPath(steps, at));
  const caption = stickyNote ?? (mode === "project" ? pkg?.name : d.date && win ? `${shortDate(d.date)} · ${t12(win.start)}` : pkg?.name ?? svc?.name ?? "Pick what you are making");
  return (
    <>
      <Nav />
      <div className="wrap booklayout" style={aside ? undefined : { gridTemplateColumns: "1fr" }}>
        <div className="stack gap24 bookmain">
          <Steps steps={steps} at={at} />
          <div className="stack gap8"><h1 className="h1" style={{ fontSize: "clamp(30px,3.6vw,46px)" }}>{title}</h1>{sub && <p className="muted">{sub}</p>}</div>
          {children}
          {next && (
            <div className="row between desk-actions">
              {backTo ? <TactileLink to={backTo} variant="light" size="lg">Back</TactileLink> : <span />}
              <Btn arrow onClick={next} disabled={nextDisabled || busy}>{busy ? "Please wait…" : nextLabel}</Btn>
            </div>
          )}
        </div>
        {aside && <Summary cat={cat} d={d} hold={hold} />}
      </div>
      {next && (
        <div className="stickybar">
          {backTo && <TactileLink to={backTo} variant="light" size="lg" className="stickyback" aria-label="Back">‹</TactileLink>}
          <div className="grow stickyinfo"><b>{pkg ? naira(total) : "Choose"}</b><div className="caption">{caption}</div></div>
          <Btn arrow onClick={next} disabled={nextDisabled || busy}>{busy ? "Please wait…" : (nextLabel ?? "").length > 16 ? "Continue" : nextLabel}</Btn>
        </div>
      )}
    </>
  );
}

const Wait = () => <><Nav /><Loading /></>;

export function BookService() {
  const cat = useCatalog();
  const [d, up] = useDraft();
  const nav = useNavigate();
  if (!cat) return <Wait />;
  const { svc, fixed } = priced(cat, d);
  const steps = stepsFor(fixed, d.packageId);
  const pick = (slug: string) => {
    const s = cat.services.find((x) => x.slug === slug);
    if (!s) return;
    if (isQuoteOnly(cat, s)) { nav(`/quote?service=${encodeURIComponent(s.name)}`); return; }
    const same = svc?.slug === slug;
    up({ serviceSlug: slug, ...(same ? {} : { packageId: undefined, start: undefined, date: undefined, extras: [], extraHours: 0 }) });
  };
  const cats = [...cat.categories].sort((a, b) => a.sort - b.sort);
  return (
    <Shell at="service" title="What are you making?" sub="Pick the closest match. You choose the package next." cat={cat} d={d} aside={false} next={() => nav(nextPath(steps, "service"))} nextLabel={nextLabelFor(steps[1]?.key)} nextDisabled={!svc} stickyNote={svc?.name ?? "Pick what you are making"}>
      {cats.map((c) => {
        const list = cat.services.filter((s) => s.category === c.slug);
        if (!list.length || !cat.packages.some((p) => p.service_category === c.slug)) return null;
        const premium = c.slug === "exclusive";
        return (
          <div key={c.slug} id={c.slug} className="stack gap12">
            <div className="stack gap4"><span className="mono faint">{c.name}</span>{premium && <span className="small muted">{c.blurb}</span>}</div>
            <div className={`grid svcpick ${premium ? "cols-2 premium" : "cols-4"}`}>
              {list.map((s) => <ServiceCard key={s.id} s={s} on={svc?.slug === s.slug} onClick={() => pick(s.slug)} quote={isQuoteOnly(cat, s)} premium={premium} />)}
            </div>
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
  const blocked = useGuard(cat, d, "package");
  if (!cat || blocked) return <Wait />;
  const { svc, fixed, pkg } = priced(cat, d);
  const steps = stepsFor(fixed, d.packageId);
  const quotes = svc ? cat.packages.filter((p) => p.pricing === "quote" && (p.service_slug ? p.service_slug === svc.slug : p.service_category === svc.category)) : [];
  const choose = (id: string) => { const changed = id !== d.packageId; up({ packageId: id, ...(changed ? { start: undefined, extraHours: 0 } : {}) }); };
  return (
    <Shell at="package" title="Pick a package." sub={svc ? `For ${svc.name.toLowerCase()}.` : undefined} cat={cat} d={d} next={() => nav(nextPath(steps, "package"))} nextLabel={nextLabelFor(steps[steps.findIndex((s) => s.key === "package") + 1]?.key)} nextDisabled={!pkg || !d.packageId}>
      <div className="card stack gap12">
        {fixed.map((p) => {
          const deposit = depositOf(cat, p, p.price_kobo);
          const sv = savings(p);
          const facts = [deliveryLabel(p.turnaround_days), revisionLabel(p.revision_limit), p.scheduling === "slot" && p.slot_kind === "night" ? "Saturday night" : ""].filter(Boolean);
          return (
            <button key={p.id} type="button" className={`opt ${d.packageId === p.id ? "on" : ""}`} onClick={() => choose(p.id)} aria-pressed={d.packageId === p.id}>
              <span className="radio" />
              <span className="grow stack gap4"><b>{p.name}</b><span className="small muted">{p.description}</span>
                <span className="row gap8 wrapflex">
                  {needsApproval(cat, p) ? <span className="tag warning">Studio approval</span> : <span className="tag success">Instant booking</span>}
                  <span className="tag">{needsApproval(cat, p) ? (deposit < p.price_kobo ? "Deposit or full after approval" : "Pay after approval") : deposit < p.price_kobo ? `${naira(deposit)} deposit` : "Pay in full"}</span>
                  {facts.map((f) => <span key={f} className="tag">{f}</span>)}
                </span>
              </span>
              <span className="stack optprice">
                {sv && <s className="small faint">{naira(sv.regular)}</s>}
                <b>{naira(p.price_kobo)}</b>
                {p.unit && <span className="mono faint">{p.unit}</span>}
                {sv && <span className="tag success">Save {sv.percent}%</span>}
              </span>
            </button>
          );
        })}
        {quotes.length > 0 && (
          <div className="stack gap12">
            <span className="mono faint">Priced by quote</span>
            {quotes.map((p) => (
              <Link key={p.id} to={`/quote?service=${encodeURIComponent(svc?.name ?? p.name)}`} className="opt">
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
interface CalDay { date: string; status: DayStatus }
interface Tile { key: string; start: number; end?: number; label?: string; available: boolean }

const MONTH_LABEL = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const STATUS_TEXT: Record<DayStatus, string> = { available: "open", limited: "few sessions left", full: "fully booked", closed: "no sessions", past: "passed" };

export function BookTime() {
  const cat = useCatalog();
  const [d, up] = useDraft();
  const nav = useNavigate();
  const [q] = useSearchParams();
  const blocked = useGuard(cat, d, "time");
  const p = cat ? priced(cat, d) : null;
  const pkg = p?.pkg, mode = p?.mode, room = p?.room, duration = p?.duration ?? 0, hourly = p?.hourly ?? 0;
  const today = lagosToday();
  const [month, setMonth] = useState((d.date && d.date >= today ? d.date : today).slice(0, 7));
  const [days, setDays] = useState<CalDay[] | null>(null);
  const [tiles, setTiles] = useState<Tile[] | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [failed, setFailed] = useState(false);
  const tilesRef = useRef<HTMLDivElement>(null);
  const flexQuery = mode === "flex" && room ? `duration=${duration}&room=${room.id}` : "";
  const scope = pkg ? (mode === "flex" ? flexQuery : `package=${pkg.id}`) : "";

  useEffect(() => {
    if (!scope) return;
    let live = true;
    setFailed(false);
    api(`/availability/month?month=${month}&${scope}`).then((r) => live && setDays(r.days)).catch(() => { if (live) { setDays([]); setFailed(true); } });
    return () => { live = false; };
  }, [month, scope]);

  useEffect(() => {
    if (!d.date || !scope) return;
    let live = true;
    setTiles(null);
    api(`/availability/day?date=${d.date}&${scope}`)
      .then((r) => {
        if (!live) return;
        setTiles(r.slots.map((s: any) => ({ key: s.id ?? String(s.start), start: s.start, end: s.end, label: s.label, available: s.available })));
        setUpdated(new Date());
      })
      .catch(() => { if (live) { setTiles([]); setFailed(true); } });
    return () => { live = false; };
  }, [d.date, scope]);

  useEffect(() => {
    if (mode === "day" && tiles?.[0]?.available && d.start !== tiles[0].start) up({ start: tiles[0].start });
  }, [mode, tiles]); // eslint-disable-line

  useEffect(() => {
    if (mode !== "slot" || !days || (d.date && d.date >= today)) return;
    const first = days.find((x) => x.status === "available" || x.status === "limited");
    if (first) up({ date: first.date, start: undefined });
  }, [mode, days]); // eslint-disable-line

  if (!cat || !pkg || !p || blocked) return <Wait />;
  const shift = (n: number) => { const x = new Date(`${month}-01T00:00:00Z`); x.setUTCMonth(x.getUTCMonth() + n); setMonth(x.toISOString().slice(0, 7)); };
  const firstDow = (new Date(`${month}-01T00:00:00Z`).getUTCDay() + 6) % 7;
  const lastMonth = addDays(today, cat.rules.bookAhead).slice(0, 7);
  const sel = days?.find((x) => x.date === d.date);
  const ok = (s?: DayStatus) => s === "available" || s === "limited";
  const nowMin = ((Date.now() + 3600000) % 86400000) / 60000;
  const tooSoon = (t: Tile) => d.date === today && t.start - nowMin < cat.rules.minNotice;
  const nextOpen = d.date ? days?.find((x) => x.date > d.date! && ok(x.status)) : undefined;
  const choose = (date: string) => {
    up({ date, start: undefined });
    if (window.matchMedia("(max-width: 1000px)").matches) setTimeout(() => tilesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };
  const reason = (date: string, status?: DayStatus) => {
    if (status === "full") return mode === "day" ? "The studio is already booked on this day." : "Every session is booked on this day.";
    if (date > addDays(today, cat.rules.bookAhead)) return `Bookings open up to ${cat.rules.bookAhead} days ahead.`;
    if (mode === "slot") {
      const own = cat.sessions.filter((s) => s.active && s.kind === pkg.slot_kind);
      if (own.length && own.every((s) => s.weekday != null)) return `${own[0].label} runs ${sessionDays(own[0]).toLowerCase()}, not on ${weekdayLong(date)}s.`;
    }
    return `No sessions on ${weekdayLong(date)}s.`;
  };
  const night = mode === "slot" && pkg.slot_kind === "night";
  const nightSession = night ? windowsOn(cat.sessions, "night", d.date ?? "")[0] ?? cat.sessions.find((s) => s.active && s.kind === "night") : undefined;
  const title = mode === "day" ? "Pick the day you want to start." : mode === "flex" ? "Pick a date and start time." : "Pick a date and session.";
  const sub = mode === "flex" ? `Live availability for ${room?.name}. Times are in Lagos time (WAT).` : "Live availability. Times are in Lagos time (WAT).";
  return (
    <Shell at="time" title={title} sub={sub} cat={cat} d={d} next={() => nav(nextPath(stepsFor(p.fixed, d.packageId), "time"))} nextLabel="Continue to details" nextDisabled={!d.date || d.start == null || !p.win}>
      {q.get("taken") && <div className="error">Someone took that time a moment ago. Please pick another.</div>}
      {failed && <div className="error">We could not load availability. Check your connection and try another date.</div>}
      <div className="grid timegrid" data-stack>
        <div className="card stack gap12">
          <div className="row between">
            <h3 className="h3" style={{ fontSize: 20 }}>{MONTH_LABEL(month)}</h3>
            <div className="row gap8"><Tactile variant="light" size="sm" onClick={() => shift(-1)} disabled={month <= today.slice(0, 7)} aria-label="Previous month">‹</Tactile><Tactile variant="light" size="sm" onClick={() => shift(1)} disabled={month >= lastMonth} aria-label="Next month">›</Tactile></div>
          </div>
          <div className="cal" aria-busy={!days}>
            {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((w) => <div key={w} className="wd">{w}</div>)}
            {Array.from({ length: firstDow }, (_, i) => <div key={`b${i}`} className="day blank" />)}
            {(days ?? []).map((x) => (
              <button key={x.date} type="button" disabled={x.status === "past"} className={`day ${x.status} ${d.date === x.date ? "on" : ""}`} onClick={() => choose(x.date)} aria-pressed={d.date === x.date} aria-label={`${longDate(x.date)}, ${STATUS_TEXT[x.status]}`}><span>{+x.date.slice(8)}</span><i /></button>
            ))}
          </div>
          <div className="row gap16 wrapflex caption">
            <span className="row gap4"><i className="key" style={{ background: "var(--success)" }} />Open</span>
            {mode === "slot" && <span className="row gap4"><i className="key" style={{ background: "var(--coral)" }} />Few left</span>}
            <span>Crossed out: fully booked{mode === "slot" ? ". Boxed: no sessions that day." : "."}</span>
          </div>
        </div>
        <div className="card stack gap16" ref={tilesRef} style={{ scrollMarginTop: 96 }}>
          <div><h3 className="h3" style={{ fontSize: 20 }}>{d.date ? longDate(d.date).replace(/ \d{4}$/, "") : "Pick a day"}</h3></div>
          {mode === "flex" && (
            <div className="field">
              <label>Duration</label>
              <div className="seg">{[0, 1, 2].map((x) => <button key={x} type="button" className={d.extraHours === x ? "on" : ""} onClick={() => up({ extraHours: x, start: undefined })}>{hrs(pkg.duration_min + x * 60)}</button>)}</div>
              <span className="hint">Extra time in {room?.name} is {naira(hourly)} per hour.</span>
            </div>
          )}
          {!d.date ? <span className="small muted">Choose a day to see {mode === "day" ? "if it is free" : "the open sessions"}.</span>
            : !tiles || !days ? <span className="small muted">Checking…</span>
            : !ok(sel?.status) && mode !== "flex" ? (
              <div className="stack gap12">
                <div className="panel small" role="status"><b>{sel?.status === "full" ? "Fully booked" : "Not available"}</b><div className="muted">{reason(d.date, sel?.status)}</div></div>
                {nextOpen ? <div><Tactile variant="light" size="md" onClick={() => choose(nextOpen.date)}>Next open day: {shortDate(nextOpen.date)}</Tactile></div>
                  : month < lastMonth && <div><Tactile variant="light" size="md" onClick={() => shift(1)}>See {MONTH_LABEL(addDays(`${month}-01`, 32).slice(0, 7))}</Tactile></div>}
              </div>
            ) : mode === "day" ? (
              tiles[0]?.available
                ? <div className="stack gap12"><div className="panel small" role="status"><b>The studio is free on {shortDate(d.date)}.</b><div className="muted">Your request starts that day.</div></div></div>
                : <div className="panel small" role="status"><b>Not available</b><div className="muted">That day cannot start a new request. Pick another.</div></div>
            ) : tiles.length === 0 ? <span className="small muted">{mode === "flex" ? "No times fit this duration." : "No sessions on this day."}</span>
            : mode === "flex" ? (
              <div className="field"><label>Start time</label><div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 8 }}>{tiles.map((s) => <button key={s.key} type="button" className={`slot ${d.start === s.start ? "on" : ""}`} disabled={!s.available} onClick={() => up({ start: s.start })}>{t12(s.start)}</button>)}</div></div>
            ) : (
              <div className="stack gap8" role="group" aria-label="Sessions">
                {tiles.map((s) => {
                  const soon = tooSoon(s), open = s.available && !soon;
                  return (
                    <button key={s.key} type="button" className={`sesstile ${d.start === s.start ? "on" : ""}`} disabled={!open} aria-pressed={d.start === s.start} onClick={() => up({ start: s.start })}>
                      <span className="grow stack"><b>{windowLabel(d.date!, s.start, s.end ?? s.start)}</b><span className="small muted">{s.label}</span></span>
                      <span className={`tag ${open ? "success" : ""}`}>{open ? "Open" : soon ? "Too soon" : "Booked"}</span>
                    </button>
                  );
                })}
              </div>
            )}
          {night && nightSession && <div className="panel small">{nightSession.label} runs {sessionDays(nightSession).toLowerCase()} and ends the next morning, so your session finishes on Sunday at {t12(nightSession.end_min)}.</div>}
          {mode === "day" && <div className="panel small muted">The studio confirms the full schedule and accommodation after approving your request.</div>}
          {updated && mode !== "day" && <span className="caption">Updated {updated.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}{mode === "flex" ? ` · ${cat.rules.buffer} min changeover included` : ""}</span>}
        </div>
      </div>
    </Shell>
  );
}

const weekdayLong = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });

function ExtrasPanel({ cat, d, up }: { cat: Catalog; d: BookingDraft; up: (p: Partial<BookingDraft>) => void }) {
  const { svc } = priced(cat, d);
  const list = extrasFor(cat, svc);
  if (!list.length) return null;
  return (
    <div className="card stack gap12">
      <h3 className="h4">Add-ons</h3>
      {list.map((e) => (
        <label key={e.slug} className="row gap12 small addon">
          <input type="checkbox" checked={d.extras.includes(e.slug)} onChange={(ev) => up({ extras: ev.target.checked ? [...d.extras, e.slug] : d.extras.filter((x) => x !== e.slug) })} />
          <span className="grow stack"><b>{e.name}</b>{e.description && <span className="caption">{e.description}</span>}</span>
          <span className="muted nowrap">{e.pricing === "quote" ? "Price on request" : `+${naira(e.price_kobo)}`}</span>
        </label>
      ))}
      {list.some((e) => e.pricing === "quote") && <span className="caption">Add-ons priced on request are quoted by the studio separately. They are never added to your total.</span>}
    </div>
  );
}

export function BookDetails() {
  const cat = useCatalog();
  const [d, up] = useDraft();
  const nav = useNavigate();
  const { user } = useAuth();
  const blocked = useGuard(cat, d, "details");
  useEffect(() => { if (user && !d.contactName) up({ contactName: user.name, contactEmail: user.email, contactPhone: user.phone }); }, [user]); // eslint-disable-line
  if (!cat || blocked) return <Wait />;
  const { room, mode } = priced(cat, d);
  const max = room?.capacity || cat.rules.maxPeople;
  const remote = mode === "project";
  const valid = d.contactName && /\S+@\S+\.\S+/.test(d.contactEmail) && d.contactPhone && d.artistName && (remote || (d.people >= 1 && d.people <= max));
  const people = (
    <div className="field"><label>{mode === "day" ? "People staying with us (including you)" : "Number of people"}</label>
      <div className="row stepper">
        <button type="button" className="link" onClick={() => up({ people: Math.max(1, d.people - 1) })} aria-label="Fewer people">−</button>
        <b>{d.people}</b>
        <button type="button" className="link" onClick={() => up({ people: Math.min(max, d.people + 1) })} aria-label="More people">+</button>
      </div>
      <span className="hint">{room?.name ?? "The room"} takes up to {max}, including you.</span>
    </div>
  );
  const title = remote ? "Tell us about your order." : mode === "day" ? "Tell us about your project." : "Tell us about the session.";
  return (
    <Shell at="details" title={title} sub="No account needed yet. You log in or sign up at checkout and keep everything you enter here." cat={cat} d={d} next={() => nav("/book/review")} nextLabel="Review" nextDisabled={!valid}>
      <div className="card stack gap16">
        <h3 className="h4">Contact details</h3>
        <Field label="Full name" name="contactName" value={d.contactName} onChange={(e) => up({ contactName: e.target.value })} autoComplete="name" />
        <div className="grid cols-2" style={{ gap: 16 }}>
          <Field label="Email" name="contactEmail" type="email" value={d.contactEmail} onChange={(e) => up({ contactEmail: e.target.value })} autoComplete="email" />
          <Field label="Phone number" name="contactPhone" type="tel" value={d.contactPhone} onChange={(e) => up({ contactPhone: e.target.value })} autoComplete="tel" />
        </div>
      </div>
      <div className="card stack gap16">
        <h3 className="h4">{remote ? "Your order" : mode === "day" ? "Your project" : "Session"}</h3>
        {remote ? <>
          <Field label="Artist or brand name" name="artistName" value={d.artistName} onChange={(e) => up({ artistName: e.target.value })} />
          <Field label="Song title or titles (optional)" name="project" value={d.project} onChange={(e) => up({ project: e.target.value })} />
          <Area label="Notes (optional)" name="notes" rows={3} value={d.notes} onChange={(e) => up({ notes: e.target.value })} placeholder="Style, tempo, references, or anything we should know." />
          <Field label="Reference links (optional)" name="links" value={d.links} onChange={(e) => up({ links: e.target.value })} placeholder="YouTube, Spotify or Drive links" />
          <div className="panel small row gap12" style={{ alignItems: "flex-start" }}><Icon name="upload" size={18} /><span>Right after you pay, upload your stems or references from your portal. Finished work comes back to the same place.</span></div>
        </> : <>
          <div className="grid cols-2" style={{ gap: 16 }}>
            <Field label="Artist, brand or project name" name="artistName" value={d.artistName} onChange={(e) => up({ artistName: e.target.value })} />
            {people}
          </div>
          <Area label="Project description" name="project" rows={3} value={d.project} onChange={(e) => up({ project: e.target.value })} placeholder={mode === "day" ? "What are you making? Style, songs you have ready, how long you want to stay." : "What are you working on? A single, an EP, a verse…"} />
          <Area label="Special requirements" name="notes" rows={2} value={d.notes} onChange={(e) => up({ notes: e.target.value })} placeholder="Bringing your own producer, gear you need, accessibility needs…" />
          <Field label="Reference links (optional)" name="links" value={d.links} onChange={(e) => up({ links: e.target.value })} placeholder="YouTube, Spotify, Instagram or Drive links" />
        </>}
      </div>
      <ExtrasPanel cat={cat} d={d} up={up} />
    </Shell>
  );
}

export function PriceTable({ cat, d }: { cat: Catalog; d: BookingDraft }) {
  const { pkg, extras, extraHours, hourly, total } = priced(cat, d);
  if (!pkg) return null;
  const sv = savings(pkg);
  const facts = [deliveryLabel(pkg.turnaround_days), revisionLabel(pkg.revision_limit)].filter(Boolean);
  return (
    <div className="panel stack gap8" style={{ padding: 18 }}>
      <b>Price details</b>
      <div className="row between small gap12"><span className="stack"><span>{pkg.name}</span>{pkg.unit && <span className="caption">{pkg.unit}</span>}</span><span className="row gap8">{sv && <s className="faint">{naira(sv.regular)}</s>}<span>{naira(pkg.price_kobo)}</span></span></div>
      {sv && <div className="row between small" style={{ color: "var(--success)" }}><span>You save</span><b>{naira(sv.kobo)} ({sv.percent}%)</b></div>}
      {extraHours > 0 && <div className="row between small"><span>Extra time ({extraHours} hr at {naira(hourly)})</span><span>{naira(extraHours * hourly)}</span></div>}
      {extras.map((e) => <div key={e.slug} className="row between small gap12"><span>{e.name}</span><span className="nowrap">{e.pricing === "quote" ? "Price on request" : naira(e.price_kobo)}</span></div>)}
      {extras.some((e) => e.pricing === "quote") && <span className="caption">Price on request, the studio quotes it after you send the request. It is not part of this total.</span>}
      <div className="divider" />
      <div className="row between"><b>Total</b><b style={{ fontSize: 20 }}>{naira(total)}</b></div>
      {facts.length > 0 && <div className="row gap8 wrapflex">{facts.map((f) => <span key={f} className="metachip">{f}</span>)}</div>}
    </div>
  );
}

export function BookReview() {
  const cat = useCatalog();
  const [d, up] = useDraft();
  const nav = useNavigate();
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const blocked = useGuard(cat, d, "checkout");
  if (!cat || blocked) return <Wait />;
  const { svc, pkg, mode, room, win, total, deposit, approval } = priced(cat, d);
  const remote = mode === "project";
  const go = async () => {
    setBusy(true); setError(null);
    try {
      if (d.holdId) await api(`/holds/${d.holdId}`, { method: "DELETE" }).catch(() => {});
      const r = await api("/holds", { body: draftBody(cat, d) });
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
      <Link to={to} className="small editlink">Edit</Link>
    </div>
  );
  const facts = [deliveryLabel(pkg?.turnaround_days ?? null), revisionLabel(pkg?.revision_limit ?? 0)].filter(Boolean).join(" · ");
  const hasExtras = extrasFor(cat, svc).length > 0;
  return (
    <Shell at="checkout" title={remote ? "Review your order." : approval ? "Review your request." : "Review your booking."} sub={remote ? "Check the details and price." : "Check the details and price. We hold your slot while you check out."} cat={cat} d={d} back="/book/details"
      next={go} nextLabel={approval ? "Continue to send request" : "Continue to checkout"} nextDisabled={!agree} busy={busy}>
      <div className="card" style={{ padding: 0 }}>
        <div style={{ marginTop: -1 }}>{row("Package", `${svc?.name}${pkg && pkg.name !== svc?.name ? ` · ${pkg.name}` : ""}`, remote ? [pkg?.unit, facts].filter(Boolean).join(" · ") : `${room?.name ?? ""}${room ? " · crew included" : ""}`, stepsFor(priced(cat, d).fixed, d.packageId).some((s) => s.key === "package") ? "/book/package" : "/book")}</div>
        {remote
          ? row("Delivery", "In your portal", "Finished work arrives in your portal, never by email.", "/book/details")
          : row(mode === "day" ? "Start day" : "Date and time", d.date ? longDate(d.date) : "", mode === "day" ? "The studio confirms the full schedule and accommodation after approving." : win && d.date ? `${windowLabel(d.date, win.start, win.end)}${win.label ? ` · ${win.label}` : ""}` : "", "/book/time")}
        {row("Your details", d.contactName, `${d.contactEmail} · ${d.contactPhone}`, "/book/details")}
        {row(remote ? "Order" : mode === "day" ? "Project" : "Session", remote ? d.artistName : `${d.artistName} · ${d.people} ${d.people === 1 ? "person" : "people"}`, [d.project, d.notes].filter(Boolean).join(" · ") || "No project notes", "/book/details")}
      </div>
      <div className="card stack gap12">
        {hasExtras && <div className="row between small gap12"><span className="muted">Add-ons are chosen on the details step.</span><Link to="/book/details" className="small editlink">Change</Link></div>}
        <PriceTable cat={cat} d={d} />
      </div>
      {approval ? (
        <div className="notice row gap12" style={{ alignItems: "flex-start" }}><Icon name="shield" /><div><b>This package needs studio approval.</b><div className="small">You send a request now and pay nothing yet. The studio replies within 24 hours, then you have {cat.rules.paymentWindowHours} hours to pay {deposit < total ? `the ${naira(deposit)} deposit or the full amount` : "the full amount"} to confirm.</div></div></div>
      ) : (
        <div className="card stack gap12">
          <b className="small">{deposit < total ? "How would you like to pay?" : "Payment"}</b>
          {deposit < total ? <>
            {(["deposit", "full"] as const).map((plan) => (
              <button key={plan} type="button" className={`opt ${d.plan === plan ? "on" : ""}`} onClick={() => up({ plan })}>
                <span className="radio" />
                <span className="grow stack"><b>{plan === "deposit" ? `Pay a deposit of ${naira(deposit)}` : `Pay in full, ${naira(total)}`}</b><span className="small muted">{plan === "deposit" ? `The balance of ${naira(total - deposit)} is due ${remote ? "before your finished files are released" : "before your session"}. Pay it online from your account or at the studio.` : "Nothing more to pay later."}</span></span>
              </button>
            ))}
          </> : <span className="small muted">This package is paid in full when you {remote ? "order" : "book"}: {naira(total)}.</span>}
        </div>
      )}
      {remote && <div className="panel small row gap12" style={{ alignItems: "flex-start" }}><Icon name="upload" size={18} /><span>After you pay, upload your stems or references from your portal. Finished work arrives there too.</span></div>}
      <label className="row gap12 small agree" style={{ cursor: "pointer" }}>
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <span>I agree to the <Link to="/packages#policies" target="_blank" style={{ textDecoration: "underline" }}>booking policies</Link> and <Link to="/terms" target="_blank" style={{ textDecoration: "underline" }}>terms</Link>, including payments, cancellation, revisions and refunds.</span>
      </label>
      <ErrorBox error={error} />
    </Shell>
  );
}
