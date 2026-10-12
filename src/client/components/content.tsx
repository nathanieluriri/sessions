import { useState, type ReactNode } from "react";
import { Icon } from "./brand";

/** Renders plain text with "## " headings, "- " bullets and blank-line paragraphs. No HTML is ever injected. */
export function RichText({ text, className }: { text: string; className?: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => { if (list.length) { blocks.push(<ul key={blocks.length}>{list.map((l, i) => <li key={i}>{l}</li>)}</ul>); list = []; } };
  for (const para of text.split(/\n\s*\n/)) {
    for (const line of para.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      if (t.startsWith("- ")) { list.push(t.slice(2)); continue; }
      flush();
      if (t.startsWith("## ")) blocks.push(<h2 key={blocks.length} className="h4">{t.slice(3)}</h2>);
      else blocks.push(<p key={blocks.length}>{t}</p>);
    }
    flush();
  }
  return <div className={`rich ${className ?? ""}`}>{blocks}</div>;
}

export interface EmbedInfo { src: string; kind: "video" | "audio"; thumb?: string }

/** Turns a YouTube, Vimeo, Spotify or SoundCloud link into an embeddable player URL. */
export function embedFor(url: string): EmbedInfo | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, "");
    if (host === "youtu.be" || host === "youtube.com" || host === "music.youtube.com") {
      const id = host === "youtu.be" ? u.pathname.slice(1) : u.searchParams.get("v") ?? u.pathname.match(/\/(shorts|embed|live)\/([\w-]+)/)?.[2];
      return id && /^[\w-]{6,}$/.test(id) ? { src: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`, kind: "video", thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` } : null;
    }
    if (host === "vimeo.com" || host === "player.vimeo.com") {
      const id = u.pathname.match(/(\d{6,})/)?.[1];
      return id ? { src: `https://player.vimeo.com/video/${id}?autoplay=1`, kind: "video" } : null;
    }
    if (host === "open.spotify.com") {
      const m = u.pathname.match(/\/(track|album|playlist|episode|show)\/(\w+)/);
      return m ? { src: `https://open.spotify.com/embed/${m[1]}/${m[2]}`, kind: "audio" } : null;
    }
    if (host === "soundcloud.com") return { src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&color=%2365f87c&visual=true`, kind: "audio" };
  } catch { /* not a URL */ }
  return null;
}

/** Shows a poster first and only loads the third-party player when someone presses play. */
export function Embed({ url, poster, title }: { url: string; poster?: string; title: string }) {
  const info = embedFor(url);
  const [on, setOn] = useState(info?.kind === "audio");
  if (!info) return null;
  if (on) return <div className={`embed ${info.kind}`}><iframe src={info.src} title={title} loading="lazy" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen /></div>;
  return (
    <button type="button" className="embed poster" style={{ backgroundImage: `url(${poster || info.thumb || ""})` }} onClick={() => setOn(true)} aria-label={`Play ${title}`}>
      <span className="play"><Icon name="play" size={22} /></span>
    </button>
  );
}
