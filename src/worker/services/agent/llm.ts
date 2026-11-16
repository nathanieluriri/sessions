import type { Env } from "../../env";
import type { ToolCall } from "./types";
import type { ToolRegistry } from "./registry";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

const SYSTEM_PROMPT = `You are the Psych Studios assistant, for the studio's own staff. You help run a music, video, podcast and photography studio.

Rules:
- You act only through the tools you are given. Never invent capabilities.
- You never delete or reverse a financial record. Payments and refunds are append-only: you may record a payment, and you may cancel a booking (which refunds under policy), but you never remove a payment, refund or booking row.
- Work from booking references (PR…), client names or dates — never ask staff for internal database ids.
- Money is whole naira. Convert to the amount in naira when a tool asks for it.
- When a tool result says you do not have permission, say so plainly and stop.
- Answer briefly and in plain text (markdown ok for lists/tables).`;

interface Choice {
  message?: { content?: string | null; tool_calls?: { function?: { name?: string; arguments?: string } }[] };
}

export async function callLLM(
  env: Env,
  registry: ToolRegistry,
  opts: { message: string; history: { role: string; text: string }[]; allowTools: boolean },
): Promise<{ text: string; toolCalls: ToolCall[] }> {
  const apiKey = env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("no key");
  const model = env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
  const fallback = env.OPENROUTER_FALLBACK_MODEL;

  const tools = opts.allowTools ? registry.toOpenAITools() : [];
  const body = {
    model,
    temperature: 0.2,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      ...opts.history.map((h) => ({ role: h.role === "assistant" ? "assistant" : "user", content: h.text })),
      { role: "user", content: opts.message },
    ],
    ...(tools.length ? { tools, tool_choice: "auto" } : {}),
  };

  const json = await post(env, body, fallback);
  const msg = json.choices?.[0]?.message;
  const toolCalls: ToolCall[] = [];
  for (const call of msg?.tool_calls ?? []) {
    if (!call.function?.name) continue;
    let args: Record<string, unknown> = {};
    try { args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>; } catch { args = {}; }
    toolCalls.push({ name: call.function.name, args });
  }
  return { text: (msg?.content ?? "").trim(), toolCalls };
}

async function post(env: Env, body: Record<string, unknown>, fallback?: string): Promise<{ choices?: Choice[] }> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
    "x-title": "Psych Studios assistant",
    "http-referer": env.APP_URL,
  };
  let res = await fetch(ENDPOINT, { method: "POST", headers, body: JSON.stringify(body) });
  if (res.ok) return (await res.json()) as { choices?: Choice[] };
  if (fallback && body.model !== fallback) {
    const retry = await fetch(ENDPOINT, { method: "POST", headers, body: JSON.stringify({ ...body, model: fallback }) });
    if (retry.ok) return (await retry.json()) as { choices?: Choice[] };
    const rb = await retry.text().catch(() => "");
    throw new Error(`OpenRouter failed (${retry.status}): ${rb.slice(0, 400)}`);
  }
  const eb = await res.text().catch(() => "");
  throw new Error(`OpenRouter failed (${res.status}): ${eb.slice(0, 400)}`);
}
