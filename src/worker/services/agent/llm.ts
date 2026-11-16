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

You have tools for the catalogue, website copy (email, phone, headlines, FAQs, service text), creating bookings, sending quotes, payments, receipts, clients, reports and enquiries. Use them. Never say you cannot see the catalogue or cannot change site copy.

If they attach a photo, read every word on it, then find that text on the site with content_find / content_set.

Rules:
- Act only through tools. If a write needs several fields, open the form tool (bookings_form, quotes_form, payments_form, catalog_price_form) instead of asking for a typed list.
- Edits to existing copy, prices, or bookings are previewed. Do not claim they are already saved until Accept.
- Never delete or reverse a financial record. Payments and refunds are append-only.
- Work from booking references (PR…), client names or dates — never ask staff for internal database ids.
- Money is whole naira.
- When a tool result says you do not have permission, say so plainly and stop.
- Answer briefly in markdown.`;

interface Choice {
  message?: { content?: string | null; tool_calls?: { function?: { name?: string; arguments?: string } }[] };
}

const trim = (s?: string) => (s ?? "").trim();

function userContent(text: string, images?: string[]) {
  const pics = (images ?? []).filter((u) => /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(u) || /^https:\/\//i.test(u)).slice(0, 2);
  if (!pics.length) return text;
  return [
    { type: "text" as const, text: text || "Read this picture. Extract every word, then find and update the matching site copy." },
    ...pics.map((url) => ({ type: "image_url" as const, image_url: { url } })),
  ];
}

export async function callLLM(
  env: Env,
  registry: ToolRegistry,
  opts: { message: string; history: { role: string; text: string }[]; allowTools: boolean; extraSystem?: string; images?: string[] },
): Promise<{ text: string; toolCalls: ToolCall[] }> {
  const apiKey = trim(env.OPENROUTER_API_KEY);
  if (!apiKey) throw new Error("no key");
  const model = trim(env.OPENROUTER_MODEL) || DEFAULT_MODEL;
  const fallback = trim(env.OPENROUTER_FALLBACK_MODEL) || DEFAULT_FALLBACK;

  const tools = opts.allowTools ? registry.toOpenAITools() : [];
  const system = opts.extraSystem ? `${SYSTEM_PROMPT}\n\n${opts.extraSystem}` : SYSTEM_PROMPT;
  const body = {
    model,
    max_tokens: MAX_TOKENS,
    messages: [
      { role: "system", content: system },
      ...opts.history.map((h) => ({ role: h.role === "assistant" ? "assistant" : "user", content: h.text })),
      { role: "user", content: userContent(opts.message, opts.images) },
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
