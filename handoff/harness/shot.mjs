import { chromium } from "/home/user/sessions/node_modules/playwright/index.mjs";
const [,, url, out, w = "1200", h = "700", full = "0"] = process.argv;
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
await p.goto(url, { waitUntil: "load" });
await p.waitForTimeout(400);
await p.screenshot({ path: out, fullPage: full === "1" });
await b.close();
