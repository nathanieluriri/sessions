-- Restore the four daily recording sessions and Saturday all-night full production.
-- Photography is ₦40,000 per hour. The podcast studio is ₦60,000 per hour.
-- EP and album are paid packages: benefits are included, with no calendar and no separate add-on prices.

UPDATE session_slots SET active = 1 WHERE id = 'slot_night';
UPDATE opening_hours SET is_open = 1, open_min = 600, close_min = 1140 WHERE weekday = 0;

UPDATE packages SET
  name = 'Recording session',
  description = 'Record your vocals over an existing beat in our professional studio. Includes a 2-hour session; mixing and mastering are not included.',
  duration_min = 120,
  price_kobo = 8000000,
  pricing = 'fixed',
  price_note = '',
  scheduling = 'slot',
  slot_kind = 'day',
  unit = 'per session',
  service_slug = 'recording',
  room_id = 'room_studio_a',
  active = 1,
  requires_approval = 0
WHERE slug = 'recording-session';

UPDATE services SET
  price_label = '₦80,000 / session',
  duration_label = 'Four sessions every day',
  description = 'Record your vocals over an existing beat in our professional studio. Includes a 2-hour session; mixing and mastering are not included.',
  details = 'There are four recording sessions every day: 10:00am to 12:00noon, 12:30pm to 2:00pm, 2:30pm to 4:30pm and 5:00pm to 7:00pm. Each session is ₦80,000. You can book more than one session at once. Mixing and mastering are not included.',
  active = 1
WHERE slug = 'recording';

UPDATE packages SET
  name = 'Full production',
  description = 'A complete package featuring a 6-hour recording session, custom instrumental, mixing and mastering.',
  duration_min = 360,
  price_kobo = 28000000,
  pricing = 'fixed',
  featured = 1,
  price_note = '',
  scheduling = 'slot',
  slot_kind = 'night',
  unit = 'per track',
  room_id = 'room_studio_a',
  service_slug = 'full-production',
  requires_approval = 0,
  turnaround_days = 7,
  revision_limit = 3,
  active = 1
WHERE slug = 'full-production';

UPDATE services SET
  price_label = '₦280,000 / track',
  description = 'A complete package featuring a 6-hour recording session, custom instrumental, mixing and mastering.',
  duration_label = 'Saturday night, 11:00pm to 5:00am',
  details = 'A custom instrumental, the 6 hour All night session in Studio A on Saturday from 11:00pm to 5:00am on Sunday, then mixing and mastering. Delivered in your portal, with up to 3 revisions.',
  active = 1
WHERE slug = 'full-production';

UPDATE services SET price_label = '₦40,000 / hour', duration_label = '1 hour, add more if you need them', description = 'Photography with a photographer and lighting. ₦40,000 per hour.' WHERE slug = 'artist-portraits';
UPDATE packages SET
  name = 'Photography, 1 hour',
  description = 'One hour of photography with a photographer and lighting. ₦40,000 per hour. Add further hours when you book.',
  duration_min = 60,
  price_kobo = 4000000,
  pricing = 'fixed',
  scheduling = 'flex',
  unit = 'per hour',
  active = 1,
  service_slug = 'artist-portraits'
WHERE slug = 'photo-session-2-hour';

UPDATE services SET price_label = '₦60,000 / hour', duration_label = '1 hour, add more if you need them', description = 'Podcast recording in the studio. ₦60,000 per hour.' WHERE slug = 'podcast-recording';
UPDATE packages SET
  price_kobo = 6000000,
  unit = 'per hour',
  pricing = 'fixed',
  scheduling = 'flex',
  duration_min = 60,
  active = 1,
  description = 'One hour in the Podcast Room for up to four guests, with an engineer and separate tracks. ₦60,000 per hour.'
WHERE slug = 'podcast-hour';
UPDATE rooms SET hourly_kobo = 6000000 WHERE id = 'room_podcast';

UPDATE services SET price_label = '₦180,000 / song', active = 1 WHERE slug = 'song-covers';
UPDATE packages SET price_kobo = 18000000, pricing = 'fixed', active = 1 WHERE slug = 'song-cover';

UPDATE services SET active = 0 WHERE slug = 'artist-development';
UPDATE packages SET active = 0 WHERE slug = 'artist-development-programme';

UPDATE services SET
  price_label = '₦1,500,000',
  active = 1,
  description = 'Five tracks recorded, mixed and mastered. Every benefit listed here is included in the package price.',
  details = 'Five tracks recorded, mixed and mastered. Every benefit on the package is included in the price. After you pay, our management team contacts you to schedule the sessions.',
  image_url = '/artwork/ep-package.jpeg'
WHERE slug = 'produce-ep';
UPDATE packages SET
  price_kobo = 150000000,
  scheduling = 'project',
  requires_approval = 0,
  pricing = 'fixed',
  deposit_percent = 100,
  unit = 'for 5 tracks',
  tracks = 5,
  active = 1,
  description = 'Five tracks recorded, mixed and mastered. Every benefit listed here is included in the package price.'
WHERE slug = 'produce-ep';

UPDATE services SET
  price_label = '₦2,500,000',
  active = 1,
  description = 'Twelve tracks recorded, mixed and mastered. Every benefit listed here is included in the package price.',
  details = 'Twelve tracks recorded, mixed and mastered. Every benefit on the package is included in the price. After you pay, our management team contacts you to schedule the sessions.',
  image_url = '/artwork/lp-package.jpeg'
WHERE slug = 'produce-album';
UPDATE packages SET
  price_kobo = 250000000,
  scheduling = 'project',
  requires_approval = 0,
  pricing = 'fixed',
  deposit_percent = 100,
  unit = 'for 12 tracks',
  tracks = 12,
  active = 1,
  description = 'Twelve tracks recorded, mixed and mastered. Every benefit listed here is included in the package price.'
WHERE slug = 'produce-album';

UPDATE packages SET includes = replace(includes, '—', ' - ') WHERE slug IN ('produce-ep', 'produce-album');
UPDATE extras SET active = 0 WHERE category = 'exclusive' AND pricing = 'quote';

UPDATE content SET value = 'Book recording sessions, beats, mixing and mastering online, with fixed session times and live availability. Photography is ₦40,000 per hour and the podcast studio is ₦60,000 per hour.' WHERE key = 'hero_subtitle';
UPDATE content SET value = 'Book recording sessions, beats, mixing and mastering online. Photography is ₦40,000 per hour. The podcast studio is ₦60,000 per hour.' WHERE key = 'footer_blurb';
UPDATE content SET value = 'Book recording sessions, beats, mixing and mastering at Psych Records, with live availability and secure Paystack checkout. Photography is ₦40,000 per hour. The podcast studio is ₦60,000 per hour.' WHERE key = 'seo_description';
UPDATE content SET value = 'Recording sessions run daily from 10:00am to 7:00pm. The All night session runs on Saturdays from 11:00pm to 5:00am (Sunday).' WHERE key = 'hours_note';

UPDATE policies SET body = 'Recording sessions run at set times every day: 10:00am to 12:00noon, 12:30pm to 2:00pm, 2:30pm to 4:30pm and 5:00pm to 7:00pm. You can book more than one session at once. The All night session runs on Saturdays only, from 11:00pm to 5:00am on Sunday. Each session ends at its scheduled time so the room can be reset for the next artist.' WHERE slug = 'sessions';

UPDATE faqs SET answer = 'Choose what you are making, pick a package, then pick one or more of the open sessions and pay with Paystack. EP and album packages are paid online, and the studio contacts you to schedule the sessions.' WHERE id = 'faq_1';
UPDATE faqs SET answer = 'There are four recording sessions every day: 10:00am to 12:00noon, 12:30pm to 2:00pm, 2:30pm to 4:30pm and 5:00pm to 7:00pm. You can book more than one session at once. The All night session for full production runs on Saturdays only, from 11:00pm to 5:00am on Sunday.' WHERE id = 'faq_2';
UPDATE faqs SET answer = 'A recording session is ₦80,000. There are four sessions every day and you can book more than one at once. Beat production is ₦100,000. Mixing and mastering is ₦100,000 (Standard, 7 days) or ₦170,000 (Express, 1 day). Song covers are ₦180,000. Full production is ₦280,000 per track. Photography is ₦40,000 per hour and the podcast studio is ₦60,000 per hour.' WHERE id = 'faq_3';
UPDATE faqs SET answer = 'Produce your EP (5 tracks, ₦1,500,000) or your album (12 tracks, ₦2,500,000). The benefits listed on each package are included in the price. After you pay, the studio contacts you to schedule the sessions.' WHERE id = 'faq_13';

UPDATE page_meta SET description = 'Recording sessions at fixed times, beats, mixing and mastering, full production, photography at ₦40,000 per hour and the podcast studio at ₦60,000 per hour.' WHERE path = '/services';
UPDATE page_meta SET description = 'Fixed recording sessions, full production at ₦280,000, photography and podcast rates, and booking policies.' WHERE path = '/packages';
UPDATE page_meta SET description = 'Choose a service, book one or more of the four daily sessions, and pay online.' WHERE path = '/book';
