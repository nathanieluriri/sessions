import type { Env, SessionUser } from "../../env";
import { hasPermission } from "../../../shared/permissions";
import { badRequest, forbidden } from "../../lib/errors";
import { uuid } from "../../lib/crypto";
import { agentRepo } from "../../repositories/agent";
import { callLLM, friendlyLlmError } from "./llm";
import { ToolRegistry } from "./registry";
import { isAccept, isDecline, lastOpenPending, lastPriceRequest, priceChangeOf, pendingGist } from "../../../shared/agent-confirm";
import { nextSteps } from "./next-steps";
import { selectSkills } from "./skills";
import { studioTools } from "./tools";
import type { AgentFormKind, ChatTurnInput, ChatTurnOutput, PendingChange, PreviewPayload, Step, ToolContext, ToolDef, ToolResultSummary } from "./types";

const ONCE = new Set(["catalog_list", "enquiries_list", "payments_outstanding", "reports_overview"]);
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
    const d = (r.data ?? {}) as { form?: AgentFormKind; pending?: PendingChange; table?: { columns: string[]; rows: string[][] }; args?: Record<string, unknown> };
    const data: Record<string, unknown> = {};
    if (d.form) data.form = d.form;
    if (d.pending) data.pending = d.pending;
    if (d.table?.columns?.length) data.table = d.table;
    if (d.args && Object.keys(d.args).length) data.args = d.args;
    return { tool: r.tool, status: r.status, summary: r.summary, ...(Object.keys(data).length ? { data } : {}) };
  });
}

function withMeta(data: unknown, args: Record<string, unknown>) {
  const base = data && typeof data === "object" && !Array.isArray(data) ? { ...(data as Record<string, unknown>) } : {};
  return { ...base, args };
}

function parseResults(raw: string): ToolResultSummary[] {
  try { return JSON.parse(raw || "[]") as ToolResultSummary[]; } catch { return []; }
}

function fallbackPreview(tool: string, args: Record<string, unknown>): PreviewPayload {
  const gist = pendingGist({ tool, args });
  if (tool === "catalog_set_price") {
    const after = args.quote ? "Request a quote" : typeof args.amount_ngn === "number" ? `₦${Number(args.amount_ngn).toLocaleString("en-NG")}` : "a new price";
    return { title: `Website price · ${String(args.service || "service")}`, where: "Services and pricing", after, available: true, note: "Accept saves this on the site." };
  }
  if (tool === "content_set") {
    return { title: `Change ${String(args.target || "copy")}`, after: String(args.value ?? gist), available: true };
  }
  if (tool === "bookings_reschedule") {
    return { title: `Move ${String(args.ref || "booking")}`, after: `${args.date ?? ""} ${args.time ?? ""}`.trim(), available: true };
  }
  if (tool === "bookings_cancel") {
    return { title: `Cancel ${String(args.ref || "booking")}`, after: String(args.reason || "Cancel"), available: true };
  }
  return { title: gist, after: gist, available: false, note: MISSING_PREVIEW };
}

function hardPreviewFail(msg: string): boolean {
  return /could not find|no service matches|no package matches|several places match|no booking matches/i.test(msg);
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
    const args = parsed.data as Record<string, unknown>;
    let preview: PreviewPayload;
    try {
      preview = tool.preview ? await tool.preview(parsed.data, ctx) : fallbackPreview(tool.name, args);
    } catch (e) {
      const msg = e instanceof Error ? e.message : MISSING_PREVIEW;
      if (hardPreviewFail(msg)) return { tool: tool.name, status: "error", summary: msg };
      preview = { ...fallbackPreview(tool.name, args), available: true, note: msg };
    }
    if (!preview.available) {
      const fb = fallbackPreview(tool.name, args);
      preview = { ...fb, ...preview, available: Boolean(preview.after || preview.before || fb.after), note: preview.note || fb.note };
    }
    const pending: PendingChange = { tool: tool.name, args, preview };
    return {
      tool: tool.name,
      status: "ok",
      summary: preview.available ? `Preview ready: ${preview.title}` : MISSING_PREVIEW,
      data: withMeta({ pending }, args),
    };
  }
  try {
    const exec = await tool.execute(parsed.data, ctx);
    return { tool: call.name, status: "ok", summary: exec.summary, data: withMeta(exec.data, parsed.data as Record<string, unknown>) };
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

  const history = (await agentRepo.messages(env.DB, conversationId)).map((m) => ({
    role: m.role,
    text: m.text,
    tool_results: parseResults(m.tool_results),
  }));
  const prior = history.slice(-16).map((m) => ({ role: m.role, text: m.text }));
  const open = lastOpenPending(history);
  const inferred = lastPriceRequest(history) ?? priceChangeOf(message);
  const acceptJob = input.confirm
    ?? (isAccept(message) && open ? { tool: open.tool, args: open.args } : undefined)
    ?? (isAccept(message) && inferred ? { tool: "catalog_set_price", args: inferred } : undefined);

  const userText = input.decline || isDecline(message)
    ? "Decline the preview."
    : input.confirm || isAccept(message)
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
    if (input.decline || isDecline(message)) {
      text = (input.decline || open) ? "No change. Nothing was saved." : "There's nothing to decline.";
    } else if (input.confirm || isAccept(message)) {
      if (!acceptJob) {
        text = "There's nothing waiting to accept. Tell me the change again — I'll show a preview, then Accept saves it.";
      } else {
        const r = await executeCall(reg, { name: acceptJob.tool, args: acceptJob.args }, ctx, true);
        toolResults.push(r);
        steps.push({ label: r.tool, status: r.status === "ok" ? "done" : "active" });
        text = r.status === "ok" ? `Done.\n\n${r.summary}` : r.summary;
      }
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
          if (ONCE.has(call.name) && toolResults.some((r) => r.tool === call.name && r.status === "ok")) continue;
          const r = await executeCall(reg, call, ctx, false);
          toolResults.push(r);
          steps.push({ label: r.tool, status: r.status === "ok" ? "done" : "active" });
        }
        const facts = toolResults.map((r) => `${r.tool}: ${r.summary}`).join("\n");
        const pending = pendingOf(toolResults);
        turn = await callLLM(env, reg, {
          message: `Tool results:\n${facts}\n\nAnswer the user's original request ("${userText}") in plain language.${pending ? " A preview card is on screen. Tell them to Accept to save or Decline to cancel." : " Do not mention Accept, Decline, or a missing preview — you did not open one."} Do not claim a change is saved until they Accept. Do not reprint a catalogue or booking list as markdown — the app already shows it as a table. One or two sentences is enough.`,
          history: prior,
          allowTools: rounds < 3 && !pending,
          extraSystem: skills,
        });
        if (turn.toolCalls.length === 0) break;
      }
      const want = priceChangeOf(userText);
      if (want && !pendingOf(toolResults) && !toolResults.some((r) => r.tool === "catalog_set_price")) {
        const r = await executeCall(reg, { name: "catalog_set_price", args: want }, ctx, false);
        toolResults.push(r);
        steps.push({ label: r.tool, status: r.status === "ok" ? "done" : "active" });
      }
      const pendingNow = pendingOf(toolResults);
      const raw = turn.text.trim();
      const lied = /preview[^.]*wasn't available|nothing is saved until you accept/i.test(raw);
      if (pendingNow && (!raw || lied)) {
        text = `Check the preview. Accept saves ${pendingGist(pendingNow)}.`;
      } else {
        text = raw || toolResults.map((r) => r.summary).join("\n");
      }
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
  const suggestions = nextSteps(userText, toolResults.map((r) => r.tool), pending, form);
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
