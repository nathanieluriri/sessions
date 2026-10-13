import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { PublicLayout } from "../components/Layout";
import { Icon, Mark } from "../components/brand";
import { Badge, Pill, Ring } from "../components/pill";
import { Split, wordCount } from "../components/Split";
import { PhoneDemo, type DemoData } from "../components/PhoneDemo";
import { Swirl } from "../components/Swirl";
import { Intro, introPending } from "../components/Intro";
import { CardArt, LineArt, Pixels, Sticker } from "../components/art";
import { HERO_PHOTO, depositOf, roomOf, useCatalog, useContent, type Catalog, type Package, type Service, type Site } from "../lib/catalog";
import { addDays, hrs, initials, lagosToday, naira, shortDate, t12 } from "../lib/format";
import { api } from "../lib/api";
import { clamp, prefersStill, useInView, useReveal, useScrollFrame } from "../lib/motion";
import { useStartBooking } from "./public";
import { WorkCard } from "./portfolio";

interface OpenDay { date: string; slots: { start: number; available: boolean }[] }

const SHOWCASE = ["vocal-recording", "beat-production", "mixing", "music-videos", "video-podcast", "podcast-recording", "artist-portraits", "social-content"];
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function useOpenDay(cat: Catalog | null) {
  const [day, setDay] = useState<OpenDay | null>(null);
  const room = cat ? roomOf(cat, cat.packages.find((p) => p.slug === "2-hour"))?.id ?? "" : null;
  useEffect(() => {
    if (room === null) return;
    let live = true;
    (async () => {
      for (let i = 1; i <= 14 && live; i++) {
        const date = addDays(lagosToday(), i);
        const r = await api<{ slots: OpenDay["slots"] }>(`/availability/day?date=${date}&duration=120&room=${room}`).catch(() => null);
        const slots = r?.slots ?? [];
        if (slots.some((s) => s.available && s.start >= 720)) { if (live) setDay({ date, slots }); return; }
      }
    })();
    return () => { live = false; };
  }, [room]);
  return day;
}

function demoData(cat: Catalog | null, day: OpenDay | null): DemoData {
  const pkg = cat?.packages.find((p) => p.slug === "2-hour");
  const price = pkg?.price_kobo ?? 4_500_000;
  const deposit = cat && pkg ? depositOf(cat, pkg, price) : price / 2;
  const date = day?.date ?? addDays(lagosToday(), 2);
  const starts = [600, 720, 840, 960, 1080];
  const free = (m: number) => day?.slots.find((s) => s.start === m)?.available ?? m !== 840;
  const slotIndex = Math.max(1, starts.findIndex((m, k) => k >= 1 && free(m)));
  const days = [-1, 0, 1, 2, 3].map((n) => { const d = addDays(date, n), w = new Date(`${d}T00:00:00Z`).getUTCDay(); return { wd: WEEKDAY[w], d: String(Number(d.slice(8))) }; });
  const yymm = lagosToday().slice(2, 4) + lagosToday().slice(5, 7);
  return {
    service: cat?.services.find((s) => s.slug === "vocal-recording")?.name ?? "Vocal recording",
    pkg: pkg?.name ?? "2-Hour Session", room: (cat && roomOf(cat, pkg)?.name) ?? "Studio A",
    price: naira(price), deposit: naira(deposit), balance: naira(price - deposit),
    day: shortDate(date).replace(",", ""), days, dayIndex: 1,
    slots: starts.map((m) => ({ label: `${t12(m)} to ${t12(m + 120)}`, booked: !free(m) })),
    slotIndex, time: t12(starts[slotIndex]), reference: `PR-${yymm}-0042`,
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
          <div className="hcta"><Ring className="lg"><Pill to="/services" kind="dark">Explore our services</Pill><i className="sep" /><Pill to="/book" kind="light" arrow>Book a session</Pill></Ring></div>
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
      <div className="rtrack"><div className="rrow">{[...items, ...items].map((t, i) => <span key={i} aria-hidden={i >= items.length}><Mark tone="white" size={22} />{t}</span>)}</div></div>
    </section>
  );
}

function Values({ rooms }: { rooms: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const cards = [
    { art: "streaks", line: "crew", title: "Crew included", body: "Every booking comes with an engineer, producer or technician who knows the room." },
    { art: "glitch", line: "live", title: "Live availability", body: "Real open times for every room, updated the moment someone books.", light: true },
    { art: "spectrum", line: "deposit", title: "Deposit or pay in full", body: "Hold your slot with a deposit and clear the balance before you arrive." },
    { art: "chrome", line: "rooms", title: `${rooms} rooms, one crew`, body: "A recording room, a production suite, a podcast set and a video and photo stage." },
  ];
  useScrollFrame(() => {
    const row = ref.current;
    if (!row) return;
    const flat = prefersStill() || window.innerWidth < 900;
    const r = row.getBoundingClientRect();
    const p = clamp((window.innerHeight - r.top) / (window.innerHeight * 0.9));
    Array.from(row.children).forEach((el, i) => { (el as HTMLElement).style.translate = flat ? "" : `0 ${Math.round((1 - p) * i * 120 + i * 30)}px`; });
  });
  return (
    <section className="lsec values" data-tone="dark">
      <div className="wrap lhead">
        <Badge>Why Psych Records</Badge>
        <h2 className="ltitle" data-split><Heading lead="Less admin, more" accent="music." /></h2>
        <p className="lsub" data-reveal>Everything around the session is handled, so your time in the room goes into the work.</p>
      </div>
      <div className="wrap"><div className="vcards" ref={ref}>
        {cards.map((c) => (
          <article key={c.art} className={`vcard ${c.light ? "light" : ""}`} data-reveal>
            <CardArt kind={c.art} />
            <div className="vbody"><LineArt kind={c.line} /><h3>{c.title}</h3><p>{c.body}</p></div>
          </article>
        ))}
      </div></div>
    </section>
  );
}

const STEPS: [string, string, string][] = [
  ["mic", "Pick what you’re making", "Vocals, beats, music videos, podcasts or a photo shoot. Every booking comes with crew."],
  ["calendar", "Take a live slot", "Real open times for each room. Your slot is held for you while you check out."],
  ["card", "Pay a deposit or in full", "Card, bank transfer or USSD through Paystack. The booking confirms the moment the payment is verified."],
  ["receipt", "Walk in and create", "Your ticket and receipt land in your inbox, with a reminder the day before. The crew is ready when you arrive."],
];

function Steps({ demo, photo }: { demo: DemoData; photo: string }) {
  const list = useRef<HTMLOListElement>(null);
  const [active, setActive] = useState(0);
  const [boxRef, inView] = useInView<HTMLDivElement>(0.25);
  const [narrow, setNarrow] = useState(() => window.innerWidth < 900);
  useScrollFrame(() => {
    const ol = list.current;
    if (!ol) return;
    setNarrow(window.innerWidth < 900);
    const mid = window.innerHeight * 0.55, r = ol.getBoundingClientRect();
    ol.style.setProperty("--p", String(clamp((mid - r.top) / r.height)));
    if (window.innerWidth < 900) return;
    let best = 0, dist = Infinity;
    Array.from(ol.children).forEach((el, i) => {
      const b = el.getBoundingClientRect(), d = Math.abs(b.top + b.height / 2 - mid);
      if (d < dist) { dist = d; best = i; }
    });
    setActive(best);
  });
  useEffect(() => {
    if (!narrow || !inView || prefersStill()) return;
    const t = window.setInterval(() => setActive((a) => (a + 1) % STEPS.length), 2600);
    return () => window.clearInterval(t);
  }, [narrow, inView]);
  return (
    <section className="lsec howto" data-tone="dark">
      <div className="wrap sgrid">
        <div className="sleft">
          <Badge>How it works</Badge>
          <h2 className="ltitle" data-split><Heading lead="Booked in" accent="two minutes." /></h2>
          <p className="lsub" data-reveal>From your phone to the room in four steps. No calls, no back and forth.</p>
          <div data-reveal><Ring><Pill to="/book" kind="dark" arrow>Book a session</Pill></Ring></div>
          <div className="svis" ref={boxRef}>
            <Pixels src={photo} />
            <PhoneDemo data={demo} screen={active} className="sphone" />
          </div>
        </div>
        <ol className="slist" ref={list}>
          {STEPS.map(([icon, title, body], i) => (
            <li key={title} className={i === active ? "on" : ""} data-reveal>
              <span className="stile"><Icon name={icon} size={30} /></span>
              <div><span className="snum">Step {i + 1}</span><h3>{title}</h3><p>{body}</p></div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Showcase({ cat }: { cat: Catalog }) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [held, setHeld] = useState(false);
  const [boxRef, inView] = useInView<HTMLElement>(0.35);
  const chosen = SHOWCASE.map((s) => cat.services.find((x) => x.slug === s)).filter(Boolean) as Service[];
  const services = chosen.length >= 4 ? chosen : cat.services.slice(0, 8);
  const go = useCallback((i: number) => {
    const t = track.current, card = t?.children[i] as HTMLElement | undefined;
    if (!t || !card) return;
    t.scrollTo({ left: card.offsetLeft - (t.clientWidth - card.offsetWidth) / 2, behavior: prefersStill() ? "auto" : "smooth" });
  }, []);
  const onScroll = () => {
    const t = track.current;
    if (!t) return;
    const mid = t.scrollLeft + t.clientWidth / 2;
    let best = 0, dist = Infinity;
    Array.from(t.children).forEach((el, i) => { const c = el as HTMLElement, d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid); if (d < dist) { dist = d; best = i; } });
    setActive(best);
  };
  useEffect(() => {
    if (!inView || held || prefersStill()) return;
    const t = window.setInterval(() => go((active + 1) % services.length), 3400);
    return () => window.clearInterval(t);
  }, [inView, held, active, services.length, go]);
  const step = (d: number) => { setHeld(true); go((active + d + services.length) % services.length); };
  return (
    <section className="lsec showcase" data-tone="dark" ref={boxRef}>
      <div className="wrap lhead center">
        <Badge>What we do</Badge>
        <h2 className="ltitle" data-split><Split text="Made for every kind" /><br /><Heading lead="of" accent="project." from={4} /></h2>
        <p className="lsub" data-reveal>Records, music videos, podcasts and shoots. Four rooms, one crew, your vision.</p>
      </div>
      <div className="ctrack" ref={track} onScroll={onScroll} onPointerDown={() => setHeld(true)} onMouseEnter={() => setHeld(true)}>
        {services.map((s, i) => (
          <article key={s.id} className={`ccard ${i === active ? "on" : ""}`}>
            <Link to={`/services/${s.slug}`} className="cimg" aria-label={s.name}><span style={{ backgroundImage: `url(${s.image_url})` }} /></Link>
            <div className="cbody"><h3><Link to={`/services/${s.slug}`}>{s.name}</Link></h3><p>{s.description}</p><span className="ctag">{s.price_label}</span></div>
          </article>
        ))}
      </div>
      <div className="cnav"><button type="button" onClick={() => step(-1)}>Prev</button><button type="button" onClick={() => step(1)}>Next</button></div>
    </section>
  );
}

function Rooms({ cat }: { cat: Catalog }) {
  const rooms = cat.rooms.slice(0, 4);
  return (
    <section className="lsec rooms2" data-tone="light">
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
              <span className="bkind">{r.kind}</span>
              <b>{r.name}</b>
              <span className="bmeta">Up to {r.capacity} people · {naira(r.hourly_kobo || cat.rules.extraHourKobo)} per extra hour</span>
            </Link>
          ))}
        </div>
        <div className="lmore" data-reveal><Ring><Pill to="/studio" kind="dark" arrow>See the rooms and equipment</Pill></Ring></div>
      </div>
    </section>
  );
}

function Voices({ items }: { items: Site["testimonials"] }) {
  const [order, setOrder] = useState(() => items.map((_, i) => i));
  const [leaving, setLeaving] = useState(false);
  const shuffle = () => {
    if (leaving) return;
    if (prefersStill()) { setOrder((o) => [...o.slice(1), o[0]]); return; }
    setLeaving(true);
    window.setTimeout(() => { setOrder((o) => [...o.slice(1), o[0]]); setLeaving(false); }, 420);
  };
  if (!items.length) return null;
  return (
    <section className="lsec voices" data-tone="dark">
      <div className="wrap lhead center">
        <Badge>What clients say</Badge>
        <h2 className="ltitle" data-split><Heading lead="Trusted by artists and" accent="creators." /></h2>
        <p className="lsub" data-reveal>Singers, producers, podcasters and brands who booked a room and came back.</p>
      </div>
      <div className="deckwrap">
        <Sticker kind="mic" className="vsticker" />
        <div className="deck" data-reveal>
          {order.slice(0, Math.min(4, order.length)).map((idx, k) => {
            const t = items[idx];
            return (
              <figure key={t.id} className={`dcard ${k === 0 && leaving ? "out" : ""}`} style={{ "--k": k } as CSSProperties} aria-hidden={k > 0}>
                <span className="dav">{initials(t.name)}</span>
                <span className="dstars">{[0, 1, 2, 3, 4].map((s) => <Icon key={s} name="star" size={20} />)}</span>
                <blockquote>“{t.quote}”</blockquote>
                <figcaption><b>{t.name}</b>{t.role && <span>{t.role}</span>}</figcaption>
              </figure>
            );
          })}
        </div>
        {items.length > 1 && <button type="button" className="pill light dshuffle" onClick={shuffle}><Icon name="shuffle" size={18} />Tap to shuffle</button>}
      </div>
    </section>
  );
}

function Work({ site }: { site: Site }) {
  const featured = site.portfolio.filter((w) => w.featured).slice(0, 3);
  if (!featured.length) return null;
  return (
    <section className="lsec work2" data-tone="dark">
      <div className="wrap stack gap48">
        <div className="whead">
          <div className="stack gap16"><Badge>Portfolio</Badge><h2 className="ltitle" data-split><Heading lead="Work made" accent="here." /></h2></div>
          <Ring><Pill to="/portfolio" kind="dark" arrow>Full portfolio</Pill></Ring>
        </div>
        <div className="grid cols-3">{featured.map((w, i) => <div key={w.id} data-reveal style={{ transitionDelay: `${i * 90}ms` }}><WorkCard w={w} /></div>)}</div>
      </div>
    </section>
  );
}

function Plans({ cat }: { cat: Catalog }) {
  const start = useStartBooking();
  const featured = ["half-day", "video-podcast-2-hour", "photo-session-2-hour"].map((s) => cat.packages.find((p) => p.slug === s)).filter(Boolean) as Package[];
  const book = (p: Package) => start({ serviceSlug: cat.services.find((s) => s.category === p.service_category)?.slug, packageId: p.id });
  return (
    <section className="lsec plans2" data-tone="dark">
      <div className="wrap lhead center">
        <Badge>Packages</Badge>
        <h2 className="ltitle" data-split><Heading lead="Your next project starts" accent="here." /></h2>
        <p className="lsub" data-reveal>Pick a package. Pay a deposit to hold it and the balance before you arrive.</p>
      </div>
      <div className="wrap">
        <div className="pcards">
          {featured.map((p, i) => {
            const deposit = depositOf(cat, p, p.price_kobo), hot = !!p.featured;
            return (
              <article key={p.id} className={`pcard ${hot ? "hot" : ""}`} data-reveal style={{ transitionDelay: `${i * 90}ms` }}>
                {hot && <span className="ptag">Most booked</span>}
                <span className="proom"><Mark tone="neon" size={18} />{roomOf(cat, p)?.name}</span>
                <h3>{p.name}</h3>
                <b className="pprice">{naira(p.price_kobo)}</b>
                <span className="pmeta">{deposit < p.price_kobo ? `${naira(deposit)} deposit to book` : "Paid in full when you book"} · {hrs(p.duration_min)}</span>
                <ul>{p.includes.map((x) => <li key={x}><Icon name="check" size={16} />{x}</li>)}</ul>
                <Pill kind={hot ? "light" : "dark"} onClick={() => book(p)}>Book {p.name}</Pill>
              </article>
            );
          })}
        </div>
        <div className="lmore" data-reveal><Link to="/packages" className="lmorelink">Compare all packages and policies <Icon name="arrow" size={16} /></Link></div>
      </div>
    </section>
  );
}

function Faqs({ items, whatsapp }: { items: Site["faqs"]; whatsapp?: string }) {
  const [open, setOpen] = useState<string | null>(items[0]?.id ?? null);
  if (!items.length) return null;
  return (
    <section className="lsec faqs2" data-tone="dark">
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
        <p className="qmore" data-reveal>Can’t find what you need? <Link to="/faq">Read all FAQs</Link>{whatsapp && <> or <Link to="/contact">message the studio</Link></>}.</p>
      </div></div>
    </section>
  );
}

function Final() {
  return (
    <section className="lsec final">
      <div className="wrap">
        <div className="fcard" data-reveal>
          <div className="fcopy">
            <Badge>Ready when you are</Badge>
            <h2 className="ltitle" data-split><Split text="Ready to create?" /><br /><span className="neon"><Split text="Book your session." from={3} /></span></h2>
            <p>Live availability, a deposit to hold your slot and a crew ready when you arrive.</p>
            <Ring><Pill to="/book" kind="light" arrow>Book a session</Pill><i className="sep" /><Pill to="/quote" kind="dark">Request a quote</Pill></Ring>
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
          sub={c.hero_subtitle ?? "Music recording, video production, podcasts and photography. Check live availability, book a room, and pay a deposit or the full amount online."} />
        <Ribbon items={["Vocal recording", "Beat production", "Mixing and mastering", "Music videos", "Video podcasts", "Artist portraits", "Voice-over", "Content days"]} />
        {cat && site && <>
          <Values rooms={cat.rooms.length} />
          <Steps demo={demo} photo={c.hero_image || HERO_PHOTO} />
          <Showcase cat={cat} />
          <Rooms cat={cat} />
          <Voices items={site.testimonials} />
          <Work site={site} />
          <Plans cat={cat} />
          <Faqs items={site.faqs} whatsapp={c.whatsapp} />
          <Final />
        </>}
      </div>
    </PublicLayout>
  );
}
