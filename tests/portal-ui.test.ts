import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PART_RETRIES, PARALLEL_PARTS, backoffMs, checkFile, explain, extOf, fmtBytes, loadedBytes, newJob, percent, planParts, retryable, stateLine, titleOf, uploadFile, UploadError,
} from "../src/client/lib/files";

const MiB = 1024 * 1024;

describe("fmtBytes", () => {
  it("reads like a person would", () => {
    expect(fmtBytes(0)).toBe("0 B");
    expect(fmtBytes(512)).toBe("512 B");
    expect(fmtBytes(1536)).toBe("1.5 KB");
    expect(fmtBytes(30 * MiB)).toBe("30 MB");
    expect(fmtBytes(5.5 * MiB)).toBe("5.5 MB");
    expect(fmtBytes(1024 * MiB)).toBe("1 GB");
    expect(fmtBytes(-4)).toBe("0 B");
  });
});

describe("names and extensions", () => {
  it("takes the extension from the end, lower case", () => {
    expect(extOf("Mix v2.WAV")).toBe("wav");
    expect(extOf("noext")).toBe("");
    expect(extOf("archive.tar.gz")).toBe("gz");
  });
  it("defaults a delivery title to the file name without its extension", () => {
    expect(titleOf("Lagos Nights (master).wav")).toBe("Lagos Nights (master)");
    expect(titleOf("  spaced   out .mp3")).toBe("spaced out");
    expect(titleOf(".wav")).toBe("File");
  });
});

describe("checkFile", () => {
  it("refuses zero byte files before any request", () => {
    expect(checkFile("empty.wav", 0)).toMatch(/empty/);
  });
  it("refuses more than 1 GB and says what to do", () => {
    expect(checkFile("big.wav", 1024 * MiB + 1)).toMatch(/up to 1 GB/);
    expect(checkFile("edge.wav", 1024 * MiB)).toBeNull();
  });
  it("lists what is allowed when the type is not", () => {
    const why = checkFile("setup.exe", 1000)!;
    expect(why).toMatch(/not accepted/);
    expect(why).toMatch(/audio/);
    expect(checkFile("page.html", 10)).not.toBeNull();
    expect(checkFile("song.mp3", 10)).toBeNull();
    expect(checkFile("session.ptx", 10)).toBeNull();
  });
});

describe("planParts and progress", () => {
  it("plans 8 MiB parts with the remainder last", () => {
    const p = planParts(17 * MiB);
    expect(p).toHaveLength(3);
    expect(p.map((x) => x.end - x.start)).toEqual([8 * MiB, 8 * MiB, 1 * MiB]);
    expect(p[2].end).toBe(17 * MiB);
    expect(p.map((x) => x.n)).toEqual([1, 2, 3]);
  });
  it("uses one part for small files and exact multiples", () => {
    expect(planParts(1)).toHaveLength(1);
    expect(planParts(8 * MiB)).toHaveLength(1);
    expect(planParts(8 * MiB + 1)).toHaveLength(2);
  });
  it("never shows 100 until the server confirmed the file", () => {
    expect(percent(0, 100)).toBe(0);
    expect(percent(50, 100)).toBe(50);
    expect(percent(100, 100)).toBe(99);
    expect(percent(100, 100, true)).toBe(100);
    expect(percent(5, 0)).toBe(0);
  });
  it("adds finished parts to the bytes in flight", () => {
    const job = newJob(new File([new Uint8Array(17 * MiB)], "a.wav"));
    job.done.add(1);
    job.done.add(3);
    job.inflight.set(2, 3 * MiB);
    expect(loadedBytes(job)).toBe(8 * MiB + 1 * MiB + 3 * MiB);
  });
});

describe("retry rules", () => {
  it("backs off and caps", () => {
    expect([0, 1, 2].map(backoffMs)).toEqual([600, 1200, 2400]);
    expect(backoffMs(10)).toBe(8000);
    expect(PART_RETRIES).toBe(3);
    expect(PARALLEL_PARTS).toBe(3);
  });
  it("retries network and server trouble but not refusals", () => {
    for (const s of [0, 408, 429, 500, 502, 503]) expect(retryable(s)).toBe(true);
    for (const s of [400, 401, 403, 404, 409, 413]) expect(retryable(s)).toBe(false);
  });
  it("explains failures in plain language", () => {
    expect(explain(0, "offline", "x").kind).toBe("offline");
    expect(explain(0, "offline", "x").message).toMatch(/carries on from where it stopped/);
    expect(explain(401, "unauthorized", "x").kind).toBe("expired");
    expect(explain(400, "storage_unavailable", "x").kind).toBe("storage");
    expect(explain(503, "error", "x").kind).toBe("busy");
    expect(explain(400, "bad_request", "That file type is not accepted.").message).toBe("That file type is not accepted.");
  });
});

describe("stateLine", () => {
  const today = "2026-10-23";
  const base = { status: "confirmed", scheduling: "project", date: "2026-10-20", due_date: "2026-10-29", balance_kobo: 0 };
  const none = { deliveries: [], uploads: [] };
  const open = { final: false, open: null };
  it("says nothing before the job exists", () => {
    expect(stateLine({ ...base, status: "pending" }, none, open, today)).toBeNull();
    expect(stateLine({ ...base, status: "cancelled" }, none, open, today)).toBeNull();
  });
  it("walks a remote order from waiting to finished", () => {
    expect(stateLine(base, none, open, today)!.text).toBe("Waiting for your files");
    expect(stateLine(base, { deliveries: [], uploads: [{}] }, open, today)!.text).toBe("In production, due Thursday 29 October");
    expect(stateLine(base, { deliveries: [{ locked: false }], uploads: [] }, open, today)!.text).toBe("Delivered, take a look");
    expect(stateLine(base, { deliveries: [{ locked: false }], uploads: [] }, { final: false, open: {} }, today)!.text).toBe("Revision requested, the studio is on it");
    expect(stateLine(base, { deliveries: [{ locked: false }], uploads: [] }, { final: true, open: null }, today)!.text).toBe("Approved and finished");
  });
  it("does not say take a look while every file is locked", () => {
    const s = stateLine({ ...base, balance_kobo: 8_000_000 }, { deliveries: [{ locked: true }], uploads: [] }, open, today)!;
    expect(s.text).not.toMatch(/take a look/);
    expect(s.sub).toMatch(/Pay/);
  });
  it("tells a session booking apart from a remote one", () => {
    const session = { ...base, scheduling: "slot", date: "2026-10-30", due_date: null };
    expect(stateLine(session, none, open, today)!.text).toBe("Session on Friday 30 October");
    expect(stateLine({ ...session, date: "2026-10-01" }, none, open, today)!.text).toBe("In production");
  });
});

describe("uploadFile", () => {
  type Hit = { url: string; method: string };
  let hits: Hit[];
  let failures: Map<number, number>;
  let inflight = 0, peak = 0;

  class FakeXhr {
    upload: { onprogress: ((e: { loaded: number }) => void) | null } = { onprogress: null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    ontimeout: (() => void) | null = null;
    onabort: (() => void) | null = null;
    status = 0;
    responseText = "";
    withCredentials = false;
    private url = "";
    open(_m: string, url: string) { this.url = url; }
    abort() { this.onabort?.(); }
    send(body: Blob) {
      const n = Number(this.url.match(/parts\/(\d+)/)![1]);
      hits.push({ url: this.url, method: "PUT" });
      inflight++; peak = Math.max(peak, inflight);
      setTimeout(() => {
        inflight--;
        const left = failures.get(n) ?? 0;
        if (left > 0) { failures.set(n, left - 1); this.onerror?.(); return; }
        this.upload.onprogress?.({ loaded: body.size });
        this.status = 200;
        this.onload?.();
      }, 5);
    }
  }

  beforeEach(() => {
    hits = []; failures = new Map(); inflight = 0; peak = 0;
    vi.useFakeTimers();
    (globalThis as any).XMLHttpRequest = FakeXhr;
    (globalThis as any).fetch = vi.fn(async (url: string, init: any) => {
      hits.push({ url, method: init.method });
      const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data });
      if (url.endsWith("/files") && init.method === "POST") return ok({ id: "f1", partSize: 8 * MiB, parts: 5 });
      if (url.endsWith("/complete")) return ok({ id: "f1", name: "big.wav" });
      throw new Error(`unexpected ${url}`);
    });
  });
  afterEach(() => { vi.useRealTimers(); });

  const run = async (p: Promise<unknown>) => { const settled = p.then((v) => ({ v }), (e) => ({ e })); await vi.runAllTimersAsync(); return settled; };

  it("sends 33 MiB as five parts, three at a time, then completes once", async () => {
    const job = newJob(new File([new Uint8Array(33 * MiB)], "big.wav"));
    const r: any = await run(uploadFile("/account", "b1", job, new AbortController().signal, () => {}));
    expect(r.v.id).toBe("f1");
    expect(hits.filter((h) => h.method === "PUT")).toHaveLength(5);
    expect(peak).toBe(3);
    expect(hits.filter((h) => h.url.endsWith("/complete"))).toHaveLength(1);
    expect(hits.filter((h) => h.url.endsWith("/files") && h.method === "POST")).toHaveLength(1);
  });

  it("retries a part three times, then stops with a plain message and keeps what arrived", async () => {
    failures.set(2, 4);
    const job = newJob(new File([new Uint8Array(33 * MiB)], "big.wav"));
    const r: any = await run(uploadFile("/account", "b1", job, new AbortController().signal, () => {}));
    expect(r.e).toBeInstanceOf(UploadError);
    expect(r.e.kind).toBe("offline");
    expect(hits.filter((h) => h.url.includes("/parts/2"))).toHaveLength(1 + PART_RETRIES);
    expect(job.done.has(2)).toBe(false);
    expect(job.done.size).toBeGreaterThanOrEqual(1);
    expect(job.id).toBe("f1");
  });

  it("resumes from the missing parts without starting over", async () => {
    failures.set(2, 4);
    const job = newJob(new File([new Uint8Array(33 * MiB)], "big.wav"));
    await run(uploadFile("/account", "b1", job, new AbortController().signal, () => {}));
    const had = new Set(job.done);
    hits.length = 0; failures.clear();
    const r: any = await run(uploadFile("/account", "b1", job, new AbortController().signal, () => {}));
    expect(r.v.id).toBe("f1");
    const resent = hits.filter((h) => h.method === "PUT").map((h) => Number(h.url.match(/parts\/(\d+)/)![1]));
    for (const n of had) expect(resent).not.toContain(n);
    expect(resent).toContain(2);
    expect(hits.some((h) => h.url.endsWith("/files") && h.method === "POST")).toBe(false);
    expect(job.done.size).toBe(5);
  });
});
