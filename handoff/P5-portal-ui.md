# P5. Portal UI: artist files and deliveries, studio delivery and queue

Read first: `.gauntlet/BRIEF.md` (R1 to R5 and R18 are the heart of it), `.gauntlet/ARCHITECTURE.md`, `.gauntlet/API-NOTES.md` (exact request and response JSON, written from the files builder's report: trust it over the prose), then the existing client code you will extend: `pages/account.tsx`, `components/Dash.tsx`, `pages/admin/bookings.tsx` (the `BookingDrawer`), `pages/admin/index.tsx`, `pages/admin/kit.tsx` (`ImageField` shows the existing upload pattern), `components/ui.tsx`, `components/kitchen.tsx` (`Tactile`, `HoldToConfirm`), `styles.css`, `pages.css`. The server is done and tested (P3).

## Goal

The artist side is so simple a first-time user on a phone knows what to do in five seconds: your finished songs are at the top with a big Download button, a clear way to upload your own files, and nothing else competing. The studio side lets staff deliver finished work and fetch client uploads without leaving the booking, and gives the team a production queue. Producers can do their job without ever seeing how to contact a client.

## Bar

Match or beat WeTransfer's upload and download pages for a first-time user on a phone (one obvious action per screen, visible progress, plain errors, nothing to learn), and Fiverr's order page for deliveries and revisions (clear state, "request a revision (2 left)", "approve and finish", nothing ambiguous about what happens after approval). Standing criterion: it must not read as a framework default; use the existing visual language (tactile buttons, `.card`, `.panel`, `.tag`, neon on near black accents, Reddit Sans and Mono).

## Files you own

Client: `pages/account.tsx`, new `pages/account-files.tsx` (or components), new `components/Uploader.tsx`, `components/FileList.tsx` (or similar), new `lib/files.ts` (chunked upload with retry, formatting), `pages/admin/bookings.tsx` (a Files panel inside `BookingDrawer`, hidden contact fields, email edit), `pages/admin/index.tsx` (the Deliveries nav entry and page, section permissions), new `pages/admin/deliveries.tsx`, `components/Dash.tsx` (nav entries only; `SlotPicker` belongs to the booking-flow builder), `App.tsx` (routes), new `portal.css` imported from `main.tsx`, `docs/ADMIN_GUIDE.md` (add the Deliveries section, the Producer role and the `deliver_files` permission, written for studio staff). A parallel builder owns the booking flow, pricing pages, `lib/catalog.ts`, `pages/admin/catalog.tsx`, `pages.css`. Never overwrite an existing file with Write, use Edit. No git commands. Ignore type errors in files you do not own.

## Must do

### Artist side (`/account`)

1. Navigation: Home, Bookings, Files, Payments, Profile. Home leads with "Ready for you": the newest published deliveries across bookings, each with title, booking, size, a big Download button and, for audio, a Listen button using a native `<audio>` with the inline stream URL. A locked delivery (balance due) shows what unlocks it ("Pay ₦X to unlock your files") with a Pay now button to the existing pay page, and no download link in the DOM. Then "Upload your files" (one button), next session, requests and balance cards as today, but quieter. Empty states are friendly and say what to do.
2. Files page (`/account/files`): section "From the studio" (grouped by booking, newest first, version badges v2, v3 for revised work, "New" badge until first downloaded) and section "Your uploads" (pick the booking if there is more than one, big dropzone plus "Choose files", list with status, size and remove). After a batch finishes uploading, call the notify endpoint once and show "Sent to the studio". Works with the keyboard and with touch; the dropzone is a real button and input.
3. Uploader (`lib/files.ts`, `components/Uploader.tsx`): 8 MiB parts, up to 3 parts in flight, 3 retries with backoff per part, per-file progress bar (`role="progressbar"` with values), cancel, remove, resume after a failed part without restarting the file, plain-language errors (too big, file type not allowed with the allowed list, offline, session expired, storage not set up), a `beforeunload` guard while uploads are running, and refusal of zero byte files before any request. Pure helpers (part planning, byte formatting, extension check, progress maths) unit tested.
4. Booking page (`/account/bookings/:id`): a Files panel with the same lists and uploader (anchor `#files`), a state line that always says where the job is ("Waiting for your files", "In production, due Thursday 29 October", "Delivered, take a look", "Revision requested, the studio is on it", "Approved and finished"), and the revision and approval controls: "Request a revision" opens a modal with a required note and shows "2 of 3 left"; when none are left it says so; "Approve and finish" uses the existing hold-to-confirm and states clearly that no further adjustments are possible after approval (the studio's terms: maximum 3 revisions for mixing and mastering, no refunds after job completion, no adjustments once delivered in all agreed formats). After approval the controls disappear and the page says finished. Cancel and reschedule request buttons remain only where they still apply.
5. Remote order jobs (`scheduling: project`) never show session time, room or reschedule; they show due date, upload and delivery state. Sessions show them as today.
6. Everything responsive at 390 px with no horizontal scroll and 44 px tap targets; focus rings visible; `prefers-reduced-motion` respected; color is never the only state signal.

### Studio side (`/admin`)

7. `BookingDrawer` gets a Files panel for staff with `deliver_files`: client uploads (download button, who and when, "New" until first downloaded), delivery staging (multi-file picker with per-file chunked upload and progress, editable title per file defaulting to the file name without extension, a note to the artist, "Release before the balance is paid" (shows the balance and a warning when checked), "This is the final delivery in all agreed formats" (explains that revisions close), then "Deliver to artist"), the published deliveries with release toggle, download counts and first-downloaded time, open revision requests with the artist's note (delivering again resolves it), "Mark job complete" (finalize) with hold-to-confirm. The deliver response may say the client could not be notified (no account or email): show that as a clear warning with the next step (add the client's email in Edit details, which now accepts an email, then share the portal link).
8. Contact fields that the server blanked for staff without contact access show "Hidden" with a short reason, never an empty cell. The Clients section stays hidden for them (already in place).
9. New admin section "Deliveries" (permission `deliver_files`): tabs To deliver, Revision requests, Client uploads, Delivered; rows with reference, artist, package, due date with an Overdue tag, balance due tag, file counts, open revision tag; clicking a row opens the booking drawer on the Files panel. Counts shown on the tabs. Nav lock behaviour as the other sections.
10. A producer account (`level: producer`: view calendar and deliver files) can use the Deliveries section and the drawer's Files panel and sees no client email, phone or payment details anywhere in the admin.
11. `docs/ADMIN_GUIDE.md`: Deliveries section, role table row for Producer, permission table row for `deliver_files`, and a short note that all delivery goes through the portal and why.
12. Tests: unit tests for the pure helpers; `npm run typecheck`, `npm test`, `npm run build` pass.

## Out of scope

Server code (report API problems to the orchestrator instead of working around them), booking flow, pricing pages, brand.

## How it will be judged

A first-contact critic plays a non-technical artist on a 390 px phone with a booking that has deliveries (one locked, one released), checks the five second test, uploads a 30 MB file through the UI with progress, kills the network mid-upload and recovers, requests revisions until the limit, approves, and tries to find a way to download a locked file or see another client's file. A studio critic plays a producer, the front desk and the CEO: delivers two files (one released early), watches the client's side update, tries to find any contact detail as a producer, uses the Deliveries queue, finalizes. Both read the copy against the studio's terms and BRIEF.md, and run keyboard and screen reader checks (labels, roles, focus order).
