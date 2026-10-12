# Sessions Studio

Booking website for a recording studio in Lekki, Lagos. Clients browse services and packages, pick a live time slot, check out with Paystack and manage their bookings. The CEO and studio staff run the calendar, availability, packages, payments, reports, policies and staff permissions from their dashboards.

Everything runs on Cloudflare: one Worker serves the API and the React app (Workers Static Assets), D1 is the database and a Cron Trigger does housekeeping.

Live: https://sessions.uririnathaniel.workers.dev

Demo video: [`demo/sessions-demo.mp4`](demo/sessions-demo.mp4)

## Features

- Public pages: Home, Services, Packages, pricing and policies, Contact (enquiry form with honeypot and timing spam checks), Book.
- Booking in five steps (service, package, date and time, details, review and checkout). No account is needed until checkout, and the draft survives sign up and the payment redirect.
- Availability from the database: opening hours, blocked time, minimum notice, booking window, session length and a changeover buffer.
- A 15 minute server-side hold is placed atomically before payment, so two people cannot book the same slot. Expired holds are released automatically.
- Paystack checkout verified on the server (callback and signed webhook). Confirmation is idempotent: a payment confirms one booking exactly once. A late payment for a lost slot is refunded.
- Accounts: register, log in, email verification, password reset, profile and password change. Passwords are hashed with PBKDF2 and sessions use HttpOnly cookies. Repeated failed logins are rate limited.
- Client dashboard: next session, bookings, receipts, payment history, notifications, reschedule and cancellation requests under the published refund rules.
- CEO dashboard: overview, request approvals, week calendar, bookings (edit, reschedule, cancel), availability and blocked time, packages and services CRUD with price snapshots on past bookings, enquiries, payments, reports with CSV export, website content and versioned policies, staff and permissions, audit log and email outbox.
- Admin dashboard: the same shell with only the areas the CEO granted. Permissions are enforced by the API, not only hidden in the UI. There is no public staff sign up.
- Emails to clients and staff for bookings, payments, requests and decisions. Every email is stored in the outbox.

## Architecture

```
src/
  worker/                 Cloudflare Worker (Hono)
    routes/               HTTP layer: routing, input validation (zod), cookies
    middleware/           session loading, requireUser / requireStaff / requireCeo / requirePermission
    services/             business logic: auth, availability, bookings, payments, notifications, admin
    repositories/         D1 queries, one module per area
    lib/                  crypto, time (Lagos time), errors, validation helpers
  shared/                 permission list shared by the Worker and the app
  client/                 React app (Vite), pages, components, design tokens in styles.css
migrations/               D1 schema and seed data
scripts/                  seed generator and demo recorder
tests/                    unit tests for the slot engine
```

Requests flow routes to services to repositories. Routes never touch SQL and repositories hold no business rules.

## Run locally

```
npm install
npm run db:migrate:local
npm run dev            # builds the app and starts wrangler dev on http://localhost:8787
```

Checks: `npm run typecheck` and `npm test`.

Seeded accounts (password `password`, change it after the first deploy):

| Role | Email |
| --- | --- |
| CEO | uririnathaniel@gmail.com |
| Studio manager (admin, limited permissions) | dami@sessionsstudio.ng |

To seed a different password, run `SEED_PASSWORD='...' npm run db:seed:sql` before migrating.

Without a Paystack key the app uses a simulated Paystack checkout that still goes through server verification. Without a Resend key emails are only written to the outbox (visible in the CEO dashboard).

## Deploy to Cloudflare

1. Log in: `npx wrangler login`, or set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
2. Create the database: `npx wrangler d1 create sessions-db`, then paste the printed `database_id` into `wrangler.jsonc`.
3. Apply the schema and seed: `npm run db:migrate:remote`.
4. Set `APP_URL` in `wrangler.jsonc` to the live URL (used in email links).
5. Add secrets (optional for demo mode):
   ```
   npx wrangler secret put PAYSTACK_SECRET_KEY
   npx wrangler secret put RESEND_API_KEY
   npx wrangler secret put EMAIL_FROM
   ```
6. Deploy: `npm run deploy`.
7. In the Paystack dashboard set the webhook URL to `https://<your-domain>/api/payments/webhook` and the callback URL to `https://<your-domain>/book/verify`.

The cron trigger (every 5 minutes) releases expired holds, fails abandoned payments and marks past sessions completed.

## Demo video

With `npm run dev` running:

```
npm run demo
```

This records `demo/sessions-demo.mp4` with Playwright and ffmpeg. Set `CHROME_PATH` to use a specific Chromium build.
