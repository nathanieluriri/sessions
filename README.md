# Psych Studio

Website, online booking and studio management for Psych Studio, a music, video, podcast and photography studio. Clients explore services, rooms and past work, check live availability per room, book and pay a deposit or the full amount with Paystack, or send a request that the studio approves first. Staff run bookings, payments, rooms, pricing, website content and reports from a permission-based dashboard.

Everything runs on Cloudflare: one Worker serves the API, the React app (Workers Static Assets) and server-rendered page metadata, D1 is the database, R2 stores uploaded images and a Cron Trigger handles expiries and reminders.

Live: https://sessions.uririnathaniel.workers.dev

Guides: [admin guide](docs/ADMIN_GUIDE.md) · [operations, costs and backups](docs/OPERATIONS.md) · [requirements coverage](docs/REQUIREMENTS.md)

## Features

- Public site: Home, About, Services (by category, with a page per service), Studio and facilities (rooms, equipment, gallery, virtual tour), Portfolio (YouTube, Vimeo, Spotify and SoundCloud embeds), Pricing and packages, FAQs, Contact (WhatsApp, map, service of interest), Request a quote, Privacy and Terms. An announcement bar appears on every public page, and WhatsApp is linked from the footer and the contact page.
- Booking: service, package and room, live date and time, details (people, project, requirements, reference links), review with a deposit or full payment choice, then checkout. No account is needed until checkout and the draft survives sign up and the payment redirect.
- Rooms: every room has its own calendar, capacity and hourly rate, so two rooms can run at the same time while the same room can never be double booked. Holds, requests, approvals and blocks are all checked atomically in the database.
- Automatic or manual confirmation: packages confirm automatically after a verified payment, or are sent as requests that staff approve or decline. Approved requests get a secure payment link and a deadline. Unpaid or unapproved requests are never treated as confirmed unless staff confirm them explicitly.
- Deposits and full payment: a default deposit percentage with per-package overrides, balances paid online from the client account or an emailed link, and cash, transfer or POS payments recorded by staff. Refunds follow the policy on the amount actually paid, across every payment on the booking.
- Paystack checkout verified on the server (callback and signed webhook). Each payment is applied exactly once. A payment that arrives after its slot was lost, or after the booking closed, is refunded automatically.
- Accounts: register, log in, email verification, password reset, profile. Guest bookings made by staff link to the client's account once they verify the same email.
- Client dashboard: upcoming sessions, requests waiting for approval, pay now and pay balance, receipts with every payment, reschedule and cancellation requests, withdrawing a request.
- Staff dashboard: overview with approvals and a launch checklist, room calendar, bookings with approve, decline, confirm without payment, record payment, payment links, reschedule, cancel, completed and no-show, manual bookings for phone, WhatsApp and walk-in clients, client history, availability and blocked time per room, services, packages, rooms, categories, extras, deposit and approval rules, enquiries and quote requests, website content, portfolio, team, equipment, gallery, testimonials, FAQs, announcements, policies, SEO and analytics, payments and outstanding balances, reports with CSV export, staff and permissions, audit log and email outbox.
- Catalog: fixed session times (four daily sessions and a Saturday All night session), whole-day residency requests, remote orders (beats, mixing and mastering, song covers) and an EP or album request, each with its own booking steps, regular price and savings, delivery time and revision count.
- Client portal: finished files with payment-gated download, uploads in parts with retry, up to 3 revisions, approve and finish, and automatic completion after 7 days. Studio side: a Deliveries queue and a Files panel on every booking, with a Producer role that never sees client contacts. See `docs/PORTAL.md`.
- Notifications: emails for requests, approvals, declines, confirmations, payments, payment links, reschedules, cancellations, refunds, expiries and session reminders, plus staff alerts. Every email is kept in the outbox.
- SEO: per-page titles, descriptions and social tags rendered on the server, canonical URLs, sitemap.xml, robots.txt, LocalBusiness structured data, image alt text, Cloudflare Web Analytics or Google Analytics 4, and Search Console verification. Search indexing stays off until the studio turns it on.

## Architecture

```
src/
  worker/                 Cloudflare Worker (Hono)
    index.ts              API, /media, robots.txt, sitemap.xml and HTML pages
    site.ts               page metadata, structured data and analytics injected with HTMLRewriter
    routes/               HTTP layer: routing, input validation (zod), cookies
    middleware/           session loading, requireUser / requireStaff / requireCeo / requirePermission
    services/             business logic: auth, availability, bookings, payments, emails, collections, admin
    repositories/         D1 queries, one module per area
    lib/                  crypto, time (Lagos time), errors, validation helpers
  shared/                 permission list shared by the Worker and the app
  client/                 React app (Vite): pages, admin, components and styles
migrations/               D1 schema and seed data
scripts/                  seed generator, demo recorder and logo asset builder
tests/                    unit tests
docs/                     admin guide, operations and requirements coverage
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
| Studio manager (admin, limited permissions) | manager@psychrecords.test |

To seed a different password, run `SEED_PASSWORD='...' npm run db:seed:sql` before migrating.

Without a Paystack key the app uses a simulated Paystack checkout that still goes through server verification. Without a Resend key emails are only written to the outbox (Audit log, Email outbox in the dashboard).

The seed content (rooms, equipment, team, portfolio, testimonials and contact details) is sample content to replace before launch. The dashboard's launch checklist lists what is left.

## Deploy to Cloudflare

See [docs/OPERATIONS.md](docs/OPERATIONS.md) for the full steps, secrets, custom domain, backups and costs. In short:

1. `npx wrangler login`, or set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
2. `npx wrangler d1 create sessions-db` and paste the `database_id` into `wrangler.jsonc`.
3. `npx wrangler r2 bucket create psych-records-media` for image uploads.
4. `npm run db:migrate:remote`.
5. Set `APP_URL` in `wrangler.jsonc`, add the secrets, then `npm run deploy`.
6. In Paystack set the webhook URL to `https://<your-domain>/api/payments/webhook`.

The cron trigger (every 5 minutes) releases expired holds, requests and unpaid approvals, sends session reminders and marks past sessions completed.

## Logo assets

The logo images in `src/client/public` (the emblem and lockup WebP sets in `brand/`, the share image `brand/og.png`, the favicon set and the app icons) are generated from the two files the studio supplied, a tiger head SVG and the full lockup SVG, which are not kept in the repo. To rebuild them, with Python, Pillow and numpy installed:

```
python3 scripts/make-brand.py path/to/tiger-head.svg path/to/lockup.svg
```

## Demo video

With `npm run dev` running:

```
npm run demo
```

This records `demo/psych-records-demo.mp4` with Playwright and ffmpeg. Set `CHROME_PATH` to use a specific Chromium build.
