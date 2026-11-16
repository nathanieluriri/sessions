import type { Env, SessionUser } from "../../env";
import { hasPermission } from "../../../shared/permissions";
import { badRequest, forbidden } from "../../lib/errors";
import { uuid } from "../../lib/crypto";
import { agentRepo } from "../../repositories/agent";
import { callLLM, friendlyLlmError } from "./llm";
import { ToolRegistry } from "./registry";
import { studioTools } from "./tools";
import type { ChatTurnInput, ChatTurnOutput, Step, ToolContext, ToolResultSummary } from "./types";

const STARTERS = ["What's on today?", "Who still owes money?", "This month's numbers"];

let cached: ToolRegistry | null = null;
function registry(): ToolRegistry {
  if (!cached) {
    cached = new ToolRegistry();
    for (const tool of studioTools) cached.register(tool);
  }
  return cached;
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
    return { tool: call.name, status: "ok", summary: exec.summary };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "It didn't work.";
    return { tool: call.name, status: "error", summary: msg };
  }
}

export async function runTurn(env: Env, user: SessionUser, input: ChatTurnInput): Promise<ChatTurnOutput> {
  const reg = registry();
  const message = (input.message ?? "").trim();
  if (!message) throw badRequest("What would you like me to do?");

  let conversationId = input.conversationId;
  if (!conversationId) {
    conversationId = uuid();
    await agentRepo.createConversation(env.DB, conversationId, user.id, message.slice(0, 60) || "New chat");
  } else {
    const own = await agentRepo.byId(env.DB, conversationId, user.id);
    if (!own) throw forbidden("That conversation is not yours.");
  }

  const prior = (await agentRepo.messages(env.DB, conversationId)).slice(-16).map((m) => ({ role: m.role, text: m.text }));
  await agentRepo.addMessage(env.DB, { id: uuid(), conversationId, role: "user", text: message, steps: "[]", toolResults: "[]", suggestions: "[]" });
  await agentRepo.touch(env.DB, conversationId);

  const ctx: ToolContext = { user, env, conversationId };
  const toolResults: ToolResultSummary[] = [];
  const steps: Step[] = [];
  let text = "";

  try {
    if (trimKey(env.OPENROUTER_API_KEY)) {
      let turn = await callLLM(env, reg, { message, history: prior, allowTools: true });
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
          message: `Tool results:\n${facts}\n\nAnswer the user's original request ("${message}") in plain language. Do not call more tools unless a step is genuinely missing.`,
          history: prior,
          allowTools: rounds < 3,
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

  const suggestions = prior.length === 0 ? STARTERS : [];
  try {
    await agentRepo.addMessage(env.DB, {
      id: uuid(), conversationId, role: "assistant", text,
      steps: JSON.stringify(steps.map((s) => s.label)),
      toolResults: JSON.stringify(toolResults),
      suggestions: JSON.stringify(suggestions),
    });
    await agentRepo.touch(env.DB, conversationId);
  } catch (e) {
    console.error(e);
  }

  return { conversationId, text, steps, toolResults, suggestions };
}

const trimKey = (s?: string) => Boolean(s?.trim());
