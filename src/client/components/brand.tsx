import { useEffect, useRef } from "react";

const MARK = [
  "M120.443 1.33206C121.412 0.250933 123.095 0.219122 124.103 1.26273L151.476 29.5791C151.717 29.8295 151.904 30.1284 152.024 30.4551L152.778 32.5059C153.354 34.0737 152.259 35.7545 150.593 35.8623L146.958 36.0957L119.857 35.8662L156.374 78.9375C157.088 79.7797 157.436 80.8051 157.44 81.8252L158.176 81.4746C161.082 87.5611 162.727 94.1732 163.012 100.912C163.296 107.651 162.214 114.378 159.831 120.688C157.448 126.997 153.813 132.76 149.144 137.628C144.476 142.496 138.871 146.369 132.667 149.015C126.463 151.66 119.787 153.022 113.042 153.021C106.297 153.019 99.6218 151.652 93.4189 149.003C87.2162 146.354 81.6137 142.477 76.9482 137.606C72.2827 132.736 68.6509 126.971 66.2714 120.66L67.0302 120.373L51.2832 91.7432L77.5791 72.752L92.3466 87.5186L83.3818 93.4951L83.7548 93.9248L96.7959 108.898L89.0849 112.058L97.6123 108.844C98.3977 110.927 99.5967 112.83 101.137 114.438C102.677 116.045 104.527 117.325 106.574 118.199C108.622 119.074 110.825 119.525 113.052 119.525C115.278 119.526 117.481 119.076 119.529 118.203C121.577 117.33 123.428 116.051 124.969 114.444C126.51 112.837 127.71 110.935 128.497 108.853C129.271 106.804 129.628 104.622 129.55 102.435L81.7861 45.5987L92.8535 32.5977C92.9429 32.2087 93.1311 31.8289 93.4335 31.4912L100.764 23.3057L104.995 18.336L105.102 18.4619L120.443 1.33206Z",
  "M185.223 110.977C186.2 109.674 188.141 109.638 189.166 110.903L211.879 138.96C212.08 139.208 212.231 139.493 212.325 139.798L213.052 142.158C213.523 143.69 212.451 145.263 210.853 145.386L208.122 145.596L164.562 145.156C162.514 145.135 161.359 142.795 162.588 141.156L185.223 110.977Z",
  "M25.8281 111.528C26.7952 110.374 28.5559 110.331 29.5791 111.436L50.7138 134.261C51.4775 135.086 51.5965 136.32 51.0048 137.275L46.5966 144.396C46.1362 145.139 45.3208 145.589 44.4462 145.58L2.98042 145.161C0.869855 145.14 -0.266432 142.674 1.08882 141.056L25.8281 111.528Z",
];

/** Placeholder mark from the original Figma file, used until the official Psych Records logo is supplied. Replace the paths above to swap it everywhere. */
export function Mark({ tone = "neon", size = 34 }: { tone?: "neon" | "ink" | "white"; size?: number }) {
  const fill = tone === "neon" ? "#65F87C" : tone === "ink" ? "#171714" : "#FFFFFF";
  return (
    <svg viewBox="0 0 215 154" width={size} height={(size * 154) / 215} aria-hidden>
      {MARK.map((d) => <path key={d.slice(0, 12)} d={d} fill={fill} />)}
    </svg>
  );
}

const SOCIAL: Record<string, string> = {
  Instagram: "M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077",
  TikTok: "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z",
  YouTube: "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z",
  X: "M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z",
};
const SOCIAL_KEY: Record<string, string> = { Instagram: "social_instagram", TikTok: "social_tiktok", YouTube: "social_youtube", X: "social_x" };

export function Socials({ links = {} }: { links?: Record<string, string> }) {
  return (
    <div className="row gap8">
      {Object.entries(SOCIAL).filter(([name]) => links[SOCIAL_KEY[name]]).map(([name, d]) => (
        <a key={name} className="social" href={links[SOCIAL_KEY[name]]} target="_blank" rel="noreferrer" aria-label={name}>
          <svg viewBox="0 0 24 24"><path d={d} /></svg>
        </a>
      ))}
    </div>
  );
}

const ICONS: Record<string, string> = {
  arrow: "M4 12h15m-6-6 6 6-6 6",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  list: "M5 6h14M5 12h14M5 18h14",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1-4 4-6 8-6s7 2 8 6",
  chat: "M4 5h16v11H9l-5 4z",
  music: "M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  card: "M3 6h18v12H3zM3 10h18",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  pencil: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 20c.8-3.5 3.5-5 7-5s6.2 1.5 7 5M16 4.5a3.5 3.5 0 0 1 0 6.5M18 15c2 .5 3.4 2 4 5",
  shield: "M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z",
  mail: "M3 5h18v14H3zM3 6l9 7 9-7",
  lock: "M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4",
  menu: "M4 7h16M4 12h16M4 17h16",
  x: "M6 6l12 12M18 6 6 18",
  check: "M5 12l5 5L20 7",
  logout: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11",
  phone: "M5 4h4l2 5-3 2a11 11 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 6a2 2 0 0 1 2-2z",
  pin: "M12 21s7-6 7-12a7 7 0 0 0-14 0c0 6 7 12 7 12zM12 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  play: "M8 5v14l11-7z",
  plus: "M12 5v14M5 12h14",
  upload: "M12 16V4m0 0-4 4m4-4 4 4M4 17v3h16v-3",
  image: "M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15 9.5h.01",
  link: "M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1",
  mic: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3",
  video: "M3 7h12v10H3zM15 10l6-3v10l-6-3",
  camera: "M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
  door: "M6 21V4h12v17M3 21h18M14 12h.01",
  megaphone: "M3 11v2l13 5V6zM16 9a3 3 0 0 1 0 6M6 13.5V18h3v-3.5",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01",
  star: "M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z",
  trash: "M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  quote: "M7 7h4v4H8v6H4v-6zM16 7h4v4h-3v6h-4v-6z",
  briefcase: "M4 8h16v11H4zM9 8V5h6v3M4 13h16",
};

export function Icon({ name, size = 20, className }: { name: keyof typeof ICONS | string; size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={ICONS[name]} />
    </svg>
  );
}

/** Live audio waveform drawn on a canvas. Pauses offscreen and holds still for reduced motion. */
export function Waveform({ className, step = 8, color = "#65F87C" }: { className?: string; step?: number; color?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0, visible = false, w = 0, h = 0;
    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = color;
      const bw = Math.max(2, step / 2);
      for (let i = 0, n = Math.ceil(w / step); i < n; i++) {
        const u = i * 0.37 + t * 0.0009;
        const shape = Math.abs(Math.sin(u) * Math.cos(u * 0.3 + 1));
        const level = 0.55 + 0.3 * Math.sin(t * 0.0052 + i * 1.7) + 0.15 * Math.sin(t * 0.011 + i * 0.6);
        const bh = Math.max(bw, shape * level * h);
        ctx.beginPath();
        ctx.roundRect(i * step, (h - bh) / 2, bw, bh, bw / 2);
        ctx.fill();
      }
    };
    const loop = (t: number) => { draw(t); raf = visible ? requestAnimationFrame(loop) : 0; };
    const resize = () => {
      const r = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width; h = r.height;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(performance.now());
    };
    const ro = new ResizeObserver(resize);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting && !still;
      if (visible && !raf) raf = requestAnimationFrame(loop);
    });
    ro.observe(canvas); io.observe(canvas);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); };
  }, [step, color]);
  return <canvas ref={ref} className={className} aria-hidden />;
}

/** Traced loader built from the official mark: a faint outline with a travelling highlight. */
export function LogoLoader({ size = 56, className }: { size?: number; className?: string }) {
  return (
    <svg className={`logoload ${className ?? ""}`} viewBox="-8 -8 231 170" width={size} height={(size * 170) / 231} role="img" aria-label="Loading">
      <g opacity={0.18}>{MARK.map((d) => <path key={d.slice(0, 16)} d={d} fill="none" stroke="currentColor" strokeWidth={6} strokeLinejoin="round" />)}</g>
      {MARK.map((d) => <path key={`c${d.slice(0, 16)}`} className="ll-comet" d={d} pathLength={1} fill="none" stroke="currentColor" strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" />)}
    </svg>
  );
}
