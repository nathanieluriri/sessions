import { auditRepo } from "../repositories/misc";
import { uuid } from "../lib/crypto";
import type { SessionUser } from "../env";

export const audit = (db: D1Database, actor: SessionUser | null, action: string, target = "", detail = "", ip = "") =>
  auditRepo.add(db, { id: uuid(), actorId: actor?.id ?? null, actorLabel: actor ? `${actor.name} (${actor.role.toUpperCase()})` : "System", action, target, detail, ip });
