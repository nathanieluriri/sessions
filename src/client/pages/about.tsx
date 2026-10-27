import { PublicLayout } from "../components/Layout";
import { Icon, Mark } from "../components/brand";
import { Loading } from "../components/ui";
import { TactileLink } from "../components/kitchen";
import { useContent } from "../lib/catalog";
import { initials } from "../lib/format";

export function About() {
  const site = useContent();
  if (!site) return <PublicLayout title="About us"><Loading /></PublicLayout>;
  const c = site.content;
  const points = (c.about_points ?? "").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const i = l.indexOf(":");
    return i > 0 ? [l.slice(0, i), l.slice(i + 1).trim()] : [l, ""];
  });
  return (
    <PublicLayout title="About us">
      <section className="abouthero">
        <div className="wrap abouthero-grid">
          <div className="stack gap20">
            <span className="mono muted">About {c.business_name}</span>
            <h1 className="display" style={{ fontSize: "clamp(36px,4.6vw,64px)" }}>{c.about_title}</h1>
            <p style={{ fontSize: 18, lineHeight: 1.6 }} className="muted">{c.about_intro}</p>
          </div>
          {c.about_image && <div className="abouthero-img" style={{ backgroundImage: `url(${c.about_image})` }} role="img" aria-label="Inside the studio" />}
        </div>
      </section>
      <section className="section" style={{ paddingTop: 40 }}><div className="wrap grid cols-3">
        {[["Vision", c.about_vision, "star"], ["Mission", c.about_mission, "megaphone"], ["How we work", c.about_philosophy, "check"]].filter(([, v]) => v).map(([t, v, i]) => (
          <div key={t} className="card stack gap12"><span className="cicon light"><Icon name={i!} /></span><h2 className="h4">{t}</h2><p className="muted">{v}</p></div>
        ))}
      </div></section>
      {points.length > 0 && (
        <section className="section darksec"><div className="wrap stack gap32">
          <div className="row gap12"><Mark tone="neon" size={44} lazy /><h2 className="h1">Why work with us</h2></div>
          <div className="grid cols-4">{points.map(([t, d]) => <div key={t} className="stack gap8 why"><b>{t}</b><span>{d}</span></div>)}</div>
        </div></section>
      )}
      {site.team.length > 0 && (
        <section className="section" id="team" style={{ scrollMarginTop: 80 }}><div className="wrap stack gap32">
          <div className="stack gap8"><h2 className="h1">The team</h2><p className="muted">Engineers, producers and crew who run every session.</p></div>
          <div className="grid cols-4">{site.team.map((m) => (
            <div key={m.id} className="person">
              {m.image_url ? <div className="person-img" style={{ backgroundImage: `url(${m.image_url})` }} role="img" aria-label={m.name} /> : <div className="person-img initials" aria-hidden>{initials(m.name)}</div>}
              <b>{m.name}</b><span className="mono muted">{m.role}</span><p className="small muted">{m.bio}</p>
            </div>
          ))}</div>
        </div></section>
      )}
      {site.testimonials.length > 0 && (
        <section className="section" id="reviews" style={{ background: "var(--surface)", scrollMarginTop: 80 }}><div className="wrap stack gap32">
          <h2 className="h1">What clients say</h2>
          <div className="grid cols-3">{site.testimonials.map((t) => (
            <figure key={t.id} className="card stack gap16 quotecard"><Icon name="quote" size={26} /><blockquote>{t.quote}</blockquote><figcaption><b>{t.name}</b>{t.role ? <span className="muted"> · {t.role}</span> : null}</figcaption></figure>
          ))}</div>
        </div></section>
      )}
      <section className="section"><div className="wrap"><div className="ctaband">
        <div className="stack gap8"><h2 className="h2">Come and see the rooms.</h2><p style={{ opacity: .75 }}>Book a session, or arrange a visit before you commit.</p></div>
        <div className="row gap12 wrapflex"><TactileLink to="/studio" variant="neon" size="lg">Studio and facilities</TactileLink><TactileLink to="/contact" variant="light" size="lg">Contact us</TactileLink></div>
      </div></div></section>
    </PublicLayout>
  );
}
