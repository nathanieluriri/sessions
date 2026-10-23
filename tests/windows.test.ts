import { describe, expect, it } from "vitest";
import { computeSlots, computeWindows, dayStatus, relativeBusy, wholeDay, windowFor, windowsFor, type Win } from "../src/worker/services/availability";
import type { SessionSlotRow } from "../src/worker/repositories/catalog";

const row = (id: string, kind: "day" | "night", label: string, weekday: number | null, start_min: number, end_min: number, active = 1): SessionSlotRow =>
  ({ id, kind, label, weekday, start_min, end_min, sort: 0, active });
// The seeded session times: four day sessions every day and the All night session on Saturdays.
const SLOTS = [
  row("slot_day_1", "day", "Session 1", null, 600, 720), row("slot_day_2", "day", "Session 2", null, 750, 840),
  row("slot_day_3", "day", "Session 3", null, 870, 990), row("slot_day_4", "day", "Session 4", null, 1020, 1140),
  row("slot_night", "night", "All night session", 6, 1380, 1740),
];
const SAT = "2026-10-24", SUN = "2026-10-25", MON = "2026-10-26";
const rules = { buffer: 30, step: 30, minNotice: 180, bookAhead: 90 };
// Monday 12 October 2026, 08:00 UTC is 09:00 in Lagos.
const now = new Date("2026-10-12T08:00:00Z");
const open = (windows: Win[], busy: { start_min: number; end_min: number; kind: string }[] = [], date = SAT, at = now) =>
  computeWindows({ date, windows, busy, rules, now: at }).filter((w) => w.available).map((w) => w.label);

describe("windowsFor", () => {
  it("gives four day sessions on every weekday, in order", () => {
    for (const d of ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", SAT, SUN]) {
      expect(windowsFor(SLOTS, "day", d).map((w) => [w.label, w.start, w.end])).toEqual([["Session 1", 600, 720], ["Session 2", 750, 840], ["Session 3", 870, 990], ["Session 4", 1020, 1140]]);
    }
  });
  it("offers the all night session on Saturday only, running past midnight", () => {
    expect(windowsFor(SLOTS, "night", SAT)).toEqual([{ id: "slot_night", label: "All night session", kind: "night", start: 1380, end: 1740 }]);
    for (const d of [SUN, MON, "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"]) expect(windowsFor(SLOTS, "night", d)).toEqual([]);
  });
  it("ignores inactive rows, rows of another kind and rows that end before they start", () => {
    const rows = [...SLOTS, row("off", "day", "Hidden", null, 500, 560, 0), row("bad", "day", "Broken", null, 900, 900)];
    expect(windowsFor(rows, "day", MON).map((w) => w.label)).toEqual(["Session 1", "Session 2", "Session 3", "Session 4"]);
  });
  it("sorts by start time whatever order the rows come in", () => {
    expect(windowsFor([...SLOTS].reverse(), "day", MON).map((w) => w.start)).toEqual([600, 750, 870, 1020]);
  });
  it("lets a weekday row add a session on its day only", () => {
    const rows = [...SLOTS, row("fri", "day", "Friday late", 5, 1170, 1260)];
    expect(windowsFor(rows, "day", "2026-10-23").map((w) => w.label)).toContain("Friday late");
    expect(windowsFor(rows, "day", MON).map((w) => w.label)).not.toContain("Friday late");
  });
});

describe("wholeDay and windowFor", () => {
  it("covers the first session start to the last session end", () => {
    expect(wholeDay(windowsFor(SLOTS, "day", MON))).toMatchObject({ start: 600, end: 1140 });
    expect(wholeDay([])).toBeNull();
  });
  it("accepts only the start of one of the open sessions", () => {
    const slot = { scheduling: "slot", slot_kind: "day" as const };
    expect(windowFor(SLOTS, slot, MON, 750)).toMatchObject({ label: "Session 2", end: 840 });
    for (const bad of [0, 600 + 30, 780, 1139, 1380]) expect(windowFor(SLOTS, slot, MON, bad)).toBeNull();
  });
  it("matches the all night session only on Saturday at 11pm", () => {
    const night = { scheduling: "slot", slot_kind: "night" as const };
    expect(windowFor(SLOTS, night, SAT, 1380)).toMatchObject({ end: 1740 });
    expect(windowFor(SLOTS, night, SUN, 1380)).toBeNull();
    expect(windowFor(SLOTS, night, SAT, 1350)).toBeNull();
  });
  it("matches a day package on the start of the whole day only", () => {
    const day = { scheduling: "day", slot_kind: "day" as const };
    expect(windowFor(SLOTS, day, MON, 600)).toMatchObject({ start: 600, end: 1140 });
    expect(windowFor(SLOTS, day, MON, 750)).toBeNull();
  });
});

describe("computeWindows", () => {
  const day = windowsFor(SLOTS, "day", SAT);
  it("offers every session when the room is empty", () => {
    expect(open(day)).toEqual(["Session 1", "Session 2", "Session 3", "Session 4"]);
  });
  it("keeps Session 2 open next to a booked Session 1, because the gap equals the 30 minute buffer", () => {
    expect(open(day, [{ start_min: 600, end_min: 720, kind: "booking" }])).toEqual(["Session 2", "Session 3", "Session 4"]);
    expect(open(day, [{ start_min: 750, end_min: 840, kind: "booking" }])).toEqual(["Session 1", "Session 3", "Session 4"]);
    expect(open(day, [{ start_min: 870, end_min: 990, kind: "booking" }])).toEqual(["Session 1", "Session 2", "Session 4"]);
  });
  it("closes the neighbour once the buffer is a minute longer than the gap", () => {
    const wide = { ...rules, buffer: 31 };
    const free = computeWindows({ date: SAT, windows: day, busy: [{ start_min: 600, end_min: 720, kind: "booking" }], rules: wide, now }).filter((w) => w.available).map((w) => w.label);
    expect(free).toEqual(["Session 3", "Session 4"]);
  });
  it("treats holds like bookings and blocks without a buffer", () => {
    expect(open(day, [{ start_min: 870, end_min: 990, kind: "hold" }])).toEqual(["Session 1", "Session 2", "Session 4"]);
    expect(open(day, [{ start_min: 1140, end_min: 1200, kind: "block" }])).toEqual(["Session 1", "Session 2", "Session 3", "Session 4"]);
    expect(open(day, [{ start_min: 1130, end_min: 1200, kind: "block" }])).toEqual(["Session 1", "Session 2", "Session 3"]);
  });
  it("offers a whole day only when every part of it is free", () => {
    const whole = [wholeDay(day)!];
    expect(open(whole)).toEqual(["Whole day"]);
    expect(open(whole, [{ start_min: 1020, end_min: 1140, kind: "booking" }])).toEqual([]);
    expect(open(whole, [{ start_min: 1170, end_min: 1230, kind: "booking" }])).toEqual(["Whole day"]);
    expect(open(whole, [{ start_min: 1169, end_min: 1230, kind: "booking" }])).toEqual([]);
  });
  it("holds the night session against bookings, holds and blocks in the early hours of Sunday", () => {
    const night = windowsFor(SLOTS, "night", SAT);
    expect(open(night)).toEqual(["All night session"]);
    // Minutes past 1440 are Sunday morning on the Saturday timeline: 1560 is 02:00 and 1740 is 05:00, when the session ends.
    expect(open(night, [{ start_min: 1560, end_min: 1680, kind: "booking" }])).toEqual([]);
    expect(open(night, [{ start_min: 1710, end_min: 1770, kind: "block" }])).toEqual([]);
    expect(open(night, [{ start_min: 1740, end_min: 1800, kind: "block" }])).toEqual(["All night session"]);
    expect(open(night, [{ start_min: 1770, end_min: 1830, kind: "booking" }])).toEqual(["All night session"]);
    expect(open(night, [{ start_min: 1769, end_min: 1830, kind: "booking" }])).toEqual([]);
    expect(open(night, [{ start_min: 1769, end_min: 1830, kind: "hold" }])).toEqual([]);
  });
  it("respects the notice period measured from the window start on the booking date", () => {
    const night = windowsFor(SLOTS, "night", SAT);
    const at = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 24, h - 1, m));
    expect(open(night, [], SAT, at(19, 59))).toEqual(["All night session"]);
    expect(open(night, [], SAT, at(20, 0))).toEqual(["All night session"]);
    expect(open(night, [], SAT, at(20, 1))).toEqual([]);
    expect(open(night, [], SAT, at(23, 30))).toEqual([]);
  });
  it("shuts a session that is already under way, and every session of a past day", () => {
    const at = new Date("2026-10-24T09:00:00Z");
    expect(open(day, [], SAT, at)).toEqual(["Session 3", "Session 4"]);
    expect(open(day, [], SAT, new Date("2026-10-24T14:00:00Z"))).toEqual([]);
    expect(computeWindows({ date: "2026-10-23", windows: windowsFor(SLOTS, "day", "2026-10-23"), busy: [], rules, now: at })).toEqual([]);
  });
  it("closes the night session of a Saturday that has begun, even from the small hours of Sunday", () => {
    const night = windowsFor(SLOTS, "night", SAT);
    expect(computeWindows({ date: SAT, windows: night, busy: [], rules, now: new Date("2026-10-25T02:00:00Z") })).toEqual([]);
  });
  it("stops offering dates beyond the booking horizon", () => {
    expect(computeWindows({ date: "2027-02-01", windows: day, busy: [], rules, now })).toEqual([]);
    expect(open(windowsFor(SLOTS, "day", "2027-01-09"), [], "2027-01-09")).toHaveLength(4);
  });
});

describe("relativeBusy", () => {
  it("moves neighbouring dates onto the timeline of the day asked about", () => {
    const rows = [
      { date: SAT, start_min: 1380, end_min: 1740, kind: "booking" }, { date: SUN, start_min: 600, end_min: 720, kind: "booking" },
      { date: "2026-10-23", start_min: 600, end_min: 720, kind: "hold" }, { date: "2026-10-27", start_min: 600, end_min: 720, kind: "block" },
    ];
    expect(relativeBusy(rows, SUN)).toEqual([
      { start_min: 1380 - 1440, end_min: 1740 - 1440, kind: "booking" }, { start_min: 600, end_min: 720, kind: "booking" },
    ]);
    expect(relativeBusy(rows, SAT)).toEqual([
      { start_min: 1380, end_min: 1740, kind: "booking" }, { start_min: 2040, end_min: 2160, kind: "booking" }, { start_min: -840, end_min: -720, kind: "hold" },
    ]);
  });
  it("lets last night's session close the first hour of Sunday for a flex booking", () => {
    const hours = { weekday: 0, is_open: 1, open_min: 0, close_min: 600 };
    const busy = relativeBusy([{ date: SAT, start_min: 1380, end_min: 1740, kind: "booking" }], SUN);
    const free = computeSlots({ date: SUN, duration: 60, hours, busy, rules, now }).filter((s) => s.available).map((s) => s.start);
    expect(free[0]).toBe(330);
  });
});

describe("dayStatus", () => {
  it("is closed with no windows, full with none free, limited with one of several left", () => {
    expect(dayStatus(0, 0)).toBe("closed");
    expect(dayStatus(4, 0)).toBe("full");
    expect(dayStatus(4, 1)).toBe("limited");
    expect(dayStatus(4, 2)).toBe("available");
    expect(dayStatus(4, 4)).toBe("available");
  });
  it("calls a single free window available, since nothing else exists to run out", () => {
    expect(dayStatus(1, 1)).toBe("available");
    expect(dayStatus(1, 0)).toBe("full");
  });
});
