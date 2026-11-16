import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ToolRegistry, openAiToolName } from "../src/worker/services/agent/registry";

describe("OpenAI tool names", () => {
  it("strips dots so OpenRouter will accept them", () => {
    expect(openAiToolName("bookings.list")).toBe("bookings_list");
    expect(openAiToolName("payments_record")).toBe("payments_record");
  });

  it("looks up a tool by the sanitised name", () => {
    const r = new ToolRegistry();
    r.register({
      name: "bookings_list",
      description: "List bookings",
      risk: "read",
      permission: "view_calendar",
      schema: z.object({}),
      execute: async () => ({ summary: "ok" }),
    });
    expect(r.get("bookings_list")?.name).toBe("bookings_list");
    expect(r.toOpenAITools()[0].function.name).toMatch(/^[a-zA-Z0-9_-]+$/);
  });
});

describe("skills", () => {
  it("loads the house skills on every turn", async () => {
    const { selectSkills, ALWAYS_ON_SKILLS } = await import("../src/worker/services/agent/skills");
    const text = selectSkills("hi");
    expect(ALWAYS_ON_SKILLS).toBe(6);
    expect(text).toMatch(/catalogue/i);
    expect(text).toMatch(/bookings_form/);
    expect(text).toMatch(/quotes_form/);
    expect(text).toMatch(/payments_form/);
    expect(text).toMatch(/Never say you lack access/i);
  });
});
