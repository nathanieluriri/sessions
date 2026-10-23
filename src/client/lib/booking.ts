import type { Catalog, Package, Scheduling, Service, SessionSlot } from "./catalog";
import { addDays, endsNextDay, naira, shortDate, t12, weekdayName } from "./format";

export const SERVICE_REDIRECTS: Record<string, string> = {
  "vocal-recording": "recording", "voice-over": "recording", "song-arrangement": "recording",
  mixing: "mixing-mastering", mastering: "mixing-mastering", "vocal-editing": "mixing-mastering",
};
export const canonicalService = (slug?: string) => (slug ? SERVICE_REDIRECTS[slug] ?? slug : slug);

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

const clock = (m: number) => (m % 1440 === 720 ? "12:00noon" : t12(m));

/** "10:00am to 12:00noon", or "11:00pm to 5:00am (Sunday)" when the window runs past midnight on `date`. */
export const windowLabel = (date: string, start: number, end: number) =>
  `${clock(start)} to ${clock(end)}${endsNextDay(end) ? ` (${weekdayName(addDays(date, 1))})` : ""}`;

/** A session row without a date: "11:00pm to 5:00am (Sunday)" for Saturday, "(next day)" when it runs every day. */
export const sessionWindow = (s: Pick<SessionSlot, "weekday" | "start_min" | "end_min">) =>
  `${clock(s.start_min)} to ${clock(s.end_min)}${endsNextDay(s.end_min) ? ` (${s.weekday == null ? "next day" : DAYS[(s.weekday + 1) % 7]})` : ""}`;

export const sessionDays = (s: Pick<SessionSlot, "weekday">) => (s.weekday == null ? "Every day" : `${DAYS[s.weekday]}s only`);

export const activeSessions = (sessions: SessionSlot[]) =>
  sessions.filter((s) => s.active && s.end_min > s.start_min).sort((a, b) => a.sort - b.sort || a.start_min - b.start_min);

/** Footer and contact lines for the night sessions, for example "Saturday night · 11:00pm to 5:00am". */
export const nightLines = (sessions: SessionSlot[]) =>
  activeSessions(sessions).filter((s) => s.kind === "night").map((s) => ({ days: `${s.weekday == null ? "Every" : DAYS[s.weekday]} night`, time: `${clock(s.start_min)} to ${clock(s.end_min)}` }));

export const windowsOn = (sessions: SessionSlot[], kind: "day" | "night", date: string) =>
  activeSessions(sessions).filter((s) => s.kind === kind && (s.weekday == null || s.weekday === weekdayOf(date)));

export const wholeDayWindow = (sessions: SessionSlot[], date: string) => {
  const w = windowsOn(sessions, "day", date).sort((a, b) => a.start_min - b.start_min);
  return w.length ? { start: w[0].start_min, end: Math.max(...w.map((x) => x.end_min)) } : null;
};

export interface PickedTime { date?: string; start?: number }

/** The window a draft points at, or null when the date or start is not one of the open sessions. */
export function draftWindow(sessions: SessionSlot[], pkg: Pick<Package, "scheduling" | "slot_kind" | "duration_min"> | undefined, d: PickedTime): { start: number; end: number; label: string } | null {
  if (!pkg || !d.date || d.start == null) return null;
  if (pkg.scheduling === "day") { const w = wholeDayWindow(sessions, d.date); return w && w.start === d.start ? { ...w, label: "Whole day" } : null; }
  if (pkg.scheduling === "slot") { const s = windowsOn(sessions, pkg.slot_kind, d.date).find((x) => x.start_min === d.start); return s ? { start: s.start_min, end: s.end_min, label: s.label } : null; }
  if (pkg.scheduling === "flex") return { start: d.start, end: d.start + pkg.duration_min, label: "" };
  return null;
}

export const packagesOfService = (cat: Pick<Catalog, "packages">, svc: Pick<Service, "slug" | "category">) =>
  cat.packages.filter((p) => (p.service_slug ? p.service_slug === svc.slug : p.service_category === svc.category));

export const fixedPackages = (cat: Pick<Catalog, "packages">, svc?: Pick<Service, "slug" | "category">) =>
  svc ? packagesOfService(cat, svc).filter((p) => p.pricing === "fixed" && p.active).sort((a, b) => a.sort - b.sort) : [];

export const isQuoteOnly = (cat: Pick<Catalog, "packages">, svc: Pick<Service, "slug" | "category">) => fixedPackages(cat, svc).length === 0;

export type StepKey = "service" | "package" | "time" | "details" | "checkout";
export interface Step { key: StepKey; label: string; path: string }
const PATH: Record<StepKey, string> = { service: "/book", package: "/book/package", time: "/book/time", details: "/book/details", checkout: "/book/review" };

/** The steps that apply once a service is chosen: a package step only when there is a choice, a time step only when the package has one. */
export function stepsFor(fixed: Package[], packageId?: string): Step[] {
  const chosen = fixed.find((p) => p.id === packageId) ?? (fixed.length === 1 ? fixed[0] : undefined);
  const candidates = chosen ? [chosen] : fixed;
  const timed = candidates.length === 0 || candidates.some((p) => p.scheduling !== "project");
  const dayOnly = candidates.length > 0 && candidates.every((p) => p.scheduling === "day");
  const list: [StepKey, string][] = [["service", "Service"]];
  if (fixed.length !== 1) list.push(["package", "Package"]);
  if (timed) list.push(["time", dayOnly ? "Start day" : "Date & time"]);
  list.push(["details", "Details"], ["checkout", "Checkout"]);
  return list.map(([key, label]) => ({ key, label, path: PATH[key] }));
}

export const nextPath = (steps: Step[], at: StepKey) => steps[steps.findIndex((s) => s.key === at) + 1]?.path ?? PATH.checkout;
export const prevPath = (steps: Step[], at: StepKey) => steps[Math.max(0, steps.findIndex((s) => s.key === at) - 1)]?.path ?? PATH.service;

export interface FlowDraft { serviceSlug?: string; packageId?: string; date?: string; start?: number }

export const resolvePackage = (fixed: Package[], packageId?: string) => fixed.find((p) => p.id === packageId) ?? (fixed.length === 1 ? fixed[0] : undefined);

/** Where a visitor must go instead of `at` given what the draft holds, or null when `at` is fine. Keeps a stale draft from stranding anyone. */
export function flowGuard(cat: Pick<Catalog, "services" | "packages" | "sessions">, d: FlowDraft, at: StepKey, today: string): string | null {
  if (at === "service") return null;
  const svc = cat.services.find((s) => s.slug === canonicalService(d.serviceSlug));
  const fixed = fixedPackages(cat, svc);
  if (!svc || fixed.length === 0) return PATH.service;
  const steps = stepsFor(fixed, d.packageId);
  const pkg = resolvePackage(fixed, d.packageId);
  if (!pkg) return at === "package" ? null : PATH.package;
  if (!steps.some((s) => s.key === at)) return nextPath(steps, at);
  if ((at === "details" || at === "checkout") && pkg.scheduling !== "project") {
    if (!d.date || d.date < today || !draftWindow(cat.sessions, pkg, d)) return PATH.time;
  }
  return null;
}

export const savings = (p: Pick<Package, "price_kobo" | "compare_at_kobo">) =>
  p.compare_at_kobo && p.compare_at_kobo > p.price_kobo ? { regular: p.compare_at_kobo, kobo: p.compare_at_kobo - p.price_kobo, percent: Math.round(((p.compare_at_kobo - p.price_kobo) / p.compare_at_kobo) * 100) } : null;

export const deliveryLabel = (days: number | null) => (days ? `Delivered within ${days} ${days === 1 ? "day" : "days"}` : "");
export const revisionLabel = (n: number) => (n > 0 ? `Up to ${n} ${n === 1 ? "revision" : "revisions"}` : "");
export const isRemote = (p?: Pick<Package, "scheduling">) => p?.scheduling === "project";

/** Packages the home page features: flagged ones first (at most three, in order), else the first bookable ones. */
export function featuredPackages(cat: Pick<Catalog, "packages">, max = 3) {
  const bookable = cat.packages.filter((p) => p.pricing === "fixed" && p.active).sort((a, b) => a.sort - b.sort);
  const flagged = bookable.filter((p) => p.featured);
  return (flagged.length ? flagged : bookable).slice(0, max);
}

/** Add-ons offered for a service: scoped to its category and, when set, to the service itself. */
export const extrasFor = (cat: Pick<Catalog, "extras">, svc?: Pick<Service, "slug" | "category">) =>
  cat.extras.filter((e) => svc && (!e.category || e.category === svc.category) && (!e.service_slug || e.service_slug === svc.slug));

export function whenLine(b: { scheduling?: string; date: string; start_min: number; end_min: number }) {
  if (b.scheduling === "project") return `Ordered ${shortDate(b.date)}`;
  if (b.scheduling === "day") return `Starts ${shortDate(b.date)}`;
  return `${shortDate(b.date)} · ${windowLabel(b.date, b.start_min, b.end_min)}`;
}

export const moneyOrRequest = (e: { pricing: string; price_kobo: number }) => (e.pricing === "quote" ? "Price on request" : naira(e.price_kobo));

export const modeNoun = (m: Scheduling | undefined) => (m === "project" ? "order" : m === "day" ? "request" : "booking");

/** One plain line about how a package is scheduled, built from the session rows. */
export function howLine(p: Pick<Package, "scheduling" | "slot_kind">, sessions: SessionSlot[]) {
  const rows = activeSessions(sessions).filter((s) => s.kind === p.slot_kind);
  if (p.scheduling === "project") return "Ordered online and delivered in your portal";
  if (p.scheduling === "day") return "You choose the start day and the studio confirms the schedule";
  if (p.scheduling !== "slot" || !rows.length) return "";
  if (p.slot_kind === "night") return `${rows[0].label} · ${sessionDays(rows[0])} · ${sessionWindow(rows[0])}`;
  return `Choose from ${rows.length} fixed ${rows.length === 1 ? "session" : "sessions"} ${rows.every((s) => s.weekday == null) ? "every day" : "a day"}`;
}
