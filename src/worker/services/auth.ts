import type { Env, SessionUser } from "../env";
import { usersRepo, sessionsRepo, tokensRepo, loginAttemptsRepo, type UserRow } from "../repositories/users";
import { hashPassword, verifyPassword, randomToken, sha256, uuid } from "../lib/crypto";
import { isoIn } from "../lib/time";
import { badRequest, conflict, unauthorized, AppError } from "../lib/errors";
import { brand, sendEmail } from "./notifications";
import { bookingsRepo } from "../repositories/bookings";
import { audit } from "./audit";

export const SESSION_DAYS = 14;

export const toSessionUser = (u: UserRow): SessionUser => ({
  id: u.id, email: u.email, name: u.name, phone: u.phone, role: u.role, level: u.level, title: u.title,
  permissions: JSON.parse(u.permissions), emailVerified: !!u.email_verified_at,
});

async function startSession(env: Env, userId: string) {
  const token = randomToken();
  await sessionsRepo.create(env.DB, await sha256(token), userId, isoIn(SESSION_DAYS * 1440));
  return token;
}

async function sendVerification(env: Env, u: { id: string; email: string; name: string }) {
  const token = randomToken();
  await tokensRepo.create(env.DB, await sha256(token), u.id, "verify", isoIn(24 * 60));
  await sendEmail(env, u.email, "Verify your email", `Hi ${u.name},\n\nConfirm your email address for ${(await brand(env)).name}:\n${env.APP_URL}/verify-email?token=${token}\n\nThe link expires in 24 hours.`);
}

export const authService = {
  async register(env: Env, input: { name: string; email: string; phone: string; password: string }) {
    if (await usersRepo.byEmail(env.DB, input.email)) throw conflict("An account with this email already exists. Log in instead.");
    const id = uuid();
    await usersRepo.create(env.DB, { id, email: input.email, name: input.name, phone: input.phone, passwordHash: await hashPassword(input.password), role: "client" });
    await sendVerification(env, { id, email: input.email.toLowerCase(), name: input.name });
    const user = toSessionUser((await usersRepo.byId(env.DB, id))!);
    await audit(env.DB, user, "Client registered", user.email);
    return { user, token: await startSession(env, id) };
  },

  async login(env: Env, email: string, password: string, ip: string, staffOnly = false) {
    email = email.toLowerCase();
    const since = isoIn(-15);
    if (((await loginAttemptsRepo.countSince(env.DB, email, since))?.n ?? 0) >= 5) throw new AppError(429, "Too many attempts. Sign in is paused for 15 minutes.", "rate_limited");
    const u = await usersRepo.byEmail(env.DB, email);
    const ok = u && u.active && (await verifyPassword(password, u.password_hash));
    if (!ok || (staffOnly && u.role === "client")) {
      await loginAttemptsRepo.add(env.DB, email, new Date().toISOString());
      if (u && u.role !== "client") await audit(env.DB, null, "Failed staff sign-in", email, "", ip);
      throw unauthorized("Email or password is incorrect.");
    }
    await loginAttemptsRepo.clear(env.DB, email);
    const user = toSessionUser(u);
    if (user.role !== "client") await audit(env.DB, user, "Signed in", user.email, "", ip);
    return { user, token: await startSession(env, u.id) };
  },

  async userForToken(env: Env, token: string) {
    const u = await sessionsRepo.user(env.DB, await sha256(token), new Date().toISOString());
    return u ? toSessionUser(u) : null;
  },

  logout: async (env: Env, token: string) => sessionsRepo.remove(env.DB, await sha256(token)),

  async verifyEmail(env: Env, token: string) {
    const r = await tokensRepo.consume(env.DB, await sha256(token), "verify", new Date().toISOString());
    if (!r) throw badRequest("This link has expired or was already used.");
    await usersRepo.markVerified(env.DB, r.user_id);
    const u = await usersRepo.byId(env.DB, r.user_id);
    if (u?.role === "client") await bookingsRepo.linkGuestBookings(env.DB, u.id, u.email);
  },

  async resendVerification(env: Env, user: SessionUser) {
    if (!user.emailVerified) await sendVerification(env, user);
  },

  async requestReset(env: Env, email: string) {
    const u = await usersRepo.byEmail(env.DB, email);
    if (!u) return;
    const token = randomToken();
    await tokensRepo.create(env.DB, await sha256(token), u.id, "reset", isoIn(60));
    await sendEmail(env, u.email, "Reset your password", `Hi ${u.name},\n\nSet a new password here:\n${env.APP_URL}/reset-password?token=${token}\n\nThe link expires in 1 hour. If you did not ask for this, ignore this email.`);
  },

  async resetPassword(env: Env, token: string, password: string) {
    const r = await tokensRepo.consume(env.DB, await sha256(token), "reset", new Date().toISOString());
    if (!r) throw badRequest("This link has expired or was already used.");
    await usersRepo.setPassword(env.DB, r.user_id, await hashPassword(password));
    await sessionsRepo.removeOthers(env.DB, r.user_id, "");
  },

  async changePassword(env: Env, user: SessionUser, current: string, next: string, keepToken: string) {
    const u = (await usersRepo.byId(env.DB, user.id))!;
    if (!(await verifyPassword(current, u.password_hash))) throw badRequest("Current password is incorrect.");
    await usersRepo.setPassword(env.DB, user.id, await hashPassword(next));
    await sessionsRepo.removeOthers(env.DB, user.id, await sha256(keepToken));
  },
};
