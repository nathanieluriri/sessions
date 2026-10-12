import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { PublicLayout, PageHero } from "../components/Layout";
import { Icon, Socials } from "../components/brand";
import { Area, Btn, ErrorBox, Field, Loading } from "../components/ui";
import { PHOTOS, useCatalog, useContent, type Package, type Service } from "../lib/catalog";
import { hrs, naira } from "../lib/format";
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
      <Btn kind={f ? "neon" : "primary"} arrow block onClick={onBook}>Book this package</Btn>
    </div>
  );
}

export function useStartBooking() {
  const nav = useNavigate();
  return (patch: { serviceSlug?: string; packageId?: string }) => { saveDraft({ ...loadDraft(), ...patch, holdId: undefined }); nav(patch.serviceSlug ? "/book/package" : "/book"); };
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
