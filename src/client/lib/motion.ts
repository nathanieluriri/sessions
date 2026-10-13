import { useEffect, useRef, useState } from "react";

export const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));
export const prefersStill = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Runs fn at most once per animation frame while the page scrolls or resizes. */
export function useScrollFrame(fn: () => void) {
  const latest = useRef(fn);
  latest.current = fn;
  useEffect(() => {
    let raf = 0;
    const queue = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; latest.current(); }); };
    queue();
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    return () => { window.removeEventListener("scroll", queue); window.removeEventListener("resize", queue); cancelAnimationFrame(raf); };
  }, []);
}

/** Marks every [data-reveal] and [data-split] element under the returned ref with data-shown as it enters the viewport. An attribute, not a class, so React re-renders cannot strip it. */
export function useReveal<T extends HTMLElement>(ready: boolean) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root || !ready) return;
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { e.target.setAttribute("data-shown", ""); io.unobserve(e.target); }
    }), { rootMargin: "0px 0px -8% 0px" });
    root.querySelectorAll("[data-reveal], [data-split]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [ready]);
  return ref;
}

export function useInView<T extends Element>(threshold = 0.3) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, inView] as const;
}
