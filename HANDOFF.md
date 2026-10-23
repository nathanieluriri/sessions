# Handoff: Psych Records catalog, portal deliveries and brand upgrade

Branch `claude/zen-clarke-xltn5i` (pushed). Production is NOT deployed yet. Date of this note: 2026-10-23.

Start by reading `handoff/BRIEF.md` (owner's brief, requirements R1 to R20), `handoff/ARCHITECTURE.md`, `handoff/API-NOTES.md` (exact JSON), `handoff/LEDGER.md` (decisions A1 to A16 to flag to the owner) and the part specs `handoff/P2-engine.md`, `P3-files-server.md`, `P4-booking-ui.md`, `P5-portal-ui.md`, `P6-brand.md`. `handoff/CRITIC.md` is the review checklist used on each part. House rules from the owner: no em dashes anywhere, no AI attribution anywhere (commits, code, docs), minimal code comments, cost-effective choices, no new dependencies.

## What is done (committed)

- Migrations 0005 (catalog, session windows, remote orders, EP/album, policies, FAQs), 0006 (portal files, revisions), 0007 (follow-ups). Rehearsed on a copy of production data: the 2 production bookings survive, the booked `1-hour` package is hidden not deleted.
- Server engine (P2): scheduling modes flex, slot, day, project; fixed sessions 10-12, 12:30-14:00, 14:30-16:30, 17-19 daily; Saturday All night session 23:00 to 05:00; atomic money and status transitions.
- Server portal files (P3): R2 multipart uploads, payment-gated downloads, deliver, 3 revision rounds, approve, finalize, 7 day auto-complete, production queue, producer role (`deliver_files`) with client contacts hidden. `docs/PORTAL.md` documents it.
- Brand (P6): tiger emblem and lockup everywhere, favicon set, share image, `scripts/make-brand.py`.
- Tests: `npm test` runs unit tests plus an integration harness (`tests/helpers/harness.ts`) on a real local D1 and R2. Last full run was green (about 296 tests).

## Status after the latest session

Done and pushed: the four P3 round 3 defects (delivery blocked while a change request is pending, contact details refused in producer notes and titles, auto-complete waits for the session end), the admin catalog UI (booking mode, session kind, unit, regular price, delivery days, revisions, tracks, service scope, price-on-request extras, Session times tab with the `time` field), a `nextPath` fix so a stale step lands on the next applicable step, a producer drawer that no longer shows paid or deposit wording, docs (ADMIN_GUIDE Deliveries, Producer and `deliver_files`, session times, PORTAL, OPERATIONS, REQUIREMENTS, README). The booking flow and portal UI already existed from earlier work in progress commits and were audited against P4 and P5.

Checked in a real browser (local wrangler dev, 390 and 1440 px): no horizontal scroll or console errors on home, services, pricing, FAQ and booking; Beat order paid with the demo provider through to the receipt; Recording time step; Saturday night note; EP request through to the send screen; stale draft guards; client home, files and booking pages with a delivery; producer queue and drawer with no client email or phone; admin package form and session time form. `npm run typecheck`, `npm run build` and `npm test` (305 tests) pass.

## Open work, in order

1. **P2 engine round 3 review has not run.** Run a fresh critic against `handoff/CRITIC.md` with the P2 spec.
2. **Not yet exercised in a browser:** Mixing and mastering Standard and Express end to end, Song cover, staff approval and payment of the EP request, 30 MB upload with a killed network, revision requests to the limit, keyboard and screen reader pass, session booking on a weekday completed to payment, the Deliveries tabs with data.
3. **Final whole-app check** against the brief with a fresh critic, then verify the brand first-load logo bytes (target about 60 KB or less at 1x/2x/3x).
4. **Deploy** (credentials `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` were present in the earlier environment):
   - `npx wrangler d1 export sessions-db --remote --output=<outside the repo>/prod-before.sql` (never commit it, it contains real client data) and note `npx wrangler d1 time-travel info sessions-db`. The bookmark taken at the start of this work was `00000bfe-00000000-0000510d-e856692273f20c3eab2cf20e2260bae9`.
   - Rehearse migrations on a copy of production first (`handoff/harness/import-prod.mjs`, `dev.sh <port> <name> prod`).
   - `npm run typecheck && npm test && npm run db:migrate:remote && npm run deploy`, then smoke test the live URL with GET requests only (no test bookings in production, no guessed passwords).
   - R2 bucket `psych-records-media` already exists. Live site: https://sessions.uririnathaniel.workers.dev.
5. **Report to the owner** the assumptions in `handoff/LEDGER.md` (A1 to A16), especially: Mixing and mastering Standard 100,000 and Express 170,000; Full production only on Saturday nights; Song covers meaning; no discount applied yet (set the "regular price"); album art, distribution and PR campaign are "price on request"; files unlock only when the balance is paid; 7 day auto-complete; remote orders refund in full until first delivery.

## Working notes

- The `handoff/harness` scripts hard-code the old scratchpad path `/tmp/claude-0/-home-user-sessions/e4158143-0612-583f-a6cc-25c7b8ce3d86/scratchpad`; change it to your own scratch directory. `dev.sh` starts an isolated `wrangler dev` with its own D1/R2 state. Playwright needs `executablePath` `/opt/pw-browsers/chromium`.
- Wrangler persists state under `<dir>/v3`; `getPlatformProxy` under `<dir>` (add `/v3` when sharing a state dir).
- `scripts/demo.mjs` and `demo/psych-records-demo.mp4` are stale (they predate this work); leave or regenerate.
- Delete `HANDOFF.md` and `handoff/` before the final merge if you do not want process notes in the repo.
