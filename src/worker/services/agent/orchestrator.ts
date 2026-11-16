import type { Env, SessionUser } from "../../env";
import { hasPermission } from "../../../shared/permissions";
import { uuid } from "../../lib/crypto";
import { agentRepo } from "../../repositories/agent";
import { callLLM } from "./llm";
import { ToolRegistry } from "./registry";
import { studioTools } from "./tools";
import type { ChatTurnInput, ChatTurnOutput, Step, ToolContext, ToolResultSummary } from "./types";

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
    return { tool: call.name, status: "ok", summary: exec.summary, data: exec.data };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "It didn't work.";
    return { tool: call.name, status: "error", summary: msg };
  }
}

function history(ctx: { env: Env; user: SessionUser }, conversationId?: string) {
  if (!conversationId) return [];
  return agentRepo.messages(ctx.env.DB, conversationId).then((msgs) =>
    msgs.slice(-16).map((m) => ({ role: m.role, text: m.text })),
  );
}

export async function runTurn(env: Env, user: SessionUser, input: ChatTurnInput): Promise<ChatTurnOutput> {
  const reg = registry();
  const message = (input.message ?? "").trim();
  if (!message) throw new Error("What would you like me to do?");

  let conversationId = input.conversationId;
  if (!conversationId) {
    conversationId = uuid();
    await agentRepo.createConversation(env.DB, conversationId, user.id, message.slice(0, 60) || "New chat");
  } else {
    const own = await agentRepo.byId(env.DB, conversationId, user.id);
    if (!own) throw new Error("That conversation is not yours.");
  }

  const ctx: ToolContext = { user, env, conversationId };
  const prior = await history({ env, user }, conversationId);

  // If there is no LLM key, the assistant still answers reads from a deterministic hint set, but cannot reason.
  const toolResults: ToolResultSummary[] = [];
  let text = "";
  const steps: Step[] = [];

  if (env.OPENROUTER_API_KEY) {
    let turn = await callLLM(env, reg, { message, history: prior, allowTools: true });
    let rounds = 0;
    // Run tool calls, then ask once more for a plain answer that folds in the results.
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
        allowTools: false,
      });
    }
    text = turn.text.trim() || toolResults.map((r) => r.summary).join("\n");
  } else {
    text = "The assistant is not configured. Add OPENROUTER_API_KEY as a Worker secret to turn on the full assistant. Until then I cannot look anything up or act.";
  }

  await agentRepo.addMessage(env.DB, { id: uuid(), conversationId, role: "user", text: message, steps: "[]", toolResults: "[]", suggestions: "[]" });
  await agentRepo.addMessage(env.DB, {
    id: uuid(), conversationId, role: "assistant", text,
    steps: JSON.stringify(steps.map((s) => s.label)),
    toolResults: JSON.stringify(toolResults),
    suggestions: "[]",
  });
  await agentRepo.touch(env.DB, conversationId);

  return { conversationId, text, steps, toolResults, suggestions: [] };
}
