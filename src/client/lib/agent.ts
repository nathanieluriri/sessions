import { api } from "./api";

export interface ToolResult {
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

export interface ChatResponse {
  conversationId: string;
  text: string;
  steps: Step[];
  toolResults: ToolResult[];
  suggestions: string[];
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  steps: string[];
  tool_results: ToolResult[];
  suggestions: string[];
  created_at: string;
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

export const chat = (message: string, conversationId?: string) =>
  api<ChatResponse>("/agent/chat", { method: "POST", body: { message, conversationId } });

export const listConversations = () => api<ConversationSummary[]>("/agent/conversations");

export const getConversation = (id: string) => api<Conversation>(`/agent/conversations/${id}`);

export const deleteConversation = (id: string) => api<{ deleted: boolean }>(`/agent/conversations/${id}`, { method: "DELETE" });

export const toolLabel = (name: string) =>
  name
    .split(/[._]/)
    .filter(Boolean)
    .slice(-2)
    .join(" ")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
