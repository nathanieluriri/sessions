import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { PublicLayout, PageHero, hoursSummary, waLink } from "../components/Layout";
import { Icon, Socials } from "../components/brand";
import { Eq } from "../components/art";
import { Area, Btn, ErrorBox, Field, Loading } from "../components/ui";
import { TactileAnchor, TactileLink } from "../components/kitchen";
import { RichText } from "../components/content";
import { PHOTOS, depositOf, needsApproval, useCatalog, useContent, type Catalog, type Package, type Service } from "../lib/catalog";
import { naira } from "../lib/format";
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

/** Starts the booking flow with whatever the visitor already chose. */
export function useStartBooking() {
  const nav = useNavigate();
  return (patch: { serviceSlug?: string; packageId?: string }) => {
    saveDraft({ ...loadDraft(), ...patch, holdId: undefined, start: undefined });
    nav(patch.serviceSlug && patch.packageId ? "/book/time" : patch.serviceSlug ? "/book/package" : "/book");
  };
}

export function PackageCard({ p, cat, service }: { p: Package; cat: Catalog; service?: Service }) {
  const start = useStartBooking();
  const f = !!p.featured;
  const quote = p.pricing === "quote";
  const approval = needsApproval(cat, p);
  const pct = p.deposit_percent ?? cat.rules.depositPercent;
  const svc = service ?? cat.services.find((s) => s.category === p.service_category);
  const pay = pct > 0 && pct < 100 ? `${pct}% deposit (${naira(depositOf(cat, p, p.price_kobo))})` : "";
  const terms = approval ? `Needs studio approval, then ${pay ? `a ${pay} or pay in full` : "paid in full"}` : pay ? `${pay} to book, or pay in full` : "Paid in full when you book";
  return (
    <div className={`pkg ${f ? "featured" : ""}`} id={`pkg-${p.slug}`}>
      {f && <span className="pkgbadge">Most booked</span>}
      <h3 className="h3">{p.name}</h3>
      <p style={{ opacity: f ? .75 : 1 }} className={f ? "" : "muted"}>{p.description}</p>
      {quote
        ? <div className="stack gap4"><span className="price" style={{ fontSize: 30 }}>Price on request</span>{p.price_note && <span className="small" style={{ opacity: .65 }}>{p.price_note}</span>}</div>
        : <div className="stack gap4"><div className="row gap8" style={{ alignItems: "baseline" }}><span className="price">{naira(p.price_kobo)}</span><span className="small" style={{ opacity: .6 }}>per session</span></div>
          <span className="small" style={{ opacity: .65 }}>{terms}</span></div>}
      <div className="divider" style={{ background: f ? "var(--brand-2)" : undefined }} />
      <ul>{p.includes.map((i) => <li key={i}><Eq />{i}</li>)}</ul>
      {quote
        ? <TactileLink to={`/quote?service=${encodeURIComponent(svc?.name ?? p.name)}`} variant={f ? "neon" : "light"} size="lg" block>Request a quote</TactileLink>
        : <Btn kind={f ? "neon" : ""} arrow block onClick={() => start({ serviceSlug: svc?.slug, packageId: p.id })}>{approval ? "Request this package" : "Book this package"}</Btn>}
    </div>
  );
}

export function Packages() {
  const cat = useCatalog();
  const site = useContent();
  const loc = useLocation();
  const ref = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState("all");
  useEffect(() => {
    const h = loc.hash.slice(1);
    if (!cat || !site || !h) return;
    if (cat.categories.some((c) => c.slug === h)) setTab(h);
    setTimeout(() => document.getElementById(h)?.scrollIntoView({ block: "start" }), 50);
  }, [loc.hash, cat, site]);
  const booking = site?.policies.filter((p) => p.kind === "booking") ?? [];
  return (
    <PublicLayout title="Pricing and packages">
      <PageHero kicker="Pricing" title="Clear prices. Fair policies." sub="Every package includes the people who run the room. Prices are locked when you book, and most packages take a deposit." />
      <section className="section" style={{ paddingTop: 40 }}><div className="wrap stack gap32">
        {!cat ? <Loading /> : <>
          <div className="chips" role="tablist">
            {[{ slug: "all", name: "All packages" }, ...cat.categories].map((c) => <button key={c.slug} className={`chip ${tab === c.slug ? "on" : ""}`} onClick={() => setTab(c.slug)} role="tab" aria-selected={tab === c.slug}>{c.name}</button>)}
          </div>
          {cat.categories.filter((c) => tab === "all" || tab === c.slug).map((c) => {
            const list = cat.packages.filter((p) => p.service_category === c.slug);
            if (!list.length) return null;
            return (
              <div key={c.slug} id={c.slug} className="stack gap20" style={{ scrollMarginTop: 100 }}>
                <div className="stack gap4"><h2 className="h2">{c.name}</h2><p className="muted">{c.blurb}</p></div>
                <div className="grid cols-3">{list.map((p) => <PackageCard key={p.id} p={p} cat={cat} />)}</div>
              </div>
            );
          })}
          <div className="stack gap20 pkgmore" id="rooms">
            <div className="stack gap4"><h2 className="h2">Rooms and extra time</h2><p className="muted">Every package includes its room and crew. Need longer? Add time at the room’s hourly rate.</p></div>
            <div className="grid cols-4">{cat.rooms.map((r) => (
              <Link key={r.id} to={`/studio#${r.slug}`} className="rate">
                <span className="rate-img" style={{ backgroundImage: `url(${r.image_url})` }} />
                <span className="stack gap4"><b>{r.name}</b><span className="small muted">{r.kind} · up to {r.capacity} people</span></span>
                <span className="rate-price">{naira(r.hourly_kobo || cat.rules.extraHourKobo)}<span className="small muted"> per extra hour</span></span>
              </Link>
            ))}</div>
          </div>
          {cat.extras.length > 0 && <div className="stack gap20" id="extras">
            <div className="stack gap4"><h2 className="h2">Extras</h2><p className="muted">Add any of these when you book.</p></div>
            <div className="grid cols-3">{cat.extras.map((e) => (
              <div key={e.slug} className="rate extra">
                <span className="stack gap4"><b>{e.name}</b><span className="small muted">{cat.categories.find((c) => c.slug === e.category)?.name ?? "Any session"}</span></span>
                <span className="rate-price">{naira(e.price_kobo)}</span>
              </div>
            ))}</div>
          </div>}
          <div className="panel row between wrapflex gap16">
            <div className="stack gap4"><b>Need something custom?</b><span className="muted small">Music videos, commercials, content days and long projects are priced to your brief.</span></div>
            <TactileLink to="/quote" size="lg">Request a quote <Icon name="arrow" size={18} /></TactileLink>
          </div>
        </>}
      </div></section>
      <section className="section" style={{ background: "var(--surface)" }} id="policies" ref={ref}><div className="wrap stack gap32">
        <h2 className="h1">Booking policies</h2>
        <div className="grid cols-3 policies">{booking.map((p) => <div key={p.slug} className="card stack gap8"><h3 className="h4">{p.title}</h3><p className="muted">{p.body}</p></div>)}</div>
        {booking.length > 0 && <span className="mono faint">Last updated {new Date(Math.max(...booking.map((p) => Date.parse(p.updated_at)))).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</span>}
      </div></section>
    </PublicLayout>
  );
}

function ContactCard() {
  const site = useContent();
  const cat = useCatalog();
  const c = site?.content ?? {};
  return (
    <div className="contactcard">
      <h3 className="h3">{c.business_name}</h3>
      {[["phone", "Phone", c.contact_phone, c.contact_phone ? `tel:${c.contact_phone.replace(/\s/g, "")}` : ""], ["mail", "Email", c.contact_email, c.contact_email ? `mailto:${c.contact_email}` : ""], ["pin", "Studio", c.studio_address, ""]].filter(([, , v]) => v).map(([i, k, v, href]) => (
        <div key={k} className="row gap12" style={{ alignItems: "flex-start" }}>
          <span className="cicon"><Icon name={i!} /></span>
          <div><div className="mono" style={{ opacity: .6 }}>{k}</div>{href ? <a href={href}><b>{v}</b></a> : <b>{v}</b>}</div>
        </div>
      ))}
      {c.whatsapp && <TactileAnchor href={waLink(c.whatsapp)} target="_blank" rel="noreferrer" variant="neon" size="lg" block>Chat on WhatsApp</TactileAnchor>}
      {cat && <div className="stack gap8 hoursbox">
        <span className="mono neon">Opening hours</span>
        {hoursSummary(cat.hours).map((h) => <div key={h.days} className="row between small"><span style={{ opacity: .75 }}>{h.days}</span><b>{h.time}</b></div>)}
        {c.hours_note && <span className="caption" style={{ color: "rgba(255,255,255,.55)" }}>{c.hours_note}</span>}
      </div>}
      <Socials links={c} />
    </div>
  );
}

function ServiceSelect({ value, onChange, cat }: { value: string; onChange: (v: string) => void; cat: Catalog | null }) {
  return (
    <div className="field">
      <label htmlFor="service">Service of interest</label>
      <select id="service" className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Not sure yet</option>
        {cat?.categories.map((c) => (
          <optgroup key={c.slug} label={c.name}>{cat.services.filter((s) => s.category === c.slug).map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}</optgroup>
        ))}
      </select>
    </div>
  );
}

function useEnquiry<T extends Record<string, string>>(init: T, kind: "general" | "quote") {
  const [f, setF] = useState(init);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const started = useRef(Date.now());
  const set = (k: keyof T) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setState("sending");
    try { await api("/enquiries", { body: { ...f, kind, startedAt: started.current } }); setState("sent"); }
    catch (err: any) { setError(err.message); setState("idle"); }
  };
  return { f, setF, set, state, error, submit };
}

const Honeypot = ({ value, onChange }: { value: string; onChange: (e: { target: { value: string } }) => void }) =>
  <input tabIndex={-1} autoComplete="off" aria-hidden style={{ position: "absolute", left: -9999 }} name="website" value={value} onChange={onChange} />;

export function Contact() {
  const cat = useCatalog();
  const site = useContent();
  const { f, setF, set, state, error, submit } = useEnquiry({ name: "", email: "", phone: "", service: "", topic: "General enquiry", message: "", website: "" }, "general");
  const map = site?.content.map_query;
  return (
    <PublicLayout title="Contact">
      <PageHero kicker="Contact" title="Talk to the studio." sub="Call, send a WhatsApp or use the form. We reply within one working day." />
      <section className="section" style={{ paddingTop: 40 }}><div className="wrap grid contactgrid" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,440px)", gap: 32, alignItems: "start" }}>
        <div className="stack gap24">
          {state === "sent" ? (
            <div className="card stack gap12" style={{ padding: 40 }}><span className="tag success" style={{ alignSelf: "flex-start" }}>Sent</span><h2 className="h3">Thanks, {f.name.split(" ")[0]}.</h2><p className="muted">Your message is with the studio team and a copy is in your inbox. We reply within one working day.</p></div>
          ) : (
            <form className="card stack gap20" onSubmit={submit} style={{ padding: 40 }}>
              <h2 className="h3">Send an enquiry</h2>
              <div className="grid cols-2" style={{ gap: 16 }}><Field label="Full name" name="name" required value={f.name} onChange={set("name")} /><Field label="Email" name="email" type="email" required value={f.email} onChange={set("email")} /></div>
              <div className="grid cols-2" style={{ gap: 16 }}><Field label="Phone number" name="phone" value={f.phone} onChange={set("phone")} placeholder="+234 803 000 0000" /><ServiceSelect cat={cat} value={f.service} onChange={(v) => setF({ ...f, service: v })} /></div>
              <Area label="Message" name="message" required value={f.message} onChange={set("message")} placeholder="Tell us about your project, the dates you have in mind and how many people are coming." />
              <Honeypot value={f.website} onChange={set("website")} />
              <ErrorBox error={error} />
              <div className="row gap16 wrapflex"><Btn arrow disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Send enquiry"}</Btn><Link to="/quote" className="link small">Need a quote instead?</Link></div>
            </form>
          )}
          {map && <iframe className="map" title="Map to the studio" loading="lazy" referrerPolicy="no-referrer-when-downgrade" src={`https://www.google.com/maps?q=${encodeURIComponent(map)}&output=embed`} />}
        </div>
        <ContactCard />
      </div></section>
    </PublicLayout>
  );
}

const BUDGETS = ["Under ₦250,000", "₦250,000 to ₦750,000", "₦750,000 to ₦2,000,000", "Over ₦2,000,000", "Not sure yet"];

export function Quote() {
  const cat = useCatalog();
  const [q] = useSearchParams();
  const { f, setF, set, state, error, submit } = useEnquiry({ name: "", email: "", phone: "", service: q.get("service") ?? "", budget: "", timeline: "", links: "", message: "", website: "" }, "quote");
  return (
    <PublicLayout title="Request a quote">
      <PageHero kicker="Quotes" title="Tell us what you are making." sub="For music videos, commercials, content days, albums and long projects. We reply with a quote within one working day." />
      <section className="section" style={{ paddingTop: 40 }}><div className="wrap grid contactgrid" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,400px)", gap: 32, alignItems: "start" }}>
        {state === "sent" ? (
          <div className="card stack gap12" style={{ padding: 40 }}><span className="tag success" style={{ alignSelf: "flex-start" }}>Request sent</span><h2 className="h3">Thanks, {f.name.split(" ")[0]}.</h2><p className="muted">We have your brief and a copy is in your inbox. Expect a quote within one working day.</p><div><TactileLink to="/portfolio" variant="light" size="lg">See recent work</TactileLink></div></div>
        ) : (
          <form className="card stack gap20" onSubmit={submit} style={{ padding: 40 }}>
            <div className="grid cols-2" style={{ gap: 16 }}><Field label="Full name" name="name" required value={f.name} onChange={set("name")} /><Field label="Email" name="email" type="email" required value={f.email} onChange={set("email")} /></div>
            <div className="grid cols-2" style={{ gap: 16 }}><Field label="Phone number" name="phone" value={f.phone} onChange={set("phone")} /><ServiceSelect cat={cat} value={f.service} onChange={(v) => setF({ ...f, service: v })} /></div>
            <Area label="Project details" name="message" required rows={6} value={f.message} onChange={set("message")} placeholder="What are you making, where, and what should the final result look or sound like?" />
            <div className="field"><label>Budget</label><div className="row gap8 wrapflex">{BUDGETS.map((b) => <button type="button" key={b} className={`chip ${f.budget === b ? "on" : ""}`} onClick={() => setF({ ...f, budget: b })}>{b}</button>)}</div></div>
            <div className="grid cols-2" style={{ gap: 16 }}>
              <Field label="Timeline or preferred dates" name="timeline" value={f.timeline} onChange={set("timeline")} placeholder="e.g. Shoot in early December" />
              <Field label="Reference links" name="links" value={f.links} onChange={set("links")} placeholder="YouTube, Instagram or Drive links" />
            </div>
            <Honeypot value={f.website} onChange={set("website")} />
            <ErrorBox error={error} />
            <div><Btn arrow disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Request a quote"}</Btn></div>
          </form>
        )}
        <div className="stack gap16">
          <div className="card stack gap16">
            <h3 className="h4">What happens next</h3>
            {[["1", "We read your brief", "A producer or director looks at what you need and asks anything that is unclear."], ["2", "You get a quote", "An itemised quote with crew, rooms, deliverables and dates."], ["3", "We book it in", "Approve the quote, pay the deposit and the dates are yours."]].map(([n, t, d]) => (
              <div key={n} className="row gap12" style={{ alignItems: "flex-start" }}><span className="stepnum">{n}</span><div><b>{t}</b><div className="small muted">{d}</div></div></div>
            ))}
          </div>
          <div className="panel small muted">Booking a room by the hour? You can <Link to="/book" className="link">book online</Link> with live availability.</div>
        </div>
      </div></section>
    </PublicLayout>
  );
}

export function Faq() {
  const site = useContent();
  return (
    <PublicLayout title="FAQs">
      <PageHero kicker="FAQs" title="Questions, answered." sub="How booking works, deposits, opening hours, rescheduling, crew and quotes." />
      <section className="section" style={{ paddingTop: 40 }}><div className="wrap stack gap24" style={{ maxWidth: 900 }}>
        {!site ? <Loading /> : <div className="faq">{site.faqs.map((q) => (
          <details key={q.id}><summary>{q.question}<Icon name="plus" size={18} /></summary><p className="muted">{q.answer}</p></details>
        ))}</div>}
        <div className="panel row between wrapflex gap16"><div className="stack gap4"><b>Still have a question?</b><span className="small muted">Message the studio and we will get back to you.</span></div><TactileLink to="/contact" size="lg">Contact us</TactileLink></div>
      </div></section>
    </PublicLayout>
  );
}

export function Legal({ slug }: { slug: "privacy" | "terms" }) {
  const site = useContent();
  const p = site?.policies.find((x) => x.slug === slug);
  return (
    <PublicLayout title={p?.title ?? (slug === "privacy" ? "Privacy policy" : "Terms of service")}>
      <PageHero kicker="Legal" title={p?.title ?? ""} sub={p ? `Last updated ${new Date(p.updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}` : ""} />
      <section className="section" style={{ paddingTop: 40 }}><div className="wrap" style={{ maxWidth: 860 }}>{!p ? <Loading /> : <RichText text={p.body} />}</div></section>
    </PublicLayout>
  );
}

export { PHOTOS };
