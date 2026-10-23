import { describe, expect, it } from "vitest";
import {
  EXTENSIONS, MAX_FILE_SIZE, PART_SIZE, canDownload, cleanName, cleanNote, cleanText, contentDisposition, contentTypeFor, extensionOf, isAudio, parseRange, partCount, partLength, titleFromName,
  type DownloadCheck,
} from "../src/worker/lib/files";

describe("extensions", () => {
  it("accepts audio, video, archives, documents, images and DAW exports and nothing executable", () => {
    for (const ext of ["wav", "mp3", "flac", "aiff", "m4a", "mp4", "mov", "zip", "7z", "pdf", "docx", "png", "jpg", "psd", "ptx", "als", "flp"]) expect(EXTENSIONS[ext], ext).toBeTruthy();
    for (const ext of ["html", "htm", "svg", "js", "mjs", "php", "exe", "sh", "bat", "dll", "jar", "xml", "xhtml", "swf", "ini", ""]) expect(EXTENSIONS[ext], ext).toBeUndefined();
  });
  it("reads the extension from the end of the name, case insensitive", () => {
    expect(extensionOf("Mix v2.WAV")).toBe("wav");
    expect(extensionOf("archive.tar.gz")).toBe("gz");
    expect(extensionOf("noext")).toBe("");
    expect(extensionOf("trailing.")).toBe("");
    expect(extensionOf("weird.mp3 ")).toBe("");
  });
  it("decides the served type from the name and ignores whatever the browser claimed", () => {
    expect(contentTypeFor("song.mp3")).toBe("audio/mpeg");
    expect(contentTypeFor("song.html.mp3")).toBe("audio/mpeg");
    expect(contentTypeFor("mystery")).toBe("application/octet-stream");
    expect(isAudio(contentTypeFor("take.wav"))).toBe(true);
    expect(isAudio(contentTypeFor("cover.png"))).toBe(false);
  });
});

describe("cleanName", () => {
  it("drops paths, control characters and characters that break headers", () => {
    expect(cleanName("../../etc/passwd.mp3")).toBe("passwd.mp3");
    expect(cleanName("C:\\Users\\me\\Desktop\\mix.wav")).toBe("mix.wav");
    expect(cleanName('a"b\r\nSet-Cookie: x=1.mp3')).toBe("a_b Set-Cookie_ x=1.mp3");
    expect(cleanName("tab\tand\u0000nul.wav")).toBe("tab and nul.wav");
  });
  it("removes direction overrides and zero width characters", () => {
    expect(cleanName("fdp.\u202Emp3")).toBe("fdp.mp3");
    expect(cleanName("a\u200Bb\u200E.wav")).toBe("ab.wav");
  });
  it("never leaves a leading or trailing dot or space", () => {
    expect(cleanName(".htaccess")).toBe("htaccess");
    expect(cleanName("...  hidden.wav  ")).toBe("hidden.wav");
    expect(cleanName("..")).toBe("");
    expect(cleanName("name.wav...")).toBe("name.wav");
  });
  it("replaces lone surrogates so later encoding cannot throw", () => {
    const name = cleanName("bad\ud800name.mp3");
    expect(() => encodeURIComponent(name)).not.toThrow();
    expect(name.endsWith(".mp3")).toBe(true);
  });
  it("keeps long names to 200 characters and keeps the extension", () => {
    const name = cleanName(`${"a".repeat(500)}.mp3`);
    expect(Array.from(name).length).toBe(200);
    expect(name.endsWith(".mp3")).toBe(true);
    const wide = cleanName(`${"歌".repeat(300)}.wav`);
    expect(Array.from(wide).length).toBe(200);
    expect(wide.endsWith(".wav")).toBe(true);
  });
  it("keeps ordinary unicode names", () => {
    expect(cleanName("Ọmọ Ibadan – final.wav")).toBe("Ọmọ Ibadan – final.wav");
  });
});

describe("cleanText and cleanNote", () => {
  it("collapses whitespace and strips hidden characters from titles", () => {
    expect(cleanText("  Midnight \n\t (Master)\u202E  ", 120)).toBe("Midnight (Master)");
    expect(cleanText("x".repeat(300), 120).length).toBe(120);
  });
  it("keeps line breaks in notes but not control characters", () => {
    expect(cleanNote("Line one\r\nLine two\u0000\n\n\n\nLine three", 1000)).toBe("Line one\nLine two\n\nLine three");
  });
  it("derives a default title from the file name", () => {
    expect(titleFromName("Mix_v2.final.wav")).toBe("Mix_v2.final");
    expect(titleFromName(".wav")).toBe("File");
  });
});

describe("contentDisposition", () => {
  const safe = /^(attachment|inline); filename="[\x20-\x7e]*"; filename\*=UTF-8''[A-Za-z0-9%._~!$&+^`|#-]*$/;
  it("is an attachment unless inline is asked for", () => {
    expect(contentDisposition("mix.wav")).toMatch(/^attachment; /);
    expect(contentDisposition("mix.wav", true)).toMatch(/^inline; /);
  });
  it("never carries quotes, line breaks or raw non-ASCII, whatever the stored name holds", () => {
    for (const name of ['a"b.mp3', "x\r\ny.mp3", "歌曲 – 终极版.wav", "semi;colon,comma.mp3", "pct%20.wav", "back\\slash.wav", "it's (1) *.mp3", "\ud800.mp3", `${"é".repeat(400)}.wav`, ""]) {
      const header = contentDisposition(name);
      expect(header, name).toMatch(safe);
      expect(header).not.toMatch(/[\r\n]/);
      expect(header.match(/"/g)?.length).toBe(2);
    }
  });
  it("carries the real name in filename* and an ASCII fallback", () => {
    const h = contentDisposition("Ọmọ – final.wav");
    expect(h).toContain(`filename*=UTF-8''%E1%BB%8Cm%E1%BB%8D%20%E2%80%93%20final.wav`);
    expect(h).toContain('filename="_m_ _ final.wav"');
    expect(contentDisposition("it's (1).mp3")).toContain("filename*=UTF-8''it%27s%20%281%29.mp3");
  });
});

describe("part plan", () => {
  it("splits a file into 8 MiB parts with a shorter last part", () => {
    expect(partCount(1)).toBe(1);
    expect(partCount(PART_SIZE)).toBe(1);
    expect(partCount(PART_SIZE + 1)).toBe(2);
    expect(partCount(MAX_FILE_SIZE)).toBe(128);
    expect(partLength(1, 1)).toBe(1);
    expect(partLength(PART_SIZE * 2 + 5, 1)).toBe(PART_SIZE);
    expect(partLength(PART_SIZE * 2 + 5, 2)).toBe(PART_SIZE);
    expect(partLength(PART_SIZE * 2 + 5, 3)).toBe(5);
    expect(partLength(PART_SIZE * 2, 2)).toBe(PART_SIZE);
  });
  it("adds up to the declared size", () => {
    for (const size of [1, 100, PART_SIZE, PART_SIZE + 1, 30_000_123, MAX_FILE_SIZE]) {
      let sum = 0;
      for (let n = 1; n <= partCount(size); n++) sum += partLength(size, n);
      expect(sum).toBe(size);
    }
  });
});

describe("parseRange", () => {
  it("serves the whole file when no usable range is sent", () => {
    for (const h of [undefined, null, "", "bytes=", "bytes=-", "items=0-5", "bytes=abc", "bytes=0-1,5-9", "bytes=5-2", "bytes = 0-5", "bytes=1.5-3"]) expect(parseRange(h, 100), String(h)).toEqual({ kind: "all" });
  });
  it("reads single ranges", () => {
    expect(parseRange("bytes=0-9", 100)).toEqual({ kind: "range", start: 0, end: 9 });
    expect(parseRange("bytes=90-", 100)).toEqual({ kind: "range", start: 90, end: 99 });
    expect(parseRange("bytes=-10", 100)).toEqual({ kind: "range", start: 90, end: 99 });
    expect(parseRange("bytes=-500", 100)).toEqual({ kind: "range", start: 0, end: 99 });
    expect(parseRange("bytes=50-5000", 100)).toEqual({ kind: "range", start: 50, end: 99 });
    expect(parseRange("bytes=99-99", 100)).toEqual({ kind: "range", start: 99, end: 99 });
  });
  it("refuses ranges that start past the end", () => {
    expect(parseRange("bytes=100-", 100)).toEqual({ kind: "unsatisfiable" });
    expect(parseRange("bytes=999999999999-", 100)).toEqual({ kind: "unsatisfiable" });
    expect(parseRange("bytes=-0", 100)).toEqual({ kind: "unsatisfiable" });
  });
});

describe("canDownload", () => {
  const base: DownloadCheck = { staff: false, owner: true, direction: "delivery", state: "ready", delivered: true, released: false, balanceKobo: 0 };
  const check = (o: Partial<DownloadCheck>) => canDownload({ ...base, ...o });

  it("lets the client take a published delivery once the balance is clear", () => {
    expect(check({})).toBe("ok");
  });
  it("locks a delivery with a balance due, for every kind of request", () => {
    expect(check({ balanceKobo: 1 })).toBe("locked");
    expect(check({ balanceKobo: 5_000_000 })).toBe("locked");
  });
  it("unlocks it when staff released the file", () => {
    expect(check({ balanceKobo: 5_000_000, released: true })).toBe("ok");
  });
  it("hides staged deliveries from the client even when released and paid", () => {
    expect(check({ delivered: false })).toBe("missing");
    expect(check({ delivered: false, released: true })).toBe("missing");
    expect(check({ delivered: false, balanceKobo: 100 })).toBe("missing");
  });
  it("treats anyone but the owner as if the file did not exist", () => {
    expect(check({ owner: false })).toBe("missing");
    expect(check({ owner: false, released: true })).toBe("missing");
    expect(check({ owner: false, direction: "upload" })).toBe("missing");
  });
  it("never serves unfinished or removed files, not even to staff", () => {
    for (const state of ["uploading", "removed"] as const) {
      expect(check({ state })).toBe("missing");
      expect(check({ state, staff: true })).toBe("missing");
      expect(check({ state, direction: "upload" })).toBe("missing");
    }
  });
  it("lets staff take anything finished, staged and unpaid included", () => {
    expect(check({ staff: true, owner: false, delivered: false, balanceKobo: 9_999_999 })).toBe("ok");
    expect(check({ staff: true, owner: false, direction: "upload" })).toBe("ok");
  });
  it("lets the client take back their own uploads whatever the balance", () => {
    expect(check({ direction: "upload", delivered: false, balanceKobo: 9_999_999 })).toBe("ok");
  });
});
