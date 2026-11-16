import type { Env, SessionUser } from "../../env";
import { hasPermission } from "../../../shared/permissions";
import { badRequest, forbidden } from "../../lib/errors";
import { uuid } from "../../lib/crypto";
import { agentRepo } from "../../repositories/agent";
import { callLLM, friendlyLlmError } from "./llm";
import { ToolRegistry } from "./registry";
import { selectSkills } from "./skills";
import { studioTools } from "./tools";
import type { AgentFormKind, ChatTurnInput, ChatTurnOutput, PendingChange, PreviewPayload, Step, ToolContext, ToolDef, ToolResultSummary } from "./types";

const STARTERS = ["Create a booking", "Send a quote", "Change site copy", "What's on today?"];
const FORM_TOOLS: Record<AgentFormKind, string> = {
  booking: "bookings_create",
  quote: "quotes_send",
  payment: "payments_record",
  price: "catalog_set_price",
};
const MISSING_PREVIEW = "I tried to show a preview for this change but it wasn't available at this moment.";

let cached: ToolRegistry | null = null;
function registry(): ToolRegistry {
  if (!cached) {
    cached = new ToolRegistry();
    for (const tool of studioTools) cached.register(tool);
  }
  return cached;
}

function wantsConfirm(tool: ToolDef): boolean {
  if (tool.confirm === false) return false;
  if (tool.confirm === true) return true;
  return tool.risk !== "read";
}

function formOf(results: ToolResultSummary[]): AgentFormKind | undefined {
  for (const r of results) {
    const kind = (r.data as { form?: AgentFormKind } | undefined)?.form;
    if (kind === "booking" || kind === "quote" || kind === "payment" || kind === "price") return kind;
  }
}

function pendingOf(results: ToolResultSummary[]): PendingChange | undefined {
  for (const r of results) {
    const p = (r.data as { pending?: PendingChange } | undefined)?.pending;
    if (p?.tool && p.preview) return p;
  }
}

function slim(results: ToolResultSummary[]): ToolResultSummary[] {
  return results.map((r) => {
    const form = (r.data as { form?: AgentFormKind } | undefined)?.form;
    const pending = (r.data as { pending?: PendingChange } | undefined)?.pending;
    return { tool: r.tool, status: r.status, summary: r.summary, ...((form || pending) ? { data: { ...(form ? { form } : {}), ...(pending ? { pending } : {}) } } : {}) };
  });
}

async function executeCall(reg: ToolRegistry, call: { name: string; args: Record<string, unknown> }, ctx: ToolContext, apply: boolean): Promise<ToolResultSummary> {
  const tool = reg.get(call.name);
  if (!tool) return { tool: call.name, status: "error", summary: "I couldn't find a way to do that." };
  if (!hasPermission(ctx.user, tool.permission)) {
    return { tool: call.name, status: "error", summary: `You don't have the "${tool.permission.replace(/_/g, " ")}" permission to do that.` };
  }
  const parsed = tool.schema.safeParse(call.args);
  if (!parsed.success) {
    return { tool: call.name, status: "error", summary: parsed.error.issues[0]?.message ?? "More detail needed." };
  }
  if (!apply && wantsConfirm(tool)) {
    try {
      const preview: PreviewPayload = tool.preview
        ? await tool.preview(parsed.data, ctx)
        : { title: tool.name, available: false, note: MISSING_PREVIEW };
      const pending: PendingChange = { tool: tool.name, args: parsed.data as Record<string, unknown>, preview };
      return {
        tool: tool.name,
        status: "ok",
        summary: preview.available ? `Preview ready: ${preview.title}` : MISSING_PREVIEW,
        data: { pending },
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : MISSING_PREVIEW;
      return { tool: tool.name, status: "error", summary: msg };
    }
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
  if (!message && !input.form && !input.confirm && !input.decline && !(input.images && input.images.length)) {
    throw badRequest("What would you like me to do?");
  }

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
  const userText = input.decline
    ? "Decline the preview."
    : input.confirm
      ? "Accept the preview."
      : input.form
        ? `Submitted the ${input.form.kind} form${message ? `: ${message}` : "."}`
        : message || (input.images?.length ? "Read this picture and find the matching site copy." : "");
  await agentRepo.addMessage(env.DB, { id: uuid(), conversationId, role: "user", text: userText, steps: "[]", toolResults: "[]", suggestions: "[]" });
  await agentRepo.touch(env.DB, conversationId);

  const ctx: ToolContext = { user, env, conversationId };
  const toolResults: ToolResultSummary[] = [];
  const steps: Step[] = [];
  let text = "";
  const skills = selectSkills(userText);

  try {
    if (input.decline) {
      text = "No change. Nothing was saved.";
    } else if (input.confirm) {
      const r = await executeCall(reg, { name: input.confirm.tool, args: input.confirm.args }, ctx, true);
      toolResults.push(r);
      steps.push({ label: r.tool, status: r.status === "ok" ? "done" : "active" });
      text = r.status === "ok" ? `Done.\n\n${r.summary}` : r.summary;
    } else if (input.form) {
      const name = FORM_TOOLS[input.form.kind];
      const r = await executeCall(reg, { name, args: input.form.values }, ctx, false);
      toolResults.push(r);
      steps.push({ label: r.tool, status: r.status === "ok" ? "done" : "active" });
      text = r.data && (r.data as { pending?: unknown }).pending
        ? (r.summary.startsWith("Preview") ? "Check the preview, then Accept to save it on the site." : r.summary)
        : r.status === "ok" ? `Done.\n\n${r.summary}` : r.summary;
    } else if (trimKey(env.OPENROUTER_API_KEY)) {
      let turn = await callLLM(env, reg, { message: userText, history: prior, allowTools: true, extraSystem: skills, images: input.images });
      let rounds = 0;
      while (turn.toolCalls.length > 0 && rounds < 4) {
        rounds++;
        for (const call of turn.toolCalls) {
          const r = await executeCall(reg, call, ctx, false);
          toolResults.push(r);
          steps.push({ label: r.tool, status: r.status === "ok" ? "done" : "active" });
        }
        const facts = toolResults.map((r) => `${r.tool}: ${r.summary}`).join("\n");
        const pending = pendingOf(toolResults);
        turn = await callLLM(env, reg, {
          message: `Tool results:\n${facts}\n\nAnswer the user's original request ("${userText}") in plain language.${pending ? " A preview is on screen. Tell them to Accept to save, Decline to cancel, or say if they meant a different field." : ""} Do not claim a change is saved until they Accept.`,
          history: prior,
          allowTools: rounds < 3 && !pending,
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
  const pending = pendingOf(toolResults);
  const suggestions = pending ? ["Find another place this appears"] : prior.length === 0 && !form ? STARTERS : [];
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

  return { conversationId, text, steps, toolResults: stored, suggestions, form, pending };
}

const trimKey = (s?: string) => Boolean(s?.trim());
