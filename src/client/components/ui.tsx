import { useEffect, useState, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
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

const VARIANT = { "": "brand", neon: "neon", neutral: "light", primary: "ink", danger: "danger" } as const;

export function Btn({ kind = "", size = "", arrow, block, children, ...p }: { kind?: keyof typeof VARIANT; size?: "" | "sm"; arrow?: boolean; block?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <Tactile variant={VARIANT[kind]} size={size === "sm" ? "md" : "lg"} block={block} {...p}>{children}{arrow && <Icon name="arrow" size={size === "sm" ? 16 : 18} />}</Tactile>;
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return <div className="seg">{options.map(([v, l]) => <button key={v} type="button" className={v === value ? "on" : ""} onClick={() => onChange(v)}>{l}</button>)}</div>;
}

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
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

export function Steps({ step }: { step: number }) {
  const labels = ["Service", "Package", "Date & time", "Details", "Checkout"];
  return (
    <>
      <div className="steps">
        {labels.map((l, i) => (
          <div key={l} className="row gap12" style={{ flex: i < 4 ? 1 : "none" }}>
            <div className={`s ${i + 1 < step ? "done" : i + 1 === step ? "cur" : ""}`}><i>{i + 1 < step ? <Icon name="check" size={14} /> : i + 1}</i>{l}</div>
            {i < 4 && <div className={`bar ${i + 1 < step ? "done" : ""}`} />}
          </div>
        ))}
      </div>
      <div className="steps-m">
        <div className="row between"><b className="small">{labels[step - 1]}</b><span className="mono faint">Step {step} of 5</span></div>
        <div className="bars">{labels.map((l, i) => <i key={l} className={i < step ? "on" : ""} />)}</div>
      </div>
    </>
  );
}

export const Loading = () => <div className="loading"><LogoLoader /></div>;
