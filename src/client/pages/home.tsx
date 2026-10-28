import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { Link } from "react-router-dom";
import { PublicLayout } from "../components/Layout";
import { Icon, Mark } from "../components/brand";
import { Badge } from "../components/pill";
import { Tactile, TactileLink, type TactileVariant } from "../components/kitchen";
import { Split, wordCount } from "../components/Split";
import { PhoneDemo, type DemoData } from "../components/PhoneDemo";
import { Swirl } from "../components/Swirl";
import { Intro, introPending } from "../components/Intro";
import { CardArt, Eq, LineArt, Pixels, Sticker } from "../components/art";
import { HERO_PHOTO, depositOf, needsApproval, roomOf, useCatalog, useContent, type Catalog, type Package, type Service, type Site } from "../lib/catalog";
import { addDays, initials, lagosToday, naira, shortDate, t12 } from "../lib/format";
import { featuredPackages, fixedPackages, revisionLabel, deliveryLabel, savings, windowLabel, windowsOn } from "../lib/booking";
import { api } from "../lib/api";
import { clamp, prefersStill, useInView, useReveal, useScrollFrame } from "../lib/motion";
import { useStartBooking } from "./public";
import { WorkCard } from "./portfolio";

interface OpenDay { date: string; slots: { id: string; label: string; start: number; end: number; available: boolean }[] }

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const demoPackage = (cat: Catalog | null) => cat?.packages.find((p) => p.scheduling === "slot" && p.slot_kind === "day" && p.pricing === "fixed" && p.active);

function useOpenDay(cat: Catalog | null) {
  const [day, setDay] = useState<OpenDay | null>(null);
  const pkg = demoPackage(cat)?.id ?? (cat ? "" : null);
  useEffect(() => {
    if (!pkg) return;
    let live = true;
    (async () => {
      for (let i = 1; i <= 14 && live; i++) {
        const date = addDays(lagosToday(), i);
        const r = await api<{ slots: OpenDay["slots"] }>(`/availability/day?date=${date}&package=${pkg}`).catch(() => null);
        const slots = r?.slots ?? [];
        if (slots.some((s) => s.available)) { if (live) setDay({ date, slots }); return; }
      }
    })();
    return () => { live = false; };
  }, [pkg]);
  return day;
}

const bookableServices = (cat: Catalog) => [...cat.categories].sort((a, b) => a.sort - b.sort).flatMap((c) => cat.services.filter((x) => x.category === c.slug && fixedPackages(cat, x).length > 0));

function demoData(cat: Catalog | null, day: OpenDay | null): DemoData {
  const pkg = demoPackage(cat);
  const svc = cat?.services.find((s) => pkg && (pkg.service_slug ? s.slug === pkg.service_slug : s.category === pkg.service_category));
  const price = pkg?.price_kobo ?? 0;
  const deposit = cat && pkg ? depositOf(cat, pkg, price) : price;
  const date = day?.date ?? addDays(lagosToday(), 2);
  const wins = day?.slots ?? (cat ? windowsOn(cat.sessions, "day", date).map((s) => ({ id: s.id, label: s.label, start: s.start_min, end: s.end_min, available: true })) : []);
  const slotIndex = Math.max(0, wins.findIndex((w) => w.available));
  const days = [-1, 0, 1, 2, 3].map((n) => { const d = addDays(date, n), w = new Date(`${d}T00:00:00Z`).getUTCDay(); return { wd: WEEKDAY[w], d: String(Number(d.slice(8))) }; });
  const yymm = lagosToday().slice(2, 4) + lagosToday().slice(5, 7);
  const tiles = cat ? bookableServices(cat).slice(0, 4).map((x) => x.name) : [];
  return {
    service: svc?.name ?? "Recording", pkg: pkg?.name ?? "Recording session", room: (cat && roomOf(cat, pkg)?.name) ?? "Studio A",
    price: naira(price), deposit: deposit < price ? naira(deposit) : null, balance: naira(price - deposit), tiles: [...tiles, "", "", "", ""].slice(0, 4),
    day: shortDate(date).replace(",", ""), days, dayIndex: 1,
    slots: wins.map((w) => ({ label: windowLabel(date, w.start, w.end), booked: !w.available })), slotIndex, time: wins[slotIndex] ? t12(wins[slotIndex].start) : "", reference: `PR-${yymm}-0042`,
  };
}

/** Turns the page white at the very top and follows each section's tone below it. */
function useTone() {
  useScrollFrame(() => {
    const mid = window.innerHeight * 0.5;
    let tone = window.scrollY < 24 ? "light" : "dark";
    if (tone === "dark") {
      for (const s of document.querySelectorAll<HTMLElement>(".landing [data-tone]")) {
        const r = s.getBoundingClientRect();
        if (r.top <= mid && r.bottom > mid) { tone = s.dataset.tone ?? "dark"; break; }
      }
    }
    if (document.body.dataset.tone !== tone) document.body.dataset.tone = tone;
  });
  useEffect(() => () => { delete document.body.dataset.tone; }, []);
}

function Heading({ lead, accent, from = 0 }: { lead: string; accent: string; from?: number }) {
  const n = wordCount(lead);
  return <><Split text={lead} from={from} /> <span className="neon"><Split text={accent} from={from + n} /></span></>;
}

function Hero({ title, accent, sub, badge, demo, play }: { title: string; accent: string; sub: string; badge: { text: string; to?: string }; demo: DemoData; play: boolean }) {
  const words = accent.trim().split(/\s+/);
  const last = words.pop() ?? "";
  const lead = words.join(" ");
  const n = wordCount(title);
  const pill = <Badge>{badge.text}{badge.to && <Icon name="arrow" size={14} />}</Badge>;
  return (
    <section className={`hero2 ${play ? "in" : ""}`} data-tone="dark">
      <div className="hcard">
        <div className="hcopy">
          {badge.to ? <Link to={badge.to} className="hbadge">{pill}</Link> : <span className="hbadge">{pill}</span>}
          <h1 className="htitle"><Split text={title} /> <br /><Heading lead={lead} accent={last} from={n} /></h1>
          <p className="hsub">{sub}</p>
          <div className="hcta"><TactileLink to="/services" variant="light" size="lg">Explore our services</TactileLink><TactileLink to="/book" variant="neon" size="lg">Book a session <Icon name="northeast" size={16} /></TactileLink></div>
        </div>
        <div className="hstage">
          <Swirl className="hswirl" />
          <PhoneDemo data={demo} className="hphone" />
        </div>
      </div>
    </section>
  );
}

function Ribbon({ items }: { items: string[] }) {
  return (
    <section className="ribbon" data-tone="dark" aria-label="What we make">
      <div className="rbar" />
      <div className="rtrack"><div className="rrow">{[...items, ...items].map((t, i) => <span key={i} aria-hidden={i >= items.length}><Mark tone="white" size={30} lazy />{t}</span>)}</div></div>
    </section>
  );
}

function Values({ rooms, daily }: { rooms: number; daily: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const cards = [
    { art: "streaks", line: "crew", title: "Crew included", body: "Recording sessions come with an engineer at the desk who knows the room." },
    { art: "glitch", line: "live", title: "Fixed session times", body: "Select one of the four available options for a two-hour session.", light: true },
    { art: "spectrum", line: "deposit", title: "Delivered in your portal", body: "Beats, mixes and finished tracks arrive in your portal, never by email." },
    { art: "chrome", line: "rooms", title: `${rooms} rooms, one crew`, body: "A recording room, a production suite, a podcast set and a video and photo stage." },
  ];
  useEffect(() => {
    const row = ref.current;
    if (!row || prefersStill()) return;
    const cards = Array.from(row.children) as HTMLElement[];
    const now = cards.map(() => 0);
    let raf = 0, last = 0;
    const goal = () => {
      const top = row.getBoundingClientRect().top, vh = window.innerHeight;
      const cols = Math.max(1, Math.round(row.clientWidth / Math.max(1, cards[0].offsetWidth)));
      return cards.map((c, i) => clamp((vh - top - c.offsetTop) / (vh * 0.55) - (i % cols) * 0.14));
    };
    const paint = () => cards.forEach((c, i) => {
      const p = now[i], e = Math.pow(1 - p, 3);
      c.style.translate = `0 ${(e * 300).toFixed(1)}px`;
      c.style.rotate = `${(e * (i % 2 ? -4 : 4)).toFixed(2)}deg`;
      c.style.opacity = String(clamp(p * 2.5));
    });
    const tick = (t: number) => {
      const k = 1 - Math.pow(0.93, Math.min(64, t - (last || t)) / 16.7);
      last = t;
      const g = goal();
      let moving = false;
      now.forEach((v, i) => { const d = g[i] - v; if (Math.abs(d) < 0.0005) now[i] = g[i]; else { now[i] = v + d * k; moving = true; } });
      paint();
      raf = moving ? requestAnimationFrame(tick) : 0;
      if (!moving) last = 0;
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
    paint();
    kick();
    window.addEventListener("scroll", kick, { passive: true });
    window.addEventListener("resize", kick);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("scroll", kick); window.removeEventListener("resize", kick); };
  }, []);
  return (
    <section className="lsec values" id="about" data-tone="dark" data-nav="about">
      <div className="wrap lhead">
        <Badge>Why Psych Studios</Badge>
        <h2 className="ltitle" data-split><Heading lead="Less admin, more" accent="music." /></h2>
        <p className="lsub" data-reveal>Everything around the session is handled, so your time in the room goes into the work.</p>
      </div>
      <div className="wrap"><div className="vcards" ref={ref}>
        {cards.map((c) => (
          <article key={c.art} className={`vcard ${c.light ? "light" : ""}`}>
            <CardArt kind={c.art} />
            <div className="vbody"><LineArt kind={c.line} /><h3>{c.title}</h3><p>{c.body}</p></div>
          </article>
        ))}
      </div>
      <div className="lmore" data-reveal><TactileLink to="/about" variant="light" size="lg">Learn more <Icon name="northeast" size={16} /></TactileLink></div></div>
    </section>
  );
}

const STEPS: [string, string, string][] = [
  ["mic", "Pick what you’re making", "Recording, beats, mixing and mastering, full production, or an EP or album."],
  ["calendar", "Choose a session", "Pick one of the open session times. It is held for you while you check out. Remote orders skip the calendar."],
  ["card", "Pay securely", "Card, bank transfer or USSD through Paystack. The booking confirms the moment the payment is verified."],
  ["receipt", "Walk in or collect online", "Your ticket and receipt land in your inbox. Remote orders are delivered in your portal."],
];

function Steps({ demo, photo }: { demo: DemoData; photo: string }) {
  const [active, setActive] = useState(0);
  const [hold, setHold] = useState(false);
  const [boxRef, inView] = useInView<HTMLElement>(0.3);
  useEffect(() => {
    if (!inView || hold || prefersStill()) return;
    const t = window.setTimeout(() => setActive((a) => (a + 1) % STEPS.length), 3200);
    return () => window.clearTimeout(t);
  }, [inView, hold, active]);
  const pick = (i: number) => { setHold(true); setActive(i); };
  return (
    <section className="lsec howto" data-tone="dark" data-nav="about" ref={boxRef}>
      <div className="wrap sgrid">
        <div className="sleft">
          <Badge>How it works</Badge>
          <h2 className="ltitle" data-split><Heading lead="Booked in" accent="two minutes." /></h2>
          <p className="lsub" data-reveal>From your phone to the room in four steps. No calls, no back and forth.</p>
          <div className="lbtns" data-reveal><TactileLink to="/book" variant="neon" size="lg">Book a session <Icon name="northeast" size={16} /></TactileLink><TactileLink to="/faq" variant="light" size="lg">Learn more <Icon name="northeast" size={16} /></TactileLink></div>
          <div className="svis">
            <Pixels src={photo} />
            <PhoneDemo data={demo} screen={active} className="sphone" />
          </div>
        </div>
        <ol className="slist" style={{ "--p": active / (STEPS.length - 1) } as CSSProperties} onMouseLeave={() => setHold(false)}>
          {STEPS.map(([icon, title, body], i) => (
            <li key={title} className={i === active ? "on" : ""} data-reveal style={{ "--rd": `${i * 90}ms` } as CSSProperties}>
              <button type="button" aria-pressed={i === active} onMouseEnter={() => pick(i)} onFocus={() => pick(i)} onClick={() => pick(i)}>
                <span className="stile"><Icon name={icon} size={30} /></span>
                <span className="stext"><b>{title}</b><span className="sbody">{body}</span></span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Showcase({ cat }: { cat: Catalog }) {
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const moved = useRef(false);
  const settle = useRef(0);
  const [boxRef, inView] = useInView<HTMLElement>(0.35);
  const chosen = bookableServices(cat).slice(0, 8);
  const services: Service[] = chosen.length >= 4 ? chosen : cat.services.slice(0, 8);
  const n = services.length;
  const [active, setActive] = useState(n);
  const [held, setHeld] = useState(false);
  const left = (i: number) => {
    const t = track.current!, c = t.children[i] as HTMLElement;
    return c.offsetLeft - (t.clientWidth - c.offsetWidth) / 2;
  };
  const go = useCallback((i: number, smooth = true) => {
    const t = track.current;
    if (t?.children[i]) t.scrollTo({ left: left(i), behavior: smooth && !prefersStill() ? "smooth" : "auto" });
  }, []);
  const nearest = () => {
    const t = track.current!, mid = t.scrollLeft + t.clientWidth / 2;
    let best = 0, dist = Infinity;
    Array.from(t.children).forEach((el, i) => { const c = el as HTMLElement, d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid); if (d < dist) { dist = d; best = i; } });
    return best;
  };
  const recenter = () => {
    const t = track.current;
    if (!t || drag.current) return;
    const i = nearest();
    if (i >= n && i < 2 * n) return;
    const shift = i < n ? n : -n, stride = (t.children[1] as HTMLElement).offsetLeft - (t.children[0] as HTMLElement).offsetLeft;
    t.scrollLeft += shift * stride;
    setActive(i + shift);
  };
  useLayoutEffect(() => { go(n, false); }, [n, go]);
  useEffect(() => {
    if (!inView || held || prefersStill()) return;
    const t = window.setTimeout(() => go(active + 1), 3400);
    return () => window.clearTimeout(t);
  }, [inView, held, active, go]);
  useEffect(() => () => window.clearTimeout(settle.current), []);
  const onScroll = () => {
    setActive(nearest());
    window.clearTimeout(settle.current);
    settle.current = window.setTimeout(recenter, 160);
  };
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    setHeld(true);
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    drag.current = { x: e.clientX, left: track.current!.scrollLeft, moved: false };
    track.current!.classList.add("dragging");
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.abs(e.clientX - d.x) > 5) { d.moved = true; track.current!.setPointerCapture(e.pointerId); }
    if (d.moved) track.current!.scrollLeft = d.left - (e.clientX - d.x);
  };
  const up = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    moved.current = d.moved;
    track.current!.classList.remove("dragging");
    if (d.moved) go(nearest());
  };
  const step = (d: number) => { setHeld(true); go(active + d); };
  return (
    <section className="lsec showcase" id="services" data-tone="dark" data-nav="services" ref={boxRef}>
      <div className="wrap lhead center">
        <Badge>What we do</Badge>
        <h2 className="ltitle" data-split><Split text="Made for every kind" /><br /><Heading lead="of" accent="project." from={4} /></h2>
        <p className="lsub" data-reveal>Recording, beats, mixing and mastering, full production, and premium EP and album offers.</p>
      </div>
      <div className="ctrack" ref={track} onScroll={onScroll} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        onClickCapture={(e) => { if (moved.current) { e.preventDefault(); e.stopPropagation(); moved.current = false; } }} onDragStart={(e) => e.preventDefault()}>
        {[0, 1, 2].flatMap((copy) => services.map((s, i) => {
          const k = copy * n + i, real = copy === 1;
          return (
            <article key={`${copy}-${s.id}`} className={`ccard ${k === active ? "on" : ""}`} aria-hidden={!real || undefined}>
              <Link to={`/services/${s.slug}`} className="cimg" aria-label={s.name} tabIndex={real ? undefined : -1} draggable={false}><span style={{ backgroundImage: `url(${s.image_url})` }} /></Link>
              <div className="cbody"><h3><Link to={`/services/${s.slug}`} tabIndex={real ? undefined : -1} draggable={false}>{s.name}</Link></h3><p>{s.description}</p><span className="ctag">{s.price_label}</span></div>
            </article>
          );
        }))}
      </div>
      <div className="cnav"><Tactile variant="ink" size="md" onClick={() => step(-1)} aria-label="Previous service"><Icon name="arrow" size={16} className="flip" />Prev</Tactile><TactileLink to="/services" variant="light" size="md">Learn more <Icon name="northeast" size={16} /></TactileLink><Tactile variant="ink" size="md" onClick={() => step(1)} aria-label="Next service">Next<Icon name="arrow" size={16} /></Tactile></div>
    </section>
  );
}

function Rooms({ cat }: { cat: Catalog }) {
  const rooms = cat.rooms.slice(0, 4);
  return (
    <section className="lsec rooms2" id="studio" data-tone="light" data-nav="studio">
      <div className="wrap lhead center">
        <Badge>Studio and facilities</Badge>
        <h2 className="ltitle" data-split><Split text="Rooms built for" /><br /><Heading lead="sound and" accent="picture." from={3} /></h2>
        <p className="lsub" data-reveal>Treated rooms, proper monitoring, cameras and lights, and the people who run them.</p>
      </div>
      <div className="wrap">
        <div className={`bento ${rooms.length === 4 ? "four" : ""}`}>
          {rooms.map((r, i) => (
            <Link key={r.id} to={`/studio#${r.slug}`} className={`bcard b${i}`} data-reveal style={{ transitionDelay: `${i * 90}ms` }}>
              <span className="bimg" style={{ backgroundImage: `url(${r.image_url})` }} />
              <b>{r.name}</b>
              <span className="bmeta">{r.kind} · up to {r.capacity} people</span>
            </Link>
          ))}
        </div>
        <div className="lmore" data-reveal><TactileLink to="/studio" variant="light" size="lg">Learn more <Icon name="northeast" size={16} /></TactileLink></div>
      </div>
    </section>
  );
}

function Voices({ items }: { items: Site["testimonials"] }) {
  const [order, setOrder] = useState(() => items.map((_, i) => i));
  const [fly, setFly] = useState(0);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef(0);
  const next = (dir: number) => {
    if (fly) return;
    if (prefersStill()) { setOrder((o) => [...o.slice(1), o[0]]); setDx(0); return; }
    setFly(dir || 1);
    window.setTimeout(() => { setOrder((o) => [...o.slice(1), o[0]]); setFly(0); setDx(0); }, 420);
  };
  const down = (e: ReactPointerEvent<HTMLElement>) => {
    if (fly || items.length < 2 || e.button !== 0) return;
    start.current = e.clientX;
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: ReactPointerEvent<HTMLElement>) => { if (dragging) setDx(e.clientX - start.current); };
  const up = () => {
    if (!dragging) return;
    setDragging(false);
    if (Math.abs(dx) > 90) next(Math.sign(dx)); else setDx(0);
  };
  if (!items.length) return null;
  return (
    <section className="lsec voices" data-tone="dark" data-nav="portfolio">
      <div className="wrap lhead center">
        <Badge>What clients say</Badge>
        <h2 className="ltitle" data-split><Heading lead="Trusted by artists and" accent="creators." /></h2>
        <p className="lsub" data-reveal>Singers, producers, podcasters and brands who booked a room and came back.</p>
      </div>
      <div className="deckwrap">
        <div className="deck" data-reveal>
          <Sticker kind="mic" className="vsticker" />
          {order.slice(0, Math.min(4, order.length)).map((idx, k) => {
            const t = items[idx], top = k === 0;
            const style = { "--k": k, ...(top ? { "--dx": `${dx}px`, "--dxn": dx, "--dir": fly } : {}) } as CSSProperties;
            return (
              <figure key={t.id} className={`dcard ${top && fly ? "out" : ""} ${top && dragging ? "held" : ""}`} style={style} aria-hidden={!top}
                onPointerDown={top ? down : undefined} onPointerMove={top ? move : undefined} onPointerUp={top ? up : undefined} onPointerCancel={top ? up : undefined}>
                <span className="dav">{initials(t.name)}</span>
                <span className="dstars">{[0, 1, 2, 3, 4].map((s) => <Icon key={s} name="star" size={20} />)}</span>
                <blockquote>“{t.quote}”</blockquote>
                <figcaption><b>{t.name}</b>{t.role && <span>{t.role}</span>}</figcaption>
              </figure>
            );
          })}
        </div>
        <div className="lbtns dbtns">
          {items.length > 1 && <Tactile variant="ink" size="lg" onClick={() => next(1)}><Icon name="shuffle" size={18} />Drag or tap to shuffle</Tactile>}
          <TactileLink to="/about#reviews" variant="light" size="lg">Learn more <Icon name="northeast" size={16} /></TactileLink>
        </div>
      </div>
    </section>
  );
}

function Work({ site }: { site: Site }) {
  const featured = site.portfolio.filter((w) => w.featured).slice(0, 3);
  if (!featured.length) return null;
  return (
    <section className="lsec work2" id="portfolio" data-tone="dark" data-nav="portfolio">
      <div className="wrap stack gap48">
        <div className="whead">
          <div className="stack gap16"><Badge>Portfolio</Badge><h2 className="ltitle" data-split><Heading lead="Work made" accent="here." /></h2></div>
          <TactileLink to="/portfolio" variant="light" size="lg">Learn more <Icon name="northeast" size={16} /></TactileLink>
        </div>
        <div className="grid cols-3">{featured.map((w, i) => <div key={w.id} data-reveal style={{ transitionDelay: `${i * 90}ms` }}><WorkCard w={w} /></div>)}</div>
      </div>
    </section>
  );
}

function Plans({ cat }: { cat: Catalog }) {
  const start = useStartBooking();
  const featured = featuredPackages(cat);
  const serviceOf = (p: Package) => cat.services.find((s) => (p.service_slug ? s.slug === p.service_slug : s.category === p.service_category));
  const variants: TactileVariant[] = ["neon", "yellow", "coral"];
  return (
    <section className="lsec plans2" id="pricing" data-tone="dark" data-nav="pricing">
      <div className="wrap lhead center">
        <Badge>Packages</Badge>
        <h2 className="ltitle" data-split><Heading lead="Your next project starts" accent="here." /></h2>
        <p className="lsub" data-reveal>Clear prices for every package, locked when you book.</p>
      </div>
      <div className="wrap">
        <div className="pcards" style={{ "--n": Math.max(1, featured.length) } as CSSProperties}>
          {featured.map((p, i) => {
            const deposit = depositOf(cat, p, p.price_kobo), hot = !!p.featured, sv = savings(p), approval = needsApproval(cat, p);
            const meta = [approval ? "Needs studio approval" : deposit < p.price_kobo ? `${naira(deposit)} deposit to book` : "Paid in full when you book", deliveryLabel(p.turnaround_days), revisionLabel(p.revision_limit)].filter(Boolean);
            return (
              <article key={p.id} className={`pcard ${hot ? "hot" : ""}`} data-reveal style={{ transitionDelay: `${i * 90}ms` }}>
                {hot && <span className="ptag">Featured</span>}
                <h3>{p.name}</h3>
                <b className="pprice">{naira(p.price_kobo)}{p.unit && <span className="punit"> {p.unit}</span>}</b>
                {sv && <span className="pmeta"><s>{naira(sv.regular)}</s> · Save {naira(sv.kobo)} ({sv.percent}%)</span>}
                <span className="pmeta">{meta.join(" · ")}</span>
                <ul>{p.includes.map((x) => <li key={x}><Eq />{x}</li>)}</ul>
                <Tactile variant={variants[i % 3]} size="lg" block onClick={() => start({ serviceSlug: serviceOf(p)?.slug, packageId: p.id })}>{approval ? "Request" : "Book"} {p.name}</Tactile>
              </article>
            );
          })}
        </div>
        <div className="lmore" data-reveal><TactileLink to="/packages" variant="light" size="lg">See all pricing <Icon name="northeast" size={16} /></TactileLink></div>
      </div>
    </section>
  );
}

function Faqs({ items }: { items: Site["faqs"] }) {
  const [open, setOpen] = useState<string | null>(items[0]?.id ?? null);
  if (!items.length) return null;
  return (
    <section className="lsec faqs2" id="faqs" data-tone="dark" data-nav="contact">
      <div className="wrap lhead center">
        <Badge>Frequently asked questions</Badge>
        <h2 className="ltitle" data-split><Split text="Got questions?" /><br /><Heading lead="We’ve got" accent="answers." from={2} /></h2>
      </div>
      <div className="wrap"><div className="qlist">
        {items.slice(0, 6).map((q) => (
          <div key={q.id} className={`qitem ${open === q.id ? "on" : ""}`} data-reveal>
            <button type="button" aria-expanded={open === q.id} onClick={() => setOpen(open === q.id ? null : q.id)}>{q.question}<i><Icon name="plus" size={16} /></i></button>
            <div className="qa"><div><p>{q.answer}</p></div></div>
          </div>
        ))}
        <p className="qmore" data-reveal>Can’t find what you need? <Link to="/contact">Message the studio</Link>.</p>
      </div>
      <div className="lmore" data-reveal><TactileLink to="/faq" variant="light" size="lg">Learn more <Icon name="northeast" size={16} /></TactileLink></div></div>
    </section>
  );
}

function Final() {
  return (
    <section className="lsec final" id="contact" data-nav="contact">
      <div className="wrap">
        <div className="fcard" data-reveal>
          <div className="fcopy">
            <h2 className="ltitle" data-split><Split text="Ready to create?" /><br /><span className="neon"><Split text="Book your session." from={3} /></span></h2>
            <p>Fixed session times, live availability and a crew ready when you arrive.</p>
            <div className="fbtns"><TactileLink to="/book" variant="neon" size="lg">Book a session <Icon name="northeast" size={16} /></TactileLink><TactileLink to="/quote" variant="light" size="lg">Request a quote</TactileLink></div>
          </div>
          <Sticker kind="headphones" className="fsticker" />
        </div>
      </div>
    </section>
  );
}

export function Home() {
  const cat = useCatalog();
  const site = useContent();
  const day = useOpenDay(cat);
  const root = useReveal<HTMLDivElement>(!!cat && !!site);
  const [intro, setIntro] = useState(introPending);
  const done = useCallback(() => setIntro(false), []);
  useTone();
  const c = site?.content ?? {};
  const a = site?.announcements[0];
  const badge = a ? { text: a.title, to: a.link_url || undefined } : { text: c.hero_badge || "Now booking sessions in Lagos" };
  const demo = demoData(cat, day);
  return (
    <PublicLayout bare>
      {intro && <Intro onDone={done} />}
      <div className="landing" ref={root}>
        <Hero play={!intro && !!site} badge={badge} demo={demo} title={c.hero_title ?? "Record, shoot and create"} accent={c.hero_accent ?? "under one roof."}
          sub={c.hero_subtitle ?? "Book recording sessions, beats, mixing and mastering online, with fixed session times and live availability."} />
        <Ribbon items={cat ? cat.services.filter((s) => s.active).slice(0, 10).map((s) => s.name) : ["Recording", "Beat production", "Mixing and mastering", "Full production"]} />
        {cat && site && <>
          <Values rooms={cat.rooms.length} daily={cat.sessions.filter((s) => s.active && s.kind === "day" && s.weekday == null).length} />
          <Steps demo={demo} photo={c.hero_image || HERO_PHOTO} />
          <Showcase cat={cat} />
          <Rooms cat={cat} />
          <Work site={site} />
          <Voices items={site.testimonials} />
          <Plans cat={cat} />
          <Faqs items={site.faqs} />
          <Final />
        </>}
      </div>
    </PublicLayout>
  );
}
