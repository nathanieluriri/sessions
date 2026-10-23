# Handoff: Psych Records catalog, portal deliveries and brand upgrade

Branch `claude/zen-clarke-xltn5i` (pushed). Production is NOT deployed yet. Date of this note: 2026-10-23.

Start by reading `handoff/BRIEF.md` (owner's brief, requirements R1 to R20), `handoff/ARCHITECTURE.md`, `handoff/API-NOTES.md` (exact JSON), `handoff/LEDGER.md` (decisions A1 to A16 to flag to the owner) and the part specs `handoff/P2-engine.md`, `P3-files-server.md`, `P4-booking-ui.md`, `P5-portal-ui.md`, `P6-brand.md`. `handoff/CRITIC.md` is the review checklist used on each part. House rules from the owner: no em dashes anywhere, no AI attribution anywhere (commits, code, docs), minimal code comments, cost-effective choices, no new dependencies.

## What is done (committed)

- Migrations 0005 (catalog, session windows, remote orders, EP/album, policies, FAQs), 0006 (portal files, revisions), 0007 (follow-ups). Rehearsed on a copy of production data: the 2 production bookings survive, the booked `1-hour` package is hidden not deleted.
- Server engine (P2): scheduling modes flex, slot, day, project; fixed sessions 10-12, 12:30-14:00, 14:30-16:30, 17-19 daily; Saturday All night session 23:00 to 05:00; atomic money and status transitions.
- Server portal files (P3): R2 multipart uploads, payment-gated downloads, deliver, 3 revision rounds, approve, finalize, 7 day auto-complete, production queue, producer role (`deliver_files`) with client contacts hidden. `docs/PORTAL.md` documents it.
- Brand (P6): tiger emblem and lockup everywhere, favicon set, share image, `scripts/make-brand.py`.
- Tests: `npm test` runs unit tests plus an integration harness (`tests/helpers/harness.ts`) on a real local D1 and R2. Last full run was green (about 296 tests).

## Open work, in order

1. **P3 round 3 defects (found by the last critic, not yet fixed):**
   a. `deliver()` with `final:true` completes an order over a client's pending cancel or reschedule request (the guard exists only in `closeOrder`). Add the same guard in `deliver`.
   b. A producer can destroy a client's refund by delivering any file after the client asks to cancel (project refund is 0 once anything is delivered). Block `deliver` while a change request is pending, or fix the refund share when the request is made.
   c. Producers can put their own phone or email in delivery notes and titles, which go into the client email. Detect and refuse phone numbers and email addresses in `note` and `title` for staff without `record_payments`/owner.
   d. Auto-complete ignores the session time: a paid slot/day booking with an early delivery is completed 7 days later even if the session is weeks away. Require the session end (overnight aware) to have passed.
   Non-blocking: `notify-delivery` on cancelled bookings; per-account upload quota; stale duplicate JSDoc above `assertMayRelease` in `services/files.ts`.
2. **P2 engine round 3 review has not run** (the last fixes: money and status transitions as one conditional write, every payment counted or refunded exactly once). Run a fresh critic against `handoff/CRITIC.md` with the P2 spec. Previous rounds found only money-concurrency issues, all fixed.
3. **UI builders P4 (booking flow, pricing pages, admin catalog UI) and P5 (portal UI, admin Files panel, Deliveries queue) were still running** when the session was handed off. Their work may be partial or absent: check `git log` and `git status`, `npm run typecheck`, `npm run build`, then finish each against its spec in `handoff/`. Neither has had a review.
4. **Docs:** `docs/PORTAL.md` still says staff holding `deliver_files` can release files before payment; it now needs owner or `record_payments`. Update `README.md`, `docs/ADMIN_GUIDE.md` (P5 owns the Deliveries and Producer sections), `docs/OPERATIONS.md` (R2 storage and file costs), `docs/REQUIREMENTS.md` (the client portal is no longer excluded).
5. **Final whole-app check** against the brief with a fresh critic (Playwright at 390 and 1440 px, every package type end to end with the demo payment provider), then verify the brand first-load logo bytes (target about 60 KB or less at 1x/2x/3x).
6. **Deploy** (credentials `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` were present in the environment):
   - `npx wrangler d1 export sessions-db --remote --output=<outside the repo>/prod-before.sql` (never commit it, it contains real client data) and note `npx wrangler d1 time-travel info sessions-db`. The bookmark taken at the start of this work was `00000bfe-00000000-0000510d-e856692273f20c3eab2cf20e2260bae9`.
   - Rehearse migrations on a copy of production first (`handoff/harness/import-prod.mjs`, `dev.sh <port> <name> prod`).
   - `npm run typecheck && npm test && npm run db:migrate:remote && npm run deploy`, then smoke test the live URL with GET requests only (do not create test bookings in production, and do not log in with guessed passwords).
   - R2 bucket `psych-records-media` already exists. Live site: https://sessions.uririnathaniel.workers.dev.
7. **Report to the owner** the assumptions in `handoff/LEDGER.md` (A1 to A16), especially: Mixing and mastering Standard 100,000 and Express 170,000; Full production only on Saturday nights; Song covers meaning; no discount applied yet (set the "regular price"); album art, distribution and PR campaign are "price on request"; files unlock only when the balance is paid; 7 day auto-complete; remote orders refund in full until first delivery.

## Working notes

- The `handoff/harness` scripts hard-code the old scratchpad path `/tmp/claude-0/-home-user-sessions/e4158143-0612-583f-a6cc-25c7b8ce3d86/scratchpad`; change it to your own scratch directory. `dev.sh` starts an isolated `wrangler dev` with its own D1/R2 state. Playwright needs `executablePath` `/opt/pw-browsers/chromium`.
- Wrangler persists state under `<dir>/v3`; `getPlatformProxy` under `<dir>` (add `/v3` when sharing a state dir).
- `scripts/demo.mjs` and `demo/psych-records-demo.mp4` are stale (they predate this work); leave or regenerate.
- Delete `HANDOFF.md` and `handoff/` before the final merge if you do not want process notes in the repo.
