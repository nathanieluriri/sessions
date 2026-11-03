-- Migration 0011: Website updates for pricing, content, and descriptions

-- 1. Song Cover price update to ₦180,000
UPDATE packages SET price_kobo = 18000000 WHERE slug = 'song-cover';
UPDATE services SET price_label = '₦180,000 / song' WHERE slug = 'song-covers';

-- 2. Remove Artist Development from all pages
UPDATE services SET active = 0 WHERE slug = 'artist-development';
UPDATE packages SET active = 0 WHERE slug = 'artist-development-programme';

-- 3. Update Music & Audio descriptions
UPDATE services SET description = 'Record your vocals over an existing beat in our professional studio. Includes a 2-hour session; mixing and mastering are not included.' WHERE slug = 'recording';
UPDATE packages SET description = 'Record your vocals over an existing beat in our professional studio. Includes a 2-hour session; mixing and mastering are not included.' WHERE slug = 'recording-session';

UPDATE services SET description = 'Get a custom instrumental tailored to your sound. Recording, mixing and mastering are excluded.' WHERE slug = 'beat-production';
UPDATE packages SET description = 'Get a custom instrumental tailored to your sound. Recording, mixing and mastering are excluded.' WHERE slug = 'beat-production';

UPDATE services SET description = 'Have your song professionally mixed and mastered for a polished, balanced, release-ready sound.' WHERE slug = 'mixing-mastering';
UPDATE packages SET description = 'Have your song professionally mixed and mastered for a polished, balanced, release-ready sound.' WHERE slug IN ('mixing-mastering-standard', 'mixing-mastering-express');

UPDATE services SET description = 'A complete package featuring a 6-hour recording session, custom instrumental, mixing and mastering.' WHERE slug = 'full-production';
UPDATE packages SET description = 'A complete package featuring a 6-hour recording session, custom instrumental, mixing and mastering.' WHERE slug = 'full-production';

UPDATE services SET description = 'Record your version of your favourite songs in our professional studio, with quality vocal recording and production support.' WHERE slug = 'song-covers';
UPDATE packages SET description = 'Record your version of your favourite songs in our professional studio, with quality vocal recording and production support.' WHERE slug = 'song-cover';

-- 4. Update highlighted section on Video & Photography homepage / catalog
-- Photography: ₦40,000 per photo; Podcast studio: ₦60,000 per hour
UPDATE services SET price_label = 'From ₦60,000 / hr' WHERE slug = 'podcast-recording';
UPDATE packages SET price_kobo = 6000000 WHERE slug = 'podcast-hour';

UPDATE rooms SET hourly_kobo = 4000000 WHERE id = 'room_stage';
UPDATE services SET price_label = '₦40,000 / photo' WHERE slug = 'artist-portraits';
UPDATE packages SET price_kobo = 4000000, description = 'Photography session with a photographer and lighting on the cyclorama, ₦40,000 per photo.' WHERE slug = 'photo-session-2-hour';

UPDATE faqs SET answer = 'Recording is ₦40,000 per hour, podcast sessions are ₦60,000 per hour, stage hire is ₦40,000 per hour and photography is ₦40,000 per photo. Song covers are ₦180,000. Video podcasts and project work are priced as shown or by quote.' WHERE id = 'faq_3';

-- 5. Update EP & LP packages (prices and includes)
UPDATE services SET price_label = '₦3,500,000', image_url = '/media/ep-package.jpeg', description = 'Complete extended play production package including all 10 key production, distribution and marketing add-ons.' WHERE slug = 'produce-ep';
UPDATE packages SET price_kobo = 350000000,
  scheduling = 'project', requires_approval = 0,
  description = '4-6 Track Complete Extended Play Production. All 10 key production, distribution and marketing add-ons included.',
  includes = '["Full Music Production — Beat-making, arrangement, and sound design", "Professional Recording — Studio recording sessions and vocal comping", "Mixing & Mastering — Professional finishing for all tracks", "EP Artwork Design — Front cover, back cover, and tracklist", "Digital Music Distribution — Release on major streaming platforms", "PR Campaign — Press releases, media outreach, and publicity", "Digital Marketing & Promotion — Social media campaigns and targeted advertising", "Artist Branding & EPK — Artist biography, press photos, and professional profile", "Release Strategy & Playlist Pitching — Release planning, pre-save campaign, and eligible playlist submissions", "Metadata & Credits Management — Track information, producer credits, songwriter details, and release documentation"]'
WHERE slug = 'produce-ep';

UPDATE services SET price_label = '₦8,000,000', image_url = '/media/lp-package.jpeg', description = 'Complete 10-14 track album production package including all 20 key production, distribution and marketing add-ons.' WHERE slug = 'produce-album';
UPDATE packages SET price_kobo = 800000000,
  scheduling = 'project', requires_approval = 0,
  description = '10-14 Track Complete Album Production. All 20 key production, distribution and marketing add-ons included.',
  includes = '["Full Album Music Production — Beat-making, arrangement, and sound design for the album", "Professional Recording Sessions — Dedicated studio time for all tracks", "Mixing & Mastering — Professional mixing and mastering for every song", "Album Artwork & Packaging — Front cover, back cover, spine, and tracklist design", "Digital Music Distribution — Delivery to major streaming platforms", "PR & Media Campaign — Press releases, interviews, and media outreach", "Digital Marketing Campaign — Targeted advertising and social media promotion", "Artist Branding & Creative Direction — Cohesive image, visuals, and album identity", "Professional Artist Photoshoot — Promotional and press photography", "Electronic Press Kit (EPK) — Artist biography, photos, and project information", "Playlist Pitching — Submissions to eligible editorial and independent playlists", "Influencer & Creator Marketing — Promotional collaborations with relevant creators", "Social Media Content Package — Teasers, countdowns, reels, and behind-the-scenes content", "Metadata, Credits & Rights Documentation — Track credits, songwriter details, and split-sheet coordination", "Post-Release Analytics & Marketing — Performance reporting and follow-up promotional strategy", "Featured Artist Coordination — Assistance coordinating guest appearances", "Songwriting & Composition Support — Assistance with lyrics, melodies, and song development", "Vocal Tuning & Enhancement — Detailed pitch correction and vocal cleanup", "Instrumental & Clean Versions — Instrumentals, radio edits, and alternate versions", "Project Files & Stems Delivery — Organized delivery of agreed masters, stems, and instrumental files"]'
WHERE slug = 'produce-album';

-- Remove "Price on request" extras from exclusive packages since all add-ons are included in package price
UPDATE extras SET active = 0 WHERE category = 'exclusive';
