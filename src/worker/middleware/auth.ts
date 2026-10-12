import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import type { AppEnv } from "../env";
import { authService } from "../services/auth";
import { forbidden, unauthorized } from "../lib/errors";
import type { Permission } from "../../shared/permissions";

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

export const requireCeo: MiddlewareHandler<AppEnv> = async (c, next) => {
  const u = c.get("user");
  if (!u) throw unauthorized();
  if (u.role !== "ceo") throw forbidden("This area is for the CEO only.");
  await next();
};

/** CEO always passes; admins need the named permission. Enforced on every request, not just in the UI. */
export const requirePermission = (p: Permission): MiddlewareHandler<AppEnv> => async (c, next) => {
  const u = c.get("user");
  if (!u) throw unauthorized();
  if (u.role !== "ceo" && !(u.role === "admin" && u.permissions.includes(p))) throw forbidden();
  await next();
};
