import { all, first, run } from "./db";

export interface ConversationRow { id: string; owner_id: string; title: string; created_at: string; updated_at: string }
export interface MessageRow { id: string; conversation_id: string; role: "user" | "assistant"; text: string; steps: string; tool_results: string; suggestions: string; created_at: string }

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

export const agentRepo = {
  createConversation: (db: D1Database, id: string, ownerId: string, title: string) =>
    run(db, "INSERT INTO agent_conversations (id, owner_id, title) VALUES (?, ?, ?)", id, ownerId, title),

  touch: (db: D1Database, id: string) => run(db, `UPDATE agent_conversations SET updated_at = ${NOW} WHERE id = ?`, id),

  byId: (db: D1Database, id: string, ownerId: string) => first<ConversationRow>(db, "SELECT * FROM agent_conversations WHERE id = ? AND owner_id = ?", id, ownerId),

  list: (db: D1Database, ownerId: string) => all<ConversationRow & { message_count: number }>(db,
    `SELECT c.*, (SELECT COUNT(*) FROM agent_messages m WHERE m.conversation_id = c.id) message_count
     FROM agent_conversations c WHERE c.owner_id = ? ORDER BY c.updated_at DESC LIMIT 60`, ownerId),

  messages: (db: D1Database, conversationId: string) => all<MessageRow>(db, "SELECT * FROM agent_messages WHERE conversation_id = ? ORDER BY created_at", conversationId),

  addMessage: (db: D1Database, m: { id: string; conversationId: string; role: "user" | "assistant"; text: string; steps: string; toolResults: string; suggestions: string }) =>
    run(db, "INSERT INTO agent_messages (id, conversation_id, role, text, steps, tool_results, suggestions) VALUES (?, ?, ?, ?, ?, ?, ?)",
      m.id, m.conversationId, m.role, m.text, m.steps, m.toolResults, m.suggestions),

  delete: (db: D1Database, id: string, ownerId: string) => run(db, "DELETE FROM agent_conversations WHERE id = ? AND owner_id = ?", id, ownerId),
};
