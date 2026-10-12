import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { PublicLayout } from "../components/Layout";
import { Icon, Mark, Waveform } from "../components/brand";
import { Barcode, CardFan, Cassette, DynamicButton, ReceiptPrinter, ScrambleText, ScrollFadeList, TactileLink, Tactile, type PrinterStage, type TactileVariant } from "../components/kitchen";
import { BookingTicket } from "../components/BookingTicket";
import { HERO_PHOTO, PHOTOS, useCatalog, useContent, type Catalog, type Package, type Service } from "../lib/catalog";
import { addDays, hrs, lagosToday, longDate, naira, shortDate, t12 } from "../lib/format";
import { api } from "../lib/api";
import { loadDraft, saveDraft } from "../lib/draft";
import { clamp, prefersStill, useInView, useReveal, useScrollFrame } from "../lib/motion";
import { useStartBooking } from "./public";

interface OpenDay { date: string; slots: { start: number; available: boolean }[] }

const pick = (cat: Catalog, slugs: string[]) => slugs.map((s) => cat.services.find((x) => x.slug === s)).filter(Boolean) as Service[];
const SHORT: Record<string, string> = { "vocal-recording": "Vocals", "beat-production": "Beats", mixing: "Mixing", mastering: "Mastering", "podcast-recording": "Podcasts", "voice-over": "Voice-over", "vocal-editing": "Editing" };
const sampleRef = () => `SS-${lagosToday().slice(2, 4)}${lagosToday().slice(5, 7)}-0042`;

function useOpenDay() {
  const [day, setDay] = useState<OpenDay | null>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      for (let i = 1; i <= 14 && live; i++) {
        const date = addDays(lagosToday(), i);
        const r = await api<{ slots: OpenDay["slots"] }>(`/availability/day?date=${date}&duration=120`).catch(() => null);
        const slots = r?.slots ?? [];
        if (slots.some((s) => s.available && s.start >= 720)) { if (live) setDay({ date, slots }); return; }
      }
    })();
    return () => { live = false; };
  }, []);
  return day;
}

function useNarrow() {
  const query = "(max-width: 900px)";
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query), on = () => setNarrow(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return narrow;
}

function Hero({ title, sub }: { title: string; sub: string }) {
  const [l1, l2] = title.includes(",") ? [`${title.split(",")[0]},`, title.split(",").slice(1).join(",").trim()] : [title, ""];
  return (
    <section className="hero">
      <div className="photo" style={{ backgroundImage: `url(${HERO_PHOTO})` }} />
      <Waveform className="wave" />
      <div className="wrap herobody stack gap32">
        <h1 className="display rise">{l1}<br /><span className="neon">{l2}</span></h1>
        <p className="rise d1" style={{ fontSize: 20, opacity: .8, maxWidth: 600 }}>{sub}</p>
        <div className="row gap12 wrapflex rise d2">
          <TactileLink to="/book" variant="neon" size="lg">Book a session <Icon name="arrow" size={18} /></TactileLink>
          <TactileLink to="/packages" variant="light" size="lg">See packages</TactileLink>
        </div>
      </div>
    </section>
  );
}

function Marquee({ words }: { words: string[] }) {
  const run = [...words, ...words].map((w, i) => <span key={i}>{w}<i>✦</i></span>);
  return <div className="marquee" aria-hidden><div className="track"><div>{run}</div><div>{run}</div></div></div>;
}

const FEATURES = [
  ["user", "Engineer included", "Every session is run by a studio engineer, from setup to bounce."],
  ["calendar", "Live availability", "Real open times from the studio calendar, updated as people book."],
  ["lock", "Secure checkout", "Pay by card, bank transfer or USSD through Paystack."],
  ["music", "Files in 48 hours", "Raw files and rough mixes, shared by download link."],
];

function Features({ extraHour }: { extraHour: number }) {
  return (
    <section className="lsec">
      <div className="wrap stack center">
        <span className="eyebrow" data-reveal><Mark tone="neon" size={20} /> Studio A, Lekki</span>
        <h2 className="ltitle" data-reveal>Everything a session needs</h2>
        <div className="feats">
          {FEATURES.map(([icon, title, body], i) => (
            <div key={title} className="feat" data-reveal style={{ transitionDelay: `${i * 90}ms` }}><Icon name={icon} size={34} /><b>{title}</b><span>{body}</span></div>
          ))}
        </div>
        <div className="row gap12 wrapflex" style={{ justifyContent: "center" }} data-reveal>
          <TactileLink to="/book" variant="neon" size="lg">Book a session</TactileLink>
          <TactileLink to="/packages" variant="light" size="lg">View all packages</TactileLink>
        </div>
        <p className="fine" data-reveal>Extra hours are {naira(extraHour)} each. Your price is locked when you book.</p>
      </div>
    </section>
  );
}

function ServicePick({ services, onPick }: { services: Service[]; onPick: (slug: string) => void }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const narrow = useNarrow();
  const [auto, setAuto] = useState(2);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    if (!inView || hover !== null || prefersStill()) return;
    const t = window.setInterval(() => setAuto((a) => (a + 1) % services.length), 1800);
    return () => window.clearInterval(t);
  }, [inView, hover, services.length]);
  const cards = services.map((s, i) => ({ id: s.slug, index: String(i + 1).padStart(2, "0"), title: SHORT[s.slug] ?? s.name, image: s.image_url }));
  return (
    <div className="mock mock-fan" ref={ref}>
      <span className="mock-kicker">Pick a card</span>
      <CardFan cards={cards} active={hover ?? auto} onHover={setHover} onPick={(i) => onPick(services[i].slug)} width={narrow ? 104 : 168} />
    </div>
  );
}

const Check = () => <svg viewBox="0 0 24 24" fill="none" stroke="#30a46c" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
const Clock = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;

function SlotPick({ day }: { day: OpenDay | null }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const scroll = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const open = (day?.slots ?? []).filter((s) => s.available && s.start >= 720);
  useEffect(() => {
    if (!inView || !open.length || prefersStill()) return;
    const t = window.setInterval(() => setStep((s) => s + 1), 1500);
    return () => window.clearInterval(t);
  }, [inView, open.length]);
  const held = step % 2 === 1;
  const chosen = open.length ? open[Math.floor(step / 2) % open.length].start : null;
  useEffect(() => {
    const box = scroll.current, row = box?.querySelector<HTMLElement>(`[data-start="${chosen}"]`);
    if (!box || !row) return;
    const top = row.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    box.scrollTo({ top: top - box.clientHeight / 2 + row.offsetHeight / 2, behavior: prefersStill() ? "auto" : "smooth" });
  }, [chosen]);
  return (
    <div className="mock mock-slots" ref={ref}>
      <div className="ms-card">
        <div className="ms-head"><b>{day ? longDate(day.date).replace(/ \d{4}$/, "") : "Checking live times"}</b><span>2 hrs · Studio A</span></div>
        <ScrollFadeList scrollRef={scroll} height={236} items={day?.slots ?? []} getKey={(s) => String(s.start)} renderItem={(s) => (
          <div data-start={s.start} className={`ms-row ${s.available ? "" : "off"} ${s.start === chosen ? "on" : ""}`}>
            <span>{t12(s.start)} to {t12(s.start + 120)}</span>
            <em>{!s.available ? "Booked" : s.start === chosen && held ? "Held" : "Open"}</em>
          </div>
        )} />
        <div className="ms-foot">
          <span>{held ? "Nobody else can take it while you pay." : "Live from the studio calendar."}</span>
          <DynamicButton stateKey={held ? "held" : `hold-${chosen}`} icon={held ? <Check /> : <Clock />}>{held ? "Held for 15:00" : chosen != null ? `Hold ${t12(chosen)}` : "Hold"}</DynamicButton>
        </div>
      </div>
    </div>
  );
}

function PayPrint({ pkg, extra, day }: { pkg?: Package; extra?: { name: string; price_kobo: number }; day: OpenDay | null }) {
  const [ref, inView] = useInView<HTMLDivElement>(0.4);
  const [stage, setStage] = useState<PrinterStage>("processing");
  const [cycle, setCycle] = useState(0);
  useEffect(() => {
    if (!inView) { setStage("processing"); return; }
    if (prefersStill()) { setStage("complete"); return; }
    const timers: number[] = [];
    const run = () => {
      setStage("processing");
      timers.push(window.setTimeout(() => { setCycle((c) => c + 1); setStage("printing"); }, 1500));
      timers.push(window.setTimeout(() => setStage("complete"), 3250));
      timers.push(window.setTimeout(run, 8000));
    };
    run();
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [inView]);
  const price = pkg?.price_kobo ?? 0, add = extra?.price_kobo ?? 0;
  const start = day?.slots.find((s) => s.available && s.start >= 720)?.start ?? 720;
  return (
    <div className="mock mock-print" ref={ref}>
      <ReceiptPrinter stage={stage} labels={{ processing: "Verifying with Paystack", printing: "Printing your receipt", complete: "Booking confirmed" }}
        header={<><Mark tone="neon" size={30} /><TactileLink to="/book" variant="ink" size="sm" shallow>Book now</TactileLink></>}
        screen={<div className="pr-row"><div><p>{pkg?.name ?? "Studio session"}</p><p className="dim">Studio A{day ? ` · ${shortDate(day.date)}` : ""}</p></div><div className="right"><p className="dim">Total</p><strong>{naira(price + add)}</strong></div></div>}>
        <div className="rc-logo"><Mark tone="ink" size={44} /></div>
        <p className="rc-head" style={{ textAlign: "center" }}>Sessions Studio</p>
        <p className="rc-dim" style={{ textAlign: "center" }}>14 Admiralty Way, Lekki</p>
        <hr className="rc-hr" />
        <div className="rc-row"><span className="rc-head">{pkg?.name}</span><span>{naira(price)}</span></div>
        <div className="rc-dim">{day ? `${shortDate(day.date)} · ${t12(start)}` : "Studio A"} · {hrs(pkg?.duration_min ?? 120)}</div>
        {extra && <div className="rc-row" style={{ marginTop: 8 }}><span className="rc-head">{extra.name}</span><span>{naira(add)}</span></div>}
        <hr className="rc-hr" />
        <div className="rc-row rc-dim"><span>Paid with</span><span>Paystack · Card</span></div>
        <div className="rc-row" style={{ marginTop: 8 }}><span className="rc-head">Total paid</span><span className="rc-total">{naira(price + add)}</span></div>
        <hr className="rc-hr" />
        <Barcode />
        <p className="rc-note">Ref <ScrambleText key={cycle}>{sampleRef()}</ScrambleText></p>
        <p className="rc-note rc-dim">See you in Studio A.</p>
      </ReceiptPrinter>
    </div>
  );
}

function SessionStill({ day, service }: { day: OpenDay | null; service?: Service }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const [p, setP] = useState(0.24);
  useEffect(() => {
    if (!inView || prefersStill()) return;
    const t = window.setInterval(() => setP((x) => (x >= 1 ? 0 : Math.min(1, x + 0.005))), 100);
    return () => window.clearInterval(t);
  }, [inView]);
  const length = 204, clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const date = day?.date ?? addDays(lagosToday(), 1);
  const start = day?.slots.find((s) => s.available && s.start >= 720)?.start ?? 720;
  const kind = SHORT[service?.slug ?? ""] ?? "Vocal";
  return (
    <div className="mock mock-session" ref={ref}>
      <div className="msx-tape"><Cassette kicker="Studio A · Take 3" title={`${kind} session`} catalogue={sampleRef().slice(0, 7)} progress={p} elapsed={clock(p * length)} total={clock(length)} playing={inView && !prefersStill()} /></div>
      <div className="msx-ticket"><BookingTicket kind={kind} date={date} start={start} duration={120} reference={sampleRef()} /></div>
    </div>
  );
}

function HowItWorks({ cat, day }: { cat: Catalog; day: OpenDay | null }) {
  const ref = useRef<HTMLUListElement>(null);
  const start = useStartBooking();
  useScrollFrame(() => {
    const list = ref.current;
    if (!list) return;
    const cards = Array.from(list.children) as HTMLElement[];
    if (cards.length < 2 || prefersStill()) return;
    const stick = parseFloat(getComputedStyle(cards[0]).top) || 0;
    const step = cards[0].offsetHeight + (parseFloat(getComputedStyle(list).rowGap) || 0);
    const top = list.getBoundingClientRect().top;
    cards.slice(0, -1).forEach((card, i) => {
      const p = clamp((stick - (top + i * step)) / ((cards.length - 1 - i) * step));
      card.style.transform = p > 0 ? `scale(${1 - 0.08 * p})` : "";
    });
  });
  const pkg = cat.packages.find((p) => p.slug === "2-hour") ?? cat.packages[0];
  const extra = cat.extras.find((e) => e.slug === "vocal-editing");
  const fan = pick(cat, ["vocal-recording", "beat-production", "podcast-recording", "voice-over", "mixing"]);
  const steps: [string, string, string, ReactNode][] = [
    ["var(--coral)", "Pick what you’re making", "Vocals, beats, mixing, podcasts or voice-over. Every session comes with an engineer.", <ServicePick services={fan} onPick={(slug) => start({ serviceSlug: slug })} />],
    ["var(--yellow)", "Take a live slot", "Real open times from the studio calendar. We hold your slot while you pay.", <SlotPick day={day} />],
    ["var(--neon)", "Pay with Paystack", "Card, bank transfer or USSD. Your booking confirms the moment the payment is verified.", <PayPrint pkg={pkg} extra={extra} day={day} />],
    ["var(--cream)", "Walk in and record", "Your ticket and receipt land in your inbox. The engineer is ready when you arrive.", <SessionStill day={day} service={fan[0]} />],
  ];
  return (
    <section className="lsec">
      <div className="wrap stack center">
        <h2 className="ltitle" data-reveal>Booked in two minutes</h2>
        <p className="lsub" data-reveal>From your phone to the booth in four steps.</p>
      </div>
      <div className="wrap">
        <ul className="stackcards" ref={ref}>
          {steps.map(([bg, title, body, mock], i) => (
            <li key={title} className="scard" style={{ background: bg }}>
              <div className="smock">{mock}</div>
              <div className="stext">
                <span className="eyebrow"><Mark tone="ink" size={18} /> Step {i + 1}</span>
                <h3>{title}</h3>
                <p>{body}</p>
                {i === steps.length - 1 && <div><TactileLink to="/book" size="lg">Book a session <Icon name="arrow" size={18} /></TactileLink></div>}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Reveal({ quote, name }: { quote: string; name: string }) {
  const section = useRef<HTMLElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const photo = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLDivElement>(null);
  useScrollFrame(() => {
    const s = section.current, f = frame.current, ph = photo.current, t = text.current;
    if (!s || !f || !ph || !t) return;
    const box = s.getBoundingClientRect(), stage = f.parentElement!.getBoundingClientRect();
    const p = prefersStill() ? 1 : clamp((stage.top - box.top) / Math.max(1, box.height - stage.height));
    const small = window.innerWidth < 900;
    f.style.clipPath = `inset(${p * (small ? 12 : 32)}px ${p * (small ? 12 : 48)}px round ${p * 28}px)`;
    ph.style.transform = `scale(${1.12 - 0.12 * p})`;
    const q = clamp((p - 0.3) / 0.45);
    t.style.opacity = String(q);
    t.style.transform = `translateY(${(1 - q) * 32}px)`;
  });
  return (
    <section className="reveal" ref={section}>
      <div className="stage">
        <div className="frame" ref={frame}>
          <div className="img" ref={photo} style={{ backgroundImage: `url(${PHOTOS.performer})` }} />
          <div className="quote" ref={text}>
            <p>“{quote}”</p>
            <span><b>{name}</b> · Singer</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function ServicesBand({ cat, start }: { cat: Catalog; start: (p: { serviceSlug: string }) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const speeds = [-36, 44, -14, 60, 10];
  useScrollFrame(() => {
    const strip = ref.current;
    if (!strip) return;
    const flat = prefersStill() || window.innerWidth < 900;
    const r = strip.getBoundingClientRect();
    const p = clamp((window.innerHeight - r.top) / (window.innerHeight + r.height)) - 0.5;
    Array.from(strip.children).forEach((el, i) => { (el as HTMLElement).style.transform = flat ? "" : `translateY(${p * speeds[i % speeds.length]}px)`; });
  });
  const services = pick(cat, ["vocal-recording", "beat-production", "podcast-recording", "voice-over", "mixing"]);
  return (
    <section className="band">
      <div className="wrap stack center">
        <h2 className="ltitle" data-reveal>Made for every kind of session</h2>
        <p className="lsub" data-reveal>Vocals, beats, podcasts and voice-over. One room, one engineer, your sound.</p>
      </div>
      <div className="strip" ref={ref}>
        {services.map((s) => (
          <button key={s.id} type="button" className="shot" onClick={() => start({ serviceSlug: s.slug })}>
            <span className="img" style={{ backgroundImage: `url(${s.image_url})` }} />
            <b>{s.name}</b>
            <span className="d">{s.description}</span>
            <span className="mono">{s.price_label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function PlanCard({ p, variant, onBook }: { p: Package; variant: TactileVariant; onBook: () => void }) {
  return (
    <div className="plan" data-reveal style={{ "--pc": `var(--${variant})` } as CSSProperties}>
      {!!p.featured && <span className="ptab">Most booked</span>}
      <span className="peb"><Mark tone="white" size={16} /> Studio A</span>
      <h3>{p.name}</h3>
      <b className="pprice">{naira(p.price_kobo)} per session</b>
      <span className="pmeta">{p.category === "post" ? `${hrs(p.duration_min)} recording, mixed and mastered` : `${hrs(p.duration_min)}, engineer included`}</span>
      <div className="pdiv" />
      <ul>{p.includes.map((x) => <li key={x}>{x}</li>)}</ul>
      <Tactile variant={variant} size="lg" block onClick={onBook}>Book {p.name}</Tactile>
      <p className="pfine">{p.description}</p>
    </div>
  );
}

function Plans({ cat }: { cat: Catalog }) {
  const nav = useNavigate();
  const featured = ["2-hour", "half-day", "record-mix-master"].map((s) => cat.packages.find((p) => p.slug === s)).filter(Boolean) as Package[];
  const variants: TactileVariant[] = ["neon", "yellow", "coral"];
  const book = (p: Package) => { saveDraft({ ...loadDraft(), packageId: p.id, holdId: undefined }); nav("/book"); };
  return (
    <section className="lsec plans">
      <div className="wrap stack center">
        <div className="glowmark" data-reveal><Mark tone="neon" size={168} /></div>
        <h2 className="ltitle" data-reveal>Your next record starts here</h2>
        <p className="lsub" data-reveal>Pick a package. Every session comes with an engineer.</p>
        <div className="plancards">{featured.map((p, i) => <PlanCard key={p.id} p={p} variant={variants[i]} onBook={() => book(p)} />)}</div>
        <TactileLink to="/packages" variant="light" size="md" data-reveal>Compare all packages and policies</TactileLink>
      </div>
    </section>
  );
}

export function Home() {
  const cat = useCatalog();
  const content = useContent();
  const start = useStartBooking();
  const day = useOpenDay();
  const root = useReveal<HTMLDivElement>(!!cat);
  const c = content?.content ?? {};
  return (
    <PublicLayout dark>
      <div className="landing" ref={root}>
        <Hero title={c.hero_title ?? "Your sound, recorded right."} sub={c.hero_subtitle ?? "Book real studio time in Lekki, Lagos. See live availability, pay with Paystack, walk in and record."} />
        {cat && <>
          <Marquee words={cat.services.map((s) => s.name)} />
          <Features extraHour={cat.rules.extraHourKobo} />
          <HowItWorks cat={cat} day={day} />
          <Reveal quote={c.testimonial_quote ?? "Booked at midnight, recorded the next afternoon. The engineer was ready when I walked in."} name={c.testimonial_name ?? "Amaka Eze"} />
          <ServicesBand cat={cat} start={start} />
          <Plans cat={cat} />
        </>}
      </div>
    </PublicLayout>
  );
}
