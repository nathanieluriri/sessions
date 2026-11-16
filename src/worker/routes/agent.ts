import { Hono, type Context } from "hono";
import { z } from "zod";
import type { AppEnv, SessionUser } from "../env";
import { requirePermission } from "../middleware/auth";
import { agentRepo } from "../repositories/agent";
import { runTurn } from "../services/agent/orchestrator";
import { body } from "../lib/validate";
import { notFound } from "../lib/errors";

const r = new Hono<AppEnv>();
const actor = (c: Context<AppEnv>) => c.get("user") as SessionUser;

const parseJson = <T>(raw: string, fallback: T): T => {
  try { return JSON.parse(raw || "") as T; } catch { return fallback; }
};

r.post("/chat", requirePermission("use_agent"), async (c) => {
  const b = await body(c, z.object({ message: z.string().min(1), conversationId: z.string().optional() }));
  return c.json(await runTurn(c.env, actor(c), b));
});

r.get("/conversations", requirePermission("use_agent"), async (c) =>
  c.json(await agentRepo.list(c.env.DB, actor(c).id)));

r.get("/conversations/:id", requirePermission("use_agent"), async (c) => {
  const id = c.req.param("id");
  const convo = await agentRepo.byId(c.env.DB, id, actor(c).id);
  if (!convo) throw notFound("Conversation not found.");
  const messages = await agentRepo.messages(c.env.DB, id);
  return c.json({
    id: convo.id,
    title: convo.title,
    created_at: convo.created_at,
    updated_at: convo.updated_at,
    messages: messages.map((m) => ({
      id: m.id, role: m.role, text: m.text, created_at: m.created_at,
      steps: parseJson<string[]>(m.steps, []),
      tool_results: parseJson(m.tool_results, []),
      suggestions: parseJson<string[]>(m.suggestions, []),
    })),
  });
});

r.delete("/conversations/:id", requirePermission("use_agent"), async (c) => {
  const id = c.req.param("id");
  await agentRepo.delete(c.env.DB, id, actor(c).id);
  return c.json({ deleted: true });
});

export default r;
