-- AI assistant: conversations and messages. The assistant has no delete/undo of financial records by design.
CREATE TABLE agent_conversations (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE agent_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES agent_conversations(id),
  role TEXT NOT NULL,
  text TEXT NOT NULL,
  steps TEXT NOT NULL DEFAULT '[]',
  tool_results TEXT NOT NULL DEFAULT '[]',
  suggestions TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_agent_conversations_owner ON agent_conversations (owner_id, updated_at DESC);
CREATE INDEX idx_agent_messages_conversation ON agent_messages (conversation_id, created_at);
