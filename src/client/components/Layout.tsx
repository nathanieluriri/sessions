import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Icon, Mark, Socials } from "./brand";
import { useAuth } from "../lib/auth";

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
          <Link to="/" className="brandmark"><Mark tone={dark ? "neon" : "ink"} /> Sessions <span className="badge">STUDIO</span></Link>
          <div className="links">
            {[["/", "Home"], ["/services", "Services"], ["/packages", "Packages & policies"], ["/contact", "Contact"]].map(([to, l]) => (
              <NavLink key={to} to={to} end className={({ isActive }) => (isActive ? "active" : "")}>{l}</NavLink>
            ))}
          </div>
          <div className="row gap20">
            <Link to={home} className="hide-m" style={{ fontWeight: 500 }}>{user ? "My account" : "Log in"}</Link>
            <Link to="/book" className={`btn sm ${dark ? "neon" : ""}`}>Book<span className="hide-m"> a session</span></Link>
            <button className="menu-btn btn sm neutral" onClick={() => setOpen(!open)} aria-label="Menu"><Icon name={open ? "x" : "menu"} /></button>
          </div>
        </div>
      </nav>
      {open && (
        <div className="mobile-menu">
          <Link to="/">Home</Link><Link to="/services">Services</Link><Link to="/packages">Packages & policies</Link><Link to="/contact">Contact</Link><Link to={home}>{user ? "My account" : "Log in"}</Link>
        </div>
      )}
    </>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="wrap stack gap48">
        <div className="cols">
          <div className="stack gap20">
            <Mark size={44} />
            <h3 className="h3">Sessions Studio</h3>
            <p style={{ maxWidth: 360 }}>A professional recording studio in Lekki, Lagos. Book real studio time, pay securely and walk in ready to record.</p>
            <Socials />
          </div>
          <div><div className="mono h">Explore</div><Link to="/services">Services</Link><Link to="/packages">Packages & pricing</Link><Link to="/packages#policies">Booking policies</Link><Link to="/book">Book a session</Link></div>
          <div><div className="mono h">Studio</div><p>14 Admiralty Way, Lekki Phase 1, Lagos</p><p>Mon to Sat · 10:00 to 22:00</p><p>Sun · 14:00 to 20:00</p></div>
          <div><div className="mono h">Contact</div><a href="tel:+2348125550142">+234 812 555 0142</a><a href="mailto:hello@sessionsstudio.ng">hello@sessionsstudio.ng</a><Link to="/login">Client login</Link></div>
        </div>
        <div className="row between wrapflex gap16" style={{ borderTop: "1px solid var(--brand-2)", paddingTop: 24 }}>
          <span className="mono" style={{ opacity: .5 }}>© 2026 Sessions Studio · Lagos</span>
          <Link to="/staff/login" className="small" style={{ margin: 0 }}>Staff sign in</Link>
        </div>
      </div>
    </footer>
  );
}

export function PublicLayout({ children, dark }: { children: ReactNode; dark?: boolean }) {
  return <><Nav dark={dark} /><main>{children}</main><Footer /></>;
}

export function PageHero({ title, sub }: { title: string; sub: string }) {
  return (
    <section style={{ background: "var(--surface)" }}>
      <div className="wrap stack gap16" style={{ paddingTop: 88, paddingBottom: 72 }}>
        <h1 className="display" style={{ fontSize: "clamp(40px,6vw,84px)", maxWidth: 1000 }}>{title}</h1>
        <p className="muted" style={{ fontSize: 18, maxWidth: 640 }}>{sub}</p>
      </div>
    </section>
  );
}
