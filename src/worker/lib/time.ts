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

export const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export function label12(m: number) {
  const h = Math.floor(m / 60), mm = m % 60, ap = h >= 12 ? "pm" : "am";
  return `${((h + 11) % 12) + 1}:${String(mm).padStart(2, "0")}${ap}`;
}

export function prettyDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
