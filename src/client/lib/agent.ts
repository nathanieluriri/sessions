import { api } from "./api";

export type AgentFormKind = "booking" | "quote" | "payment" | "price";

export interface ToolResult {
  tool: string;
  status: "ok" | "error";
  summary: string;
  data?: { form?: AgentFormKind };
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

export const chat = (message: string, conversationId?: string, form?: { kind: AgentFormKind; values: Record<string, unknown> }) =>
  api<ChatResponse>("/agent/chat", { method: "POST", body: { message, conversationId, form } });

export const agentCatalog = () => api<AgentCatalog>("/agent/catalog");

export const listConversations = () => api<ConversationSummary[]>("/agent/conversations");

export const getConversation = (id: string) => api<Conversation>(`/agent/conversations/${id}`);

export const deleteConversation = (id: string) => api<{ deleted: boolean }>(`/agent/conversations/${id}`, { method: "DELETE" });

export const formOf = (m: Message | ChatResponse): AgentFormKind | undefined => {
  if ("form" in m && m.form) return m.form;
  const results = "toolResults" in m ? m.toolResults : m.tool_results;
  return results?.map((t) => t.data?.form).find((k): k is AgentFormKind => k === "booking" || k === "quote" || k === "payment" || k === "price");
};

export const toolLabel = (name: string) =>
  name
    .split(/[._]/)
    .filter(Boolean)
    .slice(-2)
    .join(" ")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
