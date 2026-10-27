import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import type { AppEnv, SessionUser } from "../env";
import { authService } from "../services/auth";
import { forbidden, unauthorized } from "../lib/errors";
import { canSeeContacts, hasPermission, type Permission } from "../../shared/permissions";

export const COOKIE = "sessions_sid";

export const loadUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getCookie(c, COOKIE);
  c.set("user", token ? await authService.userForToken(c.env, token) : null);
  await next();
};

export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get("user")) throw unauthorized();
  await next();
};

export const requireStaff: MiddlewareHandler<AppEnv> = async (c, next) => {
  const u = c.get("user");
  if (!u) throw unauthorized();
  if (u.role === "client") throw forbidden();
  await next();
};

export const can = (u: SessionUser, p: Permission) => hasPermission(u, p);

/** CEO and COO always pass; other staff need the named permission. Enforced on every request, not just in the UI. */
export const requirePermission = (p: Permission): MiddlewareHandler<AppEnv> => async (c, next) => {
  const u = c.get("user");
  if (!u) throw unauthorized();
  if (!can(u, p)) throw forbidden();
  await next();
};

/** Client lists and histories expose emails and phone numbers, so they are for staff who work with clients. */
export const requireFrontDesk: MiddlewareHandler<AppEnv> = async (c, next) => {
  const u = c.get("user");
  if (!u) throw unauthorized();
  if (!canSeeContacts(u)) throw forbidden();
  await next();
};
