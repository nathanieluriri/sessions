import { describe, expect, it } from "vitest";
import { computeSlots } from "../src/worker/services/availability";

const hours = { weekday: 6, is_open: 1, open_min: 600, close_min: 1320 };
const rules = { buffer: 30, step: 30, minNotice: 180, bookAhead: 90 };
const now = new Date("2026-10-12T08:00:00Z");
const free = (busy: { start_min: number; end_min: number; kind: string }[], duration = 120) =>
  computeSlots({ date: "2026-10-24", duration, hours, busy, rules, now }).filter((s) => s.available).map((s) => s.start);

describe("computeSlots", () => {
  it("offers every start time that fits inside opening hours", () => {
    expect(free([])).toEqual(Array.from({ length: 21 }, (_, i) => 600 + i * 30));
  });
  it("keeps the buffer around existing bookings", () => {
    const starts = free([{ start_min: 840, end_min: 960, kind: "booking" }]);
    expect(starts).not.toContain(720);
    expect(starts).toContain(690);
    expect(starts).not.toContain(960);
    expect(starts).toContain(990);
  });
  it("treats active holds like bookings", () => {
    expect(free([{ start_min: 600, end_min: 720, kind: "hold" }])).not.toContain(720);
  });
  it("blocks apply without a buffer", () => {
    const starts = free([{ start_min: 1080, end_min: 1320, kind: "block" }]);
    expect(starts).toContain(960);
    expect(starts).not.toContain(990);
  });
  it("respects minimum notice and closed days", () => {
    expect(computeSlots({ date: "2026-10-12", duration: 120, hours, busy: [], rules, now }).filter((s) => s.available)[0].start).toBe(720);
    expect(computeSlots({ date: "2026-10-24", duration: 120, hours: { ...hours, is_open: 0 }, busy: [], rules, now })).toEqual([]);
  });
});
