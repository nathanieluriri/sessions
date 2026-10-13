import { useEffect, useId, useRef } from "react";
import { prefersStill } from "../lib/motion";

type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => void;

/** Runs a canvas drawing at about 30 frames a second while it is on screen. */
function useCanvas(draw: Draw) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current, ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const still = prefersStill();
    let raf = 0, visible = false, w = 0, h = 0, last = 0;
    const paint = (now: number) => draw(ctx, w, h, still ? 4 : now / 1000);
    const loop = (now: number) => {
      if (now - last > 32) { last = now; paint(now); }
      raf = visible && !document.hidden ? requestAnimationFrame(loop) : 0;
    };
    const resize = () => {
      const r = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width; h = r.height;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paint(performance.now());
    };
    const wake = () => { if (visible && !still && !raf && !document.hidden) raf = requestAnimationFrame(loop); };
    const ro = new ResizeObserver(resize);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; wake(); });
    ro.observe(canvas); io.observe(canvas);
    document.addEventListener("visibilitychange", wake);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); document.removeEventListener("visibilitychange", wake); };
  }, [draw]);
  return ref;
}

const streaks: Draw = (ctx, w, h, t) => {
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#050505";
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "lighter";
  for (let k = 0; k < 34; k++) {
    const f = k / 33, wob = Math.sin(t * 0.9 + k * 0.23) * 14;
    ctx.strokeStyle = `hsla(${(f * 300 + t * 20) % 360}, 95%, 60%, .55)`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-20, h * (0.92 - f * 0.18));
    ctx.bezierCurveTo(w * 0.32, h * (1.02 - f * 0.12) + wob, w * 0.4, h * (0.16 + f * 0.1) - wob, w + 20, h * (0.06 + f * 0.3));
    ctx.stroke();
  }
};

const glitch: Draw = (ctx, w, h, t) => {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#14f0a4"); g.addColorStop(0.45, "#5df5ff"); g.addColorStop(1, "#bffcff");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const base = h * 0.42, step = 7;
  for (let band = 0; band < 3; band++) {
    ctx.fillStyle = band === 0 ? "rgba(255,255,255,.95)" : band === 1 ? "rgba(255,250,200,.55)" : "rgba(255,255,255,.35)";
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w + step; x += step) {
      const n = Math.sin(x * 0.09 + t * 2.4 + band) * Math.sin(x * 0.023 - t * 1.3);
      const tooth = ((x + t * 60 * (band + 1)) % 28) / 28;
      ctx.lineTo(x, base + band * 26 - tooth * (22 + 26 * Math.abs(n)));
    }
    ctx.lineTo(w, h);
    ctx.fill();
  }
};

const spectrum: Draw = (ctx, w, h, t) => {
  ctx.fillStyle = "#151a24";
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "lighter";
  const n = 46;
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1), x = f * w;
    const level = 0.35 + 0.35 * Math.sin(t * 3.1 + i * 0.7) * Math.sin(t * 1.3 + i * 0.21) + 0.25 * Math.sin(i * 0.4);
    const top = h * (0.5 - level * 0.42), bottom = h * (0.62 + level * 0.12);
    const g = ctx.createLinearGradient(0, top, 0, bottom);
    const hue = 350 - f * 130;
    g.addColorStop(0, `hsla(${hue}, 90%, 60%, 0)`); g.addColorStop(0.5, `hsla(${hue}, 95%, 58%, .7)`); g.addColorStop(1, `hsla(${hue - 30}, 90%, 50%, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x, top, w / n * 0.7, bottom - top);
  }
  ctx.globalCompositeOperation = "source-over";
  ctx.strokeStyle = "rgba(255,255,255,.55)";
  ctx.lineWidth = 1.2;
  for (let k = 0; k < 6; k++) {
    ctx.beginPath();
    ctx.ellipse(-w * 0.1, h * 0.5, w * (0.18 + k * 0.035), h * 0.55, 0, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
  }
};

const chrome: Draw = (ctx, w, h, t) => {
  const g = ctx.createLinearGradient(0, 0, w * 0.3, h);
  g.addColorStop(0, "#ff9a1f"); g.addColorStop(0.45, "#e5249a"); g.addColorStop(1, "#5b21d6");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const y = (x: number, k: number) => h * 0.36 + Math.sin(x / w * 5 + t * 1.2 + k) * h * 0.09 + (x / w) * h * 0.08;
  for (let k = 0; k < 2; k++) {
    const r = ctx.createLinearGradient(0, h * 0.2, 0, h * 0.6);
    r.addColorStop(0, "rgba(255,255,255,0)"); r.addColorStop(0.5, k ? "rgba(255,240,180,.85)" : "rgba(255,255,255,.9)"); r.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = r;
    ctx.beginPath();
    for (let x = -10; x <= w + 10; x += 6) ctx.lineTo(x, y(x, k * 0.6) - 3 - k * 10);
    for (let x = w + 10; x >= -10; x -= 6) ctx.lineTo(x, y(x, k * 0.6 + 0.4) + 4 + k * 6);
    ctx.fill();
  }
};

const ARTS: Record<string, Draw> = { streaks, glitch, spectrum, chrome };

export function CardArt({ kind }: { kind: keyof typeof ARTS | string }) {
  const ref = useCanvas(ARTS[kind] ?? streaks);
  return <canvas ref={ref} className="cart" aria-hidden />;
}

const PALETTE = [[24, 6, 58], [104, 34, 222], [222, 34, 150], [255, 116, 34], [255, 210, 40], [255, 250, 235]];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** A photo drawn as a dithered pixel mosaic in the brand gradient. It sharpens as it scrolls into view and shimmers like an LED wall. */
export function Pixels({ src, className }: { src: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current, ctx = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !ctx) return;
    const still = prefersStill();
    let img = new Image(), cols = 10, phase = 0, mapped = true, visible = false, ticker = 0;
    const timers: number[] = [];
    const paint = () => {
      const rows = Math.max(1, Math.round(cols * (canvas.clientHeight / Math.max(1, canvas.clientWidth))));
      if (canvas.width !== cols || canvas.height !== rows) { canvas.width = cols; canvas.height = rows; }
      const s = Math.max(cols / img.width, rows / img.height);
      ctx.drawImage(img, (cols - img.width * s) / 2, (rows - img.height * s) / 2, img.width * s, img.height * s);
      if (!mapped) return;
      try {
        const d = ctx.getImageData(0, 0, cols, rows), px = d.data, n = PALETTE.length - 1;
        for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
          const i = (y * cols + x) * 4;
          const l = Math.pow((0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255, 0.8);
          const c = PALETTE[Math.min(n, Math.max(0, Math.round(l * n * 1.15 + BAYER[((y + phase) % 4) * 4 + ((x + phase * 3) % 4)] / 16 - 0.5)))];
          px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2];
        }
        ctx.putImageData(d, 0, 0);
        canvas.parentElement?.setAttribute("data-mapped", "");
      } catch { mapped = false; }
    };
    const shimmer = () => {
      window.clearInterval(ticker);
      if (visible && !still && !document.hidden) ticker = window.setInterval(() => { phase = (phase + 1) % 4; paint(); }, 260);
    };
    const io = new IntersectionObserver(([e]) => {
      const first = e.isIntersecting && !visible && cols === 10;
      visible = e.isIntersecting;
      if (first) {
        if (still) { cols = 64; paint(); }
        else [18, 32, 64].forEach((c, k) => timers.push(window.setTimeout(() => { cols = c; paint(); }, (k + 1) * 240)));
      }
      shimmer();
    }, { threshold: 0.2 });
    const load = (cors: boolean) => {
      img = new Image();
      if (cors) img.crossOrigin = "anonymous";
      img.onload = () => { paint(); io.observe(canvas); };
      img.onerror = () => { if (cors) { mapped = false; load(false); } };
      img.src = src;
    };
    load(true);
    document.addEventListener("visibilitychange", shimmer);
    return () => { io.disconnect(); window.clearInterval(ticker); timers.forEach((t) => window.clearTimeout(t)); document.removeEventListener("visibilitychange", shimmer); img.onload = null; img.onerror = null; };
  }, [src]);
  return <div className={`pixels ${className ?? ""}`} aria-hidden><canvas ref={ref} /><i /></div>;
}

const sparkle = (x: number, y: number, r: number) =>
  `M${x} ${y - r}C${x + r * 0.18} ${y - r * 0.18} ${x + r * 0.18} ${y - r * 0.18} ${x + r} ${y}C${x + r * 0.18} ${y + r * 0.18} ${x + r * 0.18} ${y + r * 0.18} ${x} ${y + r}C${x - r * 0.18} ${y + r * 0.18} ${x - r * 0.18} ${y + r * 0.18} ${x - r} ${y}C${x - r * 0.18} ${y - r * 0.18} ${x - r * 0.18} ${y - r * 0.18} ${x} ${y - r}Z`;

/** Flat, outlined sticker illustrations in the landing page style. */
export function Sticker({ kind, className }: { kind: "mic" | "headphones"; className?: string }) {
  const clip = useId();
  if (kind === "headphones") {
    return (
      <svg className={`sticker ${className ?? ""}`} viewBox="0 0 240 220" aria-hidden>
        <g className="st-float">
          <path d="M44 132a76 76 0 0 1 152 0" fill="none" stroke="#0a0a0a" strokeWidth="22" strokeLinecap="round" />
          <path d="M44 132a76 76 0 0 1 152 0" fill="none" stroke="#8fb2ff" strokeWidth="13" strokeLinecap="round" />
          <rect x="24" y="118" width="46" height="78" rx="18" fill="#ffd23a" stroke="#0a0a0a" strokeWidth="4" />
          <rect x="170" y="118" width="46" height="78" rx="18" fill="#ffd23a" stroke="#0a0a0a" strokeWidth="4" />
          <rect x="62" y="128" width="18" height="58" rx="8" fill="#ff4fd8" stroke="#0a0a0a" strokeWidth="4" />
          <rect x="160" y="128" width="18" height="58" rx="8" fill="#ff4fd8" stroke="#0a0a0a" strokeWidth="4" />
          <path d="M34 136v40M206 136v40" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity=".8" />
        </g>
        <path className="st-twinkle" d={sparkle(206, 46, 16)} fill="#fff" stroke="#0a0a0a" strokeWidth="3.5" strokeLinejoin="round" />
        <path className="st-twinkle d2" d={sparkle(28, 62, 11)} fill="#56f0a0" stroke="#0a0a0a" strokeWidth="3" strokeLinejoin="round" />
        <path d="M120 20v14M100 26l5 12M140 26l-5 12" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg className={`sticker ${className ?? ""}`} viewBox="0 0 240 240" aria-hidden>
      <defs><clipPath id={clip}><rect x="70" y="34" width="84" height="104" rx="42" /></clipPath></defs>
      <g className="st-spin">
        <circle cx="176" cy="78" r="52" fill="#121212" stroke="#0a0a0a" strokeWidth="4" />
        {[44, 37, 30].map((r) => <circle key={r} cx="176" cy="78" r={r} fill="none" stroke="#3a3a3a" strokeWidth="2" />)}
        <circle cx="176" cy="78" r="17" fill="#ff4fd8" stroke="#0a0a0a" strokeWidth="4" />
        <circle cx="176" cy="78" r="3.5" fill="#0a0a0a" />
        <path d="M148 52a40 40 0 0 1 22-12" stroke="#fff" strokeWidth="4" strokeLinecap="round" fill="none" opacity=".75" />
      </g>
      <g className="st-float">
        <rect x="96" y="150" width="32" height="54" rx="10" fill="#8fb2ff" stroke="#0a0a0a" strokeWidth="4" />
        <rect x="84" y="134" width="56" height="20" rx="8" fill="#ffd23a" stroke="#0a0a0a" strokeWidth="4" />
        <rect x="70" y="34" width="84" height="104" rx="42" fill="#ffd23a" />
        <g clipPath={`url(#${clip})`} stroke="#0a0a0a" strokeWidth="3">{[52, 64, 76, 88, 100, 112, 124].map((y) => <path key={y} d={`M70 ${y}h84`} />)}<path d="M112 34v104" /></g>
        <rect x="70" y="34" width="84" height="104" rx="42" fill="none" stroke="#0a0a0a" strokeWidth="4" />
        <rect x="82" y="46" width="12" height="40" rx="6" fill="#fff" opacity=".85" />
        <path d="M78 214h68" stroke="#0a0a0a" strokeWidth="8" strokeLinecap="round" />
      </g>
      <path className="st-pulse" d="M50 66q-16 20 0 40M34 54q-28 32 0 64" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
      <path className="st-twinkle" d={sparkle(206, 176, 16)} fill="#fff" stroke="#0a0a0a" strokeWidth="3.5" strokeLinejoin="round" />
      <path className="st-twinkle d2" d={sparkle(40, 170, 11)} fill="#56f0a0" stroke="#0a0a0a" strokeWidth="3" strokeLinejoin="round" />
    </svg>
  );
}

/** Large thin line icons with hatched fills for the value cards. */
export function LineArt({ kind }: { kind: string }) {
  const id = useId(), hatch = `url(#${id})`;
  const defs = <defs><pattern id={id} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0v5" stroke="currentColor" strokeWidth="1.3" /></pattern></defs>;
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg className="lineart" viewBox="0 0 96 64" aria-hidden>
      {defs}
      {kind === "crew" && <g {...common}><path d="M24 40V32a24 24 0 0 1 48 0v8" /><rect x="16" y="36" width="14" height="22" rx="6" fill={hatch} /><rect x="66" y="36" width="14" height="22" rx="6" fill={hatch} /><path d="M38 14l10-8 10 8" /></g>}
      {kind === "live" && <g {...common}><path d="M10 10l34 22-34 22z" /><path d="M48 10l34 22-34 22z" fill={hatch} /></g>}
      {kind === "deposit" && <g {...common}><circle cx="36" cy="32" r="24" /><circle cx="60" cy="32" r="24" /><path d="M48 11.4a24 24 0 0 1 0 41.2a24 24 0 0 1 0-41.2z" fill={hatch} /></g>}
      {kind === "rooms" && <g {...common}><rect x="22" y="4" width="24" height="24" rx="5" /><rect x="50" y="4" width="24" height="24" rx="5" fill={hatch} /><rect x="22" y="32" width="24" height="24" rx="5" /><rect x="50" y="32" width="24" height="24" rx="5" /></g>}
    </svg>
  );
}

/** Bouncing equaliser bars used in place of a tick in "what's included" lists. */
export const Eq = () => <span className="eq" aria-hidden><i /><i /><i /></span>;
