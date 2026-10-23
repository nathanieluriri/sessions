import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Icon, Lockup, Mark, Socials } from "./brand";
import { useAuth } from "../lib/auth";
import { TactileAnchor, TactileLink } from "./kitchen";
import { useCatalog, useContent, type Catalog } from "../lib/catalog";
import { hm } from "../lib/format";
import { prefersStill } from "../lib/motion";
import { introPending } from "./Intro";

/** Page, label and the landing section the link scrolls to when on the home page. */
const LINKS: [string, string, string][] = [["/about", "About", "about"], ["/services", "Services", "services"], ["/studio", "Studio", "studio"], ["/portfolio", "Portfolio", "portfolio"], ["/packages", "Pricing", "pricing"], ["/contact", "Contact", "contact"]];
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

let navEntered = false;

type Glide = { x: number; w: number; on: boolean; snap?: boolean };
const OFF: Glide = { x: 0, w: 0, on: false };
const glideTo = (g: Glide, el?: HTMLElement | null): Glide => (el ? { x: el.offsetLeft, w: el.offsetWidth, on: true, snap: !g.on } : { ...g, on: false });
const glideStyle = (g: Glide): CSSProperties => ({ transform: `translateX(${g.x}px)`, width: g.w, ...(g.snap ? { transition: "opacity .25s ease" } : {}) });

/** Scrolls to a landing section, or to the top for an empty id. Modified clicks keep the browser default. */
const jumpTo = (id: string, after?: () => void) => (e: MouseEvent) => {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  after?.();
  document.body.classList.remove("menu-open");
  const behavior = prefersStill() ? "auto" : "smooth";
  if (!id) window.scrollTo({ top: 0, behavior });
  else document.getElementById(id)?.scrollIntoView({ behavior });
};

export function Nav() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [act, setAct] = useState(OFF);
  const [hov, setHov] = useState(OFF);
  const links = useRef<HTMLDivElement>(null);
  const loc = useLocation();
  const landing = loc.pathname === "/";
  const [enter] = useState(() => { const first = !navEntered; navEntered = true; return first; });
  const [late] = useState(() => landing && introPending());
  const home = user ? (user.role === "client" ? "/account" : "/admin") : "/login";
  const settle = () => setAct((g) => glideTo(g, links.current?.querySelector<HTMLElement>("a.active")));
  const hover = (el: HTMLElement) => setHov((g) => glideTo(g, el));
  const leave = () => setHov((g) => glideTo(g));
  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => {
    settle();
    document.fonts?.ready.then(settle);
    window.addEventListener("resize", settle);
    return () => window.removeEventListener("resize", settle);
  }, [loc.pathname]);
  useEffect(() => {
    document.body.classList.toggle("menu-open", open);
    return () => document.body.classList.remove("menu-open");
  }, [open]);
  const close = () => setOpen(false);
  const menu: [string, string, string][] = [["/", "Home", ""], ...LINKS, ["/faq", "FAQs", "faqs"], ["/quote", "Request a quote", ""], [home, user ? "My account" : "Log in", ""]];
  const hoverProps = { onMouseEnter: (e: MouseEvent<HTMLElement>) => hover(e.currentTarget), onFocus: (e: { currentTarget: HTMLElement }) => hover(e.currentTarget), onBlur: leave };
  return (
    <>
      <header className={`nav ${enter ? "enter" : ""}`} style={late ? ({ "--nd": "2.2s" } as CSSProperties) : undefined}>
        <div className="navin">
          <Link to="/" className="npill nlogo" aria-label="Psych Records Entertainment home" onClick={landing ? jumpTo("") : undefined}><Mark tone="neon" size={40} /><span>Psych Records</span></Link>
          <div className="npill nlinks" ref={links} onMouseLeave={leave}>
            <span className={`nglide nhover ${hov.on ? "on" : ""}`} style={glideStyle(hov)} aria-hidden />
            <span className={`nglide ${act.on ? "on" : ""}`} style={glideStyle(act)} aria-hidden />
            {LINKS.map(([to, l]) => <NavLink key={to} to={to} className={({ isActive }) => (isActive ? "active" : "")} {...hoverProps}>{l}</NavLink>)}
          </div>
          <div className="nright">
            <TactileLink to={home} variant="light" size="md" className="nlogin">{user ? "My account" : "Log in"}</TactileLink>
            <TactileLink to="/book" variant="neon" size="md"><span>Book<span className="nlong"> a session</span></span></TactileLink>
            <button className="npill nmenu" onClick={() => setOpen(!open)} aria-label="Menu" aria-expanded={open}><Icon name={open ? "x" : "menu"} /></button>
          </div>
        </div>
      </header>
      <div className={`mmenu ${open ? "on" : ""}`} aria-hidden={!open}>
        {menu.map(([to, l, sec], i) => {
          const style = { "--i": i } as CSSProperties, tab = open ? 0 : -1;
          return landing && to === "/"
            ? <a key={l} href={`#${sec}`} tabIndex={tab} style={style} onClick={jumpTo(sec, close)}>{l}</a>
            : <Link key={l} to={to} tabIndex={tab} style={style}>{l}</Link>;
        })}
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

const Arrow = () => <span className="farrow" aria-hidden><Icon name="northeast" size={14} /><Icon name="northeast" size={14} /></span>;

function FootLinks({ title, links }: { title: string; links: [string, string][] }) {
  return <div className="fcol"><h4>{title}</h4>{links.map(([to, l]) => <Link key={to} to={to}><Arrow />{l}</Link>)}</div>;
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
            <Link to="/" className="flogo"><Lockup width={340} /></Link>
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
