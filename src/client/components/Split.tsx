import { Fragment, type CSSProperties } from "react";

/** Splits text into words that rise in one after another once an ancestor gets the "in" class. */
export function Split({ text, from = 0, className }: { text: string; from?: number; className?: string }) {
  let i = from;
  return (
    <span className={`split ${className ?? ""}`}>
      {text.split(/(\s+)/).map((w, k) => (!w.trim() ? <Fragment key={k}>{w}</Fragment> : (
        <span key={k} className="sw"><span className="si" style={{ "--i": i++ } as CSSProperties}>{w}</span></span>
      )))}
    </span>
  );
}

export const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;
