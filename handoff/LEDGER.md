# GAUNTLET: Psych Records catalog, portal deliveries and brand

Started: 2026-10-23T08:43Z (UTC) · Status: in progress
Branch: claude/zen-clarke-xltn5i · Repo: /home/user/sessions · Specs: `.gauntlet/` (BRIEF, ARCHITECTURE, P2 to P6)
This file and `.gauntlet/` are excluded from git on purpose (`.git/info/exclude`).

## Contract

- **Goal:** the studio's brief (`.gauntlet/BRIEF.md`, R1 to R20) is live on production: new catalog and fixed session times, EP and album offers, remote project orders, portal-only deliveries and client uploads with payment gating and 3 revisions, producer role without client contacts, the real logo everywhere, the new terms.
- **Bars (per part):** P2 Calendly availability correctness for fixed-time events. P3 Fiverr delivery, revision and approval rules plus private-link access safety. P4 Cal.com public booking page clarity on a phone plus Stripe pricing page plainness. P5 WeTransfer upload and download simplicity for a first-time user on a phone plus Fiverr order page for deliveries and revisions. P6 an established record label site's logo treatment. Standing criterion for UI: does not read as a framework default; both viewport widths 390 and 1440; focus states; reduced motion.
- **Budget:** 3 rounds per part, about 22 agents in total, wall-clock ceiling 10 hours from the start time above (hard stop: close the ledger and report in whatever state it is in).
- **Evidence rule:** critics run `npm test`, start their own isolated instance (`<scratchpad>/harness/dev.sh <port> <name> [prod]`), drive it with curl, the vitest harness and Playwright (Chromium at `/opt/pw-browsers/chromium`, `CHROME_PATH`), screenshot at 390 and 1440 wide, read the email outbox for notification contents. A critic that only reads source is guessing.

Scratchpad: `/tmp/claude-0/-home-user-sessions/e4158143-0612-583f-a6cc-25c7b8ce3d86/scratchpad` (harness scripts, production backup `backups/prod-before-20261023T0843.sql`, prod Time Travel bookmark `00000bfe-00000000-0000510d-e856692273f20c3eab2cf20e2260bae9`).

## Decisions and assumptions to flag to the owner in the final report

- A1. Mixing and mastering: Standard (7 days) 100,000 and Express (1 day) 170,000. Reconciles their text ("Mixing & Mastering - 100k, two options") with their drafted price image (170,000).
- A2. Full production's "6 hours session" is the Saturday All night session (11pm to 5am). Full production is therefore bookable on Saturdays only.
- A3. Session 2 (12:30pm to 2:00pm) is 90 minutes as written, flat 80,000 like the others. Editable in the dashboard.
- A4. "Song covers" (50,000) is treated as a cover version produced by the studio, delivered through the portal. Owner to confirm what it covers.
- A5. Beat production, Mixing and mastering and Song covers are remote project orders (no time slot, no room): order, pay, upload files, receive delivery in the portal. Due dates: Express 1 day, Standard 7 days, Full production 7 days after the session.
- A6. EP and album are requests with studio approval; the client picks a preferred start day; the studio confirms accommodation and schedule, and blocks the studio for the residency by hand. Default 50% deposit or pay in full.
- A7. Discount: packages carry a "regular price" field that shows a struck-through price and savings. No discount is applied until the owner sets one (no percentage was given).
- A8. EP/album add-ons (album art, independent distribution, PR campaign) have no prices yet: they are "price on request" and staff are alerted to quote them. The owner sets prices in the dashboard and they then charge automatically.
- A9. Downloads stay locked until the booking balance is paid, unless staff release a file early.
- A10. Revisions are 3 rounds per booking (a round can cover any tracks), for packages that include mixing and mastering.
- A11. Producers get a new role that never shows client email or phone (anywhere in the admin API), so private deals cannot start from the studio's own system.
- A12. Files may be removed from the portal 12 months after delivery (policy text, nothing is auto-deleted).
- A13. Old packages were removed, or hidden where bookings exist (the 2 test bookings on "1-Hour Session" are kept). Opening hours are now 10:00 to 19:00 every day. Artist development stays as a quote.
- A15. Delivered orders auto-complete 7 days after the latest delivery if no revision is open and the balance is zero (Fiverr-style), closing revisions and refunds.
- A16. Remote orders (beat, mixing and mastering, song cover) refund in full until the first finished files are delivered, none after.
- A14. Mixing and mastering, Song covers and Beat orders still need a delivery date promise for beats and covers: none was given, so none is shown.

## Parts

| # | Part | Spec | Status | Rounds |
|---|------|------|--------|--------|
| 1 | Foundation (migrations, roles, redaction, harness) | done by orchestrator, commit faf2fe4 | pass (rehearsed on a production copy) | 0 |
| 2 | Scheduling and catalog engine (server) | P2-engine.md | pending | 0 |
| 3 | Portal files, deliveries, revisions (server) | P3-files-server.md | pending | 0 |
| 4 | Booking flow, pricing pages, admin catalog UI | P4-booking-ui.md | pending | 0 |
| 5 | Portal UI (client and admin) | P5-portal-ui.md | pending | 0 |
| 6 | Brand logo | P6-brand.md | pending | 0 |
| 7 | Integration, docs, deploy | (orchestrator) | pending | 0 |

Waves: 1 = P2 + P3 + P6 in parallel. 2 = P4 + P5 in parallel (after P2 and P3 pass). 3 = integration gauntlet, docs, production rehearsal, deploy.

## Round history

Wave 1 (builders P2, P3, P6; critics blind, opus):
- P6 round 1 FAIL (1 blocking: lazy lockup loaded eagerly, 85-92 KB logo bytes at 2x/3x). Logo otherwise at the bar. Round 2 fix in progress.
- P3 round 1 FAIL x2. Hostile critic: ranged downloads not audited (access control held). Workflow critic: walk-in artist never notified, failed email reported sent, outcome could undo completion, no auto-complete. Builder also found and closed an anonymous /media bypass of locked files. Round 2 fixes sent (auto-finalize 7 days after delivery added as assumption A15).
- P2 round 1 FAIL x2. Correctness critic: 3 double-booking paths (late payment of lapsed holds, lapsed requests paid/approved, completed bookings not occupying). Brief critic: Recording copy promised comping, EP emails read as one-day booking, hours contradicted night session, remote refund rule unstated. Round 2 fixes sent.
Wave 2 (P4, P5 UI) held until P6 round 2 and server rounds settle; specs written (.gauntlet/P4, P5, API-NOTES).

## Durable checks added

- tests/api/privacy.test.ts: producers get no contacts or pay tokens from any admin endpoint; front desk keeps access.
- tests/helpers/harness.ts: real Worker + D1 + R2 integration harness.

## Open questions for the human

- Confirm A1 (M&M prices), A2 (Full production on Saturday nights only), A4 (what Song covers means), discount percentage (A7), prices for album art, distribution and PR campaign (A8).

## Final report

(pending)
