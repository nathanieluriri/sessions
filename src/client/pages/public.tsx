import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { PublicLayout, PageHero } from "../components/Layout";
import { Icon, Socials, Waveform } from "../components/brand";
import { Area, Btn, ErrorBox, Field, Loading } from "../components/ui";
import { HERO_PHOTO, PHOTOS, useCatalog, useContent, type Package, type Service } from "../lib/catalog";
import { addDays, hrs, lagosToday, naira, shortDate, t12 } from "../lib/format";
import { api } from "../lib/api";
import { loadDraft, saveDraft } from "../lib/draft";

export function ServiceCard({ s, on, onClick }: { s: Service; on?: boolean; onClick?: () => void }) {
  return (
    <button type="button" className={`svc ${on ? "on" : ""}`} style={{ backgroundImage: `url(${s.image_url})` }} onClick={onClick} aria-pressed={on}>
      {on && <span className="check"><Icon name="check" size={18} /></span>}
      <span className="label"><b>{s.name}</b><span>{s.price_label}</span></span>
    </button>
  );
}

export function PackageCard({ p, onBook }: { p: Package; onBook: () => void }) {
  const f = !!p.featured;
  return (
    <div className={`pkg ${f ? "featured" : ""}`}>
      <div className="row between"><span className="mono" style={{ color: f ? "var(--neon)" : "var(--fg2)" }}>{hrs(p.duration_min)}{p.category === "post" ? " + post" : ""}</span>{f && <span className="tag" style={{ background: "var(--neon)", color: "var(--brand)" }}>Most booked</span>}</div>
      <h3 className="h3">{p.name}</h3>
      <p style={{ opacity: f ? .75 : 1 }} className={f ? "" : "muted"}>{p.description}</p>
      <div className="row gap8" style={{ alignItems: "baseline" }}><span className="price">{naira(p.price_kobo)}</span><span className="small" style={{ opacity: .6 }}>per session</span></div>
      <div className="divider" style={{ background: f ? "var(--brand-2)" : undefined }} />
      <ul>{p.includes.map((i) => <li key={i}>{i}</li>)}</ul>
      <Btn kind={f ? "neon" : "primary"} arrow className="block" onClick={onBook}>Book this package</Btn>
    </div>
  );
}

function useStartBooking() {
  const nav = useNavigate();
  return (patch: { serviceSlug?: string; packageId?: string }) => { saveDraft({ ...loadDraft(), ...patch, holdId: undefined }); nav(patch.serviceSlug ? "/book/package" : "/book"); };
}

function NextSlots() {
  const [slots, setSlots] = useState<{ date: string; start: number }[]>([]);
  useEffect(() => {
    (async () => {
      const out: { date: string; start: number }[] = [];
      for (let i = 1; i <= 10 && out.length < 3; i++) {
        const d = addDays(lagosToday(), i);
        const r = await api<{ slots: { start: number; available: boolean }[] }>(`/availability/day?date=${d}&duration=120`).catch(() => null);
        const s = r?.slots.find((x) => x.available && x.start >= 720);
        if (s) out.push({ date: d, start: s.start });
      }
      setSlots(out);
    })();
  }, []);
  return slots;
}

export function Home() {
  const cat = useCatalog();
  const content = useContent();
  const start = useStartBooking();
  const slots = NextSlots();
  if (!cat) return <PublicLayout dark><Loading /></PublicLayout>;
  const featured = cat.packages.filter((p) => ["2-hour", "half-day", "record-mix-master"].includes(p.slug));
  const showcase = ["vocal-recording", "beat-production", "mixing", "podcast-recording"].map((s) => cat.services.find((x) => x.slug === s)!).filter(Boolean);
  const title = content?.content.hero_title ?? "Your sound, recorded right.";
  const [l1, l2] = title.includes(",") ? [title.split(",")[0] + ",", title.split(",").slice(1).join(",").trim()] : [title, ""];
  return (
    <PublicLayout dark>
      <section className="hero">
        <div className="photo" style={{ backgroundImage: `url(${HERO_PHOTO})` }} />
        <Waveform className="wave" bars={180} />
        <div className="wrap content stack gap32">
          <h1 className="display">{l1}<br /><span className="neon">{l2}</span></h1>
          <p style={{ fontSize: 20, opacity: .8, maxWidth: 600 }}>{content?.content.hero_subtitle}</p>
          <div className="row gap12 wrapflex">
            <Link to="/book" className="btn neon">Book a session <Icon name="arrow" size={18} /></Link>
            <Link to="/packages" className="btn neutral">See packages</Link>
          </div>
        </div>
      </section>
      <div className="marquee"><div>{["Vocal & rap recording", "Beat production", "Mixing", "Mastering", "Vocal editing", "Podcasts", "Voice-over", "Vocal & rap recording", "Beat production"].map((w, i) => <span key={i}>{w.toUpperCase()} ✦</span>)}</div></div>

      <section className="section"><div className="wrap stack gap48">
        <div className="row between wrapflex gap16" style={{ alignItems: "flex-end" }}>
          <h2 className="display" style={{ fontSize: "clamp(40px,6vw,84px)" }}>Pick what<br />you’re making.</h2>
          <Link to="/services" className="linkrow">All services <Icon name="arrow" size={18} /></Link>
        </div>
        <div className="grid cols-4">{showcase.map((s) => <ServiceCard key={s.id} s={s} onClick={() => start({ serviceSlug: s.slug })} />)}</div>
      </div></section>

      <section className="section" style={{ paddingTop: 0 }}><div className="wrap grid cols-2" style={{ gap: 72, alignItems: "center" }}>
        <div style={{ borderRadius: 28, minHeight: 560, background: `center/cover url(${PHOTOS.control})` }} />
        <div className="stack">
          <h2 className="display" style={{ fontSize: "clamp(36px,5vw,72px)", marginBottom: 40 }}>Booked in<br />two minutes.</h2>
          {[["01", "Pick a service", "Vocals, beats, mixing, podcasts or voice-over."], ["02", "Choose a package", "From one hour to a full day, engineer included."], ["03", "Take a live slot", "Real availability. We hold it while you pay."], ["04", "Pay and record", "Paystack checkout. Your reference lands in your inbox."]].map(([n, t, d]) => (
            <div key={n} className="row gap24" style={{ alignItems: "flex-start", padding: "24px 0", borderTop: "1px solid var(--line)" }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 22, color: "var(--brand)" }}>{n}</span>
              <div className="stack gap4"><b style={{ fontSize: 28, letterSpacing: "-.02em", fontWeight: 600 }}>{t}</b><span className="muted">{d}</span></div>
            </div>
          ))}
        </div>
      </div></section>

      <section className="section" style={{ background: "var(--surface)" }}><div className="wrap stack gap48">
        <div className="row between wrapflex gap16" style={{ alignItems: "flex-end" }}>
          <h2 className="display" style={{ fontSize: "clamp(36px,5vw,72px)" }}>Clear prices.<br />Engineer included.</h2>
          <Link to="/packages" className="linkrow">Compare packages <Icon name="arrow" size={18} /></Link>
        </div>
        <div className="grid cols-3">{featured.map((p) => <PackageCard key={p.id} p={p} onBook={() => { saveDraft({ ...loadDraft(), packageId: p.id }); window.location.assign("/book"); }} />)}</div>
      </div></section>

      <section className="section"><div className="wrap grid cols-2" style={{ gap: 72, alignItems: "center" }}>
        <div style={{ borderRadius: 28, minHeight: 600, background: `center/cover url(${PHOTOS.performer})` }} />
        <div className="stack gap24">
          <p style={{ fontSize: "clamp(26px,3.4vw,48px)", lineHeight: 1.12, letterSpacing: "-.03em", fontWeight: 600 }}>“{content?.content.testimonial_quote}”</p>
          <div><b>{content?.content.testimonial_name}</b><div className="small muted">Singer</div></div>
        </div>
      </div></section>

      <section className="section" style={{ paddingTop: 0 }}><div className="wrap">
        <div className="cta-card">
          <div className="stack gap32" style={{ padding: "clamp(28px,5vw,64px)", justifyContent: "center" }}>
            <h2 className="h1" style={{ fontSize: "clamp(32px,4vw,56px)" }}>Studio A has open<br />slots this week.</h2>
            <p style={{ opacity: .7, fontSize: 18 }}>Live availability. Pick a time and you’re booked in two minutes.</p>
            <div style={{ borderBottom: "1px solid var(--brand-2)" }}>
              {slots.map((s) => (
                <Link key={s.date} to="/book" className="slotrow">
                  <b style={{ width: 130 }}>{shortDate(s.date)}</b><span className="grow" style={{ opacity: .7 }}>{t12(s.start)} to {t12(s.start + 120)}</span>
                  <span className="linkrow neon">Book <Icon name="arrow" size={18} /></span>
                </Link>
              ))}
              {!slots.length && <div className="slotrow" style={{ opacity: .7 }}>Checking live availability…</div>}
            </div>
            <div><Link to="/book" className="btn neon">See all times <Icon name="arrow" size={18} /></Link></div>
          </div>
          <div className="ph" style={{ backgroundImage: `url(${PHOTOS.producer})` }} />
        </div>
      </div></section>
    </PublicLayout>
  );
}

export function Services() {
  const cat = useCatalog();
  const start = useStartBooking();
  return (
    <PublicLayout>
      <PageHero title="Recording and audio, done properly." sub="Every service runs in Studio A with an engineer." />
      <section className="section" style={{ paddingTop: 48 }}><div className="wrap grid cols-2">
        {!cat ? <Loading /> : cat.services.map((s) => (
          <div key={s.id} className="card stack gap16" style={{ padding: 16 }}>
            <div style={{ height: 300, borderRadius: 16, background: `center/cover url(${s.image_url})` }} />
            <div className="stack gap12" style={{ padding: "4px 8px 8px" }}>
              <div className="row between wrapflex gap8"><h3 className="h3">{s.name}</h3><span className="mono muted">{s.price_label}</span></div>
              <p className="muted">{s.description}</p>
              <div className="row" style={{ justifyContent: "flex-end" }}><Btn size="sm" arrow onClick={() => start({ serviceSlug: s.slug })}>Book</Btn></div>
            </div>
          </div>
        ))}
      </div></section>
    </PublicLayout>
  );
}

export function Packages() {
  const cat = useCatalog();
  const content = useContent();
  const nav = useNavigate();
  const loc = useLocation();
  const [tab, setTab] = useState<"all" | "session" | "post">("all");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (loc.hash === "#policies" && content) ref.current?.scrollIntoView(); }, [loc.hash, content]);
  return (
    <PublicLayout>
      <PageHero title="Clear prices. Fair policies." sub="Every package includes an engineer. Prices are locked to your booking, even if they change later." />
      <section className="section" style={{ paddingTop: 48 }}><div className="wrap stack gap32">
        <div className="seg" style={{ alignSelf: "flex-start" }}>
          {([["all", "All packages"], ["session", "Session time"], ["post", "Recording + post"]] as const).map(([v, l]) => <button key={v} className={tab === v ? "on" : ""} onClick={() => setTab(v)}>{l}</button>)}
        </div>
        <div className="grid cols-3">{cat?.packages.filter((p) => tab === "all" || p.category === tab).map((p) => <PackageCard key={p.id} p={p} onBook={() => { saveDraft({ ...loadDraft(), packageId: p.id }); nav("/book"); }} />)}</div>
        {cat && (
          <div className="card stack" style={{ padding: 0, overflow: "hidden" }}>
            <div className="mono muted" style={{ padding: "14px 24px", background: "var(--surface)" }}>Extras you can add at checkout</div>
            {[...cat.extras.map((e) => [e.name, naira(e.price_kobo)]), ["Extra hour", naira(cat.rules.extraHourKobo)]].map(([n, p]) => (
              <div key={n} className="row between" style={{ padding: "14px 24px", borderTop: "1px solid var(--line)" }}><span>{n}</span><b>{p}</b></div>
            ))}
          </div>
        )}
      </div></section>
      <section className="section" style={{ background: "var(--surface)" }} id="policies" ref={ref}><div className="wrap stack gap32">
        <h2 className="h1">Booking policies</h2>
        <div className="grid cols-2">{content?.policies.map((p) => (
          <div key={p.slug} className="card stack gap8"><h3 className="h4">{p.title}</h3><p className="muted">{p.body}</p></div>
        ))}</div>
        {content && <span className="mono faint">Last updated {new Date(Math.max(...content.policies.map((p) => Date.parse(p.updated_at)))).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</span>}
      </div></section>
    </PublicLayout>
  );
}

export function Contact() {
  const [f, setF] = useState({ name: "", email: "", phone: "", topic: "Booking question", message: "", website: "" });
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const started = useRef(Date.now());
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setState("sending");
    try { await api("/enquiries", { body: { ...f, startedAt: started.current } }); setState("sent"); }
    catch (err: any) { setError(err.message); setState("idle"); }
  };
  return (
    <PublicLayout>
      <PageHero title="Questions before you book?" sub="Send a message and the studio team will reply within one working day." />
      <section className="section" style={{ paddingTop: 48 }}><div className="wrap grid contactgrid" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,440px)", gap: 32 }}>
        {state === "sent" ? (
          <div className="card stack gap12"><h2 className="h3">Thanks, {f.name.split(" ")[0]}.</h2><p className="muted">Your message is with the studio team. We reply within one working day.</p></div>
        ) : (
          <form className="card stack gap20" onSubmit={submit} style={{ padding: 40 }}>
            <h2 className="h3">Send an enquiry</h2>
            <div className="grid cols-2" style={{ gap: 16 }}><Field label="Full name" name="name" required value={f.name} onChange={set("name")} /><Field label="Email" name="email" type="email" required value={f.email} onChange={set("email")} /></div>
            <Field label="Phone number" name="phone" value={f.phone} onChange={set("phone")} placeholder="e.g. +234 803 000 0000" />
            <div className="field"><label>What is it about?</label><div className="row gap8 wrapflex">{["Booking question", "Packages & pricing", "Group or long project", "Something else"].map((t) => <button type="button" key={t} className={`chip ${f.topic === t ? "on" : ""}`} onClick={() => setF({ ...f, topic: t })}>{t}</button>)}</div></div>
            <Area label="Message" name="message" required value={f.message} onChange={set("message")} placeholder="Tell us about your project, dates you have in mind and how many people are coming." />
            <input tabIndex={-1} autoComplete="off" aria-hidden style={{ position: "absolute", left: -9999 }} name="website" value={f.website} onChange={set("website")} />
            <ErrorBox error={error} />
            <div><Btn arrow disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Send enquiry"}</Btn></div>
          </form>
        )}
        <div className="stack gap24" style={{ background: "var(--brand)", color: "#fff", borderRadius: 24, padding: 32, alignSelf: "start" }}>
          <div style={{ height: 200, borderRadius: 16, background: `center/cover url(${PHOTOS.control})` }} />
          <h3 className="h3">Sessions Studio</h3>
          {[["phone", "Phone", "+234 812 555 0142"], ["mail", "Email", "hello@sessionsstudio.ng"], ["pin", "Studio", "14 Admiralty Way, Lekki Phase 1, Lagos"]].map(([i, k, v]) => (
            <div key={k} className="row gap12" style={{ alignItems: "flex-start" }}><span style={{ width: 40, height: 40, borderRadius: 12, background: "var(--brand-2)", display: "grid", placeItems: "center", color: "var(--neon)", flex: "none" }}><Icon name={i} /></span><div><div className="mono" style={{ opacity: .6 }}>{k}</div><b>{v}</b></div></div>
          ))}
          <div className="stack gap8" style={{ background: "var(--brand-2)", borderRadius: 14, padding: 16 }}>
            <span className="mono neon">Opening hours</span>
            {[["Monday to Saturday", "10:00 to 22:00"], ["Sunday", "14:00 to 20:00"]].map(([d, h]) => <div key={d} className="row between small"><span style={{ opacity: .75 }}>{d}</span><b>{h}</b></div>)}
          </div>
          <Socials />
        </div>
      </div></section>
    </PublicLayout>
  );
}
