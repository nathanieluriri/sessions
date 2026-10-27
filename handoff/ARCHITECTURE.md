# Architecture contract (shared by every part)

Stack is unchanged: Cloudflare Worker (Hono) + D1 + R2 + React/Vite SPA. Routes call services, services call repositories, repositories hold SQL. Routes never touch SQL. No new dependencies.

House rules for every file you write: no em dashes (use commas, colons, periods, parentheses), no AI attribution anywhere, comments only when a reader could not otherwise understand a hidden constraint (match the sparse comment density of the existing code), match existing naming and idiom (terse, functional, `bookingService`-style objects, zod at the route edge).

## Migrations already written (do not rewrite, extend only if the spec says so)

- `migrations/0005_catalog_sessions.sql`: `session_slots` table; new columns on `packages`, `extras`, `bookings`; the whole new catalog (services, packages, extras, categories incl. `exclusive`), policies, FAQs, announcement, opening hours.
- `migrations/0006_portal_files.sql`: `booking_files`, `revision_requests`.

Apply locally with `npx wrangler d1 migrations apply sessions-db --local --persist-to <dir>`. Production data (2 test bookings on package `1-hour`) must survive; old packages that have bookings are deactivated, not deleted.

## Scheduling modes (`packages.scheduling`, copied to `bookings.scheduling`)

| mode | meaning | who uses it |
| --- | --- | --- |
| `flex` | legacy: any start on the step grid inside opening hours, `duration_min` plus optional extra hours. Existing behaviour, untouched. | video, podcast and photo packages, staff manual bookings |
| `slot` | exactly one fixed session window from `session_slots` (kind `day` or `night`). No extra hours. Price is flat per session whatever the window length. | Recording session (kind day), Full production (kind night) |
| `day` | the whole studio day. Occupies the room from the earliest day-slot start to the latest day-slot end of that date. Client picks a preferred start day only. | Produce your EP, Produce your album (also `requires_approval = 1`) |
| `project` | no time and no room. A remote order. `date` = studio date the order was placed, `start_min = end_min = 0`, `room_id` NULL, `room_name` ''. Nothing can clash. | Beat production, Mixing and mastering, Song cover |

Session windows (`session_slots`), minutes from midnight of the booking `date`:

- kind `day`, every weekday: 600-720, 750-840, 870-990, 1020-1140 (10:00-12:00, 12:30-14:00, 14:30-16:30, 17:00-19:00). Labels Session 1 to Session 4. Note Session 2 is 90 minutes. They are exactly 30 minutes apart, which equals the 30 minute buffer setting, and the clash maths (`b.end_min + buffer > start` is strict) allows exactly that adjacency.
- kind `night`, weekday 6 (Saturday) only: 1380-1740 (23:00 Saturday to 05:00 Sunday). `end_min` may exceed 1440. The booking `date` is the Saturday. Every formatter must show 11:00pm to 5:00am and make clear it ends the next day. Anything that compares end times (completion cron, calendar, emails, tickets, reports) must be overnight aware.

`bookings` new columns: `scheduling`, `slot_kind`, `slot_label`, `due_date` (YYYY-MM-DD or NULL), `revision_limit`, `revisions_used`, `delivered_final_at`. `packages` new columns: `service_slug` (package belongs to one service; '' = any service in the category, legacy), `scheduling`, `slot_kind`, `unit` (display, e.g. "per beat"), `compare_at_kobo` (regular price struck through when greater than `price_kobo`), `turnaround_days`, `revision_limit`, `tracks`. `extras` new columns: `service_slug` (scope an extra to one service), `pricing` (`fixed` or `quote`; a `quote` extra is selectable, stored on the booking with price 0 and `quote: true`, and staff quote it separately), `description`.

`due_date` = base + `turnaround_days`, where base is the order date for `project` and the session date for `slot`/`day`. NULL when the package has no turnaround.

Project orders still use a `holds` row as the checkout container for the draft (room_id NULL, never clashes, same expiry). `bookFromHold` turns it into a booking after verified payment exactly as today.

## Roles and privacy (already implemented in the foundation commit)

New permission `deliver_files`. New staff level `producer` (defaults `view_calendar`, `deliver_files`). `canSeeContacts(user)` is true for owners and anyone holding `manage_bookings`, `update_booking_details`, `assist_clients` or `record_payments`. Staff without it get blank `contact_email` and `contact_phone` and never see `pay_token` anywhere in `/api/admin/*`. This is how producers are kept from private deals: they deliver through the portal and never see how to reach the client. Anything sent to `deliver_files` holders (emails, notifications) must not contain client email or phone.

## Portal files (data model, `0006`)

`booking_files`: one row per file, `direction` `delivery` (studio to client) or `upload` (client to studio), `state` `uploading` | `ready` | `removed`, R2 key `portal/<booking_id>/<file_id>` (server generated, never user text), multipart `upload_id` and `parts` JSON while uploading, `delivered_at` NULL until staff publish a delivery batch, `released` (staff override of the payment gate), `version`, `title`, `note`, `first_downloaded_at`, `download_count`.
`revision_requests`: `open` | `done`.

Rules (all enforced server side):

1. Only the booking owner (`bookings.user_id`) is the client. Staff need `deliver_files` for any file route. Nobody can read another client's file, ever, by any id.
2. A client may download a delivery iff `delivered_at` is set, `state = ready`, and (`released = 1` or booking balance is zero). Otherwise a 403 with `code: "locked"`. Inline streaming obeys the same rule. Staff with `deliver_files` can always download.
3. Staff upload deliveries as staged (`delivered_at` NULL, invisible to the client). `POST deliver` publishes a batch, notifies the client once (email with portal link and file titles, in-app notification, never an attachment), and writes the audit log. Every download is audited.
4. Revisions: allowed iff `revision_limit > 0`, `revisions_used < revision_limit`, booking not final, at least one delivery published, no open request already. A round can cover any tracks. Staff delivering again resolves the open request. Client Approve, or staff Finalize, sets `delivered_final_at` and booking `status = completed`; after that no revisions, no new deliveries, no cancel and no refund.
5. Client uploads are limited to the booking owner while status is `pending`, `approved`, `confirmed` or `completed`, never `cancelled` or `rejected`. Extension allowlist (audio, video, archives, documents, images, DAW exports), 1 GiB per file, 8 MiB parts. The client confirms a batch once and staff get one notification.
6. Never trust the browser: names are sanitized for `Content-Disposition` (RFC 5987), `X-Content-Type-Options: nosniff`, attachment disposition except inline audio.

## API contract (server to UI)

Client, all under `/api/account` and requiring a logged in client:

- `GET /files` returns `{ bookings: [{ id, ref, package_name, service_name, status, scheduling, due_date, balance_kobo, revision_limit, revisions_used, final, openRevision, deliveries: File[], uploads: File[] }] }` for every booking that has files or could receive uploads.
- `GET /bookings/:id` (existing) gains `files: { deliveries: File[], uploads: File[] }` and `revisions: { limit, used, left, final, open: RevisionRequest | null, canRequest: boolean }`.
- `POST /bookings/:id/files` body `{ name, size, contentType }` returns `{ id, partSize, parts }`. `PUT /files/:id/parts/:n` raw body returns `{ ok: true, size }`. `POST /files/:id/complete` returns `File`. `DELETE /files/:id` aborts or removes an own upload. `POST /bookings/:id/files/notify` body `{ fileIds }` tells staff once. `GET /files/:id/download?inline=1` streams (Range supported) or 403 `locked`.
- `POST /bookings/:id/revisions` body `{ note }`. `POST /bookings/:id/approve`.

Staff, under `/api/admin`, permission `deliver_files` unless stated:

- `GET /bookings/:id/files` returns `{ deliveries, uploads, revisions, client: { hasAccount } }`.
- `POST /bookings/:id/files`, `PUT /files/:id/parts/:n`, `POST /files/:id/complete`, `DELETE /files/:id` (same multipart protocol, staged deliveries).
- `POST /bookings/:id/deliver` body `{ items: [{ fileId, title }], note, released?, final?, resolvesRevision? }`.
- `POST /bookings/:id/finalize`. `POST /files/:id/release` body `{ released }`. `GET /files/:id/download`.
- `GET /deliveries?tab=todo|revisions|client|delivered` returns the production queue rows (booking ref, artist, package, due_date, overdue, balance, counts, open revision).
- `PUT /bookings/:id/details` additionally accepts `contact_email` (needs `update_booking_details`) so a walk-in client can be given a portal account link.

`File` = `{ id, booking_id, direction, title, name, size, content_type, version, note, delivered_at, created_at, released, locked, downloads, first_downloaded_at }` (`locked` is computed for the caller; staff always see `locked: false`).

Public, existing endpoints extended:

- `GET /api/catalog` adds `sessions` (active `session_slots`) and the new package/extra columns. Categories include `exclusive`.
- `GET /api/availability/day?date=&package=<packageId>` returns `{ date, mode, room, open, slots }`. For `slot` mode each slot is `{ id, start, end, label, available }`; for `day` mode a single slot with the whole-day window; for `project` mode `slots: []` and `mode: "project"`; for `flex` the legacy shape (`duration`+`room` still accepted when no `package`).
- `GET /api/availability/month?month=&package=` same idea. Days with no matching window (for example a Sunday for the night package) are `closed`.
- Draft/quote/hold responses carry `scheduling`, `slotKind`, `slotLabel`, `unit`, `turnaroundDays`, `revisionLimit`, `dueDate`.

## Test harness

`tests/helpers/harness.ts` boots the real Worker against a real local D1 and R2 using `wrangler`'s `getPlatformProxy` (no new dependency), applies every migration, and offers `login`, `register`, `call` and `payDemo` helpers with a cookie jar. API-level integration tests live in `tests/api/*.test.ts`. Pure logic gets plain unit tests in `tests/*.test.ts`. Run all with `npm test`. Every blocking bug found by a critic must end as a test here.

## Running the app for evidence

`bash /tmp/claude-0/-home-user-sessions/e4158143-0612-583f-a6cc-25c7b8ce3d86/scratchpad/harness/dev.sh <port> <name>` builds nothing; it starts an isolated `wrangler dev` (own D1 and R2 state under the scratchpad) on the port after applying all migrations, and prints the base URL and the stop command. Run `npm run build` first when client code changed (assets are served from `dist/client`). Seeded logins (password `password`): CEO `uririnathaniel@gmail.com`, manager `manager@psychrecords.test`. Chromium for Playwright: `CHROME_PATH=/opt/pw-browsers/chromium`. Always stop the instance you started.
