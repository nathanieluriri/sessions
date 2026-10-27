// Loads a D1 export into a local persisted state dir: schema first, then rows, so foreign keys resolve.
import { getPlatformProxy } from "/home/user/sessions/node_modules/wrangler/wrangler-dist/cli.js";
import { readFileSync } from "node:fs";

const [, , dump, stateDir] = process.argv;
function statements(sql) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (c === "'") q = !q;
    if (c === ";" && !q) { if (cur.trim()) out.push(cur.trim()); cur = ""; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
const all = statements(readFileSync(dump, "utf8"));
const isSchema = (s) => /^(CREATE|PRAGMA)/i.test(s);
const { env, dispose } = await getPlatformProxy({ configPath: "/home/user/sessions/wrangler.jsonc", persist: { path: stateDir + "/v3" } });
for (const s of all.filter(isSchema)) await env.DB.prepare(s).run();
const data = all.filter((x) => !isSchema(x));
await env.DB.batch([env.DB.prepare("PRAGMA defer_foreign_keys = on"), ...data.map((s) => env.DB.prepare(s))]);
const rows = data.length;
console.log("schema", all.filter(isSchema).length, "rows", rows);
await dispose();
