import { getPlatformProxy } from "wrangler";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import worker from "../../src/worker/index";
import type { Env } from "../../src/worker/env";

/** Splits a migration file into statements, ignoring semicolons and comments inside strings and line comments. */
function statements(sql: string) {
  const out: string[] = [];
  let cur = "", quoted = false, comment = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (comment) { if (c === "\n") comment = false; continue; }
    if (!quoted && c === "-" && sql[i + 1] === "-") { comment = true; continue; }
    if (c === "'") quoted = !quoted;
    if (c === ";" && !quoted) { if (cur.trim()) out.push(cur.trim()); cur = ""; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export interface Reply<T = any> { status: number; body: T; headers: Headers; res: Response }

export class Client {
  cookie = "";
  constructor(private env: Env, private ctx: ExecutionContext) {}

  async call<T = any>(method: string, path: string, opts: { body?: unknown; raw?: BodyInit; headers?: Record<string, string> } = {}): Promise<Reply<T>> {
    const headers: Record<string, string> = { ...(opts.headers ?? {}) };
    if (this.cookie) headers.cookie = this.cookie;
    let body: BodyInit | undefined = opts.raw;
    if (opts.body !== undefined) { body = JSON.stringify(opts.body); headers["content-type"] = "application/json"; }
    const res = await worker.fetch!(new Request(`https://test.local${path}`, { method, headers, body }) as never, this.env, this.ctx);
    const set = res.headers.get("set-cookie");
    if (set) { const [pair] = set.split(";"); this.cookie = pair.endsWith("=") ? "" : pair; }
    const type = res.headers.get("content-type") ?? "";
    const parsed = type.includes("json") ? await res.json() : null;
    return { status: res.status, body: parsed as T, headers: res.headers, res };
  }
  get = <T = any>(path: string) => this.call<T>("GET", path);
  post = <T = any>(path: string, body?: unknown) => this.call<T>("POST", path, { body: body ?? {} });
  put = <T = any>(path: string, body?: unknown) => this.call<T>("PUT", path, { body: body ?? {} });
  del = <T = any>(path: string) => this.call<T>("DELETE", path);

  async login(email: string, password = "password", staff = false) {
    const r = await this.post("/api/auth/login", { email, password, staff });
    if (r.status !== 200) throw new Error(`login ${email} failed: ${r.status} ${JSON.stringify(r.body)}`);
    return r.body.user;
  }
}

export async function createHarness() {
  const proxy = await getPlatformProxy<Env>({ configPath: resolve("wrangler.jsonc"), persist: false });
  const env = proxy.env;
  const dir = resolve("migrations");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    for (const s of statements(readFileSync(`${dir}/${f}`, "utf8"))) await env.DB.prepare(s).run();
  }
  const ctx = { waitUntil: (p: Promise<unknown>) => void p.catch(() => {}), passThroughOnException() {} } as unknown as ExecutionContext;
  const client = () => new Client(env, ctx);
  const sql = async <T = any>(query: string, ...args: unknown[]) => (await env.DB.prepare(query).bind(...args).all<T>()).results;

  /** Logs in as the seeded CEO. */
  const ceo = async () => { const c = client(); await c.login("uririnathaniel@gmail.com", "password", true); return c; };

  /** Registers a fresh client account and returns a logged in client. */
  let n = 0;
  const newClient = async (name = "Test Artist") => {
    const c = client();
    const email = `artist${++n}.${Date.now() % 100000}@example.com`;
    const r = await c.post("/api/auth/register", { name, email, phone: "+234 803 000 0000", password: "studio2026", confirmPassword: "studio2026" });
    if (r.status !== 200) throw new Error(`register failed: ${JSON.stringify(r.body)}`);
    return { client: c, email, user: r.body.user };
  };

  /** Creates a staff account as the CEO and returns a client logged in as them (the temporary password comes from the email outbox). */
  const newStaff = async (level: string, permissions: string[], name = "Staff Member") => {
    const boss = await ceo();
    const email = `staff${++n}.${Date.now() % 100000}@example.com`;
    const r = await boss.post("/api/admin/staff", { name, email, title: level, level, permissions });
    if (r.status !== 200) throw new Error(`staff create failed: ${JSON.stringify(r.body)}`);
    const mail = (await sql<{ body: string }>("SELECT body FROM email_outbox WHERE to_email = ? ORDER BY created_at DESC LIMIT 1", email))[0];
    const password = mail.body.match(/temporary password: (\S+)/)![1];
    const c = client();
    await c.login(email, password, true);
    return { client: c, email };
  };

  /** Pays a payment reference through the simulated provider and runs the same server verification the browser triggers. */
  const payDemo = async (c: Client, reference: string, outcome: "success" | "failed" = "success") => {
    await c.post(`/api/payments/demo/${reference}`, { outcome, channel: "card" });
    return c.get(`/api/payments/verify?reference=${reference}`);
  };

  return { env, ctx, client, sql, ceo, newClient, newStaff, payDemo, dispose: () => proxy.dispose() };
}

export type Harness = Awaited<ReturnType<typeof createHarness>>;

/** The next date, at least `minDays` ahead, that falls on the given weekday (0 = Sunday), in studio time. */
export function nextWeekday(weekday: number, minDays = 8) {
  const d = new Date(Date.now() + 3600000);
  d.setUTCDate(d.getUTCDate() + minDays);
  while (d.getUTCDay() !== weekday) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
