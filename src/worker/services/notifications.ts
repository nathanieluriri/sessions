import type { Env } from "../env";
import { notificationsRepo, outboxRepo } from "../repositories/misc";
import { usersRepo } from "../repositories/users";
import { uuid } from "../lib/crypto";

export async function sendEmail(env: Env, to: string, subject: string, text: string) {
  let status: "sent" | "logged" | "failed" = "logged";
  if (env.RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.EMAIL_FROM || `${env.STUDIO_NAME} <onboarding@resend.dev>`, to, subject, text }),
    }).catch(() => null);
    status = res?.ok ? "sent" : "failed";
  }
  await outboxRepo.add(env.DB, { id: uuid(), to, subject, body: text, status });
}

export const notifyUser = (env: Env, userId: string, title: string, body: string) => notificationsRepo.add(env.DB, { id: uuid(), userId, title, body });

/** Emails the CEO and every active admin who holds the given permission. */
export async function notifyStaff(env: Env, permission: string, subject: string, text: string) {
  const staff = await usersRepo.staff(env.DB);
  const to = staff.filter((s) => s.active && (s.role === "ceo" || JSON.parse(s.permissions).includes(permission)));
  for (const s of to) {
    await sendEmail(env, s.email, subject, text);
    await notifyUser(env, s.id, subject, text.split("\n")[0]);
  }
}

export const studioFooter = (env: Env) => `\n${env.STUDIO_NAME}\n14 Admiralty Way, Lekki Phase 1, Lagos\n${env.STUDIO_PHONE} · ${env.STUDIO_EMAIL}`;
