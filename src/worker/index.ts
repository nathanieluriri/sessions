import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import type { AppEnv, Env } from "./env";
import { AppError } from "./lib/errors";
import { loadUser } from "./middleware/auth";
import authRoutes from "./routes/auth";
import publicRoutes from "./routes/public";
import bookingRoutes from "./routes/booking";
import accountRoutes from "./routes/account";
import adminRoutes from "./routes/admin";
import { bookingService } from "./services/bookings";

const app = new Hono<AppEnv>().basePath("/api");

app.use("*", secureHeaders());
app.use("*", loadUser);
app.route("/auth", authRoutes);
app.route("/", publicRoutes);
app.route("/", bookingRoutes);
app.route("/account", accountRoutes);
app.route("/admin", adminRoutes);

app.notFound((c) => c.json({ error: "Not found.", code: "not_found" }, 404));
app.onError((err, c) => {
  if (err instanceof AppError) return c.json({ error: err.message, code: err.code }, err.status);
  console.error(err);
  return c.json({ error: "Something went wrong. Please try again.", code: "server_error" }, 500);
});

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(bookingService.housekeeping(env));
  },
} satisfies ExportedHandler<Env>;
