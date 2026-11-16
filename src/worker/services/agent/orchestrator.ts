import type { Env, SessionUser } from "../../env";
import { hasPermission } from "../../../shared/permissions";
import { badRequest, forbidden } from "../../lib/errors";
import { uuid } from "../../lib/crypto";
import { agentRepo } from "../../repositories/agent";
import { callLLM, friendlyLlmError } from "./llm";
import { ToolRegistry } from "./registry";
import { selectSkills } from "./skills";
import { studioTools } from "./tools";
import type { AgentFormKind, ChatTurnInput, ChatTurnOutput, Step, ToolContext, ToolResultSummary } from "./types";

const STARTERS = ["Create a booking", "Send a quote", "Record a payment", "What's on today?"];
const FORM_TOOLS: Record<AgentFormKind, string> = {
  booking: "bookings_create",
  quote: "quotes_send",
  payment: "payments_record",
};

let cached: ToolRegistry | null = null;
function registry(): ToolRegistry {
  if (!cached) {
    cached = new ToolRegistry();
    for (const tool of studioTools) cached.register(tool);
  }
  return cached;
}

function formOf(results: ToolResultSummary[]): AgentFormKind | undefined {
  for (const r of results) {
    const kind = (r.data as { form?: AgentFormKind } | undefined)?.form;
    if (kind === "booking" || kind === "quote" || kind === "payment") return kind;
  }
}

function slim(results: ToolResultSummary[]): ToolResultSummary[] {
  return results.map((r) => {
    const kind = (r.data as { form?: AgentFormKind } | undefined)?.form;
    return { tool: r.tool, status: r.status, summary: r.summary, ...(kind ? { data: { form: kind } } : {}) };
  });
}

/** Execute one tool call. Permission is checked against the staff member before anything runs. */
async function executeCall(reg: ToolRegistry, call: { name: string; args: Record<string, unknown> }, ctx: ToolContext): Promise<ToolResultSummary> {
  const tool = reg.get(call.name);
  if (!tool) return { tool: call.name, status: "error", summary: "I couldn't find a way to do that." };
  if (!hasPermission(ctx.user, tool.permission)) {
    return { tool: call.name, status: "error", summary: `You don't have the "${tool.permission.replace(/_/g, " ")}" permission to do that.` };
  }
  const parsed = tool.schema.safeParse(call.args);
  if (!parsed.success) {
    return { tool: call.name, status: "error", summary: parsed.error.issues[0]?.message ?? "More detail needed." };
  }
  try {
    const exec = await tool.execute(parsed.data, ctx);
    return { tool: call.name, status: "ok", summary: exec.summary, data: exec.data };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "It didn't work.";
    return { tool: call.name, status: "error", summary: msg };
  }
}

export async function runTurn(env: Env, user: SessionUser, input: ChatTurnInput): Promise<ChatTurnOutput> {
  const reg = registry();
  const message = (input.message ?? "").trim();
  if (!message && !input.form) throw badRequest("What would you like me to do?");

  let conversationId = input.conversationId;
  if (!conversationId) {
    conversationId = uuid();
    const title = input.form ? `New ${input.form.kind}` : message.slice(0, 60) || "New chat";
    await agentRepo.createConversation(env.DB, conversationId, user.id, title);
  } else {
    const own = await agentRepo.byId(env.DB, conversationId, user.id);
    if (!own) throw forbidden("That conversation is not yours.");
  }

  const prior = (await agentRepo.messages(env.DB, conversationId)).slice(-16).map((m) => ({ role: m.role, text: m.text }));
  const userText = input.form
    ? `Submitted the ${input.form.kind} form${message ? `: ${message}` : "."}`
    : message;
  await agentRepo.addMessage(env.DB, { id: uuid(), conversationId, role: "user", text: userText, steps: "[]", toolResults: "[]", suggestions: "[]" });
  await agentRepo.touch(env.DB, conversationId);

  const ctx: ToolContext = { user, env, conversationId };
  const toolResults: ToolResultSummary[] = [];
  const steps: Step[] = [];
  let text = "";
  const skills = selectSkills(userText);

  try {
    if (input.form) {
      const name = FORM_TOOLS[input.form.kind];
      const r = await executeCall(reg, { name, args: input.form.values }, ctx);
      toolResults.push(r);
      steps.push({ label: r.tool, status: r.status === "ok" ? "done" : "active" });
      text = r.status === "ok" ? `Done.\n\n${r.summary}` : r.summary;
    } else if (trimKey(env.OPENROUTER_API_KEY)) {
      let turn = await callLLM(env, reg, { message, history: prior, allowTools: true, extraSystem: skills });
      let rounds = 0;
      while (turn.toolCalls.length > 0 && rounds < 4) {
        rounds++;
        for (const call of turn.toolCalls) {
          const r = await executeCall(reg, call, ctx);
          toolResults.push(r);
          steps.push({ label: r.tool, status: r.status === "ok" ? "done" : "active" });
        }
        const facts = toolResults.map((r) => `${r.tool}: ${r.summary}`).join("\n");
        turn = await callLLM(env, reg, {
          message: `Tool results:\n${facts}\n\nAnswer the user's original request ("${message}") in plain language. Do not claim you lack a tool that just ran. If a form was opened, tell them to fill it.`,
          history: prior,
          allowTools: rounds < 3,
          extraSystem: skills,
        });
        if (turn.toolCalls.length === 0) break;
      }
      text = turn.text.trim() || toolResults.map((r) => r.summary).join("\n");
      if (!text) text = "I looked, but I have nothing to add. Try asking another way.";
    } else {
      text = "The assistant is not configured. Add OPENROUTER_API_KEY as a Worker secret to turn on the full assistant. Until then I cannot look anything up or act.";
    }
  } catch (e) {
    console.error(e);
    text = friendlyLlmError(e);
  }

  const form = formOf(toolResults);
  const suggestions = prior.length === 0 && !form ? STARTERS : [];
  const stored = slim(toolResults);
  try {
    await agentRepo.addMessage(env.DB, {
      id: uuid(), conversationId, role: "assistant", text,
      steps: JSON.stringify(steps.map((s) => s.label)),
      toolResults: JSON.stringify(stored),
      suggestions: JSON.stringify(suggestions),
    });
    await agentRepo.touch(env.DB, conversationId);
  } catch (e) {
    console.error(e);
  }

  return { conversationId, text, steps, toolResults: stored, suggestions, form };
}

const trimKey = (s?: string) => Boolean(s?.trim());
