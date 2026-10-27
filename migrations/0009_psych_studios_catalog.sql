UPDATE content SET value = replace(value, 'Psych Studio', 'Psych Studios');
UPDATE policies SET body = replace(body, 'Psych Studio', 'Psych Studios');
UPDATE faqs SET answer = replace(answer, 'Psych Studio', 'Psych Studios');
UPDATE announcements SET body = replace(body, 'Psych Studio', 'Psych Studios');

UPDATE content SET value = 'Psych Studios' WHERE key = 'business_name';
UPDATE content SET value = 'Psych Studios Limited' WHERE key = 'legal_name';
UPDATE content SET value = '+234 906 744 9860' WHERE key = 'contact_phone';
UPDATE content SET value = '2349067449860' WHERE key = 'whatsapp';
UPDATE content SET value = 'Plot 39, Bethel Court Estate, Awka, Awka South Local Government Area, Anambra State' WHERE key = 'studio_address';
UPDATE content SET value = 'Plot 39, Bethel Court Estate, Awka, Awka South Local Government Area, Anambra State' WHERE key = 'map_query';
UPDATE content SET value = 'Open Monday to Saturday, 10:00am to 7:00pm. Closed Sunday.' WHERE key = 'hours_note';
UPDATE content SET value = 'Music recording, video production, podcasts and photography, all under one roof. Book one-hour sessions or reserve consecutive hours online.' WHERE key = 'hero_subtitle';
UPDATE content SET value = 'Psych Studios brings music, video, podcast and photography production together. Book one-hour sessions or request a project quote.' WHERE key = 'footer_blurb';
UPDATE content SET value = 'Psych Studios | Music, video, podcast and photography' WHERE key = 'seo_title';
UPDATE content SET value = 'Book one-hour music, video, podcast and photography sessions at Psych Studios in Awka, Anambra State.' WHERE key = 'seo_description';

UPDATE opening_hours SET is_open = 1, open_min = 600, close_min = 1140 WHERE weekday BETWEEN 1 AND 6;
UPDATE opening_hours SET is_open = 0, open_min = 600, close_min = 1140 WHERE weekday = 0;
UPDATE rooms SET hourly_kobo = 4000000 WHERE id IN ('room_studio_a', 'room_stage');

UPDATE categories SET bookable = 1 WHERE slug IN ('music', 'video', 'podcast', 'photo');

UPDATE services SET price_label = '₦40,000 / hour', duration_label = '1 hour per session', details = 'Book one hour or reserve multiple consecutive hours in Studio A. Your engineer handles setup, recording and a clean session file, with song arrangement included.' WHERE slug = 'recording';
UPDATE services SET price_label = '₦20,000 / hour', duration_label = '1 hour per session' WHERE slug = 'podcast-recording';
UPDATE services SET price_label = '₦85,000 / episode', duration_label = '1 hour per episode' WHERE slug = 'video-podcast';
UPDATE services SET price_label = 'From ₦35,000 / hour', duration_label = '1 hour per session' WHERE slug = 'artist-portraits';
UPDATE services SET price_label = '₦40,000 / hour', duration_label = '1 hour per session' WHERE slug = 'interviews';
UPDATE services SET duration_label = 'By project' WHERE slug IN ('music-videos', 'commercial-video', 'product-photography', 'social-content', 'reels');

UPDATE packages SET name = 'Recording session, 1 hour', description = 'One hour in Studio A with an engineer. Add consecutive hours when you book.', duration_min = 60, price_kobo = 4000000, service_slug = 'recording', scheduling = 'flex', unit = 'per hour' WHERE slug = 'recording-session';
UPDATE packages SET name = 'Podcast session, 1 hour', description = 'One hour in the Podcast Room for up to four guests, with an engineer and separate tracks.', service_slug = 'podcast-recording', scheduling = 'flex', unit = 'per hour' WHERE slug = 'podcast-hour';
UPDATE packages SET name = 'Video podcast session, 1 hour', description = 'One hour in the Podcast Room with three cameras, live switching and a finished episode.', duration_min = 60, service_slug = 'video-podcast', scheduling = 'flex', unit = 'per episode' WHERE slug = 'video-podcast-2-hour';
UPDATE packages SET name = 'Stage hire, 1 hour', description = 'One hour on The Stage with lighting and a studio technician. Add consecutive hours when you book.', duration_min = 60, price_kobo = 4000000, service_slug = 'interviews', scheduling = 'flex', unit = 'per hour', requires_approval = 0 WHERE slug = 'stage-half-day';
UPDATE packages SET name = 'Photography session, 1 hour', description = 'One hour with a photographer and lighting on the cyclorama, with 15 retouched images.', duration_min = 60, price_kobo = 3500000, service_slug = 'artist-portraits', scheduling = 'flex', unit = 'per hour' WHERE slug = 'photo-session-2-hour';
UPDATE packages SET service_slug = 'music-videos' WHERE slug = 'music-video';
UPDATE packages SET service_slug = 'commercial-video' WHERE slug = 'corporate-video';
UPDATE packages SET service_slug = 'social-content' WHERE slug = 'content-day';

UPDATE packages SET pricing = 'quote', price_kobo = 0, featured = 0, price_note = 'Priced per project', description = 'A full-production project planned around your brief and schedule.' WHERE slug = 'full-production';
UPDATE session_slots SET active = 0 WHERE kind = 'night';

UPDATE policies SET body = 'Book one-hour sessions Monday to Saturday, between 10:00am and 7:00pm. You may reserve consecutive hours in one booking. The studio is closed on Sundays.' WHERE slug = 'sessions';
UPDATE faqs SET answer = 'Book a one-hour session or reserve consecutive hours in one booking. Choose your service, package and an available time from Monday to Saturday.' WHERE id = 'faq_1';
UPDATE faqs SET answer = 'The studio is open Monday to Saturday, 10:00am to 7:00pm. Sessions are booked in one-hour units, and Sunday is closed.' WHERE id = 'faq_2';
UPDATE faqs SET answer = 'Recording is ₦40,000 per hour, podcast sessions are ₦20,000 per hour, stage hire is ₦40,000 per hour and photography sessions are ₦35,000 per hour. Video podcasts and project work are priced as shown or by quote.' WHERE id = 'faq_3';

UPDATE page_meta SET description = 'Music, video, podcast and photography services with one-hour sessions, clear prices and online booking.' WHERE path = '/services';
UPDATE page_meta SET description = 'One-hour music, podcast, video and photography sessions, project pricing and booking policies.' WHERE path = '/packages';
UPDATE page_meta SET description = 'Choose a service, book one-hour sessions or reserve consecutive hours, and see live availability.' WHERE path = '/book';
UPDATE page_meta SET description = 'Contact Psych Studios in Awka, Anambra State by phone or WhatsApp.' WHERE path = '/contact';