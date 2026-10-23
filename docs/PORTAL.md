# Portal files

How finished work reaches the artist, how artists send files to the studio, and what it costs to store them.

## The flow

1. The artist books and pays. Remote orders (beats, mixing and mastering, covers) appear in the production queue under **To do**.
2. The artist can upload stems, references and lyrics from their portal. When they confirm the batch, staff holding the deliver files permission get one notice. Staff download the files from the booking, and the queue tab **From clients** lists uploads nobody has downloaded yet.
3. Staff upload the finished work to the booking. Uploads are staged: the artist cannot see them yet.
4. Staff press **Deliver**: pick the files, give each a title, add an optional note. The artist gets one email (never an attachment) and an in-app notice. Delivering the same title again creates version 2, 3 and so on.
5. The artist downloads from their portal. Nothing is ever sent by email or private message.
6. The artist presses **Approve** to complete the order, or asks for a revision. Staff can also press **Complete order**. Delivering with the final option does both steps at once.

## Payment gate and release switch

A delivery is downloadable only when the booking balance is zero, or when staff switched **Release before payment** on for that file. A locked file stays locked for plain downloads, audio preview and partial (range) requests alike; the artist sees a locked badge and the amount to pay. Staff with the permission can always download. Refunds that bring a balance back lock the files again unless released.

## Revisions

Packages carry a revision limit (3 for mixing and mastering). The artist can ask for a revision only after something was delivered, while the order is not complete, with no request already open, and while rounds remain. A round can cover any tracks. Delivering again resolves the open request. Approving or completing the order closes revisions for good. After completion nothing changes: no new deliveries, no uploads, no cancellation or refund. New work needs a new booking.

## Producers

The producer role holds view calendar and deliver files. Producers see artist names, packages, due dates and balances, but never an email or phone number, and notices sent to them contain none. Text an artist types into a revision note is shown as written.

## Limits

- Types: audio, video, images, documents, archives and DAW exports. Web pages, scripts and programs are refused.
- 1 GB per file, uploaded in 8 MiB parts.
- Per booking: 100 files and 10 GB from the artist, 200 files and 20 GB of deliveries, 20 uploads in progress.
- Unfinished uploads are cleared after 24 hours by the scheduled job.
- The artist notice for uploads is limited to once every 2 minutes per booking.

## Storage costs and clearing space

Files live in the Cloudflare R2 bucket. R2 is free up to 10 GB, then $0.015 per GB per month, with no charge for downloads. 100 GB costs about $1.35 a month.

To clear space, open the booking, then Files, and remove files that are no longer needed (completed orders older than 12 months are the usual candidates). Removing deletes the stored object at once. The scheduled job retries any object that failed to delete. The R2 page in the Cloudflare dashboard shows total usage.

## For developers

Code is in `src/worker/{lib,repositories,services,routes}/files.ts`. The single download rule is `canDownload` in `lib/files.ts`. The public `/media` route serves only admin image uploads (keys like `2026-10/<uuid>.png`); portal objects use keys `portal/<booking>/<file>` and are reachable only through the gated download routes. Every download, delivery, release, removal, revision and completion is written to the audit log.
