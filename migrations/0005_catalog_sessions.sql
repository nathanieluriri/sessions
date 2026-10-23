-- Fixed recording sessions, remote project orders, premium EP and album offers and the portal-first catalog.
-- Old packages that already have bookings are hidden, not deleted, so past bookings keep their terms.

ALTER TABLE packages ADD COLUMN service_slug TEXT NOT NULL DEFAULT '';
ALTER TABLE packages ADD COLUMN scheduling TEXT NOT NULL DEFAULT 'flex';
ALTER TABLE packages ADD COLUMN slot_kind TEXT NOT NULL DEFAULT 'day';
ALTER TABLE packages ADD COLUMN unit TEXT NOT NULL DEFAULT 'per session';
ALTER TABLE packages ADD COLUMN compare_at_kobo INTEGER;
ALTER TABLE packages ADD COLUMN turnaround_days INTEGER;
ALTER TABLE packages ADD COLUMN revision_limit INTEGER NOT NULL DEFAULT 0;
ALTER TABLE packages ADD COLUMN tracks INTEGER;

ALTER TABLE extras ADD COLUMN service_slug TEXT NOT NULL DEFAULT '';
ALTER TABLE extras ADD COLUMN pricing TEXT NOT NULL DEFAULT 'fixed';
ALTER TABLE extras ADD COLUMN description TEXT NOT NULL DEFAULT '';

ALTER TABLE bookings ADD COLUMN scheduling TEXT NOT NULL DEFAULT 'flex';
ALTER TABLE bookings ADD COLUMN slot_kind TEXT NOT NULL DEFAULT '';
ALTER TABLE bookings ADD COLUMN slot_label TEXT NOT NULL DEFAULT '';
ALTER TABLE bookings ADD COLUMN due_date TEXT;
ALTER TABLE bookings ADD COLUMN revision_limit INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN revisions_used INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN delivered_final_at TEXT;
CREATE INDEX idx_bookings_due ON bookings (due_date);

CREATE TABLE session_slots (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('day', 'night')),
  label TEXT NOT NULL,
  weekday INTEGER CHECK (weekday BETWEEN 0 AND 6),
  start_min INTEGER NOT NULL,
  end_min INTEGER NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);
INSERT INTO session_slots (id, kind, label, weekday, start_min, end_min, sort) VALUES ('slot_day_1', 'day', 'Session 1', NULL, 600, 720, 0);
INSERT INTO session_slots (id, kind, label, weekday, start_min, end_min, sort) VALUES ('slot_day_2', 'day', 'Session 2', NULL, 750, 840, 1);
INSERT INTO session_slots (id, kind, label, weekday, start_min, end_min, sort) VALUES ('slot_day_3', 'day', 'Session 3', NULL, 870, 990, 2);
INSERT INTO session_slots (id, kind, label, weekday, start_min, end_min, sort) VALUES ('slot_day_4', 'day', 'Session 4', NULL, 1020, 1140, 3);
INSERT INTO session_slots (id, kind, label, weekday, start_min, end_min, sort) VALUES ('slot_night', 'night', 'All night session', 6, 1380, 1740, 10);

UPDATE opening_hours SET is_open = 1, open_min = 600, close_min = 1140;

INSERT INTO categories (slug, name, blurb, sort, bookable) VALUES ('exclusive', 'Exclusive offers', 'Premium residencies with accommodation and unlimited studio sessions until your record is recorded, mixed and mastered.', 1, 1);
UPDATE categories SET sort = 0 WHERE slug = 'music';
UPDATE categories SET sort = 2 WHERE slug = 'video';
UPDATE categories SET sort = 3 WHERE slug = 'podcast';
UPDATE categories SET sort = 4 WHERE slug = 'photo';
UPDATE categories SET name = 'Music and audio', blurb = 'Recording, beats, mixing and mastering, and full production, with the people who care about the record.' WHERE slug = 'music';

DELETE FROM services WHERE slug IN ('song-arrangement', 'mastering', 'vocal-editing', 'voice-over');
UPDATE services SET slug = 'recording', name = 'Recording', sort = 0, price_label = '₦80,000 / session', duration_label = 'Four sessions every day',
  description = 'Vocals, rap and voice-over recorded in the treated booth with an engineer at the desk. Song arrangement is included.',
  details = 'Book one of four recording sessions every day. Your engineer sets up the booth, records and comps takes as you go, and helps shape the arrangement of your song so you leave with a finished idea. Vocals, rap and voice-over all come under Recording.',
  deliverables = '["Song arrangement included", "Comped takes", "Session files in your portal"]'
  WHERE slug = 'vocal-recording';
UPDATE services SET sort = 1, price_label = '₦100,000 / beat', duration_label = 'Delivered in your portal',
  description = 'A producer builds an original beat for your song, or finishes one you started.',
  details = 'Tell us the style, tempo and references when you order and upload anything you want us to hear. A producer builds the beat and delivers it in your portal, with stems for mixing.',
  deliverables = '["Beat in WAV and MP3", "Stems for mixing", "Usage terms in writing"]'
  WHERE slug = 'beat-production';
UPDATE services SET slug = 'mixing-mastering', name = 'Mixing and mastering', sort = 2, price_label = 'From ₦100,000 / song', duration_label = 'Express 1 day, Standard 7 days',
  description = 'Balance, tone and polish for your record, with audio editing and vocal comping included. For music.',
  details = 'Upload your stems in your portal. We edit and comp the vocals, mix the record and master it for streaming, radio and the club. Choose Standard (7 days) or Express (1 day). Every order includes up to 3 revisions, requested from your portal.',
  deliverables = '["Mixed and mastered song in WAV and MP3", "Audio editing and vocal comping included", "Up to 3 revisions"]'
  WHERE slug = 'mixing';
UPDATE services SET sort = 5 WHERE slug = 'artist-development';
INSERT INTO services (id, slug, name, description, price_label, image_url, sort, category, details, deliverables, duration_label) VALUES ('svc_full_production', 'full-production', 'Full production', 'One track from start to finish: a custom beat, the 6 hour All night session and mixing and mastering.', '₦280,000 / track', 'https://images.unsplash.com/photo-1648522168784-067e98df88c0?w=1400&q=70&auto=format&fit=crop', 3, 'music', 'Your track gets a beat made for it, a 6 hour All night session in Studio A with an engineer on Saturday from 11:00pm to 5:00am, then mixing and mastering. Everything is delivered in your portal, with up to 3 revisions.', '["Custom beat", "6 hour All night session", "Mixing and mastering", "Up to 3 revisions"]', 'Saturday night session, delivered in 7 days');
INSERT INTO services (id, slug, name, description, price_label, image_url, sort, category, details, deliverables, duration_label) VALUES ('svc_song_covers', 'song-covers', 'Song covers', 'Cover versions of songs, produced and recorded by the studio.', '₦50,000 / song', 'https://images.unsplash.com/photo-1617745546548-9324da9e2b7c?w=1400&q=70&auto=format&fit=crop', 4, 'music', 'Tell us the song and the style you want when you order. The studio produces your cover and delivers the finished files in your portal.', '["Finished cover in WAV and MP3", "Delivered in your portal"]', 'Delivered in your portal');
INSERT INTO services (id, slug, name, description, price_label, image_url, sort, category, details, deliverables, duration_label) VALUES ('svc_produce_ep', 'produce-ep', 'Produce your EP', 'Five tracks recorded, mixed and mastered, with accommodation for the period and unlimited studio sessions.', '₦1,500,000', 'https://images.unsplash.com/photo-1537344845089-c7f47b3210ab?w=1400&q=70&auto=format&fit=crop', 6, 'exclusive', 'A premium residency at Psych Records. You stay with us for the period and record in unlimited studio sessions until all five tracks are recorded, mixed and mastered. Add album art, independent distribution and a PR campaign when you send your request.', '["5 tracks recorded, mixed and mastered", "Accommodation for the period", "Unlimited studio sessions", "Up to 3 revisions"]', '5 tracks');
INSERT INTO services (id, slug, name, description, price_label, image_url, sort, category, details, deliverables, duration_label) VALUES ('svc_produce_album', 'produce-album', 'Produce your LP or album', 'Twelve tracks recorded, mixed and mastered, with accommodation for the period and unlimited studio sessions.', '₦2,500,000', 'https://images.unsplash.com/photo-1714140674991-f12cf2bb4d4a?w=1400&q=70&auto=format&fit=crop', 7, 'exclusive', 'A premium residency at Psych Records. You stay with us for the period and record in unlimited studio sessions until all twelve tracks are recorded, mixed and mastered. Add album art, independent distribution and a PR campaign when you send your request.', '["12 tracks recorded, mixed and mastered", "Accommodation for the period", "Unlimited studio sessions", "Up to 3 revisions"]', '12 tracks');

UPDATE packages SET active = 0, featured = 0 WHERE slug IN ('1-hour', '2-hour', 'half-day', 'full-day', 'record-mix', 'record-mix-master', 'production-3-hour')
  AND EXISTS (SELECT 1 FROM bookings b WHERE b.package_id = packages.id);
DELETE FROM packages WHERE slug IN ('1-hour', '2-hour', 'half-day', 'full-day', 'record-mix', 'record-mix-master', 'production-3-hour')
  AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.package_id = packages.id);

INSERT INTO packages (id, slug, name, description, category, duration_min, price_kobo, includes, featured, active, sort, service_category, room_id, pricing, deposit_percent, requires_approval, price_note, service_slug, scheduling, slot_kind, unit, compare_at_kobo, turnaround_days, revision_limit, tracks)
VALUES ('pkg_recording_session', 'recording-session', 'Recording session', 'One recording session in Studio A with an engineer at the desk, for vocals, rap or voice-over. Song arrangement is included. Choose from four sessions every day.', 'session', 120, 8000000,
  '["Engineer at the desk", "Song arrangement included", "Vocals, rap or voice-over", "Session files in your portal"]', 0, 1, 0, 'music', 'room_studio_a', 'fixed', 0, 0, '', 'recording', 'slot', 'day', 'per session', NULL, NULL, 0, NULL);
INSERT INTO packages (id, slug, name, description, category, duration_min, price_kobo, includes, featured, active, sort, service_category, room_id, pricing, deposit_percent, requires_approval, price_note, service_slug, scheduling, slot_kind, unit, compare_at_kobo, turnaround_days, revision_limit, tracks)
VALUES ('pkg_beat_production', 'beat-production', 'Beat production', 'A producer builds an original beat for your song. Tell us the style, tempo and references when you order and collect the finished beat in your portal.', 'post', 0, 10000000,
  '["Original beat for your song", "WAV and MP3 with stems", "Delivered in your portal"]', 0, 1, 1, 'music', NULL, 'fixed', 0, 0, '', 'beat-production', 'project', 'day', 'per beat', NULL, NULL, 0, NULL);
INSERT INTO packages (id, slug, name, description, category, duration_min, price_kobo, includes, featured, active, sort, service_category, room_id, pricing, deposit_percent, requires_approval, price_note, service_slug, scheduling, slot_kind, unit, compare_at_kobo, turnaround_days, revision_limit, tracks)
VALUES ('pkg_mm_standard', 'mixing-mastering-standard', 'Mixing and mastering, Standard', 'Your song mixed and mastered within 7 days, with audio editing and vocal comping included. Up to 3 revisions. For music only.', 'post', 0, 10000000,
  '["Delivered in 7 days", "Audio editing and vocal comping included", "Up to 3 revisions", "Upload your stems in your portal"]', 0, 1, 2, 'music', NULL, 'fixed', 0, 0, '', 'mixing-mastering', 'project', 'day', 'per song', NULL, 7, 3, NULL);
INSERT INTO packages (id, slug, name, description, category, duration_min, price_kobo, includes, featured, active, sort, service_category, room_id, pricing, deposit_percent, requires_approval, price_note, service_slug, scheduling, slot_kind, unit, compare_at_kobo, turnaround_days, revision_limit, tracks)
VALUES ('pkg_mm_express', 'mixing-mastering-express', 'Mixing and mastering, Express', 'Your song mixed and mastered within 1 day, with audio editing and vocal comping included. Up to 3 revisions. For music only.', 'post', 0, 17000000,
  '["Delivered in 1 day", "Audio editing and vocal comping included", "Up to 3 revisions", "Upload your stems in your portal"]', 0, 1, 3, 'music', NULL, 'fixed', 0, 0, '', 'mixing-mastering', 'project', 'day', 'per song', NULL, 1, 3, NULL);
INSERT INTO packages (id, slug, name, description, category, duration_min, price_kobo, includes, featured, active, sort, service_category, room_id, pricing, deposit_percent, requires_approval, price_note, service_slug, scheduling, slot_kind, unit, compare_at_kobo, turnaround_days, revision_limit, tracks)
VALUES ('pkg_song_cover', 'song-cover', 'Song cover', 'A cover of a song, produced and recorded by the studio and delivered in your portal.', 'post', 0, 5000000,
  '["Produced by the studio", "WAV and MP3", "Delivered in your portal"]', 0, 1, 4, 'music', NULL, 'fixed', 0, 0, '', 'song-covers', 'project', 'day', 'per song', NULL, NULL, 0, NULL);
INSERT INTO packages (id, slug, name, description, category, duration_min, price_kobo, includes, featured, active, sort, service_category, room_id, pricing, deposit_percent, requires_approval, price_note, service_slug, scheduling, slot_kind, unit, compare_at_kobo, turnaround_days, revision_limit, tracks)
VALUES ('pkg_full_production', 'full-production', 'Full production', 'One track from start to finish: a custom beat, the 6 hour All night session in Studio A, and mixing and mastering. The session runs on Saturdays from 11:00pm to 5:00am.', 'post', 360, 28000000,
  '["Custom beat", "6 hour All night session with an engineer", "Mixing and mastering, delivered in 7 days", "Song arrangement included", "Up to 3 revisions", "Finished files in your portal"]', 1, 1, 5, 'music', 'room_studio_a', 'fixed', NULL, 0, '', 'full-production', 'slot', 'night', 'per track', NULL, 7, 3, NULL);
INSERT INTO packages (id, slug, name, description, category, duration_min, price_kobo, includes, featured, active, sort, service_category, room_id, pricing, deposit_percent, requires_approval, price_note, service_slug, scheduling, slot_kind, unit, compare_at_kobo, turnaround_days, revision_limit, tracks)
VALUES ('pkg_artist_development', 'artist-development-programme', 'Artist development programme', 'A structured programme covering your sound, recording habits, release plan and visuals.', 'post', 0, 0,
  '["Sound and brand review", "Recording plan", "Release and content calendar"]', 0, 1, 6, 'music', NULL, 'quote', NULL, 1, 'Priced per programme', 'artist-development', 'project', 'day', '', NULL, NULL, 0, NULL);
INSERT INTO packages (id, slug, name, description, category, duration_min, price_kobo, includes, featured, active, sort, service_category, room_id, pricing, deposit_percent, requires_approval, price_note, service_slug, scheduling, slot_kind, unit, compare_at_kobo, turnaround_days, revision_limit, tracks)
VALUES ('pkg_produce_ep', 'produce-ep', 'Produce your EP', 'Five tracks recorded, mixed and mastered, with accommodation for the period and unlimited studio sessions until the record is done.', 'post', 540, 150000000,
  '["Accommodation for the whole period", "Unlimited studio sessions until all 5 tracks are done", "5 tracks recorded, mixed and mastered", "Up to 3 revisions", "Finished files in your portal"]', 1, 1, 7, 'exclusive', 'room_studio_a', 'fixed', NULL, 1, '', 'produce-ep', 'day', 'day', 'for 5 tracks', NULL, NULL, 3, 5);
INSERT INTO packages (id, slug, name, description, category, duration_min, price_kobo, includes, featured, active, sort, service_category, room_id, pricing, deposit_percent, requires_approval, price_note, service_slug, scheduling, slot_kind, unit, compare_at_kobo, turnaround_days, revision_limit, tracks)
VALUES ('pkg_produce_album', 'produce-album', 'Produce your LP or album', 'Twelve tracks recorded, mixed and mastered, with accommodation for the period and unlimited studio sessions until the record is done.', 'post', 540, 250000000,
  '["Accommodation for the whole period", "Unlimited studio sessions until all 12 tracks are done", "12 tracks recorded, mixed and mastered", "Up to 3 revisions", "Finished files in your portal"]', 0, 1, 8, 'exclusive', 'room_studio_a', 'fixed', NULL, 1, '', 'produce-album', 'day', 'day', 'for 12 tracks', NULL, NULL, 3, 12);

DELETE FROM extras WHERE slug IN ('vocal-editing', 'rush-delivery');
INSERT INTO extras (id, slug, name, price_kobo, active, category, service_slug, pricing, description) VALUES ('ext_album_art', 'album-art', 'Album art', 0, 1, 'exclusive', '', 'quote', 'Cover artwork designed for your release. Priced on request.');
INSERT INTO extras (id, slug, name, price_kobo, active, category, service_slug, pricing, description) VALUES ('ext_distribution', 'independent-distribution', 'Independent distribution (optional)', 0, 1, 'exclusive', '', 'quote', 'We release your record to the streaming platforms for you. Priced on request.');
INSERT INTO extras (id, slug, name, price_kobo, active, category, service_slug, pricing, description) VALUES ('ext_pr_campaign', 'pr-campaign', 'PR campaign', 0, 1, 'exclusive', '', 'quote', 'A press and promotion campaign for your release. Priced on request.');

UPDATE policies SET sort = 0, body = 'Smaller packages are paid in full when you book. Larger packages show a deposit option before you pay. Pay by card, bank transfer or USSD through Paystack. Your booking is confirmed once Paystack verifies the payment, and any balance is due before your finished files are released.' WHERE slug = 'payment';
DELETE FROM policies WHERE slug = 'overtime';
INSERT INTO policies (slug, title, body, sort, kind) VALUES ('sessions', 'Session times', 'Recording sessions run at set times every day: 10:00am to 12:00noon, 12:30pm to 2:00pm, 2:30pm to 4:30pm and 5:00pm to 7:00pm. The All night session runs on Saturdays only, from 11:00pm to 5:00am on Sunday. Each session ends at its scheduled time so the room can be reset for the next artist.', 1, 'booking');
UPDATE policies SET sort = 2, body = 'Some bookings, such as the EP and album offers, are sent as requests. The studio replies within 24 hours. Once approved you have 24 hours to pay a deposit or the full amount to secure your dates. Requests that are not approved or paid in time are released.' WHERE slug = 'approvals';
UPDATE policies SET sort = 3, body = 'Cancel 72 hours or more before your session for a full refund of what you have paid. Between 24 and 72 hours, 50% of what you paid is refunded. Under 24 hours or no-shows are not refunded. There are no refunds after job completion.' WHERE slug = 'cancellations';
UPDATE policies SET sort = 4, body = 'Reschedule once for free, up to 48 hours before your session, to any open session. Later changes are treated as a cancellation.' WHERE slug = 'rescheduling';
UPDATE policies SET sort = 5 WHERE slug = 'late-arrivals';
INSERT INTO policies (slug, title, body, sort, kind) VALUES ('revisions', 'Revisions and completion', 'Mixing and mastering includes a maximum of 3 revisions. Ask for a revision from your portal and say what to change. Once work is delivered in all agreed formats, no further adjustments are made. Any additional work after completion requires new payment or renegotiation.', 6, 'booking');
UPDATE policies SET sort = 7, body = 'Approved refunds go back to the original payment method within 5 to 10 working days. No refunds after job completion.' WHERE slug = 'refunds';
UPDATE policies SET sort = 8, title = 'File delivery and uploads', body = 'All finished work is delivered through your Psych Records portal, never by email or private message. Producers and engineers do not take payments or make private deals. Files are released once your balance is paid. You can also upload your own stems, references and lyrics in your portal. Download and keep your own copies: files may be removed from the portal 12 months after delivery.' WHERE slug = 'files';
UPDATE policies SET sort = 9 WHERE slug = 'guests-conduct';
UPDATE policies SET body = replace(body, '## Cookies', '## Your files' || char(10) || 'Files you upload (stems, references, lyrics) and the finished work we deliver to you are stored on Cloudflare R2 and are available only to you and the studio staff who work on your job.' || char(10) || char(10) || '## Cookies') WHERE slug = 'privacy';
UPDATE policies SET body = 'These terms apply when you use this website or book with Psych Records Entertainment Limited ("the studio").

## Bookings
A booking is confirmed only when you receive a confirmation email with a booking reference. Requests that need approval are not confirmed until the studio approves them and your payment is verified, unless the studio confirms them in writing.

## Payments
Prices are shown in Naira and locked when you book. Deposits and balances are explained in the booking policies. Payments are processed by Paystack and verified on our server.

## Sessions
Recording sessions run at the set times shown when you book. Each session ends at its scheduled time.

## Delivery of your work
All finished work is delivered through your portal, never by email or private message. Producers and engineers do not take payments or make private deals. Files are released once your balance is paid.

## General terms
- Maximum of 3 revisions for mixing and mastering.
- No refunds after job completion.
- Once work is delivered in all agreed formats, no further adjustments.
- Any additional work after completion requires new payment or renegotiation.

## Changes and cancellations
Rescheduling, cancellation and refund rules are set out in the booking policies, which you accept when you book.

## Using the studio
Follow the instructions of studio staff. You are responsible for damage to equipment or rooms caused by you or your guests. The studio may end a session without a refund for unsafe behaviour.

## Your work
You own the recordings, footage and images made for you once they are paid for in full. We will only use your work in our portfolio with your permission.

## Liability
We take care with your files, but keep your own copies. Our liability for any booking is limited to the amount you paid for it.

## Law
These terms are governed by the laws of the Federal Republic of Nigeria.' WHERE slug = 'terms';
UPDATE settings SET value = CAST(value AS INTEGER) + 1 WHERE key = 'policy_version';

UPDATE faqs SET question = 'How do I book a session?', answer = 'Choose what you are making, pick a package, then pick one of the open sessions and pay with Paystack. EP and album offers are sent as requests and confirmed by the studio first.' WHERE id = 'faq_1';
UPDATE faqs SET question = 'What are your session times?', answer = 'There are four recording sessions every day: 10:00am to 12:00noon, 12:30pm to 2:00pm, 2:30pm to 4:30pm and 5:00pm to 7:00pm. The All night session runs on Saturdays only, from 11:00pm to 5:00am on Sunday.' WHERE id = 'faq_2';
UPDATE faqs SET question = 'How much does it cost?', answer = 'A recording session is ₦80,000 and includes song arrangement. Beat production is ₦100,000. Mixing and mastering is ₦100,000 (Standard, 7 days) or ₦170,000 (Express, 1 day). Song covers are ₦50,000. Full production is ₦280,000 per track and includes a beat, the 6 hour All night session and mixing and mastering.' WHERE id = 'faq_3';
UPDATE faqs SET question = 'Do I have to pay in full?', answer = 'Smaller packages are paid in full when you book. On larger packages you can pay a deposit to secure your dates and the balance before your finished files are released.' WHERE id = 'faq_4';
UPDATE faqs SET question = 'Is mixing and mastering included?', answer = 'A recording session is for recording. Full production, the EP offer and the album offer include mixing and mastering. Otherwise order Mixing and mastering separately, with audio editing and vocal comping included.' WHERE id = 'faq_9';
INSERT INTO faqs (id, question, answer, sort) VALUES ('faq_11', 'How do I get my finished songs?', 'Everything is delivered through your portal. When your song is ready you get an email and a notification, then you sign in and download it. We never send finished work by email or message.', 10);
INSERT INTO faqs (id, question, answer, sort) VALUES ('faq_12', 'How many revisions do I get?', 'Mixing and mastering includes a maximum of 3 revisions. Request each one from your portal and say what to change. Once work is delivered in all agreed formats there are no further adjustments, and additional work needs new payment or renegotiation.', 11);
INSERT INTO faqs (id, question, answer, sort) VALUES ('faq_13', 'What do the EP and album offers include?', 'Accommodation for the period and unlimited studio sessions until every track is recorded, mixed and mastered: 5 tracks for the EP and 12 for the album. You can add album art, independent distribution and a PR campaign.', 12);
INSERT INTO faqs (id, question, answer, sort) VALUES ('faq_14', 'Can I send you my files?', 'Yes. Upload stems, references, lyrics or a beat from your portal and the studio team can download them. Mixing and mastering orders start with your uploaded stems.', 13);

UPDATE announcements SET title = 'Exclusive offers', body = 'Produce your EP (5 tracks) or your album (12 tracks) with accommodation and unlimited studio sessions.', link_label = 'See the offers', link_url = '/packages#exclusive' WHERE id = 'ann_1';
UPDATE page_meta SET description = 'Recording sessions, beat production, mixing and mastering, full production and exclusive EP and album offers, with prices and booking policies.' WHERE path = '/packages';
UPDATE content SET value = 'Recording sessions run at set times. See Pricing for the session times.' WHERE key = 'hours_note';
