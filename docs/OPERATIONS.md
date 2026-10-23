# Operations

Hosting, setup, backups, monitoring and running costs for the Psych Records Entertainment website.

## How it is hosted

| Part | Service | Notes |
| --- | --- | --- |
| Website and API | Cloudflare Workers | One Worker serves the React app, the API, uploaded images and page metadata. HTTPS is automatic. |
| Database | Cloudflare D1 (SQLite) | Bookings, payments, content, users and settings. |
| Images | Cloudflare R2 | Uploaded photos, served from `/media/...` with long browser caching. |
| Client files | Cloudflare R2 | Songs, stems and deliveries in the same bucket, uploaded in parts and served only through the logged-in portal. Never public. |
| Scheduled jobs | Cron Trigger, every 5 minutes | Releases expired holds, requests and unpaid approvals, sends session reminders, completes past sessions. |
| Payments | Paystack | Hosted checkout. Card details never reach our servers. Every payment is verified on the server. |
| Email | Resend | Booking emails and staff alerts. Without a key, emails are only logged in the outbox. |

## Secrets and settings

Settings live in `wrangler.jsonc` (`vars`) and secrets are added with Wrangler so they never sit in the code:

```
npx wrangler secret put PAYSTACK_SECRET_KEY   # sk_live_... from Paystack, Settings, API Keys
npx wrangler secret put RESEND_API_KEY        # from Resend, API Keys
npx wrangler secret put EMAIL_FROM            # for example: Psych Records <bookings@your-domain.com>
```

- `APP_URL` in `wrangler.jsonc` must be the public address, because email links use it.
- While `PAYSTACK_SECRET_KEY` is not set, a simulated checkout is used. Setting the key switches to real Paystack and turns the simulator off.

### Paystack

1. Complete business verification in the Paystack dashboard.
2. Settings, API Keys and Webhooks: set the webhook URL to `https://<your-domain>/api/payments/webhook`. The callback URL is sent with each payment, so it does not need setting.
3. Add the live secret key as above and deploy.
4. Make a small real booking and refund it from the dashboard to check the full loop.

### Resend

1. Add and verify your domain in Resend (it gives you DNS records to add in Cloudflare).
2. Create an API key, then set `RESEND_API_KEY` and `EMAIL_FROM` (an address on the verified domain).
3. Replies go to the contact email set in Website, Business and contact.

## Custom domain

1. Add the domain to Cloudflare (or buy it through Cloudflare Registrar) so its DNS is on Cloudflare.
2. Workers and Pages, the `sessions` Worker, Settings, Domains and Routes: add a custom domain such as `psychrecords.com` and `www.psychrecords.com`. Cloudflare issues the certificate.
3. Update `APP_URL` in `wrangler.jsonc` to the new address and deploy.
4. Update the Paystack webhook URL and the Resend sender domain.
5. In the dashboard, Website, SEO and analytics: add the Search Console code, then turn on search indexing. Submit `https://<your-domain>/sitemap.xml` in Google Search Console.

## Deploying changes

```
npm ci
npm run typecheck && npm test
npm run db:migrate:remote     # only when there are new files in migrations/
npm run deploy
```

Database migrations run in order and are recorded, so each one runs once. Take a backup first (below).

## Backups and recovery

**Point-in-time restore (built in).** D1 Time Travel keeps the database history for 30 days on the Workers Paid plan (7 days on Free), at no extra cost.

```
npx wrangler d1 time-travel info sessions-db                                   # current bookmark
npx wrangler d1 time-travel restore sessions-db --timestamp=<unix-timestamp>    # roll back in place
```

Restoring overwrites the database, so note the current bookmark first; you can restore forward to it if needed.

**Off-site copies.** Export a full SQL backup weekly, and before every migration:

```
npx wrangler d1 export sessions-db --remote --output=backups/psych-$(date +%F).sql
```

Keep these files outside the repository (for example in Google Drive). To rebuild from a file into a new database: `npx wrangler d1 create <name>`, update `wrangler.jsonc`, then `npx wrangler d1 execute <name> --remote --file=<backup>.sql`.

**Images.** R2 stores uploaded images with high durability. To keep a copy, sync the bucket with any S3-compatible tool using an R2 API token.

**Code.** The source is in Git. Any commit can be redeployed with `npm run deploy`, and Cloudflare keeps previous Worker versions for instant rollback (Workers, Deployments).

## Monitoring

- Workers, the `sessions` Worker, Logs and Metrics: errors, requests and CPU time (observability is on in `wrangler.jsonc`).
- Dashboard, Audit log: every sensitive action. Email outbox: every email and whether it was sent.
- Cloudflare Web Analytics (free) or Google Analytics 4 for visitors, set in Website, SEO and analytics.

## Running costs

Prices checked in October 2026 on the providers' official pages. They change, so confirm before quoting.

| Item | Cost | Notes |
| --- | --- | --- |
| Cloudflare Workers | Free plan: 100,000 requests a day. Paid plan: $5 a month minimum, with 10 million requests and 30 million CPU milliseconds a month included. | Static files are free and unlimited. A studio site fits the free plan; the paid plan is recommended for 30-day backups and headroom. |
| Cloudflare D1 | Free: 5 million rows read and 100,000 written a day, 5 GB. Paid plan: 25 billion reads and 50 million writes a month and 5 GB included. | No extra cost for Time Travel backups. |
| Cloudflare R2 | Free each month: 10 GB stored, 1 million writes, 10 million reads, no egress fees. Then $0.015 per GB-month. | Photos are resized before upload, so 10 GB holds thousands. Audio and project files use the same allowance: one WAV song is roughly 50 MB, so 10 GB holds about 200 songs. Limits per booking are 100 files and 10 GB from the client, 200 files and 20 GB from staff. |
| Paystack | Nigeria: 1.5% + ₦100 per local transaction, the ₦100 waived under ₦2,500, capped at ₦2,000. International cards: 3.9% + ₦100. | Per transaction only. Refunds return the amount to the client. |
| Resend | Free: 3,000 emails a month, 100 a day. Pro: $20 a month for 50,000 emails with no daily limit. | The free plan covers a studio unless reminders and confirmations pass 100 a day. |
| Domain | Varies by registrar and extension. | Cloudflare Registrar sells at cost for supported extensions. |
| Google Maps embed, WhatsApp click-to-chat, Cloudflare Web Analytics, Google Analytics 4, Search Console | Free | The map uses the keyless embed. |
| WhatsApp Business API notifications (optional, not built) | Per-conversation fees set by Meta | Only needed for automatic WhatsApp messages. Click-to-chat works without it. |

Typical monthly total: $0 to $5 for hosting, plus Paystack fees on actual payments, plus email if volume passes the free plan.

## Limits to know

- Times are in Lagos time (WAT). Opening hours are per weekday; one-off changes use blocked time.
- A booking holds one room. Bookings that need two rooms at once should be made as two bookings.
- Booking references count up across all bookings (PR-YYMM-0001). Bookings are never deleted, only cancelled, so references stay unique.
- Uploads accept JPG, PNG, WebP and GIF up to 8 MB.
