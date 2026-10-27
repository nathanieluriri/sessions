import { describe, expect, it } from "vitest";
import { addDays, endsNextDay, hhmm, isDate, label12, studioNow, timeRange, weekday, weekdayName } from "../src/worker/lib/time";
import * as client from "../src/client/lib/format";
import { when } from "../src/worker/services/emails";

describe("overnight formatting on the server", () => {
  it("wraps minutes above 1439 onto the next day's clock", () => {
    expect(label12(1740)).toBe("5:00am");
    expect(label12(1380)).toBe("11:00pm");
    expect(label12(1440)).toBe("12:00am");
    expect(label12(1439)).toBe("11:59pm");
    expect(label12(0)).toBe("12:00am");
    expect(label12(720)).toBe("12:00pm");
    expect(label12(750)).toBe("12:30pm");
    expect(hhmm(1740)).toBe("05:00");
    expect(hhmm(1380)).toBe("23:00");
    expect(hhmm(1440)).toBe("00:00");
  });
  it("knows when an end falls on the next day", () => {
    expect(endsNextDay(1740)).toBe(true);
    expect(endsNextDay(1440)).toBe(true);
    expect(endsNextDay(1439)).toBe(false);
    expect(endsNextDay(1140)).toBe(false);
  });
  it("names the day after the date for a session that runs past midnight", () => {
    expect(timeRange("2026-10-24", 1380, 1740)).toBe("11:00pm to 5:00am (Sunday)");
    expect(timeRange("2026-10-31", 1380, 1740)).toBe("11:00pm to 5:00am (Sunday)");
    expect(timeRange("2026-12-31", 1380, 1740)).toBe("11:00pm to 5:00am (Friday)");
    expect(timeRange("2026-10-26", 600, 720)).toBe("10:00am to 12:00pm");
    expect(timeRange("2026-10-26", 750, 840)).toBe("12:30pm to 2:00pm");
  });
  it("puts the overnight range in the when line used by emails and notices", () => {
    expect(when({ date: "2026-10-24", start_min: 1380, end_min: 1740 })).toBe("Saturday, 24 October 2026, 11:00pm to 5:00am (Sunday)");
    expect(when({ date: "2026-10-23", start_min: 0, end_min: 0, scheduling: "project" })).toBe("ordered Friday, 23 October 2026");
  });
});

describe("dates", () => {
  it("accepts real calendar dates only", () => {
    expect(isDate("2026-10-24")).toBe(true);
    expect(isDate("2028-02-29")).toBe(true);
    for (const bad of ["2026-02-30", "2026-13-01", "2026-10-32", "2026-1-1", "", "tomorrow", "2026-10-24T00:00"]) expect(isDate(bad)).toBe(false);
  });
  it("keeps Lagos time with no daylight saving", () => {
    expect(studioNow(new Date("2026-10-24T22:59:00Z"))).toEqual({ date: "2026-10-24", minute: 23 * 60 + 59 });
    expect(studioNow(new Date("2026-10-24T23:00:00Z"))).toEqual({ date: "2026-10-25", minute: 0 });
    expect(weekday("2026-10-24")).toBe(6);
    expect(weekdayName(addDays("2026-10-24", 1))).toBe("Sunday");
  });
});

describe("overnight formatting in the app", () => {
  it("matches the server", () => {
    expect(client.t12(1740)).toBe("5:00am");
    expect(client.t12(1380)).toBe("11:00pm");
    expect(client.t12(1440)).toBe("12:00am");
    expect(client.t12(750)).toBe("12:30pm");
    expect(client.hm(1740)).toBe("05:00");
    expect(client.hm(1380)).toBe("23:00");
    expect(client.endsNextDay(1740)).toBe(true);
    expect(client.endsNextDay(1140)).toBe(false);
    expect(client.timeRange("2026-10-24", 1380, 1740)).toBe("11:00pm to 5:00am (Sunday)");
    expect(client.timeRange("2026-10-26", 1020, 1140)).toBe("5:00pm to 7:00pm");
  });
});
