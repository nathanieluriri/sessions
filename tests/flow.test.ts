import { describe, expect, it } from "vitest";
import {
  canonicalService, deliveryLabel, extrasFor, featuredPackages, flowGuard, nightLines, revisionLabel, savings, sessionWindow, stepsFor, windowLabel,
} from "../src/client/lib/booking";
import type { Package, SessionSlot } from "../src/client/lib/catalog";

const pkg = (o: Partial<Package>): Package => ({
  id: "p", slug: "p", name: "P", description: "", category: "session", duration_min: 120, price_kobo: 8_000_000, includes: [], featured: 0, active: 1, sort: 0,
  service_category: "music", room_id: null, pricing: "fixed", deposit_percent: null, requires_approval: 0, price_note: "", service_slug: "recording", scheduling: "slot",
  slot_kind: "day", unit: "per session", compare_at_kobo: null, turnaround_days: null, revision_limit: 0, tracks: null, ...o,
});
const slot = (id: string, kind: "day" | "night", weekday: number | null, start_min: number, end_min: number, sort = 0): SessionSlot => ({ id, kind, label: id, weekday, start_min, end_min, sort, active: 1 });
const SESSIONS = [slot("s1", "day", null, 600, 720), slot("s2", "day", null, 750, 840), slot("night", "night", 6, 1380, 1740, 10)];
const keys = (s: { key: string }[]) => s.map((x) => x.key);

describe("stepsFor", () => {
  const session = pkg({ id: "a" }), other = pkg({ id: "b" }), remote = pkg({ id: "r", scheduling: "project" }), day = pkg({ id: "d", scheduling: "day" });
  it("gives a single session package no package step", () => {
    expect(keys(stepsFor([session]))).toEqual(["service", "time", "details", "checkout"]);
  });
  it("asks for the package when there is a choice, and for time only when the chosen package has one", () => {
    expect(keys(stepsFor([session, other]))).toEqual(["service", "package", "time", "details", "checkout"]);
    expect(keys(stepsFor([remote]))).toEqual(["service", "details", "checkout"]);
    expect(keys(stepsFor([remote, session], "r"))).toEqual(["service", "package", "details", "checkout"]);
    expect(keys(stepsFor([remote, session], "a"))).toEqual(["service", "package", "time", "details", "checkout"]);
  });
  it("calls the time step the start day for whole-day packages", () => {
    expect(stepsFor([day]).find((s) => s.key === "time")?.label).toBe("Start day");
    expect(stepsFor([session]).find((s) => s.key === "time")?.label).toBe("Date & time");
  });
});

describe("flowGuard", () => {
  const cat = { services: [{ slug: "recording", category: "music" }, { slug: "beats", category: "music" }, { slug: "ad", category: "music" }] as any, sessions: SESSIONS,
    packages: [pkg({ id: "a" }), pkg({ id: "r", service_slug: "beats", scheduling: "project" }), pkg({ id: "q", service_slug: "ad", pricing: "quote" })] };
  const today = "2026-10-12";
  it("sends a stale or empty draft back to the first step it lacks", () => {
    expect(flowGuard(cat, {}, "details", today)).toBe("/book");
    expect(flowGuard(cat, { serviceSlug: "ad" }, "details", today)).toBe("/book");
    expect(flowGuard(cat, { serviceSlug: "recording" }, "details", today)).toBe("/book/time");
    expect(flowGuard(cat, { serviceSlug: "recording", date: "2026-10-01", start: 600 }, "details", today)).toBe("/book/time");
    expect(flowGuard(cat, { serviceSlug: "recording", date: "2026-10-20", start: 601 }, "checkout", today)).toBe("/book/time");
    expect(flowGuard(cat, { serviceSlug: "recording", date: "2026-10-20", start: 600 }, "checkout", today)).toBeNull();
  });
  it("skips steps that do not apply and follows the old service slugs", () => {
    expect(flowGuard(cat, { serviceSlug: "beats" }, "time", today)).toBe("/book/details");
    expect(flowGuard(cat, { serviceSlug: "beats" }, "package", today)).toBe("/book/details");
    expect(flowGuard(cat, { serviceSlug: "beats" }, "checkout", today)).toBeNull();
    expect(flowGuard(cat, { serviceSlug: "vocal-recording", date: "2026-10-20", start: 750 }, "details", today)).toBeNull();
  });
  it("only accepts the night session on Saturdays", () => {
    const night = { ...cat, packages: [pkg({ id: "n", slot_kind: "night" })] };
    expect(flowGuard(night, { serviceSlug: "recording", date: "2026-10-24", start: 1380 }, "details", today)).toBeNull();
    expect(flowGuard(night, { serviceSlug: "recording", date: "2026-10-23", start: 1380 }, "details", today)).toBe("/book/time");
  });
});

describe("labels and money", () => {
  it("redirects removed service slugs and leaves others alone", () => {
    for (const s of ["vocal-recording", "voice-over", "song-arrangement"]) expect(canonicalService(s)).toBe("recording");
    for (const s of ["mixing", "mastering", "vocal-editing"]) expect(canonicalService(s)).toBe("mixing-mastering");
    expect(canonicalService("beats")).toBe("beats");
    expect(canonicalService(undefined)).toBeUndefined();
  });
  it("reads windows plainly, and names the next day for overnight ones", () => {
    expect(windowLabel("2026-10-20", 600, 720)).toBe("10:00am to 12:00noon");
    expect(windowLabel("2026-10-24", 1380, 1740)).toBe("11:00pm to 5:00am (Sunday)");
    expect(sessionWindow(SESSIONS[2])).toBe("11:00pm to 5:00am (Sunday)");
  });
  it("shows savings only when the regular price is higher", () => {
    expect(savings({ price_kobo: 10_000_000, compare_at_kobo: 12_500_000 })).toEqual({ regular: 12_500_000, kobo: 2_500_000, percent: 20 });
    expect(savings({ price_kobo: 10_000_000, compare_at_kobo: 10_000_000 })).toBeNull();
    expect(savings({ price_kobo: 10_000_000, compare_at_kobo: null })).toBeNull();
  });
  it("words delivery and revisions with the right plural", () => {
    expect(deliveryLabel(1)).toBe("Delivered within 1 day");
    expect(deliveryLabel(7)).toBe("Delivered within 7 days");
    expect(deliveryLabel(null)).toBe("");
    expect(revisionLabel(1)).toBe("Up to 1 revision");
    expect(revisionLabel(3)).toBe("Up to 3 revisions");
    expect(revisionLabel(0)).toBe("");
  });
  it("lists the night session lines for the footer from the session rows", () => {
    expect(nightLines(SESSIONS)).toEqual([{ days: "Saturday night", time: "11:00pm to 5:00am" }]);
  });
  it("features flagged packages first, at most three, else the first bookable ones", () => {
    const list = [pkg({ id: "1", sort: 1 }), pkg({ id: "2", sort: 2, featured: 1 }), pkg({ id: "3", sort: 3 }), pkg({ id: "4", sort: 0, pricing: "quote" }), pkg({ id: "5", sort: 4, featured: 1, active: 0 })];
    expect(featuredPackages({ packages: list }).map((p) => p.id)).toEqual(["2"]);
    expect(featuredPackages({ packages: list.map((p) => ({ ...p, featured: 0 })) }).map((p) => p.id)).toEqual(["1", "2", "3"]);
  });
  it("scopes extras to a category and, when set, a service", () => {
    const extras = [{ slug: "a", category: "music", service_slug: "" }, { slug: "b", category: "", service_slug: "beats" }, { slug: "c", category: "video", service_slug: "" }] as any;
    expect(extrasFor({ extras }, { slug: "recording", category: "music" }).map((e) => e.slug)).toEqual(["a"]);
    expect(extrasFor({ extras }, { slug: "beats", category: "music" }).map((e) => e.slug)).toEqual(["a", "b"]);
  });
});
