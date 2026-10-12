import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Icon, Mark, Socials } from "./brand";
import { useAuth } from "../lib/auth";
import { TactileLink } from "./kitchen";
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

export function Nav({ dark }: { dark?: boolean }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  const home = user ? (user.role === "client" ? "/account" : "/admin") : "/login";
  return (
    <>
      <nav className={`nav ${dark ? "dark" : ""}`}>
        <div className="wrap row between">
          <Link to="/" className="brandmark" aria-label="Psych Records Entertainment home"><Mark tone={dark ? "neon" : "ink"} /> Psych Records <span className="badge">ENTERTAINMENT</span></Link>
          <div className="links">
            {LINKS.map(([to, l]) => <NavLink key={to} to={to} className={({ isActive }) => (isActive ? "active" : "")}>{l}</NavLink>)}
          </div>
          <div className="row gap20">
            <Link to={home} className="hide-m" style={{ fontWeight: 500 }}>{user ? "My account" : "Log in"}</Link>
            <TactileLink to="/book" variant={dark ? "neon" : "brand"} size="md"><span>Book<span className="hide-m"> a session</span></span></TactileLink>
            <button className="menu-btn" onClick={() => setOpen(!open)} aria-label="Menu" aria-expanded={open}><Icon name={open ? "x" : "menu"} /></button>
          </div>
        </div>
      </nav>
      {open && (
        <div className="mobile-menu">
          {[["/", "Home"], ...LINKS, ["/faq", "FAQs"], ["/quote", "Request a quote"]].map(([to, l]) => <Link key={to} to={to}>{l}</Link>)}
          <Link to={home}>{user ? "My account" : "Log in"}</Link>
        </div>
      )}
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

export function WhatsAppButton() {
  const site = useContent();
  const n = site?.content.whatsapp;
  if (!n) return null;
  return (
    <a className="wa-float" href={waLink(n)} target="_blank" rel="noreferrer" aria-label="Chat with the studio on WhatsApp">
      <svg viewBox="0 0 24 24" aria-hidden><path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.21 3.08.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.69.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35M12.04 21.8h-.01a9.8 9.8 0 0 1-4.99-1.37l-.36-.21-3.71.97.99-3.62-.23-.37a9.78 9.78 0 0 1-1.5-5.22c0-5.41 4.41-9.81 9.82-9.81 2.62 0 5.08 1.02 6.93 2.88a9.75 9.75 0 0 1 2.87 6.94c0 5.41-4.41 9.81-9.81 9.81m8.35-18.16A11.73 11.73 0 0 0 12.04.2C5.53.2.24 5.49.24 12c0 2.08.54 4.11 1.58 5.9L.14 24l6.25-1.64a11.8 11.8 0 0 0 5.64 1.44h.01c6.5 0 11.8-5.29 11.8-11.8 0-3.15-1.23-6.11-3.45-8.34" /></svg>
    </a>
  );
}

export function Footer() {
  const site = useContent();
  const cat = useCatalog();
  const c = site?.content ?? {};
  const year = new Date().getFullYear();
  return (
    <footer className="footer">
      <div className="wrap stack gap48">
        <div className="cols">
          <div className="stack gap20">
            <Mark size={44} />
            <h3 className="h3">{c.business_name ?? "Psych Records Entertainment"}</h3>
            <p style={{ maxWidth: 380 }}>{c.footer_blurb}</p>
            <Socials links={c} />
          </div>
          <div><div className="mono h">Explore</div>{[["/services", "Services"], ["/studio", "Studio and facilities"], ["/portfolio", "Portfolio"], ["/packages", "Pricing and packages"], ["/about", "About us"]].map(([to, l]) => <Link key={to} to={to}>{l}</Link>)}</div>
          <div><div className="mono h">Help</div>{[["/book", "Book a session"], ["/quote", "Request a quote"], ["/faq", "FAQs"], ["/packages#policies", "Booking policies"], ["/contact", "Contact"]].map(([to, l]) => <Link key={to} to={to}>{l}</Link>)}</div>
          <div>
            <div className="mono h">Visit</div>
            {c.studio_address && <p>{c.studio_address}</p>}
            {cat && hoursSummary(cat.hours).map((h) => <p key={h.days}>{h.days} · {h.time}</p>)}
            {c.contact_phone && <a href={`tel:${c.contact_phone.replace(/\s/g, "")}`}>{c.contact_phone}</a>}
            {c.contact_email && <a href={`mailto:${c.contact_email}`}>{c.contact_email}</a>}
            {c.whatsapp && <a href={waLink(c.whatsapp)} target="_blank" rel="noreferrer">WhatsApp us</a>}
          </div>
        </div>
        <div className="row between wrapflex gap16 footbar">
          <span className="mono" style={{ opacity: .5 }}>© {year} {c.legal_name ?? "Psych Records Entertainment Limited"}</span>
          <div className="row gap20 wrapflex"><Link to="/privacy" className="small">Privacy</Link><Link to="/terms" className="small">Terms</Link><Link to="/login" className="small">Client login</Link><Link to="/staff/login" className="small">Staff sign in</Link></div>
        </div>
      </div>
    </footer>
  );
}

export function PublicLayout({ children, dark, title }: { children: ReactNode; dark?: boolean; title?: string }) {
  usePageTitle(title);
  return <><Announcement /><Nav dark={dark} /><main>{children}</main><Footer /><WhatsAppButton /></>;
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
