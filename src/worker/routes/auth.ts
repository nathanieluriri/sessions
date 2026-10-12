import { Hono } from "hono";
import { z } from "zod";
import { setCookie, deleteCookie, getCookie } from "hono/cookie";
import type { AppEnv } from "../env";
import { authService, SESSION_DAYS } from "../services/auth";
import { usersRepo } from "../repositories/users";
import { body, email, password, required, text } from "../lib/validate";
import { COOKIE, requireUser } from "../middleware/auth";
import { badRequest } from "../lib/errors";

const r = new Hono<AppEnv>();
const ip = (c: any) => c.req.header("cf-connecting-ip") ?? "";
const setSession = (c: any, token: string) =>
  setCookie(c, COOKIE, token, { httpOnly: true, secure: new URL(c.req.url).protocol === "https:", sameSite: "Lax", path: "/", maxAge: SESSION_DAYS * 86400 });

r.get("/me", (c) => c.json({ user: c.get("user") }));

r.post("/register", async (c) => {
  const b = await body(c, z.object({ name: required("Full name"), email, phone: required("Phone number", 40), password, confirmPassword: z.string() }));
  if (b.password !== b.confirmPassword) throw badRequest("Passwords do not match.");
  const { user, token } = await authService.register(c.env, b);
  setSession(c, token);
  return c.json({ user });
});

r.post("/login", async (c) => {
  const b = await body(c, z.object({ email, password: z.string().min(1, "Enter your password."), staff: z.boolean().optional() }));
  const { user, token } = await authService.login(c.env, b.email, b.password, ip(c), b.staff);
  setSession(c, token);
  return c.json({ user });
});

r.post("/logout", async (c) => {
  const token = getCookie(c, COOKIE);
  if (token) await authService.logout(c.env, token);
  deleteCookie(c, COOKIE, { path: "/" });
  return c.json({ ok: true });
});

r.post("/verify-email", async (c) => {
  const b = await body(c, z.object({ token: required("Token") }));
  await authService.verifyEmail(c.env, b.token);
  return c.json({ ok: true });
});

r.post("/resend-verification", requireUser, async (c) => {
  await authService.resendVerification(c.env, c.get("user")!);
  return c.json({ ok: true });
});

r.post("/forgot-password", async (c) => {
  const b = await body(c, z.object({ email }));
  await authService.requestReset(c.env, b.email);
  return c.json({ ok: true });
});

r.post("/reset-password", async (c) => {
  const b = await body(c, z.object({ token: required("Token"), password, confirmPassword: z.string() }));
  if (b.password !== b.confirmPassword) throw badRequest("Passwords do not match.");
  await authService.resetPassword(c.env, b.token, b.password);
  return c.json({ ok: true });
});

r.put("/profile", requireUser, async (c) => {
  const b = await body(c, z.object({ name: required("Full name"), phone: required("Phone number", 40) }));
  await usersRepo.updateProfile(c.env.DB, c.get("user")!.id, b);
  return c.json({ ok: true });
});

r.put("/password", requireUser, async (c) => {
  const b = await body(c, z.object({ current: z.string().min(1, "Enter your current password."), password, confirmPassword: z.string() }));
  if (b.password !== b.confirmPassword) throw badRequest("Passwords do not match.");
  await authService.changePassword(c.env, c.get("user")!, b.current, b.password, getCookie(c, COOKIE)!);
  return c.json({ ok: true });
});

export default r;
