import type { Env } from "../env";
import { settingsRepo, type HoursRow } from "../repositories/settings";
import { bookingsRepo } from "../repositories/bookings";
import { addDays, daysBetween, minutesUntil, studioNow, weekday } from "../lib/time";
import { badRequest } from "../lib/errors";

export interface Busy { start_min: number; end_min: number; kind: string }
export interface Rules { buffer: number; step: number; minNotice: number; bookAhead: number }

export async function loadRules(env: Env): Promise<Rules & { holdMin: number; extraHourKobo: number; maxPeople: number; policyVersion: number }> {
  const s = await settingsRepo.all(env.DB);
  return {
    buffer: +s.buffer_min, step: +s.step_min, minNotice: +s.min_notice_min, bookAhead: +s.book_ahead_days,
    holdMin: +s.hold_min, extraHourKobo: +s.extra_hour_kobo, maxPeople: +s.max_people, policyVersion: +s.policy_version,
  };
}

/** Pure slot engine: start times inside opening hours that clear every booking, hold and block (bookings and holds get the buffer). */
export function computeSlots(p: { date: string; duration: number; hours: HoursRow | null; busy: Busy[]; rules: Rules; now?: Date }) {
  const { date, duration, hours, busy, rules } = p;
  if (!hours || !hours.is_open) return [];
  const daysAhead = daysBetween(studioNow(p.now).date, date);
  if (daysAhead < 0 || daysAhead > rules.bookAhead) return [];
  const slots: { start: number; available: boolean }[] = [];
  for (let s = hours.open_min; s + duration <= hours.close_min; s += rules.step) {
    const e = s + duration;
    const clash = busy.some((b) => {
      const pad = b.kind === "block" ? 0 : rules.buffer;
      return b.start_min < e + pad && b.end_min + pad > s;
    });
    const tooSoon = minutesUntil(date, s, p.now) < rules.minNotice;
    slots.push({ start: s, available: !clash && !tooSoon });
  }
  return slots;
}

export const availabilityService = {
  async slots(env: Env, date: string, duration: number) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw badRequest("Invalid date.");
    const [rules, hours, busy] = await Promise.all([loadRules(env), settingsRepo.hoursFor(env.DB, weekday(date)), bookingsRepo.busyOn(env.DB, date, new Date().toISOString())]);
    return { date, duration, open: hours?.is_open ? { from: hours.open_min, to: hours.close_min } : null, slots: computeSlots({ date, duration, hours: hours ?? null, busy, rules }) };
  },

  async month(env: Env, month: string, duration: number) {
    if (!/^\d{4}-\d{2}$/.test(month)) throw badRequest("Invalid month.");
    const rules = await loadRules(env);
    const hours = await settingsRepo.hours(env.DB);
    const first = `${month}-01`;
    const days: { date: string; status: "available" | "limited" | "full" | "closed" | "past" }[] = [];
    const now = new Date().toISOString();
    for (let d = first; d.startsWith(month); d = addDays(d, 1)) {
      const h = hours.find((x) => x.weekday === weekday(d)) ?? null;
      const ahead = daysBetween(studioNow().date, d);
      if (ahead < 0 || ahead > rules.bookAhead) { days.push({ date: d, status: "past" }); continue; }
      if (!h?.is_open) { days.push({ date: d, status: "closed" }); continue; }
      const slots = computeSlots({ date: d, duration, hours: h, busy: await bookingsRepo.busyOn(env.DB, d, now), rules });
      const free = slots.filter((s) => s.available).length;
      days.push({ date: d, status: free === 0 ? "full" : free <= 3 ? "limited" : "available" });
    }
    return { month, days };
  },
};
