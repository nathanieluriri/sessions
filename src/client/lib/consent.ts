const KEY = "psych.consent";
export type Consent = "all" | "essential";

export const readConsent = (): Consent | null => {
  try { const v = localStorage.getItem(KEY); return v === "all" || v === "essential" ? v : null; } catch { return null; }
};

export function saveConsent(c: Consent) {
  try { localStorage.setItem(KEY, c); } catch { /* private mode */ }
  if (c === "all") loadAnalytics();
}

/** Loads Google Analytics when the studio has set an ID and the visitor accepted analytics cookies. */
export function loadAnalytics() {
  const w = window as unknown as { PSYCH_GA?: string; dataLayer: unknown[]; gtag: (...a: unknown[]) => void };
  if (!w.PSYCH_GA || document.getElementById("ga-js")) return;
  const s = document.createElement("script");
  s.id = "ga-js"; s.async = true; s.src = `https://www.googletagmanager.com/gtag/js?id=${w.PSYCH_GA}`;
  document.head.appendChild(s);
  w.dataLayer = w.dataLayer || [];
  w.gtag = function () { w.dataLayer.push(arguments); }; // eslint-disable-line prefer-rest-params
  w.gtag("js", new Date());
  w.gtag("config", w.PSYCH_GA);
}

export const openCookieSettings = () => window.dispatchEvent(new Event("psych:cookies"));
