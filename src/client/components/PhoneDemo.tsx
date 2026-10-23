import { useEffect, useState, type CSSProperties } from "react";
import { Icon, Mark } from "./brand";
import { prefersStill, useInView } from "../lib/motion";

export interface DemoData {
  service: string; pkg: string; room: string; price: string; deposit: string | null; balance: string; tiles: string[];
  day: string; days: { wd: string; d: string }[]; dayIndex: number;
  slots: { label: string; booked?: boolean }[]; slotIndex: number; time: string; reference: string;
}

interface Phase { screen: number; tap?: string; held?: boolean; deposit?: boolean; paying?: boolean; ms: number }

const PHASES: Phase[] = [
  { screen: 0, ms: 1400 },
  { screen: 0, tap: "tile", ms: 500 },
  { screen: 1, ms: 1100 },
  { screen: 1, tap: "slot", held: true, ms: 1400 },
  { screen: 1, tap: "go", held: true, ms: 450 },
  { screen: 2, ms: 1000 },
  { screen: 2, tap: "dep", deposit: true, ms: 1100 },
  { screen: 2, tap: "pay", deposit: true, paying: true, ms: 1500 },
  { screen: 3, ms: 4200 },
];
const RESTING: Phase[] = [PHASES[0], PHASES[3], PHASES[6], PHASES[8]];

const TILES: [string, string][] = [["mic", "var(--neon)"], ["music", "var(--yellow)"], ["pencil", "var(--coral)"], ["star", "#c9b8ff"]];

/** A phone that plays the booking flow on a loop: pick a session, hold a time, pay, get the ticket. Pass screen to hold one step still. */
export function PhoneDemo({ data, screen, className, style }: { data: DemoData; screen?: number; className?: string; style?: CSSProperties }) {
  const [ref, inView] = useInView<HTMLDivElement>(0.2);
  const [i, setI] = useState(0);
  const auto = screen === undefined && !prefersStill();
  useEffect(() => {
    if (!auto || !inView) return;
    const t = window.setTimeout(() => setI((n) => (n + 1) % PHASES.length), PHASES[i].ms);
    return () => window.clearTimeout(t);
  }, [auto, inView, i]);
  const p = screen !== undefined ? RESTING[screen] : auto ? PHASES[i] : PHASES[0];
  const dep = !!data.deposit && !!p.deposit;
  const tap = (k: string) => (p.tap === k ? "tapped" : "");
  const at = (s: number) => (p.screen === s ? "on" : p.screen > s ? "past" : "");
  return (
    <div ref={ref} className={`phone ${className ?? ""}`} style={style} role="img" aria-label={`Booking ${data.service.toLowerCase()} on the Psych Records app`}>
      <div className="pscreen" aria-hidden>
        <div className="pisland" />
        <div className="pstatus"><b>9:41</b><span><i className="sig" /><i className="wifi" /><i className="bat" /></span></div>

        <div className={`pv ${at(0)}`}>
          <div className="pbar"><Mark tone="ink" size={28} /><b>Psych Records</b><span className="pav">AE</span></div>
          <p className="phi">Hi Amaka,</p>
          <h4 className="ptitle">What are we making today?</h4>
          <div className="ptiles">
            {TILES.map(([icon, bg], k) => (
              <div key={k} className={`ptile ${k === 0 ? tap("tile") : ""}`} style={{ background: bg }}><Icon name={icon} size={22} /><b>{data.tiles[k]}</b></div>
            ))}
          </div>
          <div className="pnext"><i />Next open: {data.day}, {data.time}<span>{data.room}</span></div>
        </div>

        <div className={`pv ${at(1)}`}>
          <div className="pback"><Icon name="arrow" size={16} /><div><b>{data.service}</b><span>{data.pkg} · {data.room}</span></div></div>
          <div className="pdays">
            {data.days.map((d, k) => <div key={d.wd + d.d} className={k === data.dayIndex ? "on" : ""}><span>{d.wd}</span><b>{d.d}</b></div>)}
          </div>
          <div className="pslots">
            {data.slots.map((s, k) => {
              const held = k === data.slotIndex && p.held;
              return (
                <div key={s.label} className={`pslot ${s.booked ? "off" : ""} ${held ? "held" : ""} ${k === data.slotIndex ? tap("slot") : ""}`}>
                  <span>{s.label}</span><em>{s.booked ? "Booked" : held ? "Held" : "Open"}</em>
                </div>
              );
            })}
          </div>
          <div className={`pheld ${p.held ? "on" : ""}`}><Icon name="clock" size={13} />Held for you · 14:59</div>
          <div className="pfoot"><div><b>{data.price}</b><span>{data.pkg}</span></div><span className={`pbtn ${tap("go")}`}>Continue</span></div>
        </div>

        <div className={`pv ${at(2)}`}>
          <div className="pback"><Icon name="arrow" size={16} /><div><b>Pay to confirm</b><span>Card, transfer or USSD</span></div></div>
          <div className="psum">
            <b>{data.service}</b>
            <span><Icon name="calendar" size={14} />{data.day} · {data.time}</span>
            <span><Icon name="door" size={14} />{data.room} · {data.pkg}</span>
            <div><span>Total</span><b>{data.price}</b></div>
          </div>
          {data.deposit && <div className={`popt ${dep ? "on" : ""} ${tap("dep")}`}><i /><div><b>Pay a deposit</b><span>Balance {data.balance} before the session</span></div><strong>{data.deposit}</strong></div>}
          <div className={`popt ${dep ? "" : "on"}`}><i /><div><b>Pay in full</b><span>Nothing more to pay</span></div><strong>{data.price}</strong></div>
          <span className={`pbtn pay ${tap("pay")} ${p.paying ? "busy" : ""}`}>{p.paying ? <><i className="spin" />Verifying with Paystack</> : <><Icon name="lock" size={14} />Pay {dep ? data.deposit : data.price}</>}</span>
          <p className="psecure">Secured by Paystack</p>
        </div>

        <div className={`pv pdone ${at(3)}`}>
          <div className="pcheck"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24" /><path d="M15 27l7.5 7.5L38 19" /></svg></div>
          <h4 className="ptitle">You're booked!</h4>
          <p className="psub">Your ticket is in your inbox.</p>
          <div className="pticket">
            <div className="pt-top"><span className="pt-brand"><Mark size={16} />Psych Records</span><span>{data.room}</span></div>
            <b>{data.service}</b>
            <div className="pt-grid"><div><span>Date</span><b>{data.day}</b></div><div><span>Start</span><b>{data.time}</b></div></div>
            <div className="pt-stub"><div><span>Ref</span><b>{data.reference}</b></div><i className="pt-code" /></div>
          </div>
          <p className="psub">{data.deposit ? `Balance of ${data.balance} due before your session.` : "Paid in full. See you in the room."}</p>
        </div>
      </div>
    </div>
  );
}
