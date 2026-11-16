import { z } from "zod";
import type { Env, SessionUser } from "../../env";
import type { Permission } from "../../../shared/permissions";

/** Risk tiers: destructive always needs a human confirm; write can auto-run once the permission holds. */
export type Risk = "read" | "write" | "destructive";

/** Per-turn context handed to every tool's execute(). */
export interface ToolContext {
  /** The authenticated staff member driving the chat. */
  user: SessionUser;
  env: Env;
  conversationId?: string;
}

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface PreviewPayload {
  title: string;
  where?: string;
  before?: string;
  after?: string;
  note?: string;
  available: boolean;
}

export interface PendingChange {
  tool: string;
  args: Record<string, unknown>;
  preview: PreviewPayload;
}

export interface ToolExecResult {
  /** Short human summary, also stored on the message for audit. */
  summary: string;
  /** Structured payload (e.g. the created/updated entity) for narration and the UI. */
  data?: unknown;
}

export interface ToolResultSummary {
  tool: string;
  status: "ok" | "error";
  summary: string;
  data?: unknown;
  kind?: "create" | "update" | "delete";
}

export interface Step {
  label: string;
  status: "pending" | "active" | "done";
}

/** A tool wraps exactly one studio capability. `permission` is the existing staff permission key. */
export interface ToolDef<S extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  risk: Risk;
  permission: Permission;
  schema: S;
  /** When true, the orchestrator shows a preview and waits for Accept. Defaults to risk !== "read". */
  confirm?: boolean;
  preview?: (args: z.infer<S>, ctx: ToolContext) => Promise<PreviewPayload>;
  execute: (args: z.infer<S>, ctx: ToolContext) => Promise<ToolExecResult>;
}

export type AgentFormKind = "booking" | "quote" | "payment" | "price";

export interface ChatTurnInput {
  message?: string;
  conversationId?: string;
  form?: { kind: AgentFormKind; values: Record<string, unknown> };
  confirm?: { tool: string; args: Record<string, unknown> };
  decline?: boolean;
  images?: string[];
}

export interface ChatTurnOutput {
  conversationId: string;
  text: string;
  steps: Step[];
  toolResults: ToolResultSummary[];
  suggestions: string[];
  form?: AgentFormKind;
  pending?: PendingChange;
}

export interface ConversationSummary {
  id: string;
  title: string;
  message_count: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  steps: string[];
  tool_results: ToolResultSummary[];
  suggestions: string[];
  created_at: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ConversationMessage[];
  created_at: string | null;
  updated_at: string | null;
}
