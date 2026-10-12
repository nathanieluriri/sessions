import { describe, expect, it } from "vitest";
import { depositFor, dueNow, refundShare } from "../src/worker/services/bookings";
import { embedFor } from "../src/client/components/content";
import type { BookingRow } from "../src/worker/repositories/bookings";

const booking = (b: Partial<BookingRow>) => ({ status: "confirmed", total_kobo: 9_000_000, amount_paid_kobo: 0, refunded_kobo: 0, deposit_kobo: 4_500_000, ...b }) as BookingRow;

describe("depositFor", () => {
  it("takes the percentage and rounds to the nearest ₦100", () => {
    expect(depositFor(4_500_000, 50)).toBe(2_250_000);
    expect(depositFor(8_500_000, 30)).toBe(2_550_000);
    expect(depositFor(2_512_345, 50)).toBe(1_260_000);
  });
  it("treats 0 and 100 as pay in full", () => {
    expect(depositFor(2_500_000, 0)).toBe(2_500_000);
    expect(depositFor(2_500_000, 100)).toBe(2_500_000);
  });
});

describe("refundShare", () => {
  it("follows the cancellation policy", () => {
    expect(refundShare(72 * 60)).toBe(1);
    expect(refundShare(72 * 60 - 1)).toBe(0.5);
    expect(refundShare(24 * 60)).toBe(0.5);
    expect(refundShare(24 * 60 - 1)).toBe(0);
  });
});

describe("dueNow", () => {
  it("offers the deposit or the full amount after approval", () => {
    expect(dueNow(booking({ status: "approved" }))).toEqual({ full: 9_000_000, deposit: 4_500_000, kind: "approval" });
  });
  it("asks only for the balance once confirmed", () => {
    expect(dueNow(booking({ amount_paid_kobo: 4_500_000 }))).toEqual({ full: 4_500_000, deposit: 0, kind: "balance" });
    expect(dueNow(booking({ amount_paid_kobo: 9_000_000 })).full).toBe(0);
  });
  it("counts refunds against what was paid", () => {
    expect(dueNow(booking({ amount_paid_kobo: 9_000_000, refunded_kobo: 1_000_000 })).full).toBe(1_000_000);
  });
  it("has nothing due on requests and closed bookings", () => {
    expect(dueNow(booking({ status: "pending" })).kind).toBe("none");
    expect(dueNow(booking({ status: "cancelled" })).kind).toBe("none");
  });
});

describe("embedFor", () => {
  it("turns YouTube links into privacy-friendly players", () => {
    expect(embedFor("https://www.youtube.com/watch?v=aqz-KE-bpKQ")?.src).toContain("youtube-nocookie.com/embed/aqz-KE-bpKQ");
    expect(embedFor("https://youtu.be/aqz-KE-bpKQ")?.kind).toBe("video");
    expect(embedFor("https://youtube.com/shorts/aqz-KE-bpKQ")?.thumb).toContain("aqz-KE-bpKQ");
  });
  it("supports Vimeo, Spotify and SoundCloud", () => {
    expect(embedFor("https://vimeo.com/76979871")?.src).toBe("https://player.vimeo.com/video/76979871?autoplay=1");
    expect(embedFor("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC")?.src).toBe("https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC");
    expect(embedFor("https://soundcloud.com/artist/song")?.kind).toBe("audio");
  });
  it("ignores other links", () => {
    expect(embedFor("https://example.com/video")).toBeNull();
    expect(embedFor("not a url")).toBeNull();
  });
});
