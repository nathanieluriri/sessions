import { describe, expect, it } from "vitest";
import { isAccept, isDecline, lastOpenPending, lastPriceRequest, parseNaira, priceChangeOf, resolvePriceJob, serviceCorrectionOf } from "../src/shared/agent-confirm";

describe("confirm phrases", () => {
  it("treats typed accept as a confirmation", () => {
    expect(isAccept("Accept")).toBe(true);
    expect(isAccept("accept the preview")).toBe(true);
    expect(isAccept("yes")).toBe(true);
    expect(isAccept("ok")).toBe(true);
    expect(isAccept("please do it")).toBe(true);
    expect(isAccept("save it")).toBe(true);
    expect(isAccept("set music videos to 190000")).toBe(false);
  });

  it("treats typed decline as a cancel", () => {
    expect(isDecline("Decline")).toBe(true);
    expect(isDecline("no")).toBe(true);
    expect(isDecline("never mind")).toBe(true);
    expect(isDecline("Accept")).toBe(false);
  });
});

describe("priceChangeOf", () => {
  it("reads set X to ₦190,000", () => {
    expect(priceChangeOf("set music videos to ₦190,000")).toEqual({ service: "music videos", amount_ngn: 190000 });
    expect(priceChangeOf("Change the price of Music videos to 190000")).toEqual({ service: "Music videos", amount_ngn: 190000 });
    expect(priceChangeOf("put 190k on music videos")).toEqual({ service: "music videos", amount_ngn: 190000 });
    expect(priceChangeOf("make Music videos change from request a quote to 190k")).toEqual({ service: "Music videos", amount_ngn: 190000 });
    expect(priceChangeOf("list quote services")).toBeNull();
  });

  it("parses naira amounts", () => {
    expect(parseNaira("₦190,000")).toBe(190000);
    expect(parseNaira("190k")).toBe(190000);
    expect(parseNaira("50")).toBeNull();
  });
});

describe("lastOpenPending", () => {
  it("keeps a price preview open after a later catalogue list", () => {
    const pending = { tool: "catalog_set_price", args: { service: "music videos", amount_ngn: 190000 }, preview: { available: true, title: "x" } };
    expect(lastOpenPending([
      { role: "assistant", tool_results: [{ tool: "catalog_set_price", status: "ok", data: { pending } }] },
      { role: "assistant", tool_results: [{ tool: "catalog_list", status: "ok" }] },
    ])).toEqual(pending);
  });

  it("closes the preview after the same tool actually runs", () => {
    const pending = { tool: "catalog_set_price", args: { service: "music videos", amount_ngn: 190000 } };
    expect(lastOpenPending([
      { role: "assistant", tool_results: [{ tool: "catalog_set_price", status: "ok", data: { pending } }] },
      { role: "assistant", tool_results: [{ tool: "catalog_set_price", status: "ok" }] },
    ])).toBeUndefined();
  });
});

describe("lastPriceRequest", () => {
  it("skips Accept lines and finds the earlier price change", () => {
    expect(lastPriceRequest([
      { role: "user", text: "set music videos to 190000" },
      { role: "assistant", text: "preview wasn't available" },
      { role: "user", text: "Accept" },
    ])).toEqual({ service: "music videos", amount_ngn: 190000 });
  });
});

describe("resolvePriceJob", () => {
  it("cleans a messy sentence and recovers I-meant plus yes", () => {
    expect(serviceCorrectionOf("ohhI meant Music videos")).toBe("Music videos");
    const history = [
      { role: "user" as const, text: "make Music videos change from request a quote to 190k" },
      { role: "assistant" as const, text: "no match", tool_results: [{ tool: "catalog_set_price", status: "error", data: { args: { service: "Music videos change from request a quote", amount_ngn: 190000 } } }] },
    ];
    expect(resolvePriceJob("ohhI meant Music videos", history)).toEqual({ service: "Music videos", amount_ngn: 190000 });
    expect(resolvePriceJob("yes", history)).toEqual({ service: "Music videos", amount_ngn: 190000 });
  });
});
