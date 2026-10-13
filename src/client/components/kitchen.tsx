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
