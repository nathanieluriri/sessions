import { Hono, type MiddlewareHandler } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { requirePermission, requireUser } from "../middleware/auth";
import { body, required, text } from "../lib/validate";
import { badRequest } from "../lib/errors";
import { filesService, type Side } from "../services/files";

const upload = z.object({
  name: z.string({ required_error: "Choose a file.", invalid_type_error: "Choose a file." }).min(1, "Choose a file.").max(1000, "That file name is too long."),
  size: z.number({ required_error: "Send the file size in bytes.", invalid_type_error: "Send the file size in bytes." }).int("Send the file size in bytes."),
});
const revision = z.object({ note: z.string().trim().min(3, "Tell the studio what to change (at least 3 characters).").max(2000, "Keep the note under 2000 characters.") });
const notify = z.object({ fileIds: z.array(z.string().max(64)).min(1, "Choose the files to tell the studio about.").max(500) });
const deliver = z.object({
  items: z.array(z.object({ fileId: required("File", 64), title: required("Title", 120) })).min(1, "Choose at least one file to deliver.").max(50, "Deliver up to 50 files at a time."),
  note: text(1000).default(""), released: z.boolean().default(false), final: z.boolean().default(false), resolvesRevision: z.boolean().default(true),
});
const release = z.object({ released: z.boolean() });
const tab = z.enum(["todo", "revisions", "client", "delivered"]).default("todo");

/** The upload protocol and download are the same for both sides. The service decides what each side may touch. */
function transfer(r: Hono<AppEnv>, side: Side, guard: MiddlewareHandler<AppEnv>) {
  r.post("/bookings/:id/files", guard, async (c) => c.json(await filesService.begin(c.env, c.get("user")!, side, c.req.param("id"), await body(c, upload))));
  r.put("/files/:id/parts/:n", guard, async (c) => c.json(await filesService.putPart(c.env, c.get("user")!, side, c.req.param("id"), Number(c.req.param("n")), c.req.raw)));
  r.post("/files/:id/complete", guard, async (c) => c.json(await filesService.complete(c.env, c.get("user")!, side, c.req.param("id"))));
  r.delete("/files/:id", guard, async (c) => c.json(await filesService.remove(c.env, c.get("user")!, side, c.req.param("id"))));
  r.get("/files/:id/download", guard, (c) =>
    filesService.download(c.env, c.get("user")!, side, c.req.param("id"), {
      range: c.req.header("range") ?? null, ifRange: c.req.header("if-range") ?? null, inline: c.req.query("inline") === "1", head: c.req.method === "HEAD",
    }));
}

/** Mounted at /api/account: the artist's side of the portal. */
export const clientFileRoutes = new Hono<AppEnv>();
transfer(clientFileRoutes, "client", requireUser);
clientFileRoutes.get("/files", requireUser, async (c) => c.json(await filesService.clientFiles(c.env, c.get("user")!)));
clientFileRoutes.post("/bookings/:id/files/notify", requireUser, async (c) =>
  c.json(await filesService.notifyUploads(c.env, c.get("user")!, c.req.param("id"), (await body(c, notify)).fileIds)));
clientFileRoutes.post("/bookings/:id/revisions", requireUser, async (c) =>
  c.json(await filesService.requestRevision(c.env, c.get("user")!, c.req.param("id"), (await body(c, revision)).note)));
clientFileRoutes.post("/bookings/:id/approve", requireUser, async (c) => c.json(await filesService.approve(c.env, c.get("user")!, c.req.param("id"))));

/** Mounted at /api/admin: staff with deliver_files. */
export const staffFileRoutes = new Hono<AppEnv>();
const deliverers = requirePermission("deliver_files");
transfer(staffFileRoutes, "staff", deliverers);
staffFileRoutes.get("/bookings/:id/files", deliverers, async (c) => c.json(await filesService.staffFiles(c.env, c.get("user")!, c.req.param("id"))));
staffFileRoutes.post("/bookings/:id/deliver", deliverers, async (c) => c.json(await filesService.deliver(c.env, c.get("user")!, c.req.param("id"), await body(c, deliver))));
staffFileRoutes.post("/bookings/:id/finalize", deliverers, async (c) => c.json(await filesService.finalize(c.env, c.get("user")!, c.req.param("id"))));
staffFileRoutes.post("/files/:id/release", deliverers, async (c) =>
  c.json(await filesService.setReleased(c.env, c.get("user")!, c.req.param("id"), (await body(c, release)).released)));
staffFileRoutes.get("/deliveries", deliverers, async (c) => {
  const parsed = tab.safeParse(c.req.query("tab") || undefined);
  if (!parsed.success) throw badRequest("Choose todo, revisions, client or delivered.");
  return c.json(await filesService.queue(c.env, c.get("user")!, parsed.data));
});
