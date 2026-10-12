import { useState } from "react";
import { Link } from "react-router-dom";
import { PublicLayout, PageHero } from "../components/Layout";
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
      <section className="section" style={{ paddingTop: 40 }}><div className="wrap stack gap48">
        {!cat ? <Loading /> : cat.rooms.map((r, i) => (
          <article key={r.id} className={`room ${i % 2 ? "flip" : ""}`} id={r.slug}>
            <div className="room-img" style={{ backgroundImage: `url(${r.image_url})` }} role="img" aria-label={r.name} />
            <div className="stack gap16 room-body">
              <span className="mono muted">{String(i + 1).padStart(2, "0")} · {r.kind}</span>
              <h2 className="h1">{r.name}</h2>
              <p className="muted" style={{ fontSize: 17 }}>{r.description}</p>
              <div className="row gap8 wrapflex">{r.features.map((f) => <span key={f} className="metachip">{f}</span>)}</div>
              <div className="row gap24 wrapflex small">
                <span><span className="mono faint">Capacity</span><br /><b>Up to {r.capacity} people</b></span>
                <span><span className="mono faint">Extra time</span><br /><b>{naira(r.hourly_kobo || cat.rules.extraHourKobo)} per hour</b></span>
              </div>
              <div><TactileLink to="/packages" size="lg">Packages for this room <Icon name="arrow" size={18} /></TactileLink></div>
            </div>
          </article>
        ))}
      </div></section>
      {groups.length > 0 && (
        <section className="section" style={{ background: "var(--surface)" }}><div className="wrap stack gap32">
          <div className="stack gap8"><h2 className="h1">Equipment</h2><p className="muted">What is in each room. Ask us if you need something specific for your session.</p></div>
          <div className="grid cols-3">{groups.map((g) => (
            <div key={g} className="card stack gap12">
              <h3 className="h4">{g}</h3>
              {equipment.filter((e) => e.category === g).map((e) => (
                <div key={e.id} className="stack" style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                  <b className="small">{e.name}</b><span className="small muted">{e.detail}</span>{roomName(e.room_id) && <span className="caption">{roomName(e.room_id)}</span>}
                </div>
              ))}
            </div>
          ))}</div>
        </div></section>
      )}
      {site && site.gallery.length > 0 && (
        <section className="section"><div className="wrap stack gap32">
          <h2 className="h1">Inside the studio</h2>
          <div className="mosaic">{site.gallery.map((g) => (
            <button key={g.id} type="button" className="tile" onClick={() => setPhoto(g)} style={{ backgroundImage: `url(${g.image_url})` }} aria-label={g.caption || "Studio photo"}>
              {g.caption && <span>{g.caption}</span>}
            </button>
          ))}</div>
        </div></section>
      )}
      <section className="section" style={{ paddingTop: 0 }}><div className="wrap stack gap24">
        {c.tour_url && (embedFor(c.tour_url)
          ? <div className="stack gap16"><h2 className="h2">Virtual tour</h2><Embed url={c.tour_url} title="Virtual tour of the studio" /></div>
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
