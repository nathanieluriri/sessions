import { describe, expect, it } from "vitest";
import { nextSteps } from "../src/worker/services/agent/next-steps";

describe("nextSteps", () => {
  it("asks to find another field while a copy preview is pending", () => {
    expect(nextSteps("change the email", ["content_set"], { tool: "content_set" })).toEqual([
      "Find another place this appears",
    ]);
  });

  it("hides chips while a price preview is waiting on Accept", () => {
    expect(nextSteps("set music videos to 190000", ["catalog_set_price"], { tool: "catalog_set_price" })).toEqual([]);
  });

  it("hides chips when a form is already on screen", () => {
    expect(nextSteps("Create a booking", ["bookings_form"], null, "booking")).toEqual([]);
  });

  it("offers quote and price after a catalogue list", () => {
    expect(nextSteps("list quote services", ["catalog_list"])).toEqual([
      "Send a quote to a client",
      "Put a naira price on one of these",
      "What's on today?",
    ]);
  });

  it("does not spam starters after a normal reply", () => {
    expect(nextSteps("What does the mixing package include?", [])).toEqual([]);
  });

  it("offers starters on a greeting", () => {
    expect(nextSteps("hi", [])).toContain("Create a booking");
  });
});
