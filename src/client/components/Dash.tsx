import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Icon, Mark } from "./brand";
import { roleLabel, useAuth } from "../lib/auth";
import { addDays, initials, lagosToday, shortDate, t12 } from "../lib/format";
import { windowLabel } from "../lib/booking";
import { api } from "../lib/api";
import { Tactile } from "./kitchen";

export interface NavEntry { to: string; label: string; icon: string; locked?: boolean; end?: boolean }

export function DashShell({ items, dark, title, action, children }: { items: NavEntry[]; dark?: boolean; title: string; action?: ReactNode; children: ReactNode }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const out = async () => { await logout(); nav("/"); };
  const cls = (locked?: boolean) => ({ isActive }: { isActive: boolean }) => `navitem ${isActive ? "active" : ""} ${locked ? "locked" : ""}`;
  return (
    <div className="dash">
      <aside className={`side ${dark ? "dark" : ""}`}>
        <Link to="/" className="brandmark"><Mark tone={dark ? "neon" : "ink"} size={36} /> Psych Records</Link>
        <nav className="stack gap4">
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.end} className={cls(i.locked)} title={i.locked ? "You do not have access" : undefined}>
              <Icon name={i.locked ? "lock" : i.icon} />{i.label}
            </NavLink>
          ))}
        </nav>
        <div className="grow" />
        <div className="row gap12">
          <span className="avatar">{initials(user?.name ?? "")}</span>
          <div className="grow" style={{ minWidth: 0 }}><b className="small" style={{ display: "block" }}>{user?.name}</b><span className="caption" style={{ color: dark ? "rgba(255,255,255,.6)" : undefined }}>{user && roleLabel(user)}</span></div>
          <button className="link" onClick={out} aria-label="Log out" style={{ color: "inherit" }}><Icon name="logout" /></button>
        </div>
      </aside>
      <div style={{ minWidth: 0 }}>
        <header className="topbar">
          <h1 className="h3" style={{ fontSize: 22 }}>{title}</h1>
          <div className="row gap12">{action}<span className="menu-only"><Tactile variant="light" size="sm" onClick={out}>Log out</Tactile></span></div>
        </header>
        <div className="mobtabs">
          {items.map((i) => <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => `${isActive ? "active" : ""} ${i.locked ? "locked" : ""}`}>{i.locked && <Icon name="lock" size={14} />}{i.label}</NavLink>)}
        </div>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}

export function Restricted({ what }: { what: string }) {
  return (
    <div className="card stack gap12" style={{ alignItems: "flex-start", padding: 40 }}>
      <span style={{ width: 48, height: 48, borderRadius: 14, background: "var(--surface)", display: "grid", placeItems: "center" }}><Icon name="shield" /></span>
      <h2 className="h3">You do not have access to {what}.</h2>
      <p className="muted">Your account does not include this permission. The CEO can grant it from Staff and permissions. The server enforces this too, so the data is never sent to your browser.</p>
    </div>
  );
}

export const Stat = ({ label, value, note }: { label: string; value: ReactNode; note?: string }) => (
  <div className="stat"><span className="mono muted">{label}</span><b>{value}</b>{note && <span className="caption">{note}</span>}</div>
);

export const Empty = ({ children }: { children: ReactNode }) => <div className="panel muted" style={{ textAlign: "center" }}>{children}</div>;

export function SlotPicker({ duration, room, packageId, value, onChange, days: count = 21, from }: { duration: number; room?: string | null; packageId?: string | null; value: { date: string; start: number } | null; onChange: (v: { date: string; start: number }) => void; days?: number; from?: string }) {
  const today = lagosToday();
  const days = Array.from({ length: count }, (_, i) => addDays(from ?? today, from ? i : i + 1));
  const [date, setDate] = useState(value?.date ?? days[0]);
  const [slots, setSlots] = useState<{ start: number; end?: number; label?: string; available: boolean }[] | null>(null);
  const scope = packageId ? `package=${packageId}` : `duration=${duration}&room=${room ?? ""}`;
  useEffect(() => { setSlots(null); api(`/availability/day?date=${date}&${scope}`).then((r) => setSlots(r.slots)).catch(() => setSlots([])); }, [date, scope]);
  return (
    <div className="stack gap12">
      <div className="daypick">{days.map((d) => <button key={d} type="button" className={d === date ? "on" : ""} onClick={() => setDate(d)}>{shortDate(d)}</button>)}</div>
      {!slots ? <span className="muted small">Loading times…</span> : slots.length === 0 ? <span className="muted small">No open times on this day.</span> : (
        <div className="slotpick">{slots.map((s) => <button key={s.start} type="button" disabled={!s.available} className={value?.date === date && value.start === s.start ? "on" : ""} onClick={() => onChange({ date, start: s.start })}>{s.end != null ? windowLabel(date, s.start, s.end) : t12(s.start)}</button>)}</div>
      )}
    </div>
  );
}
