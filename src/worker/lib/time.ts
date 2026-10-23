// The studio runs on Lagos time (WAT, UTC+1, no daylight saving), so local dates and minutes are stored directly.
const OFFSET_MIN = 60;

export function studioNow(now = new Date()) {
  const local = new Date(now.getTime() + OFFSET_MIN * 60000);
  return { date: local.toISOString().slice(0, 10), minute: local.getUTCHours() * 60 + local.getUTCMinutes() };
}

export function weekday(date: string) {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

export function minutesUntil(date: string, minute: number, now = new Date()) {
  const n = studioNow(now);
  return daysBetween(n.date, date) * 1440 + minute - n.minute;
}

export const isoIn = (minutes: number, now = new Date()) => new Date(now.getTime() + minutes * 60000).toISOString();

/** Minutes run past 1439 for sessions that end after midnight, so the clock wraps: 1740 reads 05:00. */
const clock = (m: number) => ((m % 1440) + 1440) % 1440;

export const hhmm = (m: number) => `${String(Math.floor(clock(m) / 60)).padStart(2, "0")}:${String(clock(m) % 60).padStart(2, "0")}`;

export function label12(m: number) {
  const h = Math.floor(clock(m) / 60), mm = clock(m) % 60, ap = h >= 12 ? "pm" : "am";
  return `${((h + 11) % 12) + 1}:${String(mm).padStart(2, "0")}${ap}`;
}

export const endsNextDay = (end: number) => end >= 1440;

/** A calendar date that exists: February 30 is rejected rather than rolled into March. */
export function isDate(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

export function prettyDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export const weekdayName = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });

/** "11:00pm to 5:00am (Sunday)": the weekday named in brackets is the day after `date`. */
export const timeRange = (date: string, start: number, end: number) =>
  `${label12(start)} to ${label12(end)}${endsNextDay(end) ? ` (${weekdayName(addDays(date, 1))})` : ""}`;
