import type { Env } from "../env";
import { settingsRepo, type HoursRow } from "../repositories/settings";
import { bookingsRepo } from "../repositories/bookings";
import { catalogRepo, type PackageRow, type RoomRow, type SessionSlotRow } from "../repositories/catalog";
import { addDays, daysBetween, isDate, minutesUntil, studioNow, weekday } from "../lib/time";
import { badRequest } from "../lib/errors";

export interface Busy { start_min: number; end_min: number; kind: string }
export interface Rules { buffer: number; step: number; minNotice: number; bookAhead: number }
/** A bookable session window: minutes from midnight of the booking date, with `end` above 1440 when it runs past midnight. */
export interface Win { id: string; label: string; kind: "day" | "night"; start: number; end: number }
export type DayStatus = "available" | "limited" | "full" | "closed" | "past";

export async function loadRules(env: Env) {
  const s = await settingsRepo.all(env.DB);
  return {
    buffer: +s.buffer_min, step: +s.step_min, minNotice: +s.min_notice_min, bookAhead: +s.book_ahead_days,
    holdMin: +s.hold_min, extraHourKobo: +s.extra_hour_kobo, maxPeople: +s.max_people, policyVersion: +s.policy_version,
    depositPercent: +(s.deposit_percent ?? 50), requireApproval: s.require_approval === "1", requestExpiryHours: +(s.request_expiry_hours ?? 48),
    paymentWindowHours: +(s.payment_window_hours ?? 24), reminderHours: +(s.reminder_hours ?? 24),
  };
}

const clashes = (busy: Busy[], start: number, end: number, buffer: number) =>
  busy.some((b) => {
    const pad = b.kind === "block" ? 0 : buffer;
    return b.start_min < end + pad && b.end_min + pad > start;
  });

/** Pure slot engine: start times inside opening hours that clear every booking, hold and block (bookings and holds get the buffer). */
export function computeSlots(p: { date: string; duration: number; hours: HoursRow | null; busy: Busy[]; rules: Rules; now?: Date }) {
  const { date, duration, hours, busy, rules } = p;
  if (!hours || !hours.is_open) return [];
  const daysAhead = daysBetween(studioNow(p.now).date, date);
  if (daysAhead < 0 || daysAhead > rules.bookAhead) return [];
  const slots: { start: number; available: boolean }[] = [];
  for (let s = hours.open_min; s + duration <= hours.close_min; s += rules.step) {
    const tooSoon = minutesUntil(date, s, p.now) < rules.minNotice;
    slots.push({ start: s, available: !clashes(busy, s, s + duration, rules.buffer) && !tooSoon });
  }
  return slots;
}

/** Active session windows of one kind for a date, earliest first. A row without a weekday runs every day. */
export function windowsFor(rows: SessionSlotRow[], kind: "day" | "night", date: string): Win[] {
  const wd = weekday(date);
  return rows.filter((s) => s.active && s.kind === kind && s.end_min > s.start_min && (s.weekday == null || s.weekday === wd))
    .sort((a, b) => a.start_min - b.start_min).map((s) => ({ id: s.id, label: s.label, kind: s.kind, start: s.start_min, end: s.end_min }));
}

/** The whole studio day for day-mode packages: first session start to last session end. */
export function wholeDay(wins: Win[]): Win | null {
  return wins.length ? { id: "day", label: "Whole day", kind: wins[0].kind, start: wins[0].start, end: Math.max(...wins.map((w) => w.end)) } : null;
}

/** The window a fixed-time package books when the client picks `start` on `date`, or null if it is not one of the open sessions. */
export function windowFor(rows: SessionSlotRow[], pkg: { scheduling: string; slot_kind: "day" | "night" }, date: string, start: number): Win | null {
  const wins = windowsFor(rows, pkg.slot_kind, date);
  const w = pkg.scheduling === "day" ? wholeDay(wins) : wins.find((x) => x.start === start) ?? null;
  return w && w.start === start ? w : null;
}

/**
 * Pure window engine. `busy` is in minutes relative to `date` (see relativeBusy), so a session that ran past midnight from the day before
 * is already shifted. A window is open when it clears every booking, hold and block, starts after the notice period and the date is bookable.
 */
export function computeWindows(p: { date: string; windows: Win[]; busy: Busy[]; rules: Rules; now?: Date }) {
  const ahead = daysBetween(studioNow(p.now).date, p.date);
  if (ahead < 0 || ahead > p.rules.bookAhead) return [];
  return p.windows.map((w) => ({ ...w, available: minutesUntil(p.date, w.start, p.now) >= p.rules.minNotice && !clashes(p.busy, w.start, w.end, p.rules.buffer) }));
}

export const dayStatus = (total: number, free: number): DayStatus => (total === 0 ? "closed" : free === 0 ? "full" : free === 1 && total > 1 ? "limited" : "available");

/** Busy rows from the dates around `date`, shifted onto its timeline. */
export const relativeBusy = (rows: (Busy & { date: string })[], date: string): Busy[] =>
  rows.filter((b) => Math.abs(daysBetween(date, b.date)) <= 1).map((b) => {
    const shift = daysBetween(date, b.date) * 1440;
    return { start_min: b.start_min + shift, end_min: b.end_min + shift, kind: b.kind };
  });

async function roomFor(env: Env, roomId: string) {
  const rooms = await catalogRepo.rooms(env.DB);
  const room = rooms.find((r) => r.id === roomId) ?? rooms[0];
  if (!room) throw badRequest("No rooms are set up yet.");
  return room;
}

async function packageFor(env: Env, packageId: string) {
  const pkg = await catalogRepo.packageById(env.DB, packageId);
  if (!pkg || !pkg.active) throw badRequest("This package is no longer available.");
  return pkg;
}

async function packageRoom(env: Env, pkg: PackageRow) {
  const room = pkg.room_id ? await catalogRepo.roomById(env.DB, pkg.room_id) : null;
  if (!room || !room.active) throw badRequest("This package is not linked to an open room yet.");
  return room;
}

const span = (wins: Win[]) => (wins.length ? { from: wins[0].start, to: Math.max(...wins.map((w) => w.end)) } : null);

/** What a package books on a date: its session windows (a closed weekday has none), or the whole day for day-mode packages. */
function windowsOn(rows: SessionSlotRow[], pkg: PackageRow, date: string, hours: HoursRow | null | undefined) {
  if (!hours?.is_open) return [];
  const wins = windowsFor(rows, pkg.slot_kind, date);
  const day = pkg.scheduling === "day" ? wholeDay(wins) : null;
  return pkg.scheduling === "day" ? (day ? [day] : []) : wins;
}

export const availabilityService = {
  /** One day. With a package the answer follows its scheduling mode; without one it is the flex grid for `duration` and `roomId`. */
  async day(env: Env, q: { date: string; packageId?: string; duration?: number; roomId?: string }, now = new Date()) {
    if (!isDate(q.date)) throw badRequest("Invalid date.");
    const date = q.date;
    const pkg = q.packageId ? await packageFor(env, q.packageId) : null;
    const mode = pkg?.scheduling ?? "flex";
    if (mode === "project") return { date: studioNow(now).date, mode, room: null, open: null, slots: [] };
    const duration = q.duration ?? pkg?.duration_min ?? 120;
    if (mode === "flex" && !(Number.isInteger(duration) && duration > 0 && duration <= 1440)) throw badRequest("Invalid duration.");
    const room: RoomRow = pkg ? await packageRoom(env, pkg) : await roomFor(env, q.roomId ?? "");
    const [rules, hours, busy, rows] = await Promise.all([
      loadRules(env), settingsRepo.hoursFor(env.DB, weekday(date)),
      bookingsRepo.busyBetween(env.DB, addDays(date, -1), addDays(date, 1), room.id, now.toISOString()), mode === "flex" ? [] : catalogRepo.sessionSlots(env.DB),
    ]);
    const near = relativeBusy(busy, date);
    if (!pkg || mode === "flex") {
      return { date, mode: "flex" as const, duration, room: room.id, open: hours?.is_open ? { from: hours.open_min, to: hours.close_min } : null, slots: computeSlots({ date, duration, hours: hours ?? null, busy: near, rules, now }) };
    }
    const windows = windowsOn(rows, pkg, date, hours);
    return { date, mode, kind: pkg.slot_kind, room: room.id, open: span(windows), slots: computeWindows({ date, windows, busy: near, rules, now }) };
  },

  /** One month of day statuses. Project packages need no calendar: they have no time, so `days` is empty. */
  async month(env: Env, q: { month: string; packageId?: string; duration?: number; roomId?: string }, now = new Date()) {
    if (!/^\d{4}-\d{2}$/.test(q.month) || !isDate(`${q.month}-01`)) throw badRequest("Invalid month.");
    const month = q.month;
    const pkg = q.packageId ? await packageFor(env, q.packageId) : null;
    const mode = pkg?.scheduling ?? "flex";
    if (mode === "project") return { month, mode, room: null, days: [] };
    const duration = q.duration ?? pkg?.duration_min ?? 120;
    if (mode === "flex" && !(Number.isInteger(duration) && duration > 0 && duration <= 1440)) throw badRequest("Invalid duration.");
    const room: RoomRow = pkg ? await packageRoom(env, pkg) : await roomFor(env, q.roomId ?? "");
    const first = `${month}-01`;
    const last = addDays(addDays(first, 31).slice(0, 7) + "-01", -1);
    const [rules, hours, busy, rows] = await Promise.all([
      loadRules(env), settingsRepo.hours(env.DB), bookingsRepo.busyBetween(env.DB, addDays(first, -1), addDays(last, 1), room.id, now.toISOString()),
      mode === "flex" ? [] : catalogRepo.sessionSlots(env.DB),
    ]);
    const days: { date: string; status: DayStatus; free: number; total: number }[] = [];
    for (let d = first; d.startsWith(month); d = addDays(d, 1)) {
      const h = hours.find((x) => x.weekday === weekday(d)) ?? null;
      const ahead = daysBetween(studioNow(now).date, d);
      if (ahead < 0 || ahead > rules.bookAhead) { days.push({ date: d, status: "past", free: 0, total: 0 }); continue; }
      const near = relativeBusy(busy, d);
      if (!pkg || mode === "flex") {
        if (!h?.is_open) { days.push({ date: d, status: "closed", free: 0, total: 0 }); continue; }
        const slots = computeSlots({ date: d, duration, hours: h, busy: near, rules, now });
        const free = slots.filter((s) => s.available).length;
        days.push({ date: d, status: free === 0 ? "full" : free <= 3 ? "limited" : "available", free, total: slots.length });
        continue;
      }
      const slots = computeWindows({ date: d, windows: windowsOn(rows, pkg, d, h), busy: near, rules, now });
      const free = slots.filter((s) => s.available).length;
      days.push({ date: d, status: dayStatus(slots.length, free), free, total: slots.length });
    }
    return { month, mode: pkg?.scheduling ?? "flex", kind: pkg && mode !== "flex" ? pkg.slot_kind : undefined, room: room.id, days };
  },
};
