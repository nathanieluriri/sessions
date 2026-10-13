import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Icon, Mark, Socials } from "./brand";
import { useAuth } from "../lib/auth";
import { TactileAnchor, TactileLink } from "./kitchen";
import { useCatalog, useContent, type Catalog } from "../lib/catalog";
import { hm } from "../lib/format";

const LINKS: [string, string][] = [["/services", "Services"], ["/studio", "Studio"], ["/portfolio", "Portfolio"], ["/packages", "Pricing"], ["/about", "About"], ["/contact", "Contact"]];
const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Groups days with the same hours, e.g. "Mon to Sat · 10:00 to 22:00". */
export function hoursSummary(hours: Catalog["hours"]) {
  const week = [1, 2, 3, 4, 5, 6, 0].map((d) => hours.find((h) => h.weekday === d)).filter(Boolean) as Catalog["hours"];
  const out: { days: string; time: string }[] = [];
  for (let i = 0; i < week.length;) {
    let j = i;
    const key = (h: Catalog["hours"][number]) => (h.is_open ? `${h.open_min}-${h.close_min}` : "closed");
    while (j + 1 < week.length && key(week[j + 1]) === key(week[i])) j++;
    out.push({ days: i === j ? DAY[week[i].weekday] : `${DAY[week[i].weekday]} to ${DAY[week[j].weekday]}`, time: week[i].is_open ? `${hm(week[i].open_min)} to ${hm(week[i].close_min)}` : "Closed" });
    i = j + 1;
  }
  return out;
}

export function usePageTitle(title?: string) {
  const site = useContent();
  useEffect(() => {
    const name = site?.content.business_name ?? "Psych Records Entertainment";
    document.title = title ? `${title} | ${name}` : site?.content.seo_title ?? name;
  }, [title, site]);
}

export const waLink = (number: string, text = "Hi, I would like to ask about booking a session.") => `https://wa.me/${number.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;

export function Nav() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [glide, setGlide] = useState({ x: 0, w: 0, on: false });
  const links = useRef<HTMLDivElement>(null);
  const loc = useLocation();
  const home = user ? (user.role === "client" ? "/account" : "/admin") : "/login";
  const move = (el?: HTMLElement | null) => setGlide((g) => (el ? { x: el.offsetLeft, w: el.offsetWidth, on: true } : { ...g, on: false }));
  const rest = () => move(links.current?.querySelector<HTMLElement>("a.active"));
  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => {
    rest();
    document.fonts?.ready.then(rest);
    window.addEventListener("resize", rest);
    return () => window.removeEventListener("resize", rest);
  }, [loc.pathname]);
  useEffect(() => {
    document.body.classList.toggle("menu-open", open);
    return () => document.body.classList.remove("menu-open");
  }, [open]);
  const menu: [string, string][] = [["/", "Home"], ...LINKS, ["/faq", "FAQs"], ["/quote", "Request a quote"], [home, user ? "My account" : "Log in"]];
  return (
    <>
      <header className="nav">
        <div className="navin">
          <Link to="/" className="npill nlogo" aria-label="Psych Records Entertainment home"><Mark tone="neon" size={30} /><span>Psych Records</span></Link>
          <div className="npill nlinks" ref={links} onMouseLeave={rest}>
            <span className={`nglide ${glide.on ? "on" : ""}`} style={{ transform: `translateX(${glide.x}px)`, width: glide.w }} aria-hidden />
            {LINKS.map(([to, l]) => <NavLink key={to} to={to} onMouseEnter={(e) => move(e.currentTarget)} onFocus={(e) => move(e.currentTarget)} onBlur={rest} className={({ isActive }) => (isActive ? "active" : "")}>{l}</NavLink>)}
          </div>
          <div className="nright">
            <TactileLink to={home} variant="brand" size="md" className="nlogin">{user ? "My account" : "Log in"}</TactileLink>
            <TactileLink to="/book" variant="neon" size="md"><span>Book<span className="nlong"> a session</span></span></TactileLink>
            <button className="npill nmenu" onClick={() => setOpen(!open)} aria-label="Menu" aria-expanded={open}><Icon name={open ? "x" : "menu"} /></button>
          </div>
        </div>
      </header>
      <div className={`mmenu ${open ? "on" : ""}`} aria-hidden={!open}>
        {menu.map(([to, l], i) => <Link key={l} to={to} tabIndex={open ? 0 : -1} style={{ "--i": i } as CSSProperties}>{l}</Link>)}
      </div>
    </>
  );
}

function Announcement() {
  const site = useContent();
  const a = site?.announcements[0];
  const [hidden, setHidden] = useState(() => !!a && sessionStorage.getItem("psych.ann") === a.id);
  useEffect(() => { if (a) setHidden(sessionStorage.getItem("psych.ann") === a.id); }, [a]);
  if (!a || hidden) return null;
  const close = () => { sessionStorage.setItem("psych.ann", a.id); setHidden(true); };
  return (
    <div className="announce" role="region" aria-label="Announcement">
      <div className="wrap row gap12">
        <span className="grow"><b>{a.title}</b>{a.body ? <span className="hide-m"> · {a.body}</span> : null}{a.link_url && <> <Link to={a.link_url} className="announce-link">{a.link_label || "Learn more"}</Link></>}</span>
        <button className="link" onClick={close} aria-label="Dismiss announcement"><Icon name="x" size={16} /></button>
      </div>
    </div>
  );
}

function FootLinks({ title, links }: { title: string; links: [string, string][] }) {
  return <div className="fcol"><h4>{title}</h4>{links.map(([to, l]) => <Link key={to} to={to}><Icon name="northeast" size={14} />{l}</Link>)}</div>;
}

export function Footer() {
  const site = useContent();
  const cat = useCatalog();
  const c = site?.content ?? {};
  const year = new Date().getFullYear();
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="fgrid">
          <div className="fbrand">
            <Link to="/" className="flogo"><Mark tone="neon" size={36} /><span>Psych Records</span></Link>
            <p>{c.footer_blurb}</p>
          </div>
          <FootLinks title="Explore" links={[["/services", "Services"], ["/studio", "Studio and facilities"], ["/portfolio", "Portfolio"], ["/packages", "Pricing and packages"], ["/about", "About us"]]} />
          <FootLinks title="Help" links={[["/book", "Book a session"], ["/quote", "Request a quote"], ["/faq", "FAQs"], ["/packages#policies", "Booking policies"], ["/contact", "Contact"]]} />
          <div className="fcol">
            <h4>Visit</h4>
            {c.studio_address && <p><Icon name="pin" size={16} />{c.studio_address}</p>}
            {cat && hoursSummary(cat.hours).map((h) => <p key={h.days}><Icon name="clock" size={16} />{h.days} · {h.time}</p>)}
            {c.contact_phone && <a href={`tel:${c.contact_phone.replace(/\s/g, "")}`}><Icon name="phone" size={16} />{c.contact_phone}</a>}
            {c.contact_email && <a href={`mailto:${c.contact_email}`}><Icon name="mail" size={16} />{c.contact_email}</a>}
          </div>
        </div>
        <div className="fmid">
          <div className="fcol"><h4>Follow us</h4><Socials links={c} /></div>
          {c.whatsapp && <div className="fcol"><h4>Talk to us</h4><TactileAnchor variant="neon" size="md" href={waLink(c.whatsapp)} target="_blank" rel="noreferrer">WhatsApp the studio <Icon name="northeast" size={16} /></TactileAnchor></div>}
        </div>
        <div className="fbar">
          <span>© {year} {c.legal_name ?? "Psych Records Entertainment Limited"}</span>
          <div><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><Link to="/login">Client login</Link><Link to="/staff/login">Staff sign in</Link></div>
        </div>
      </div>
    </footer>
  );
}

export function PublicLayout({ children, title, bare }: { children: ReactNode; title?: string; bare?: boolean }) {
  usePageTitle(title);
  return <>{!bare && <Announcement />}<Nav /><main>{children}</main><Footer /></>;
}

export function PageHero({ title, sub, kicker, children }: { title: string; sub?: string; kicker?: string; children?: ReactNode }) {
  return (
    <section className="pagehero">
      <div className="wrap stack gap16">
        {kicker && <span className="mono muted">{kicker}</span>}
        <h1 className="display" style={{ fontSize: "clamp(36px,4.6vw,64px)", maxWidth: 960 }}>{title}</h1>
        {sub && <p className="muted" style={{ fontSize: 18, maxWidth: 660 }}>{sub}</p>}
        {children}
      </div>
    </section>
  );
}
