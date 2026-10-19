import { hasPermission, type Permission } from "../../shared/permissions";
import type { Env } from "../env";
import { notificationsRepo, outboxRepo } from "../repositories/misc";
import { usersRepo } from "../repositories/users";
import { contentRepo } from "../repositories/settings";
import { uuid } from "../lib/crypto";

export interface Brand { name: string; address: string; phone: string; email: string; whatsapp: string }

/** Business details come from the editable website content, with the deploy settings as a fallback. */
export async function brand(env: Env): Promise<Brand> {
  const c = await contentRepo.content(env.DB);
  return {
    name: c.business_name || env.STUDIO_NAME, address: c.studio_address || "", phone: c.contact_phone || env.STUDIO_PHONE,
    email: c.contact_email || env.STUDIO_EMAIL, whatsapp: c.whatsapp || "",
  };
}

export async function sendEmail(env: Env, to: string, subject: string, text: string) {
  if (!to) return;
  const b = await brand(env);
  const body = `${text}\n\n${b.name}\n${[b.address, [b.phone, b.email].filter(Boolean).join(" · ")].filter(Boolean).join("\n")}`;
  let status: "sent" | "logged" | "failed" = "logged";
  if (env.RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.EMAIL_FROM || `${b.name} <onboarding@resend.dev>`, to, subject, text: body, reply_to: b.email || undefined }),
    }).catch(() => null);
    status = res?.ok ? "sent" : "failed";
  }
  await outboxRepo.add(env.DB, { id: uuid(), to, subject, body, status });
}

export const notifyUser = async (env: Env, userId: string | null, title: string, body: string) => {
  if (userId) await notificationsRepo.add(env.DB, { id: uuid(), userId, title, body });
};

/** Emails the CEO and every active admin who holds the given permission. */
export async function notifyStaff(env: Env, permission: string, subject: string, text: string) {
  const staff = await usersRepo.staff(env.DB);
  const to = staff.filter((s) => s.active && hasPermission({ ...s, permissions: JSON.parse(s.permissions) }, permission as Permission));
  for (const s of to) {
    await sendEmail(env, s.email, subject, text);
    await notifyUser(env, s.id, subject, text.split("\n")[0]);
  }
}
