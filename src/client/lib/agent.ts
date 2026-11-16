import { api } from "./api";

export type AgentFormKind = "booking" | "quote" | "payment" | "price";

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

export interface AgentTable {
  columns: string[];
  rows: string[][];
}

export interface ToolResult {
  tool: string;
  status: "ok" | "error";
  summary: string;
  data?: { form?: AgentFormKind; pending?: PendingChange; table?: AgentTable; args?: Record<string, unknown> };
  kind?: "create" | "update" | "delete";
}

export interface Step {
  label: string;
  status: "pending" | "active" | "done";
}

export interface ChatResponse {
  conversationId: string;
  text: string;
  steps: Step[];
  toolResults: ToolResult[];
  suggestions: string[];
  form?: AgentFormKind;
  pending?: PendingChange;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  steps: string[];
  tool_results: ToolResult[];
  suggestions: string[];
  created_at: string;
  form?: AgentFormKind;
}

export interface Conversation {
  id: string;
  title: string;
  created_at: string | null;
  updated_at: string | null;
  messages: Message[];
}

export interface ConversationSummary {
  id: string;
  title: string;
  message_count: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface AgentCatalog {
  services: { slug: string; name: string; category: string; price_label: string }[];
  packages: { id: string; slug: string; name: string; service_slug: string; service_category: string; pricing: "fixed" | "quote"; price_kobo: number; price_label: string; scheduling: string; room_id: string | null }[];
  rooms: { id: string; name: string }[];
  categories: { slug: string; name: string; bookable: number }[];
}

export const chat = (input: {
  message?: string;
  conversationId?: string;
  form?: { kind: AgentFormKind; values: Record<string, unknown> };
  confirm?: { tool: string; args: Record<string, unknown> };
  decline?: boolean;
  images?: string[];
}) => api<ChatResponse>("/agent/chat", { method: "POST", body: input });

export const agentCatalog = () => api<AgentCatalog>("/agent/catalog");

export const listConversations = () => api<ConversationSummary[]>("/agent/conversations");

export const getConversation = (id: string) => api<Conversation>(`/agent/conversations/${id}`);

export const deleteConversation = (id: string) => api<{ deleted: boolean }>(`/agent/conversations/${id}`, { method: "DELETE" });

export const formOf = (m: Message | ChatResponse): AgentFormKind | undefined => {
  if ("form" in m && m.form) return m.form;
  const results = "toolResults" in m ? m.toolResults : m.tool_results;
  return results?.map((t) => t.data?.form).find((k): k is AgentFormKind => k === "booking" || k === "quote" || k === "payment" || k === "price");
};

export const pendingOf = (m: Message | ChatResponse): PendingChange | undefined => {
  if ("pending" in m && m.pending) return m.pending;
  const results = "toolResults" in m ? m.toolResults : m.tool_results;
  return results?.map((t) => t.data?.pending).find((p): p is PendingChange => !!p?.tool);
};

export const toolLabel = (name: string) =>
  name
    .split(/[._]/)
    .filter(Boolean)
    .slice(-2)
    .join(" ")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
