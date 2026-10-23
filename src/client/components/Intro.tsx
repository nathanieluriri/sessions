import { useEffect, useState } from "react";
import { Mark } from "./brand";
import { ScrambleText } from "./kitchen";
import { prefersStill } from "../lib/motion";

const KEY = "psych.intro";

export const introPending = () => {
  try { return !prefersStill() && !sessionStorage.getItem(KEY); } catch { return false; }
};

/** Short branded intro shown once per visit: the name fills in, a line types out and a gradient bar runs across. */
export function Intro({ onDone }: { onDone: () => void }) {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    try { sessionStorage.setItem(KEY, "1"); } catch { /* private mode */ }
    document.body.classList.add("menu-open");
    const t = [window.setTimeout(() => setStage(1), 850), window.setTimeout(() => setStage(2), 1600), window.setTimeout(onDone, 2250)];
    return () => { t.forEach((x) => window.clearTimeout(x)); document.body.classList.remove("menu-open"); };
  }, [onDone]);
  return (
    <div className={`intro s${stage}`} aria-hidden>
      <div className="ilogo"><Mark tone="neon" size={52} /><span data-text="Psych Records">Psych Records</span></div>
      <p className="iline"><ScrambleText key={stage ? "b" : "a"}>{stage ? "RECORD. SHOOT. CREATE." : "WELCOME TO PSYCH RECORDS"}</ScrambleText></p>
      <i className="ibar" />
    </div>
  );
}
