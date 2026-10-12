import { useState } from "react";
import { PublicLayout, PageHero } from "../components/Layout";
import { Icon } from "../components/brand";
import { Loading } from "../components/ui";
import { TactileLink } from "../components/kitchen";
import { Embed, embedFor } from "../components/content";
import { useCatalog, useContent, type Work } from "../lib/catalog";

export function WorkCard({ w }: { w: Work }) {
  const cat = useCatalog();
  const label = cat?.categories.find((c) => c.slug === w.category)?.name ?? w.category;
  return (
    <article className="work">
      {w.embed_url && embedFor(w.embed_url) ? <Embed url={w.embed_url} poster={w.image_url} title={w.title} /> : <div className="work-img" style={{ backgroundImage: `url(${w.image_url})` }} role="img" aria-label={w.title} />}
      <div className="stack gap8 work-body">
        <span className="mono muted">{label}{w.year ? ` · ${w.year}` : ""}</span>
        <h3 className="h4">{w.title}</h3>
        {w.client && <span className="small">{w.client}</span>}
        <p className="small muted">{w.description}</p>
        {w.link_url && <a className="link small row gap4" href={w.link_url} target="_blank" rel="noreferrer">View project <Icon name="arrow" size={14} /></a>}
      </div>
    </article>
  );
}

export function Portfolio() {
  const site = useContent();
  const cat = useCatalog();
  const [tab, setTab] = useState("all");
  const used = new Set(site?.portfolio.map((w) => w.category));
  const tabs = [{ slug: "all", name: "All work" }, ...(cat?.categories.filter((c) => used.has(c.slug)) ?? [])];
  const list = site?.portfolio.filter((w) => tab === "all" || w.category === tab) ?? [];
  return (
    <PublicLayout title="Portfolio">
      <PageHero kicker="Portfolio" title="Work made here." sub="Records, videos, podcasts and shoots from our rooms and crews." >
        <div className="chips" style={{ marginTop: 8 }}>{tabs.map((t) => <button key={t.slug} className={`chip ${tab === t.slug ? "on" : ""}`} onClick={() => setTab(t.slug)}>{t.name}</button>)}</div>
      </PageHero>
      <section className="section" style={{ paddingTop: 40 }}><div className="wrap stack gap32">
        {!site ? <Loading /> : list.length === 0 ? <div className="panel muted">No projects here yet.</div> : <div className="grid cols-3">{list.map((w) => <WorkCard key={w.id} w={w} />)}</div>}
        <div className="ctaband">
          <div className="stack gap8"><h2 className="h2">Make the next one with us.</h2><p style={{ opacity: .75 }}>Book a room online or send a brief for a production quote.</p></div>
          <div className="row gap12 wrapflex"><TactileLink to="/book" variant="neon" size="lg">Book a session</TactileLink><TactileLink to="/quote" variant="light" size="lg">Request a quote</TactileLink></div>
        </div>
      </div></section>
    </PublicLayout>
  );
}
