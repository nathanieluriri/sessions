import type { Env } from "./env";
import { uuid } from "./lib/crypto";
import { inboxRepo } from "./repositories/misc";

/** Stores mail sent to the studio. The raw stream can only be read once. */
export async function receiveEmail(message: { from: string; to: string; headers: Headers; raw: ReadableStream }, env: Env) {
  const subject = (message.headers.get("subject") ?? "(no subject)").slice(0, 300);
  let body = "";
  try {
    const raw = await new Response(message.raw).text();
    const parts = raw.split(/\r?\n\r?\n/);
    body = (parts.length > 1 ? parts.slice(1).join("\n\n") : raw).replace(/<[^>]+>/g, " ").replace(/[ \t]+\n/g, "\n").trim().slice(0, 12000);
  } catch { /* a mail with no readable body is still listed */ }
  await inboxRepo.add(env.DB, { id: uuid(), from: message.from, to: message.to, subject, body });
}
