import { describe, expect, it } from "vitest";
import { tidyEmail, tidyName } from "../src/shared/format";
import { phone, personName } from "../src/worker/lib/validate";

describe("tidyName", () => {
  it("capitalises names typed in one case and tidies spacing", () => {
    expect(tidyName("  nathaniel   uriri ")).toBe("Nathaniel Uriri");
    expect(tidyName("ADA OBI-EZE")).toBe("Ada Obi-Eze");
    expect(tidyName("o'neil")).toBe("O'Neil");
  });
  it("keeps mixed case as typed", () => {
    expect(tidyName("Ronald McDonald")).toBe("Ronald McDonald");
    expect(tidyName("Ana de Souza")).toBe("Ana de Souza");
  });
  it("lowercases emails", () => expect(tidyEmail("  Ada@Example.COM ")).toBe("ada@example.com"));
});

describe("phone", () => {
  const ok = (v: string, optional = false) => phone("Phone number", optional).safeParse(v);
  it("reads local numbers as Nigerian and stores them in international format", () => {
    expect(ok("0803 000 0000").data).toBe("+234 803 000 0000");
    expect(ok("+2348030000000").data).toBe("+234 803 000 0000");
  });
  it("accepts other countries with a country code", () => {
    expect(ok("+44 7911 123456").data).toBe("+44 7911 123456");
    expect(ok("+1 415 555 2671").data).toBe("+1 415 555 2671");
  });
  it("rejects numbers that cannot be real", () => {
    expect(ok("12345").success).toBe(false);
    expect(ok("ssaa").success).toBe(false);
  });
  it("is required unless marked optional", () => {
    expect(ok("").success).toBe(false);
    expect(ok("", true).data).toBe("");
  });
  it("tidies names on the server too", () => expect(personName().parse("ADA  OBI")).toBe("Ada Obi"));
});
