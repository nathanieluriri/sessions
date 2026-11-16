import { z } from "zod";
import type { ToolDef } from "./types";

interface OpenAIFunction {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, { type: string; description?: string; items?: { type: string }; enum?: string[] }>;
      required: string[];
    };
  };
}

/** Convert a flat zod object schema into an OpenAI-compatible JSON-schema parameters object. */
function zodToParams(schema: z.ZodTypeAny): OpenAIFunction["function"]["parameters"] {
  const properties: OpenAIFunction["function"]["parameters"]["properties"] = {};
  const required: string[] = [];
  const shape = schema instanceof z.ZodObject ? (schema.shape as Record<string, z.ZodTypeAny>) : {};
  for (const [key, raw] of Object.entries(shape)) {
    let field = raw;
    let optional = false;
    while (field instanceof z.ZodOptional || field instanceof z.ZodNullable || field instanceof z.ZodDefault) {
      if (field instanceof z.ZodOptional || field instanceof z.ZodDefault) optional = true;
      field = (field as any)._def.innerType ?? (field as any).unwrap?.() ?? field;
      if (!field) break;
    }
    let type = "string";
    let items: { type: string } | undefined;
    let en: string[] | undefined;
    if (field instanceof z.ZodNumber) type = "number";
    else if (field instanceof z.ZodBoolean) type = "boolean";
    else if (field instanceof z.ZodArray) {
      type = "array";
      items = { type: "string" };
    } else if (field instanceof z.ZodEnum) {
      type = "string";
      en = (field as z.ZodEnum<any>).options as string[];
    }
    const prop: OpenAIFunction["function"]["parameters"]["properties"][string] = items ? { type, items } : { type };
    if (en) prop.enum = en;
    properties[key] = prop;
    if (!optional) required.push(key);
  }
  return { type: "object", properties, required };
}

export class ToolRegistry {
  private tools = new Map<string, ToolDef>();

  register(tool: ToolDef): void {
    if (this.tools.has(tool.name)) throw new Error(`Tool "${tool.name}" already registered`);
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDef | undefined {
    return this.tools.get(name);
  }

  all(): ToolDef[] {
    return [...this.tools.values()];
  }

  toOpenAITools(): OpenAIFunction[] {
    return this.all().map((t) => ({
      type: "function" as const,
      function: { name: t.name, description: t.description, parameters: zodToParams(t.schema) },
    }));
  }
}
