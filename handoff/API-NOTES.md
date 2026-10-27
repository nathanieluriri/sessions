# API notes (exact JSON, from the builders' reports). Trust over prose.

## Portal files (P3)

Errors: {"error": "...", "code": "bad_request|not_found|forbidden|unauthorized|conflict|locked|rate_limited|storage_unavailable|storage_error"}.
Client base /api/account, staff base /api/admin.

File = {id, booking_id, direction: delivery|upload, title, name, size, content_type, version, note, delivered_at: null|ISO, created_at, released: bool, locked: bool, downloads: n, first_downloaded_at: null|ISO}
Revision = {id, note, status: open|done, created_at, resolved_at}

Begin: POST /bookings/:id/files (client and staff). Body {name, size}. 200 {id, partSize: 8388608, parts: 5}.
Part: PUT /files/:id/parts/:n raw body, exactly partSize bytes (last part is the remainder). 200 {ok:true, size}.
Complete: POST /files/:id/complete body {} -> File. Delete: DELETE /files/:id -> {ok:true}.
Client list: GET /account/files -> {bookings:[{id, ref, package_name, service_name, status, scheduling, due_date, balance_kobo, revision_limit, revisions_used, final, openRevision, canUpload, canRequest, canApprove, deliveries:[File], uploads:[File]}]}
Client booking detail GET /account/bookings/:id gains files:{deliveries, uploads, canUpload} and revisions:{limit, used, left, final, open, canRequest, canApprove}.
Notify: POST /account/bookings/:id/files/notify {fileIds:[...]} -> {ok:true, notified:n}; 429 rate_limited within 2 minutes; 400 if none are this booking's finished uploads.
Revision: POST /account/bookings/:id/revisions {note} (3 to 2000 chars) -> {ok:true, request:Revision, revisions:{...}}.
Approve: POST /account/bookings/:id/approve -> {ok:true, final:true}.
Download: GET /account|/admin/files/:id/download[?inline=1] -> 200/206 body; 403 {error:"This file unlocks when the remaining ₦80,000 is paid.", code:"locked"}; 404; 416.
Staff view: GET /admin/bookings/:id/files -> {booking:{id, ref, status, artist_name, service_name, package_name, scheduling, due_date, balance_kobo, final, canDeliver, canFinalize}, deliveries:[File] (staged have delivered_at null, locked false), uploads:[File], revisions:{limit, used, left, final, open, canRequest, canApprove, history:[Revision]}, client:{hasAccount, hasEmail}}
Deliver: POST /admin/bookings/:id/deliver {items:[{fileId, title}], note, released, final, resolvesRevision} -> {ok, delivered:[File], final, resolvedRevision, notified: bool, reason?: "no_contact"|"send_failed"}; 409 if just delivered by someone else.
Finalize: POST /admin/bookings/:id/finalize -> {ok:true, final:true}. Release: POST /admin/files/:id/release {released} -> File.
Queue: GET /admin/deliveries?tab=todo|revisions|client|delivered -> {tab, counts:{todo,revisions,client,delivered}, rows:[{id, ref, artist_name, service_name, package_name, status, scheduling, date, due_date, overdue, balance_kobo, total_kobo, revision_limit, revisions_used, final, created_at, last_delivered_at, counts:{delivered, staged, uploads, uploads_new}, open_revision: null|{id, note, created_at}}]}
Details: PUT /admin/bookings/:id/details accepts optional contact_email ("" = no change) -> {ok:true, linked?: bool}.
Limits: 1 GiB per file, 100 files and 10 GB (client) or 200 files and 20 GB (staff) per booking. Storage missing -> 400 code storage_unavailable.
Notification subjects: client "Your music is ready · REF" / "Your files are ready · REF" / "Your order is complete · REF"; staff "Files from <artist> · REF", "Revision requested · REF", "Delivery approved · REF" (no contacts).
Note: /media/* now serves only YYYY-MM/<uuid>.(jpg|png|webp|gif); portal files are never public.
Known gap flagged by builder: finalizing a session booking before its session sets status completed, and OCCUPIES only counts confirmed, so the slot could be rebooked (engine should count completed whose end has not passed).

## Engine (P2)

GET /api/catalog adds sessions: [{id, kind: day|night, label, weekday: null|0-6, start_min, end_min, sort, active}] (Session 1 to 4 = 600-720, 750-840, 870-990, 1020-1140; slot_night = 1380-1740 weekday 6). Packages carry scheduling, slot_kind, unit, compare_at_kobo, turnaround_days, revision_limit, tracks, service_slug. Extras carry pricing (fixed|quote), description, service_slug. rules also has minNotice, bookAhead.
GET /api/availability/day?date=&package=<id>:
 slot: {date, mode:"slot", kind:"night", room, open:{from,to}|null, slots:[{id,label,kind,start,end,available}]} (Sunday for the night package: open null, slots [])
 day: {date, mode:"day", kind:"day", room, open:{from:600,to:1140}, slots:[{id:"day", label:"Whole day", kind:"day", start:600, end:1140, available}]}
 project: {date, mode:"project", room:null, open:null, slots:[]}
 flex (with or without package): {date, mode:"flex", duration, room, open, slots:[{start, available}]}
GET /api/availability/month?month=&package=: {month, mode, kind?, room, days:[{date, status: available|limited|full|closed|past, free, total}]}; project: days [].
POST /api/holds draft adds scheduling, slotKind, slotLabel, unit, turnaroundDays, revisionLimit, dueDate, tracks. Project draft: date today, start 0, duration 0, roomId "". Quote extra in extrasList: {slug, name, price:0, quote:true}. date, start, people, extraHours, extras are optional in the draft body for project orders.
Booking rows and summary carry scheduling, slot_kind, slot_label, due_date. Overview has projects count. Project cancel: full refund until a delivery is published, then none (staff may override). setOutcome on project returns 400 (use portal finalize). Project moves are refused.

## Portal files round 2 additions
File also has group (lowercased trimmed title for deliveries, null for uploads) and latest (bool; true for uploads and newest published version of a title).
deliver and POST /admin/bookings/:id/notify-delivery (429 within 2 min, 400 if nothing delivered) -> {ok:true, notified:true, notified_via:"email"|"outbox"|"app"} or {notified:false, reason:"no_contact"|"send_failed"}.
GET /account/overview notifications gain booking_id (uuid|null).
Auto-complete: 7 days after the latest delivery, no open revision, balance zero. Approve and revision requests are refused (400) while every published delivery is locked by an unpaid balance. Only CEO/COO can remove a delivery already given to the client; deliver_files holders remove staged deliveries and client uploads. Migration 0007_portal_followups.sql adds notifications.booking_id and bookings.delivery_notified_at.
Brand: missing /brand/* files return 404.
