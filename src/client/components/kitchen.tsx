// Components ported from dqnamo's Kitchen (dqnamo.com/kitchen) to plain React and CSS, without the motion and tilt libraries.
import {
  useEffect, useLayoutEffect, useRef, useState,
  type AnchorHTMLAttributes, type ButtonHTMLAttributes, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject,
} from "react";
import { Link, type LinkProps } from "react-router-dom";
import { Mark } from "./brand";

const still = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const px = (v: number | string) => (typeof v === "number" ? `${v}px` : v);

/* Tactile button */

export type TactileVariant = "brand" | "ink" | "neon" | "light" | "coral" | "yellow" | "danger";
interface TactileLook { variant?: TactileVariant; size?: "sm" | "md" | "lg"; shallow?: boolean; block?: boolean; className?: string }
const tactileClass = ({ variant = "brand", size = "md", shallow, block, className }: TactileLook) =>
  ["tactile", `t-${variant}`, `t-${size}`, shallow && "t-shallow", block && "t-block", className].filter(Boolean).join(" ");
const Face = ({ children }: { children: ReactNode }) => <><span className="tb" aria-hidden="true" /><span className="tf">{children}</span></>;

export function Tactile({ variant, size, shallow, block, className, children, ...p }: TactileLook & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={tactileClass({ variant, size, shallow, block, className })} {...p}><Face>{children}</Face></button>;
}
export function TactileLink({ variant, size, shallow, block, className, children, ...p }: TactileLook & Omit<LinkProps, "className">) {
  return <Link className={tactileClass({ variant, size, shallow, block, className })} {...p}><Face>{children}</Face></Link>;
}
export function TactileAnchor({ variant, size, shallow, block, className, children, ...p }: TactileLook & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a className={tactileClass({ variant, size, shallow, block, className })} {...p}><Face>{children}</Face></a>;
}

/* Scramble text */

const SCRAMBLE = "-_~`!@#$%^&*()+=[]{}|;:,.<>?";
const scramble = (chars: string[], shown: number) =>
  chars.map((c, i) => (i < shown || !c.trim() ? c : SCRAMBLE[Math.floor(Math.random() * SCRAMBLE.length)])).join("");

export function ScrambleText({ children, className, intervalMs = 32 }: { children: string; className?: string; intervalMs?: number }) {
  const [text, setText] = useState(children);
  useEffect(() => {
    const chars = Array.from(children);
    if (!chars.length || intervalMs <= 0 || still()) { setText(children); return; }
    const step = Math.max(1, Math.ceil(chars.length / 48));
    let shown = 0;
    setText(scramble(chars, 0));
    const timer = window.setInterval(() => {
      shown = Math.min(chars.length, shown + step);
      setText(scramble(chars, shown));
      if (shown >= chars.length) window.clearInterval(timer);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [children, intervalMs]);
  return <span className={`scramble ${className ?? ""}`}><span aria-hidden="true">{text}</span><span className="sr-only">{children}</span></span>;
}

/* Ticket */

const TILT_MEDIA = "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)";

export function Ticket({ body, stub, paper = "#ff633f", ink = "#171714", notch = 13, corner = 0, stubHeight = "24%", label, className, style }: {
  body: ReactNode; stub: ReactNode; paper?: string; ink?: string; notch?: number | string; corner?: number | string; stubHeight?: number | string; label?: string; className?: string; style?: CSSProperties;
}) {
  const tilt = useRef<HTMLDivElement>(null);
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const el = tilt.current;
    if (!el || !window.matchMedia(TILT_MEDIA).matches) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(1100px) rotateX(${(-y * 12).toFixed(2)}deg) rotateY(${(x * 12).toFixed(2)}deg) scale(1.018)`;
  };
  const leave = () => { if (tilt.current) tilt.current.style.transform = ""; };
  const vars = { "--tk-corner": px(corner), "--tk-notch": px(notch), "--tk-stub": px(stubHeight), "--tk-paper": paper, "--tk-ink": ink, ...style } as CSSProperties;
  return (
    <div className={`kticket ${className ?? ""}`} style={vars} onPointerMove={move} onPointerLeave={leave}>
      <div className="kt-tilt" ref={tilt}>
        <article className="kt-paper" aria-label={label} aria-hidden={label ? undefined : true}>
          <div className="kt-body">{body}<span className="kt-perf" aria-hidden="true" /></div>
          <div className="kt-stub">{stub}</div>
        </article>
      </div>
    </div>
  );
}

export function TicketPattern({ size = 11 }: { size?: number }) {
  const c = (size - 1) / 2, max = Math.hypot(c, c);
  return (
    <svg className="kt-pattern" viewBox={`0 0 ${size * 10} ${size * 10}`} aria-hidden="true">
      {Array.from({ length: size * size }, (_, i) => {
        const x = i % size, y = Math.floor(i / size), k = 1 - Math.hypot(x - c, y - c) / max, s = 1.4 + 3.6 * k * k;
        return <rect key={i} x={x * 10 + 5 - s / 2} y={y * 10 + 5 - s / 2} width={s} height={s} fill="currentColor" opacity={0.22 + 0.78 * k} />;
      })}
    </svg>
  );
}

export const Barcode = ({ className }: { className?: string }) => <span className={`barcode ${className ?? ""}`} aria-hidden="true" />;

/* Receipt printer */

export type PrinterStage = "processing" | "printing" | "complete";
const TEETH = 40, TOOTH = 4;
const paperClip = `polygon(0 0, 100% 0, 100% calc(100% - ${TOOTH}px), ${Array.from({ length: TEETH * 2 }, (_, i) =>
  `${100 - ((i + 1) * 100) / (TEETH * 2)}% ${i % 2 === 0 ? "100%" : `calc(100% - ${TOOTH}px)`}`).join(", ")})`;
const STAGE_LABEL: Record<PrinterStage, string> = { processing: "Processing your order", printing: "Printing your receipt", complete: "Order complete" };

export function ReceiptPrinter({ stage, header, screen, labels, children, className }: {
  stage: PrinterStage; header?: ReactNode; screen: ReactNode; labels?: Partial<Record<PrinterStage, string>>; children: ReactNode; className?: string;
}) {
  const label = { ...STAGE_LABEL, ...labels }[stage];
  return (
    <section className={`printer ${className ?? ""}`} data-stage={stage} aria-label="Receipt printer">
      <div className="pr-machine">
        {header && <div className="pr-head">{header}</div>}
        <div className="pr-screen">
          <div className="pr-screen-in">
            {screen}
            <div className="pr-status">
              <span className={`pr-ind ${stage === "complete" ? "done" : ""}`} aria-hidden="true">
                {stage === "complete"
                  ? <svg viewBox="0 0 24 24" key="done"><circle cx="12" cy="12" r="10" fill="currentColor" /><path d="M7.5 12.4l3 3 6-6.4" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  : <svg viewBox="0 0 24 24" key="busy" className="pr-spin"><path d="M12 3a9 9 0 1 0 9 9" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>}
              </span>
              <span className="pr-label" key={stage} role="status" aria-live="polite">{label}</span>
            </div>
          </div>
        </div>
        <span className="pr-slot" aria-hidden="true" />
      </div>
      <div className="pr-out">
        {stage !== "processing" && <span className="pr-shade" aria-hidden="true" />}
        <div className="pr-feed" aria-hidden={stage !== "complete"}>
          <article className="pr-paper" style={{ clipPath: paperClip }}>{children}</article>
        </div>
      </div>
    </section>
  );
}

/* Cassette */

const SPOKES = [0, 60, 120, 180, 240, 300];
const Reel = ({ side }: { side: "l" | "r" }) => (
  <div className={`cs-reel ${side}`} aria-hidden="true">
    <svg viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="48" className="cs-reel-face" />
      {SPOKES.map((r) => <path key={r} d="M46 3h8v9a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2z" transform={`rotate(${r} 50 50)`} className="cs-tooth" />)}
      <circle cx="50" cy="50" r="48" className="cs-reel-ring" />
    </svg>
  </div>
);

export function Cassette({ kicker, title, side = "Side A", catalogue, progress, elapsed, total, playing }: {
  kicker: string; title: string; side?: string; catalogue: string; progress: number; elapsed: string; total: string; playing: boolean;
}) {
  const vars = { "--left-tape": 1 - 0.4 * progress, "--right-tape": 0.6 + 0.4 * progress } as CSSProperties;
  return (
    <div className={`cassette ${playing ? "playing" : ""}`} style={vars} role="img" aria-label={`${title} cassette, ${elapsed} of ${total}`}>
      <div className="cs-shell">
        <span className="cs-rim" /><span className="cs-noise" />
        {["tl", "tr", "bl", "br"].map((p) => <span key={p} className={`cs-screw ${p}`}><i /><i /></span>)}
        <div className="cs-label">
          <div className="cs-top">
            <div className="cs-titles"><span className="cs-kicker">{kicker}</span><span className="cs-title">{title}</span></div>
            <div className="cs-meta"><span className="cs-side">{side}</span><span className="cs-cat">{catalogue}</span></div>
          </div>
          <div className="cs-mid">
            <div className="cs-stripes"><span /><span /><span /></div>
            <div className="cs-window">
              <span className="cs-noise soft" />
              <div className="cs-tape"><span className="cs-spool l" /><span className="cs-spool r" />{[0, 1, 2, 3, 4].map((i) => <i key={i} />)}</div>
              <Reel side="l" /><Reel side="r" />
            </div>
          </div>
          <div className="cs-progress">
            <div className="cs-track"><span className="cs-fill" style={{ width: `${progress * 100}%` }} /><span className="cs-thumb" style={{ left: `${progress * 100}%` }} /></div>
            <div className="cs-times"><span>{elapsed}</span><span>{total}</span></div>
          </div>
          <span className="cs-label-rim" />
        </div>
        <div className="cs-controls">
          <span className="cs-btn"><svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.6-5.9M4 4v5h5" /></svg></span>
          <span className="cs-btn big">{playing ? <svg viewBox="0 0 24 24"><path d="M8 5h3v14H8zM13 5h3v14h-3z" className="fill" /></svg> : <svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z" className="fill" /></svg>}</span>
          <span className="cs-btn"><svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /></svg></span>
        </div>
      </div>
    </div>
  );
}

/* Scroll fade list */

export function ScrollFadeList<T>({ items, getKey, renderItem, height = 320, maxFade = 76, className, scrollRef }: {
  items: readonly T[]; getKey: (item: T) => string; renderItem: (item: T) => ReactNode; height?: number; maxFade?: number; className?: string; scrollRef?: RefObject<HTMLDivElement>;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const own = useRef<HTMLDivElement>(null);
  const scroll = scrollRef ?? own;
  useEffect(() => {
    const f = frame.current, s = scroll.current;
    if (!f || !s) return;
    let raf = 0;
    const update = () => {
      const max = Math.max(0, s.scrollHeight - s.clientHeight);
      f.style.setProperty("--top-fade", `${Math.min(maxFade, s.scrollTop)}px`);
      f.style.setProperty("--bottom-fade", `${Math.min(maxFade, Math.max(0, max - s.scrollTop))}px`);
    };
    const queue = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); };
    update();
    s.addEventListener("scroll", queue, { passive: true });
    const ro = new ResizeObserver(queue);
    ro.observe(s);
    if (s.firstElementChild) ro.observe(s.firstElementChild);
    return () => { cancelAnimationFrame(raf); s.removeEventListener("scroll", queue); ro.disconnect(); };
  }, [maxFade, scroll, items.length]);
  return (
    <div className={`sfl ${className ?? ""}`} ref={frame}>
      <div className="sfl-scroll" ref={scroll} style={{ height }}>
        <ul>{items.map((item) => <li key={getKey(item)}>{renderItem(item)}</li>)}</ul>
      </div>
    </div>
  );
}

/* Dynamic button */

interface Slot { key: string; label: string; icon?: ReactNode }

export function DynamicButton({ children, icon, stateKey, variant = "primary", className, ...p }: {
  children: string; icon?: ReactNode; stateKey?: string; variant?: "primary" | "secondary";
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const button = useRef<HTMLButtonElement>(null);
  const measure = useRef<HTMLSpanElement>(null);
  const key = stateKey ?? children;
  const current = useRef<Slot>({ key, label: children, icon });
  const [leaving, setLeaving] = useState<Slot | null>(null);
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (current.current.key !== key) {
      setLeaving(current.current);
      const t = window.setTimeout(() => setLeaving(null), 180);
      current.current = { key, label: children, icon };
      return () => window.clearTimeout(t);
    }
    current.current = { key, label: children, icon };
  }, [key, children, icon]);
  useLayoutEffect(() => {
    const b = button.current, m = measure.current;
    if (!b || !m) return;
    const s = getComputedStyle(b);
    setWidth(Math.ceil(m.scrollWidth + parseFloat(s.paddingLeft) + parseFloat(s.paddingRight) + parseFloat(s.borderLeftWidth) + parseFloat(s.borderRightWidth)));
  }, [key, children]);
  const content = (slot: { label: string; icon?: ReactNode }) => <>{slot.icon && <span className="db-icon">{slot.icon}</span>}<span>{slot.label}</span></>;
  return (
    <button ref={button} type="button" className={`dynbtn ${variant} ${className ?? ""}`} style={{ width: width ?? undefined }} {...p}>
      <span className="db-stack">
        <span className="db-slot" key={key}>{content({ label: children, icon })}</span>
        {leaving && <span className="db-slot out" key={`${leaving.key}-out`}>{content(leaving)}</span>}
      </span>
      <span className="db-measure" ref={measure} aria-hidden="true">{content({ label: children, icon })}</span>
    </button>
  );
}

/* Playing cards */

export interface FanCard { id: string; index: string; title: string; image: string }

export function PlayingCard({ card, width = 128 }: { card: FanCard; width?: number }) {
  const corner = (flip?: boolean) => <span className={`pc-idx ${flip ? "flip" : ""}`}><b>{card.index}</b><Mark tone="ink" size={16} /></span>;
  return (
    <div className="pcard" style={{ fontSize: width / 14, width }}>
      {corner()}{corner(true)}
      <span className="pc-court" style={{ backgroundImage: `url(${card.image})` }}><span className="pc-name">{card.title}</span></span>
    </div>
  );
}

export function CardFan({ cards, active, onHover, onPick, width = 128 }: {
  cards: FanCard[]; active: number | null; onHover?: (i: number | null) => void; onPick?: (i: number) => void; width?: number;
}) {
  const n = cards.length, spacing = n > 5 ? 48 : 58, step = n > 1 ? Math.min(9, 46 / (n - 1)) : 0;
  return (
    <div className="fan">
      {cards.map((c, i) => {
        const offset = i - (n - 1) / 2, rotate = offset * step, lifted = i === active;
        const nudge = active != null && !lifted ? (Math.sign(i - active) * 24) / Math.max(1, Math.abs(i - active)) : 0;
        const transform = `translate(${offset * spacing + nudge}px, ${lifted ? -54 : Math.abs(rotate) * 1.9}px) rotate(${lifted ? rotate * 0.3 : rotate}deg) scale(${lifted ? 1.06 : 1})`;
        return (
          <button key={c.id} type="button" className="fan-slot" aria-label={`Book ${c.title}`} style={{ transform, zIndex: lifted ? 60 : 10 + i, marginLeft: -width / 2 }}
            onPointerEnter={() => onHover?.(i)} onPointerLeave={() => onHover?.(null)} onFocus={() => onHover?.(i)} onBlur={() => onHover?.(null)} onClick={() => onPick?.(i)}>
            <PlayingCard card={c} width={width} />
          </button>
        );
      })}
    </div>
  );
}

/* Hold to confirm */

export function HoldToConfirm({ children = "Hold to confirm", confirmed = "Confirmed", duration = 1600, onConfirm, disabled, block, className }: {
  children?: ReactNode; confirmed?: ReactNode; duration?: number; onConfirm: () => void; disabled?: boolean; block?: boolean; className?: string;
}) {
  const [status, setStatus] = useState<"idle" | "holding" | "confirmed">("idle");
  const [keyboard, setKeyboard] = useState(false);
  const timer = useRef<number | null>(null);
  const pointer = useRef<number | null>(null);
  const holding = useRef(false);
  const clear = () => { if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; } };
  const cancel = () => { if (!holding.current) return; holding.current = false; pointer.current = null; clear(); setStatus("idle"); };
  const start = (viaKeyboard: boolean) => {
    if (disabled || status === "confirmed" || holding.current) return;
    holding.current = true;
    setKeyboard(viaKeyboard);
    setStatus("holding");
    timer.current = window.setTimeout(() => { holding.current = false; pointer.current = null; setStatus("confirmed"); onConfirm(); }, duration);
  };
  useEffect(() => clear, []);
  useEffect(() => { if (disabled) cancel(); }, [disabled]); // eslint-disable-line
  const down = (e: PointerEvent<HTMLButtonElement>) => {
    if (!e.isPrimary || e.button !== 0 || disabled) return;
    pointer.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    start(false);
  };
  const moveOut = (e: PointerEvent<HTMLButtonElement>) => {
    if (!holding.current || pointer.current !== e.pointerId) return;
    const r = e.currentTarget.getBoundingClientRect(), pad = 8;
    if (e.clientX < r.left - pad || e.clientX > r.right + pad || e.clientY < r.top - pad || e.clientY > r.bottom + pad) cancel();
  };
  const end = (e: PointerEvent<HTMLButtonElement>) => { if (pointer.current === e.pointerId) cancel(); };
  const key = (e: KeyboardEvent<HTMLButtonElement>, down: boolean) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    if (down && !e.repeat) start(true);
    if (!down) cancel();
  };
  const fill: CSSProperties = {
    clipPath: status === "holding" ? "inset(0 0 0 0)" : "inset(0 100% 0 0)",
    transitionDuration: still() || keyboard ? "0ms" : status === "holding" ? `${duration}ms` : "180ms",
    transitionTimingFunction: status === "holding" ? "linear" : "cubic-bezier(0.23, 1, 0.32, 1)",
  };
  return (
    <button type="button" className={`hold ${status} ${block ? "block" : ""} ${className ?? ""}`} disabled={disabled} aria-busy={status === "holding"}
      onPointerDown={down} onPointerMove={moveOut} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={cancel} onBlur={cancel}
      onKeyDown={(e) => key(e, true)} onKeyUp={(e) => key(e, false)}>
      {status === "confirmed" ? <span className="hold-in">{confirmed}</span> : <>
        <span className="hold-in">{children}</span>
        <span className="hold-fill" aria-hidden="true" style={fill}>{children}</span>
      </>}
    </button>
  );
}
