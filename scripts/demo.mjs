// Records a walkthrough of the app against a running `wrangler dev` (default http://localhost:8787).
import { chromium } from "playwright";
import { mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";

const BASE = process.env.DEMO_URL ?? "http://localhost:8787";
const OUT = "demo/raw";
const SIZE = { width: 1440, height: 900 };
const PASSWORD = process.env.SEED_PASSWORD ?? "password";
const CEO = { email: "uririnathaniel@gmail.com", password: PASSWORD };
const ADMIN = { email: "manager@psychrecords.test", password: PASSWORD };
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
      el.style.cssText = "position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:9999;background:rgba(10,10,10,.92);color:#fff;padding:12px 20px;border-radius:14px;font:500 17px Inter,system-ui,sans-serif;max-width:min(900px,calc(100vw - 32px));text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.25);pointer-events:none;border:1px solid #65F87C";
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
const next = async (name) => { await page.locator(".desk-actions").getByRole("button", { name }).click(); await page.waitForLoadState("networkidle"); await wait(700); };
const login = async (who, staff) => {
  await go(staff ? "/staff/login" : "/login");
  await type('input[name="email"]', who.email); await type('input[name="password"]', who.password);
  await click('button:has-text("Log in")'); await page.waitForURL(/\/(admin|account)/); await wait(1200);
};
const logout = async () => { await page.evaluate(() => fetch("/api/auth/logout", { method: "POST" })); };
const nav = (label) => click(`a.navitem:has-text("${label}")`);
const pickTime = async (day) => {
  await page.locator(".day.available, .day.limited").nth(day).click(); await wait(1000);
  await page.locator(".slot:not([disabled])").nth(1).click(); await wait(500);
};

try {
// Public site
await go("/");
await cap("Psych Records Entertainment: music, video, podcast and photography under one roof", 3000);
await scroll(900); await cap("Crew included, live availability per room, deposits or full payment", 2200);
await scroll(2400, 10); await cap("How booking works, told with live data from the studio calendar", 2000);
await scroll(3200, 12); await cap("Four rooms, each with its own calendar, capacity and hourly rate", 2200);
await scroll(1200, 6); await cap("Selected work and featured packages, all managed from the dashboard", 2200);
await go("/services"); await cap("Services grouped by category. New categories can be added without a redesign", 2400);
await go("/services/music-videos"); await cap("Every service has its own page: details, deliverables, duration and packages", 2400);
await scroll(900); await cap("Fixed-price packages can be booked. Project work is priced by quote", 2400);
await go("/studio"); await cap("Studio and facilities: rooms, features and rates", 2000);
await scroll(2600, 10); await cap("Equipment per room and a photo gallery, edited by staff", 2200);
await go("/portfolio"); await cap("Portfolio with categories. YouTube, Vimeo, Spotify and SoundCloud links play inline", 2400);
await go("/packages"); await cap("Pricing: deposit terms and approval rules shown on every package", 2400);
await go("/contact"); await cap("Contact: WhatsApp, phone, email, map and an enquiry form with the service of interest", 2400);
await go("/quote"); await cap("Quote requests capture the brief, budget, timeline and reference links", 2200);

// Deposit booking
await go("/book"); await cap("Booking step 1: what are you making?", 1600);
await page.getByRole("button", { name: /Multi-camera podcast production/ }).click(); await wait(500);
await next(/Choose a package/); await cap("Step 2: packages for this category, grouped by room, with deposit and approval badges", 2600);
await page.getByRole("button", { name: /Video Podcast, 2 Hours/ }).click(); await wait(500);
await next(/Choose date/); await cap("Step 3: live availability for the Podcast Room only. Other rooms do not block it", 2600);
await pickTime(3);
await next(/Continue to details/);
await type("#contactName", client.name); await type("#contactEmail", client.email); await type("#contactPhone", client.phone);
await type("#artistName", "The Green Room"); await type("#project", "Episode 12 of our weekly video podcast");
await type("#links", "https://youtube.com/@greenroom");
await cap("Step 4: attendees, project, special requirements and reference links", 2200);
await next(/Review booking/);
await cap("Review: price breakdown, extras, and a choice between a deposit and paying in full", 2800);
await page.locator("label").filter({ hasText: "I agree" }).locator("input").check(); await wait(400);
await next(/Continue to checkout/);
await cap("The slot is held on the server while the client signs up. Nobody else can take it", 2600);
await type("#password", client.password); await type("#confirmPassword", client.password);
await click('button:has-text("Create account and continue")'); await wait(800);
await cap("Pay the 50% deposit now and the balance before the session", 2400);
await next(/with Paystack/);
await page.waitForURL(/pay\/demo/); await cap("Paystack checkout (test mode until live keys are added)", 2000);
await click('button:has-text("Pay ₦")');
await page.waitForURL(/book\/verify/); await cap("Verified on the server before the booking is confirmed", 4200);
await page.getByRole("link", { name: /Go to my booking/ }).click(); await page.waitForLoadState("networkidle");
await cap("Client dashboard: paid, balance due and every payment on the receipt", 2600);
await page.getByRole("link", { name: /balance/ }).first().click(); await page.waitForLoadState("networkidle");
await cap("The balance can be paid online any time before the session", 2000);
await click('button:has-text("with Paystack")');
await page.waitForURL(/pay\/demo/); await click('button:has-text("Pay ₦")');
await page.waitForURL(/book\/verify/); await cap("Balance paid. The booking is now paid in full", 4000);

// Approval booking
await go("/book");
await page.getByRole("button", { name: /Music videos/ }).click(); await wait(400);
await next(/Choose a package/);
await page.getByRole("button", { name: /Stage Hire, Half Day/ }).click(); await wait(400);
await next(/Choose date/);
await pickTime(5);
await next(/Continue to details/);
await type("#artistName", "Brand launch shoot"); await type("#project", "Launch film for a skincare brand, two looks");
await next(/Review booking/);
await page.locator("label").filter({ hasText: "I agree" }).locator("input").check();
await cap("Stage hire needs studio approval: the client sends a request and pays nothing yet", 2800);
await next(/send request/);
await cap("Request, approval, then payment. Unpaid or unapproved requests are never confirmed", 2600);
await next(/Send booking request/);
await page.waitForURL(/requested/); const requestId = page.url().split("/").pop();
await cap("Request sent. The slot is held until the studio decides", 2400);
await logout();

// CEO dashboard
await login(CEO, true);
await cap("CEO dashboard: approvals waiting, today, client requests and a launch checklist", 2800);
await click(".histrow");
await cap("Approve, decline, or confirm without payment when studio policy allows it", 2400);
await click('.modal button:has-text("Approve")');
await type('textarea[name="note"]', "Lights will be set for two looks.");
await click('button:has-text("Approve and send payment link")'); await wait(1200);
await cap("Approved. The client is emailed a secure payment link with a deadline", 2600);
const link = await page.evaluate((id) => fetch(`/api/admin/bookings/${id}`).then((r) => r.json()).then((d) => d.payLink), requestId);
await logout();
await page.goto(link.replace(/^https?:\/\/[^/]+/, BASE)); await page.waitForLoadState("networkidle");
await cap("The client pays from the email link, without logging in", 2400);
await click('button:has-text("with Paystack")');
await page.waitForURL(/pay\/demo/); await click('button:has-text("Pay ₦")');
await page.waitForURL(/book\/verify/); await cap("Deposit verified, booking confirmed", 3600);

await login(CEO, true);
await nav("Bookings"); await cap("Bookings with filters for approvals, awaiting payment and balances due, per room", 2400);
await click('button:has-text("New booking")');
await page.locator(".modal select").first().selectOption({ label: "Vocal & rap recording" }); await wait(400);
await page.locator(".modal select").nth(1).selectOption({ index: 2 }); await wait(900);
await page.locator(".modal .daypick button").nth(4).click(); await wait(900);
await page.locator(".modal .slotpick button:not([disabled])").first().click();
await type(".modal input[name=cname]", "Kemi Balogun"); await type(".modal input[name=cphone]", "+234 805 111 2233"); await type(".modal input[name=artist]", "Kemi B");
await page.locator(".modal select").nth(2).selectOption("whatsapp");
await page.locator(".modal label").filter({ hasText: "Record a payment now" }).locator("input").check();
await cap("Staff bookings for phone, WhatsApp and walk-in clients, with cash or transfer recorded", 2800);
await click('button:has-text("Create booking")'); await wait(1200);
await cap("Same clash checks as online bookings. Receipt and history are kept", 2200);
await page.keyboard.press("Escape"); await page.mouse.click(8, 8); await wait(400);
await nav("Calendar"); await cap("Week calendar per room: bookings, requests, holds and blocked time side by side", 2800);
await nav("Clients"); await cap("Client history: bookings, value, paid and outstanding balance", 2400);
await nav("Services and pricing"); await cap("Packages: room, duration, price, deposit and approval rule", 2400);
await click('.admintabs button:has-text("Deposits and approvals")'); await cap("Default deposit, approval rules, payment windows and reminders", 2600);
await click('.admintabs button:has-text("Rooms")'); await cap("Rooms with their own capacity and hourly rate", 2000);
await nav("Website"); await cap("Website content: every page, image and contact detail is editable, with image upload", 2600);
await click('.admintabs button:has-text("Portfolio")'); await cap("Portfolio, team, equipment, gallery, testimonials, FAQs and announcements", 2400);
await click('.admintabs button:has-text("SEO and analytics")'); await cap("SEO titles, descriptions, analytics, Search Console and the indexing switch", 2600);
await nav("Payments"); await cap("Payments by type and method, and outstanding balances (CEO only)", 2400);
await nav("Reports"); await cap("Reports: booked, collected, outstanding, utilisation, categories, rooms and CSV export", 2800);
await nav("Staff"); await cap("Staff accounts with eight permissions, enforced by the server", 2200);
await logout();

// Limited admin
await login(ADMIN, true);
await cap("Studio manager: bookings and payments recording, but no finance or website areas", 2400);
await nav("Website"); await cap("Areas without permission are locked here and refused by the API", 2400);

await go("/"); await cap("Psych Records Entertainment. Built on Cloudflare Workers, D1 and R2", 3000);
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
for (let i = 0; i < 10; i++) { await m.evaluate(() => window.scrollBy({ top: 300, behavior: "smooth" })); await m.waitForTimeout(350); }
await m.goto(BASE + "/book"); await m.waitForLoadState("networkidle");
await m.locator("button.svc").first().click(); await mcap("Mobile booking with a sticky action bar", 1800);
await m.locator(".stickybar button").click(); await m.waitForTimeout(900);
await m.locator("button.opt").nth(1).click(); await mcap("One decision per screen", 1800);
await m.locator(".stickybar button").click(); await m.waitForTimeout(1200);
await mcap("Live calendar for the room on a phone", 2400);
const mobile = await m.video().path();
await mctx.close();
await browser.close();

const v = "scale=1440:900:force_original_aspect_ratio=decrease,pad=1440:900:(ow-iw)/2:(oh-ih)/2:color=0x0a0a0a,setsar=1,fps=25";
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", desktop, "-i", mobile, "-filter_complex", `[0:v]${v}[a];[1:v]${v}[b];[a][b]concat=n=2:v=1[out]`,
  "-map", "[out]", "-c:v", "libx264", "-preset", "slow", "-crf", "26", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "demo/psych-records-demo.mp4"]);
rmSync(OUT, { recursive: true, force: true });
console.log("Saved demo/psych-records-demo.mp4");
