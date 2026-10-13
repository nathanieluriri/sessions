import { useState } from "react";
import { Link } from "react-router-dom";
import { PublicLayout, PageHero, SectionHead } from "../components/Layout";
import { Icon } from "../components/brand";
import { Loading, Modal } from "../components/ui";
import { TactileAnchor, TactileLink } from "../components/kitchen";
import { Embed, embedFor } from "../components/content";
import { useCatalog, useContent } from "../lib/catalog";
import { naira } from "../lib/format";

export function Studio() {
  const cat = useCatalog();
  const site = useContent();
  const [photo, setPhoto] = useState<{ image_url: string; caption: string } | null>(null);
  const c = site?.content ?? {};
  const equipment = site?.equipment ?? [];
  const groups = [...new Set(equipment.map((e) => e.category))];
  const roomName = (id: string | null) => cat?.rooms.find((r) => r.id === id)?.name;
  return (
    <PublicLayout title="Studio and facilities">
      <PageHero kicker="Studio and facilities" title={c.studio_title ?? "Rooms built for sound and picture."} sub={c.studio_intro} />
      <section className="section" style={{ paddingTop: 40 }}><div className="wrap stack gap32">
        <SectionHead title="The rooms" sub="Every room comes with the crew who run it. Need longer? Add time at the room’s hourly rate." />
        {!cat ? <Loading /> : <div className="tiles cols-2">{cat.rooms.map((r) => {
          const cat2 = cat.packages.find((p) => p.room_id === r.id)?.service_category;
          return (
            <article key={r.id} className="tile2 roomtile" id={r.slug}>
              <div className="tile2-img" style={{ backgroundImage: `url(${r.image_url})` }} role="img" aria-label={r.name} />
              <div className="stack gap4"><h3 className="h3">{r.name}</h3><span className="muted">{r.kind} · up to {r.capacity} people</span></div>
              <p>{r.description}</p>
              <div className="row gap8 wrapflex">{r.features.map((f) => <span key={f} className="metachip">{f}</span>)}</div>
              <div className="tile2-foot">
                <span className="price-sm">{naira(r.hourly_kobo || cat.rules.extraHourKobo)}<span className="small muted"> per extra hour</span></span>
                <TactileLink to={cat2 ? `/packages#${cat2}` : "/packages"} variant="light" size="md">Packages for this room <Icon name="arrow" size={16} /></TactileLink>
              </div>
            </article>
          );
        })}</div>}
      </div></section>
      {groups.length > 0 && (
        <section className="section" style={{ background: "var(--surface)" }}><div className="wrap stack gap32">
          <SectionHead title="Equipment" sub="What is in each room. Ask us if you need something specific for your session." />
          <div className="specs">{groups.map((g) => (
            <div key={g} className="specrow">
              <h3 className="h4">{g}</h3>
              <div className="tiles cols-3">{equipment.filter((e) => e.category === g).map((e) => (
                <div key={e.id} className="spec">
                  <b>{e.name}</b>
                  <span className="small muted">{e.detail}</span>
                  {roomName(e.room_id) && <span className="spec-room">{roomName(e.room_id)}</span>}
                </div>
              ))}</div>
            </div>
          ))}</div>
        </div></section>
      )}
      {site && site.gallery.length > 0 && (
        <section className="section"><div className="wrap stack gap32">
          <SectionHead title="Inside the studio" sub="Tap a photo to see it larger." />
          <div className="mosaic">{site.gallery.map((g) => (
            <button key={g.id} type="button" className="tile" onClick={() => setPhoto(g)} style={{ backgroundImage: `url(${g.image_url})` }} aria-label={g.caption || "Studio photo"}>
              {g.caption && <span>{g.caption}</span>}
            </button>
          ))}</div>
        </div></section>
      )}
      <section className="section" style={{ paddingTop: 0 }}><div className="wrap stack gap24">
        {c.tour_url && (embedFor(c.tour_url)
          ? <div className="stack gap24"><SectionHead title="Virtual tour" sub="Walk through the rooms before you book." /><Embed url={c.tour_url} title="Virtual tour of the studio" /></div>
          : <div className="panel row between wrapflex gap16"><div className="stack gap4"><b>Take the virtual tour</b><span className="small muted">Walk through the rooms before you book.</span></div><TactileAnchor href={c.tour_url} target="_blank" rel="noreferrer" size="lg">Open the tour</TactileAnchor></div>)}
        <div className="ctaband">
          <div className="stack gap8"><h2 className="h2">Engineers, producers and crew included.</h2><p style={{ opacity: .75 }}>Every booking comes with the people who run the room. <Link to="/about#team" style={{ textDecoration: "underline" }}>Meet the team</Link>.</p></div>
          <div className="row gap12 wrapflex"><TactileLink to="/book" variant="neon" size="lg">Book a session</TactileLink><TactileLink to="/contact" variant="light" size="lg">Arrange a visit</TactileLink></div>
        </div>
      </div></section>
      {photo && <Modal title={photo.caption || "Studio photo"} onClose={() => setPhoto(null)}><img src={photo.image_url.replace(/w=\d+/, "w=1800")} alt={photo.caption} style={{ borderRadius: 14, width: "100%" }} /></Modal>}
    </PublicLayout>
  );
}
