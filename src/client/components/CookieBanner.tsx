import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Tactile } from "./kitchen";
import { readConsent, saveConsent, type Consent } from "../lib/consent";
import { introPending } from "./Intro";

const Cookie = () => (
  <svg className="cookie-art" viewBox="0 0 48 48" aria-hidden>
    <path d="M24 4a20 20 0 1 0 20 21 6 6 0 0 1-7-6 6 6 0 0 1-6-7 6 6 0 0 1-7-8z" fill="#d9a35b" />
    <path d="M24 4a20 20 0 1 0 20 21 6 6 0 0 1-7-6 6 6 0 0 1-6-7 6 6 0 0 1-7-8z" fill="none" stroke="#0a0a0a" strokeOpacity=".2" strokeWidth="2" />
    {[[16, 18, 2.6], [27, 26, 2.2], [15, 31, 2.4], [24, 37, 1.8], [33, 34, 2.2], [20, 24, 1.4]].map(([x, y, r]) => <circle key={`${x}${y}`} cx={x} cy={y} r={r} fill="#5a3412" />)}
  </svg>
);

/** First-visit cookie notice. Reopened from "Cookie settings" in the footer. */
export function CookieBanner() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener("psych:cookies", show);
    const t = readConsent() ? 0 : window.setTimeout(show, introPending() ? 3200 : 1200);
    return () => { window.removeEventListener("psych:cookies", show); window.clearTimeout(t); };
  }, []);
  const choose = (c: Consent) => { saveConsent(c); setOpen(false); };
  if (!open) return null;
  return (
    <div className="cookiebar" role="dialog" aria-label="Cookie choices">
      <Cookie />
      <div className="stack gap12">
        <div className="stack gap4">
          <b>Cookies, briefly.</b>
          <p>One cookie keeps you signed in. With your OK, we also count visits to make the site better. Read the <Link to="/cookies" onClick={() => setOpen(false)}>cookie policy</Link>.</p>
        </div>
        <div className="row gap8 wrapflex">
          <Tactile variant="neon" size="md" onClick={() => choose("all")}>Accept all</Tactile>
          <Tactile variant="ink" size="md" onClick={() => choose("essential")}>Essential only</Tactile>
        </div>
      </div>
    </div>
  );
}
