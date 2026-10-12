// Records a walkthrough of the app against a running `wrangler dev` (default http://localhost:8787).
import { chromium } from "playwright";
import { mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";

const BASE = process.env.DEMO_URL ?? "http://localhost:8787";
const OUT = "demo/raw";
const SIZE = { width: 1440, height: 900 };
const CEO = { email: "uririnathaniel@gmail.com", password: process.env.SEED_PASSWORD ?? "password" };
const ADMIN = { email: "dami@sessionsstudio.ng", password: process.env.SEED_PASSWORD ?? "password" };
const client = { name: "Tobi Adeyemi", email: `tobi.${Date.now() % 100000}@example.com`, phone: "+234 803 555 0199", password: "studio2026" };

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const ctx = await browser.newContext({ viewport: SIZE, recordVideo: { dir: OUT, size: SIZE } });

const captions = () => {
  const paint = () => {
    const text = sessionStorage.getItem("demo.cap");
    if (!text || !document.body) return;
    let el = document.getElementById("demo-cap");
    if (!el) {
      el = document.createElement("div");
      el.id = "demo-cap";
      el.style.cssText = "position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:9999;background:rgba(16,34,0,.92);color:#fff;padding:12px 20px;border-radius:14px;font:500 17px Inter,system-ui,sans-serif;max-width:min(900px,calc(100vw - 32px));text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.25);pointer-events:none;border:1px solid #65F87C";
      document.body.appendChild(el);
    }
    el.textContent = text;
  };
  window.__cap = (t) => { sessionStorage.setItem("demo.cap", t); paint(); };
  document.addEventListener("DOMContentLoaded", paint);
  setInterval(paint, 300);
};
await ctx.addInitScript(captions);

const page = await ctx.newPage();
const wait = (ms) => page.waitForTimeout(ms);
const cap = async (t, ms = 2200) => { await page.evaluate((x) => window.__cap(x), t); await wait(ms); };
const go = async (path) => { await page.goto(BASE + path); await page.waitForLoadState("networkidle"); };
const scroll = async (px, steps = 6) => { for (let i = 0; i < steps; i++) { await page.mouse.wheel(0, px / steps); await wait(250); } };
const type = (sel, v) => page.locator(sel).first().fill(v);
const click = async (sel) => { await page.locator(sel).first().click(); await wait(700); };
const btn = (name) => click(`button:has-text("${name}"), a:has-text("${name}")`);
const login = async (who, staff) => {
  await go(staff ? "/staff/login" : "/login");
  await type('input[name="email"]', who.email); await type('input[name="password"]', who.password);
  await click('button:has-text("Log in")'); await page.waitForURL(/\/(admin|account)/); await wait(1200);
};
const logout = async () => { await page.evaluate(() => fetch("/api/auth/logout", { method: "POST" })); };

try {
// Public site
await go("/");
await cap("Home: photo-led hero with the next open studio times pulled live from the database", 3000);
await scroll(900); await cap("Services, how booking works and featured packages", 2000);
await scroll(1600, 8); await cap("Booking call to action with real open slots", 2200);
await go("/services"); await cap("Services page: every service with a photo, description and starting price", 2400);
await go("/packages"); await cap("Packages and pricing, managed by the CEO", 2200);
await page.locator("#policies").scrollIntoViewIfNeeded(); await wait(400);
await cap("Booking policies: payment, cancellation, rescheduling, late arrival, overtime, refunds", 2800);
await go("/contact"); await cap("Contact: phone, WhatsApp, email, map and an enquiry form with spam protection", 1600);
await type('input[name="name"]', "Kemi Balogun"); await type('input[name="email"]', "kemi@example.com"); await type('input[name="phone"]', "+234 805 111 2233");
await click('button:has-text("Group or long project")');
await type('textarea[name="message"]', "Hi, we want two full days for an EP next month. Can we get a group rate?");
await wait(1200); await btn("Send enquiry"); await cap("Enquiry saved and the team is notified by email", 2000);

// Booking flow, no account needed until checkout
await go("/book"); await cap("Booking step 1: choose a service. One screen, one decision", 1800);
await click('button.svc:has-text("Vocal")'); await btn("Choose a package");
await cap("Step 2: choose a package. Prices come from the database", 1500);
await click('button.opt:has-text("2-Hour Session")'); await btn("Choose date & time");
await cap("Step 3: live calendar. Opening hours, blocks, buffers and existing bookings are applied on the server", 2200);
await click(".cal .day.available >> nth=2"); await wait(1200);
await click("button.slot:not([disabled]) >> nth=4"); await cap("Only start times that fit the session plus the changeover buffer can be picked", 2200);
await btn("Continue to details");
await cap("Step 4: session details. Still no account required", 1200);
await type('input[name="contactName"]', client.name); await type('input[name="contactEmail"]', client.email); await type('input[name="contactPhone"]', client.phone);
await type('input[name="artistName"]', "Tobi A"); await click('button[aria-label="More people"]');
await type('textarea[name="notes"]', "Bringing my own beat. Need a Neumann on vocals.");
await wait(600); await btn("Review booking");
await cap("Review: price breakdown, extras and the policies the client must accept", 1600);
await page.locator('label:has-text("Vocal editing") input').check(); await wait(500); await page.locator('label:has-text("I agree") input').check(); await wait(600);
await btn("Continue to checkout");
await cap("A server-side hold now reserves the slot for 15 minutes so no one else can take it", 2600);
await cap("Login is required only at checkout. The booking draft is kept", 1400);
await type('input[name="name"]', client.name);
await type('input[name="password"]', client.password); await type('input[name="confirmPassword"]', client.password);
await btn("Create account and continue");
await cap("Account created. Now pay with Paystack", 1800);
await click('button.opt:has-text("Bank transfer")');
await click('button:has-text("with Paystack") >> visible=true');
await page.waitForURL(/pay\/demo/); await page.waitForLoadState("networkidle");
await cap("Paystack checkout (test mode until live keys are added)", 2200);
await click('button:has-text("Pay ₦")');
await cap("The server verifies the transaction with the provider before confirming. The webhook path does the same, once only", 1000);
await page.waitForURL(/book\/confirmed/, { timeout: 30000 }); await wait(800);
await cap("Confirmed automatically. Receipt emailed to the client and new-booking alerts sent to staff", 3200);

// Client dashboard
await btn("Go to my booking");
await cap("Client dashboard: booking details, receipt with the price snapshot and the policy version accepted", 2600);
await btn("Request reschedule"); await wait(800);
await click(".modal .daypick button >> nth=5"); await wait(1200);
await click(".modal .slotpick button:not([disabled]) >> nth=2");
await type('textarea[name="reason"]', "My producer moved our session.");
await cap("Clients request a reschedule or cancellation. The new time is checked for clashes", 1800);
await click('.modal button:has-text("Send request")'); await wait(1200);
await click('a.navitem:has-text("Overview")'); await cap("Overview: next session, stats, notifications and recent payments", 2400);
await click('a.navitem:has-text("Payments")'); await cap("Payments and receipts history", 1800);
await click('a.navitem:has-text("Profile")'); await cap("Profile, email verification and password change", 1800);
await logout();

// CEO dashboard
await login(CEO, true);
await cap("CEO dashboard, seeded for uririnathaniel@gmail.com. Staff sign in has no public registration", 2600);
await cap("Pending client requests can be approved or declined. The client is emailed either way", 1600);
await click('button:has-text("Approve")'); await wait(1500);
await click('a.navitem:has-text("Calendar")'); await cap("Week calendar: bookings, live checkout holds and blocked time", 2800);
await click('a.navitem:has-text("Bookings")'); await cap("All bookings with search and status filters", 1400);
await click("tr.click >> nth=0"); await cap("Booking detail: edit details, reschedule or cancel with refund rules", 2400);
await page.mouse.click(8, 8); await wait(500);
await click('a.navitem:has-text("Availability")'); await cap("Availability: opening hours, buffers, hold length and notice rules", 2000);
await type('input[name="breason"]', "Console maintenance"); await btn("Block this time");
await cap("Blocked time disappears from the public calendar immediately", 2000);
await click('a.navitem:has-text("Packages")'); await cap("Packages and services: create, edit, hide and delete", 1600);
await click('tr:has-text("Half-Day") button:has-text("Edit")');
await type('input[name="price"]', "95000"); await cap("Price changes only affect new bookings. History keeps its snapshot", 2000);
await click('.modal button:has-text("Save package")'); await wait(1000);
await click('a.navitem:has-text("Enquiries")'); await cap("Enquiries from the contact form, answered by email", 1600);
await btn("Reply by email"); await type('textarea[name="msg"]', "Hi Kemi, yes. Two full days are ₦300,000. Shall we hold dates?");
await click('.modal button:has-text("Send reply")'); await wait(1000);
await click('a.navitem:has-text("Payments")'); await cap("Payments: every transaction, how it was verified and its status (CEO only)", 2400);
await click('a.navitem:has-text("Reports")'); await cap("Reports: booked value, utilisation, repeat clients, popular packages and CSV export", 2800);
await click('a.navitem:has-text("Website")'); await cap("Website content and policies are editable. Publishing a policy creates a new version", 1800);
await click('button.link:has-text("Edit") >> nth=1'); await wait(600);
await page.locator('textarea[name="pbody"]').press("End"); await page.locator('textarea[name="pbody"]').pressSequentially(" Same-day changes are not possible.", { delay: 20 });
await click('.modal button:has-text("Publish policy")'); await wait(1000);
await click('a.navitem:has-text("Staff")'); await cap("Staff and permissions. Only the CEO creates staff accounts and sets what each can do", 2200);
await click('tr:has-text("Dami") button:has-text("Edit access")');
await cap("Granular permissions, enforced on the server for every request", 2200);
await page.mouse.click(8, 8); await wait(500);
await click('a.navitem:has-text("Audit")'); await cap("Audit log of every sensitive action", 2200);
await click('.seg button:has-text("Email outbox")'); await cap("Email outbox: confirmations, reminders and staff alerts", 2400);
await logout();

// Limited admin
await login(ADMIN, true);
await cap("Studio manager login: no financial figures on the overview", 2200);
await click('a.navitem:has-text("Payments")'); await cap("Areas without permission are locked here and refused by the API", 2600);
await click('a.navitem:has-text("Calendar")'); await cap("Permitted areas work as normal", 1800);

await go("/"); await cap("Sessions Studio. Built on Cloudflare Workers, D1 and static assets", 3000);

} catch (e) {
  await page.screenshot({ path: "demo/error.png", fullPage: true });
  console.error(e.message, page.url());
  process.exitCode = 1;
}
const desktop = await page.video().path();
await ctx.close();

const MOBILE = { width: 390, height: 844 };
const mctx = await browser.newContext({ viewport: MOBILE, isMobile: true, hasTouch: true, deviceScaleFactor: 2, recordVideo: { dir: OUT, size: MOBILE } });
await mctx.addInitScript(captions);
const m = await mctx.newPage();
const mcap = async (t, ms) => { await m.evaluate((x) => window.__cap(x), t); await m.waitForTimeout(ms); };
await m.goto(BASE + "/"); await m.waitForLoadState("networkidle");
await mcap("Mobile: every page is responsive", 2400);
for (let i = 0; i < 8; i++) { await m.evaluate(() => window.scrollBy({ top: 260, behavior: "smooth" })); await m.waitForTimeout(350); }
await m.goto(BASE + "/book"); await m.waitForLoadState("networkidle");
await m.locator("button.svc").first().click(); await mcap("Mobile booking with a sticky action bar", 1800);
await m.locator('.stickybar button').click(); await m.waitForTimeout(900);
await m.locator("button.opt").nth(1).click(); await mcap("One decision per screen", 1800);
await m.locator('.stickybar button').click(); await m.waitForTimeout(1200);
await mcap("Live calendar on a phone", 2400);
const mobile = await m.video().path();
await mctx.close();
await browser.close();

const v = "scale=1440:900:force_original_aspect_ratio=decrease,pad=1440:900:(ow-iw)/2:(oh-ih)/2:color=0x102200,setsar=1,fps=25";
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", desktop, "-i", mobile, "-filter_complex", `[0:v]${v}[a];[1:v]${v}[b];[a][b]concat=n=2:v=1[out]`,
  "-map", "[out]", "-c:v", "libx264", "-preset", "slow", "-crf", "26", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "demo/sessions-demo.mp4"]);
rmSync(OUT, { recursive: true, force: true });
console.log("Saved demo/sessions-demo.mp4");
