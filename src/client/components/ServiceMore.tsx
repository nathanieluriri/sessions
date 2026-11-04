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

/** A help control that opens the full service description under the short line. */
export function ServiceMore({ name, text, tone = "light" }: { name: string; text: string; tone?: "light" | "dark" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={`svc-help ${tone}`} aria-expanded={open} aria-label={`${open ? "Hide" : "Show"} the full description of ${name}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}>
        <Icon name="help" size={15} />
      </button>
      {open && <span className={`svc-full ${tone}`} role="note">{text}</span>}
    </>
  );
}
