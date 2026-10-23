import { useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { Icon, LogoLoader } from "./brand";
import { Tactile } from "./kitchen";

export function Field({ label, hint, ...p }: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return <div className="field"><label htmlFor={p.name}>{label}</label><input id={p.name} className="input" {...p} />{hint && <span className="hint">{hint}</span>}</div>;
}
export function Area({ label, ...p }: { label: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <div className="field"><label htmlFor={p.name}>{label}</label><textarea id={p.name} className="textarea" {...p} /></div>;
}
export const ErrorBox = ({ error }: { error?: string | null }) => (error ? <div className="error" role="alert">{error}</div> : null);
export const Tag = ({ tone = "", children }: { tone?: string; children: ReactNode }) => <span className={`tag ${tone}`}>{children}</span>;

const VARIANT = { "": "neon", neon: "neon", neutral: "light", primary: "ink", danger: "danger" } as const;

export function Btn({ kind = "", size = "", arrow, block, children, ...p }: { kind?: keyof typeof VARIANT; size?: "" | "sm"; arrow?: boolean; block?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <Tactile variant={VARIANT[kind]} size={size === "sm" ? "md" : "lg"} block={block} {...p}>{children}{arrow && <Icon name="arrow" size={size === "sm" ? 16 : 18} />}</Tactile>;
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return <div className="seg">{options.map(([v, l]) => <button key={v} type="button" className={v === value ? "on" : ""} onClick={() => onChange(v)}>{l}</button>)}</div>;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const el = box.current!;
    (el.querySelector<HTMLElement>("input, textarea, select") ?? el).focus();
    const keys = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); close.current(); return; }
      if (e.key !== "Tab") return;
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null);
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0], last = items[items.length - 1];
      if (!el.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keys);
    return () => { document.removeEventListener("keydown", keys); opener?.focus?.(); };
  }, []);
  return (
    <div className="modal-bg" onClick={onClose}>
      <div ref={box} className="modal" tabIndex={-1} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="row between"><h3 className="h3">{title}</h3><button className="link" onClick={onClose} aria-label="Close"><Icon name="x" /></button></div>
        {children}
      </div>
    </div>
  );
}

let pushToast: (m: string) => void = () => {};
export const toast = (m: string) => pushToast(m);
export function Toaster() {
  const [m, setM] = useState<string | null>(null);
  useEffect(() => { pushToast = (x) => { setM(x); setTimeout(() => setM(null), 2800); }; }, []);
  return m ? <div className="toast">{m}</div> : null;
}

export function Steps({ steps, at }: { steps: { key: string; label: string }[]; at: string }) {
  const cur = Math.max(0, steps.findIndex((s) => s.key === at));
  const n = steps.length;
  return (
    <>
      <div className="steps">
        {steps.map((st, i) => (
          <div key={st.key} className="row gap12" style={{ flex: i < n - 1 ? 1 : "none" }}>
            <div className={`s ${i < cur ? "done" : i === cur ? "cur" : ""}`} aria-current={i === cur ? "step" : undefined}><i>{i < cur ? <Icon name="check" size={14} /> : i + 1}</i>{st.label}</div>
            {i < n - 1 && <div className={`bar ${i < cur ? "done" : ""}`} />}
          </div>
        ))}
      </div>
      <div className="steps-m">
        <div className="row between"><b className="small">{steps[cur]?.label}</b><span className="mono faint">Step {cur + 1} of {n}</span></div>
        <div className="bars">{steps.map((st, i) => <i key={st.key} className={i <= cur ? "on" : ""} />)}</div>
      </div>
    </>
  );
}

export const Loading = () => <div className="loading"><LogoLoader /></div>;
