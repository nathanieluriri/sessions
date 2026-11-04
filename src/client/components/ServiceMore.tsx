import { useState } from "react";
import { Icon } from "./brand";

/** Short lines for the five Music and audio cards. The catalog description stays the full text. */
export const MUSIC_BLURBS: Record<string, string> = {
  recording: "Vocals over your beat. Two hours. Mix not included.",
  "beat-production": "A custom instrumental. Recording and mix not included.",
  "mixing-mastering": "A polished mix and master, ready to release.",
  "full-production": "Beat, six-hour session, mix and master.",
  "song-covers": "Your version of a favourite song, recorded here.",
};

export const cardBlurb = (slug: string, full: string) => {
  const short = MUSIC_BLURBS[slug];
  return { short: short || full, more: short && short !== full ? full : "" };
};

/** Help control on the right. The full description eases open underneath. */
export function ServiceMore({ name, text, short, tone = "light" }: { name: string; text: string; short?: string; tone?: "light" | "dark" }) {
  const [open, setOpen] = useState(false);
  return (
    <span className={`svc-blurb ${tone}`}>
      <span className="svc-blurb-row">
        {short && <span className="svc-short">{short}</span>}
        <button type="button" className={`svc-help ${tone}`} aria-expanded={open} aria-label={`${open ? "Hide" : "Show"} the full description of ${name}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}>
          <Icon name="help" size={15} />
        </button>
      </span>
      <span className={`svc-reveal ${open ? "on" : ""}`}>
        <span><span className={`svc-full ${tone}`} role="note">{text}</span></span>
      </span>
    </span>
  );
}
