import type { Env } from "../../env";
import type { ToolCall } from "./types";
import type { ToolRegistry } from "./registry";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const MAX_TOKENS = 2048;
const TIMEOUT_MS = 25000;
const DEFAULT_MODEL = "openai/gpt-6-astra";
/** Fast GPT-6 tier: tools + tool_choice, cheap enough to survive when Astra 402s. */
const DEFAULT_FALLBACK = "openai/gpt-6-luna";

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

const trim = (s?: string) => (s ?? "").trim();

export async function callLLM(
  env: Env,
  registry: ToolRegistry,
  opts: { message: string; history: { role: string; text: string }[]; allowTools: boolean },
): Promise<{ text: string; toolCalls: ToolCall[] }> {
  const apiKey = trim(env.OPENROUTER_API_KEY);
  if (!apiKey) throw new Error("no key");
  const model = trim(env.OPENROUTER_MODEL) || DEFAULT_MODEL;
  const fallback = trim(env.OPENROUTER_FALLBACK_MODEL) || DEFAULT_FALLBACK;

  const tools = opts.allowTools ? registry.toOpenAITools() : [];
  const body = {
    model,
    max_tokens: MAX_TOKENS,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      ...opts.history.map((h) => ({ role: h.role === "assistant" ? "assistant" : "user", content: h.text })),
      { role: "user", content: opts.message },
    ],
    ...(tools.length ? { tools, tool_choice: "auto" as const } : {}),
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

export function friendlyLlmError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/402|credits|afford/i.test(msg)) return "The assistant is out of OpenRouter credit. Add credit at openrouter.ai and try again.";
  if (/401|unauthorized|invalid api key|no key/i.test(msg)) return "The OpenRouter key was refused. Check OPENROUTER_API_KEY on the Worker.";
  if (/timeout|abort/i.test(msg)) return "The model took too long. Try again in a moment.";
  return "I couldn't reach the model just then. Try again.";
}

async function post(env: Env, body: Record<string, unknown>, fallback?: string): Promise<{ choices?: Choice[] }> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${trim(env.OPENROUTER_API_KEY)}`,
    "x-title": "Psych Studios assistant",
    "http-referer": env.APP_URL,
  };
  const models = [String(body.model || ""), trim(fallback)].filter((m, i, a) => m && a.indexOf(m) === i);
  const budgets = [MAX_TOKENS, 1024];
  let last = "no attempt";

  for (const model of models) {
    for (const max_tokens of budgets) {
      try {
        const res = await fetch(ENDPOINT, {
          method: "POST",
          headers,
          body: JSON.stringify({
            ...body,
            model,
            max_tokens,
            // Chat Completions + tools on Luna only works with reasoning off.
            ...(model.includes("gpt-6-luna") ? { reasoning: { effort: "none" } } : {}),
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (res.ok) {
          const json = (await res.json()) as { choices?: Choice[]; error?: { message?: string } };
          if (json.choices?.[0]) return json;
          last = json.error?.message ?? "empty completion";
          continue;
        }
        const eb = await res.text().catch(() => "");
        last = `${res.status}: ${eb.slice(0, 280)}`;
        if (res.status === 401) break;
      } catch (e) {
        last = e instanceof Error ? e.message : "network error";
      }
    }
  }
  throw new Error(`OpenRouter failed (${last})`);
}
