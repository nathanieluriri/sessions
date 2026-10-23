import { Link, Navigate, useParams } from "react-router-dom";
import { PublicLayout, PageHero, waLink } from "../components/Layout";
import { Icon } from "../components/brand";
import { Eq } from "../components/art";
import { Loading } from "../components/ui";
import { TactileAnchor, TactileLink } from "../components/kitchen";
import { PackageCard, useStartBooking } from "./public";
import { WorkCard } from "./portfolio";
import { useCatalog, useContent, type Service } from "../lib/catalog";
import { canonicalService, fixedPackages, packagesOfService } from "../lib/booking";

export function ServiceTile({ s, premium }: { s: Service; premium?: boolean }) {
  return (
    <Link to={`/services/${s.slug}`} className={`svtile ${premium ? "premium" : ""}`}>
      <span className="img" style={{ backgroundImage: `url(${s.image_url})` }} role="img" aria-label={s.name}>{premium && <span className="svcbadge">Exclusive offer</span>}</span>
      <span className="body">
        <b>{s.name}</b>
        <span className="d">{s.description}</span>
        <span className="row between gap8"><span className="mono">{s.price_label}</span><span className="go">Details <Icon name="arrow" size={16} /></span></span>
      </span>
    </Link>
  );
}

export function Services() {
  const cat = useCatalog();
  return (
    <PublicLayout title="Services">
      <PageHero kicker="Services" title="Everything we make, and how to order it." sub="Book a recording session, order a beat or a mix online, or send a brief for a quote.">
        {cat && <div className="chips" style={{ marginTop: 8 }}>{cat.categories.map((c) => <a key={c.slug} href={`#${c.slug}`} className="chip">{c.name}</a>)}</div>}
      </PageHero>
      {!cat ? <Loading /> : cat.categories.map((c, i) => {
        const list = cat.services.filter((s) => s.category === c.slug);
        if (!list.length) return null;
        return (
          <section key={c.slug} id={c.slug} className="section catsec" style={{ background: i % 2 ? "var(--surface)" : undefined }}>
            <div className="wrap stack gap32">
              <div className="row between wrapflex gap16" style={{ alignItems: "flex-end" }}>
                <div className="stack gap8" style={{ maxWidth: 640 }}><span className="mono muted">{String(i + 1).padStart(2, "0")} · {list.length} services</span><h2 className="h1">{c.name}</h2><p className="muted" style={{ fontSize: 17 }}>{c.blurb}</p></div>
                <TactileLink to={`/packages#${c.slug}`} variant="light" size="lg">See prices</TactileLink>
              </div>
              <div className="grid cols-4 svgrid">{list.map((s) => <ServiceTile key={s.id} s={s} premium={c.slug === "exclusive"} />)}</div>
            </div>
          </section>
        );
      })}
      <section className="section"><div className="wrap"><div className="ctaband">
        <div className="stack gap8"><h2 className="h2">Not sure what you need?</h2><p style={{ opacity: .75 }}>Send a brief and a producer will recommend the right room, crew and package.</p></div>
        <div className="row gap12 wrapflex"><TactileLink to="/quote" variant="neon" size="lg">Request a quote</TactileLink><TactileLink to="/contact" variant="light" size="lg">Talk to us</TactileLink></div>
      </div></div></section>
    </PublicLayout>
  );
}

export function ServiceDetail() {
  const { slug = "" } = useParams();
  const cat = useCatalog();
  const site = useContent();
  const start = useStartBooking();
  const s = cat?.services.find((x) => x.slug === canonicalService(slug));
  if (canonicalService(slug) !== slug) return <Navigate to={`/services/${canonicalService(slug)}`} replace />;
  if (cat && !s) return <PublicLayout title="Service not found"><PageHero title="Service not found." sub="It may have been renamed or retired." ><div><TactileLink to="/services" size="lg">All services</TactileLink></div></PageHero></PublicLayout>;
  if (!cat || !s) return <PublicLayout><Loading /></PublicLayout>;
  const category = cat.categories.find((c) => c.slug === s.category);
  const packages = packagesOfService(cat, s).sort((a, b) => a.sort - b.sort);
  const bookable = fixedPackages(cat, s).length > 0;
  const work = site?.portfolio.filter((w) => w.category === s.category).slice(0, 3) ?? [];
  const wa = site?.content.whatsapp;
  return (
    <PublicLayout title={s.name}>
      <section className="svhero">
        <div className="wrap svhero-grid">
          <div className="stack gap20">
            <div className="crumbs small"><Link to="/services">Services</Link><span>/</span><Link to={`/services#${s.category}`}>{category?.name}</Link></div>
            <h1 className="display" style={{ fontSize: "clamp(34px,4.2vw,58px)" }}>{s.name}</h1>
            <p style={{ fontSize: 18 }} className="muted">{s.description}</p>
            <div className="row gap8 wrapflex">
              {s.price_label && <span className="metachip"><Icon name="card" size={16} />{s.price_label}</span>}
              {s.duration_label && <span className="metachip"><Icon name="clock" size={16} />{s.duration_label}</span>}
            </div>
            <div className="row gap12 wrapflex" style={{ marginTop: 4 }}>
              {bookable && <TactileLink to="#packages" size="lg" onClick={(e) => { e.preventDefault(); document.getElementById("packages")?.scrollIntoView({ behavior: "smooth" }); }}>See packages <Icon name="arrow" size={18} /></TactileLink>}
              {!bookable && <TactileLink to={`/quote?service=${encodeURIComponent(s.name)}`} variant="neon" size="lg">Request a quote</TactileLink>}
              {wa && <TactileAnchor href={waLink(wa, `Hi, I would like to ask about ${s.name}.`)} target="_blank" rel="noreferrer" variant="light" size="lg">WhatsApp</TactileAnchor>}
            </div>
          </div>
          <div className="svhero-img" style={{ backgroundImage: `url(${s.image_url})` }} role="img" aria-label={s.name} />
        </div>
      </section>
      <section className="section" style={{ paddingTop: 56 }}><div className="wrap grid" style={{ gridTemplateColumns: "minmax(0,1.3fr) minmax(0,1fr)", gap: 48, alignItems: "start" }} data-stack>
        <div className="stack gap16"><h2 className="h3">How it works</h2><p style={{ fontSize: 17, lineHeight: 1.65 }}>{s.details || s.description}</p></div>
        {s.deliverables.length > 0 && <div className="card stack gap16"><h3 className="h4">What you get</h3><ul className="ticklist">{s.deliverables.map((d) => <li key={d}><Eq />{d}</li>)}</ul></div>}
      </div></section>
      {s.gallery.length > 0 && <section className="section" style={{ paddingTop: 0 }}><div className="wrap gallery">{s.gallery.map((g) => <img key={g} src={g} alt={`${s.name} at the studio`} loading="lazy" />)}</div></section>}
      {packages.length > 0 && (
        <section className="section" id="packages" style={{ background: "var(--surface)", scrollMarginTop: 80 }}><div className="wrap stack gap24">
          <div className="stack gap8"><h2 className="h2">{packages.length > 1 ? "Choose a package" : "Package"}</h2><p className="muted">Prices, delivery and what happens next are shown on each card.</p></div>
          <div className="grid cols-3">{packages.map((p) => <PackageCard key={p.id} p={p} cat={cat} service={s} />)}</div>
          {fixedPackages(cat, s).length > 1 && <div><button className="link" onClick={() => start({ serviceSlug: s.slug })}>Compare packages in the booking flow →</button></div>}
        </div></section>
      )}
      {work.length > 0 && (
        <section className="section"><div className="wrap stack gap24">
          <div className="row between wrapflex gap12"><h2 className="h2">Recent work</h2><TactileLink to="/portfolio" variant="light" size="md">Full portfolio</TactileLink></div>
          <div className="grid cols-3">{work.map((w) => <WorkCard key={w.id} w={w} />)}</div>
        </div></section>
      )}
    </PublicLayout>
  );
}
