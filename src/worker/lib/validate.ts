import { z } from "zod";
import type { Context } from "hono";
import { badRequest } from "./errors";

export async function body<T extends z.ZodTypeAny>(c: Context, schema: T): Promise<z.infer<T>> {
  const parsed = schema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Invalid input.");
  return parsed.data;
}

export const email = z.string().trim().toLowerCase().email("Enter a valid email address.").max(200);
export const password = z.string().min(8, "Password must be at least 8 characters.").regex(/\d/, "Password must include a number.").max(200);
export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date.");
export const minute = z.number().int().min(0).max(1440);
export const text = (max = 200) => z.string().trim().max(max);
export const required = (label: string, max = 200) => z.string().trim().min(1, `${label} is required.`).max(max);
