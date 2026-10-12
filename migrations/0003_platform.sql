-- Psych Records Entertainment platform: rooms, deposits, approvals, content and SEO.
-- D1 cannot switch foreign keys off, so referenced tables are rebuilt by copying to a temp table,
-- dropping, recreating and re-inserting. The re-insert clears the deferred violations the drop creates.
PRAGMA defer_foreign_keys = on;

CREATE TABLE rooms (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  capacity INTEGER NOT NULL DEFAULT 6,
  hourly_kobo INTEGER NOT NULL DEFAULT 0,
  features TEXT NOT NULL DEFAULT '[]',
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE categories (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  blurb TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE services ADD COLUMN category TEXT NOT NULL DEFAULT 'music';
ALTER TABLE services ADD COLUMN details TEXT NOT NULL DEFAULT '';
ALTER TABLE services ADD COLUMN deliverables TEXT NOT NULL DEFAULT '[]';
ALTER TABLE services ADD COLUMN duration_label TEXT NOT NULL DEFAULT '';
ALTER TABLE services ADD COLUMN gallery TEXT NOT NULL DEFAULT '[]';

ALTER TABLE packages ADD COLUMN service_category TEXT NOT NULL DEFAULT 'music';
ALTER TABLE packages ADD COLUMN room_id TEXT REFERENCES rooms(id);
ALTER TABLE packages ADD COLUMN pricing TEXT NOT NULL DEFAULT 'fixed';
ALTER TABLE packages ADD COLUMN deposit_percent INTEGER;
ALTER TABLE packages ADD COLUMN requires_approval INTEGER NOT NULL DEFAULT 0;
ALTER TABLE packages ADD COLUMN price_note TEXT NOT NULL DEFAULT '';

ALTER TABLE extras ADD COLUMN category TEXT NOT NULL DEFAULT '';

ALTER TABLE holds ADD COLUMN room_id TEXT REFERENCES rooms(id);
ALTER TABLE blocked_periods ADD COLUMN room_id TEXT REFERENCES rooms(id);

ALTER TABLE enquiries ADD COLUMN kind TEXT NOT NULL DEFAULT 'general';
ALTER TABLE enquiries ADD COLUMN service TEXT NOT NULL DEFAULT '';
ALTER TABLE enquiries ADD COLUMN budget TEXT NOT NULL DEFAULT '';
ALTER TABLE enquiries ADD COLUMN timeline TEXT NOT NULL DEFAULT '';
ALTER TABLE enquiries ADD COLUMN links TEXT NOT NULL DEFAULT '';

ALTER TABLE policies ADD COLUMN kind TEXT NOT NULL DEFAULT 'booking';

CREATE TABLE portfolio (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'music',
  client TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  embed_url TEXT NOT NULL DEFAULT '',
  link_url TEXT NOT NULL DEFAULT '',
  year TEXT NOT NULL DEFAULT '',
  featured INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE team (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE equipment (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  room_id TEXT REFERENCES rooms(id),
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE gallery (
  id TEXT PRIMARY KEY,
  image_url TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  room_id TEXT REFERENCES rooms(id),
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE testimonials (
  id TEXT PRIMARY KEY,
  quote TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '',
  featured INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE faqs (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE announcements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  link_label TEXT NOT NULL DEFAULT '',
  link_url TEXT NOT NULL DEFAULT '',
  starts_on TEXT,
  ends_on TEXT,
  published INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE page_meta (
  path TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT ''
);

CREATE TABLE uploads (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  uploaded_by TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO rooms (id, slug, name, kind, description, image_url, capacity, hourly_kobo, features, sort) VALUES ('room_studio_a', 'studio-a', 'Studio A', 'Recording room and control room', 'A tracking room and a separate control room with a treated vocal booth. Built for vocals, bands of up to six and long creative sessions.', 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=1400&q=70&auto=format&fit=crop', 6, 2000000, '["Treated vocal booth", "Separate control room", "Engineer included", "Lounge seating for guests"]', 0);
INSERT INTO rooms (id, slug, name, kind, description, image_url, capacity, hourly_kobo, features, sort) VALUES ('room_studio_b', 'studio-b', 'Studio B', 'Production suite', 'A compact production room for beat making, writing sessions, editing and mix revisions.', 'https://images.unsplash.com/photo-1741745977996-d9d9047f98db?w=1400&q=70&auto=format&fit=crop', 4, 1500000, '["Producer workstation", "Keys and pads", "Near-field monitoring", "Vocal mic on request"]', 1);
INSERT INTO rooms (id, slug, name, kind, description, image_url, capacity, hourly_kobo, features, sort) VALUES ('room_podcast', 'podcast-room', 'Podcast Room', 'Audio and video podcast set', 'A dressed set for up to four guests with broadcast microphones and three cameras for video podcasts.', 'https://images.unsplash.com/photo-1559523161-0fc0d8b38a7a?w=1400&q=70&auto=format&fit=crop', 4, 2000000, '["Four broadcast mics", "Three camera angles", "Live switching", "Separate track per guest"]', 2);
INSERT INTO rooms (id, slug, name, kind, description, image_url, capacity, hourly_kobo, features, sort) VALUES ('room_stage', 'the-stage', 'The Stage', 'Video and photo studio', 'An open studio with a white cyclorama, blackout and a full lighting package for music videos, photo shoots and interviews.', 'https://images.unsplash.com/photo-1612544409025-e1f6a56c1152?w=1400&q=70&auto=format&fit=crop', 12, 4000000, '["White cyclorama", "Blackout curtains", "Continuous and strobe lighting", "Makeup and changing area"]', 3);
INSERT INTO categories (slug, name, blurb, sort) VALUES ('music', 'Music and audio', 'Recording, production, arrangement, mixing and mastering with engineers who care about the record.', 0);
INSERT INTO categories (slug, name, blurb, sort) VALUES ('video', 'Video production', 'Music videos, commercials, interviews and post-production, shot on our stage or on location.', 1);
INSERT INTO categories (slug, name, blurb, sort) VALUES ('podcast', 'Podcast production', 'Audio and multi-camera video podcasts, recorded, edited and ready to publish.', 2);
INSERT INTO categories (slug, name, blurb, sort) VALUES ('photo', 'Photography and content', 'Portraits, product shoots and social content made in a lit studio built for it.', 3);
UPDATE services SET category = 'music', sort = 0, details = 'Your session runs in Studio A with an engineer at the desk from setup to bounce. We comp takes as you go, keep a clean session file and send everything by download link.', deliverables = '["Raw vocal and instrument stems", "Comped takes", "A rough mix to take home"]', duration_label = '1 hour to a full day' WHERE slug = 'vocal-recording';
UPDATE services SET category = 'music', sort = 1, details = 'Work with an in-house producer in Studio B to build a beat from scratch or finish one you started. Bring references and leave with stems.', deliverables = '["Beat in WAV and MP3", "Stems for mixing", "Usage terms in writing"]', duration_label = 'About 3 hours per beat' WHERE slug = 'beat-production';
UPDATE services SET category = 'music', sort = 3, details = 'Send your stems or record with us first. We balance, shape and polish every part so the record translates on phones, cars and clubs.', deliverables = '["Stereo mix in WAV", "Two rounds of revisions", "Instrumental and acapella on request"]', duration_label = '3 to 5 working days' WHERE slug = 'mixing';
UPDATE services SET category = 'music', sort = 4, details = 'Final loudness, tone and polish for streaming, radio and DJs, checked against your references.', deliverables = '["Streaming master in WAV", "MP3 for previews", "One round of revisions"]', duration_label = '2 working days' WHERE slug = 'mastering';
UPDATE services SET category = 'music', sort = 5, name = 'Audio editing and vocal comping', details = 'Timing, tuning, comping and clean-up on recorded vocals and instruments, natural or hard-tuned.', deliverables = '["Edited stems", "Tuned lead and backing vocals"]', duration_label = '1 to 2 working days' WHERE slug = 'vocal-editing';
UPDATE services SET category = 'music', sort = 6, details = 'Ads, narration, IVR, audiobooks and dubbing, recorded in the booth with a director on talkback.', deliverables = '["Edited takes in WAV", "Timed to picture on request"]', duration_label = '1 hour and up' WHERE slug = 'voice-over';
UPDATE services SET category = 'podcast', sort = 20, name = 'Podcast studio hire', description = 'Record up to four guests on broadcast mics, each on a separate track.', details = 'Book the Podcast Room with an engineer to run levels and record every voice on its own track. Add cameras for a video podcast.', deliverables = '["Separate WAV track per guest", "A clean stereo mix", "Files the same day"]', duration_label = '1 hour and up' WHERE slug = 'podcast-recording';
INSERT INTO services (id, slug, name, description, price_label, image_url, sort, category, details, deliverables, duration_label) VALUES ('svc_song_arrangement', 'song-arrangement', 'Song arrangement and composition', 'Shape a demo into a finished arrangement, or write from scratch with our musicians and producers.', 'From ₦50,000 / song', 'https://images.unsplash.com/photo-1611093791822-15086535830b?w=1400&q=70&auto=format&fit=crop', 2, 'music', 'We map the structure, write parts and bring in session players where the song needs them, so you walk into tracking with a plan.', '["Arrangement map", "Demo with new parts", "Session players booked if needed"]', '1 to 3 sessions');
INSERT INTO services (id, slug, name, description, price_label, image_url, sort, category, details, deliverables, duration_label) VALUES ('svc_artist_development', 'artist-development', 'Artist development', 'Guidance on sound, recording, release planning and visuals for emerging artists.', 'Priced per programme', 'https://images.unsplash.com/photo-1604513843888-824303218a45?w=1400&q=70&auto=format&fit=crop', 7, 'music', 'A structured programme with our producers and creative team covering your sound, recording habits, release plan and visual identity.', '["Sound and brand review", "Recording plan", "Release and content calendar"]', '4 to 12 weeks');
INSERT INTO services (id, slug, name, description, price_label, image_url, sort, category, details, deliverables, duration_label) VALUES ('svc_music_videos', 'music-videos', 'Music videos', 'Concept, shoot and edit for performance and narrative videos, on our stage or on location.', 'Quote per project', 'https://images.unsplash.com/photo-1594394489098-74ac04c0fc2e?w=1400&q=70&auto=format&fit=crop', 10, 'video', 'From treatment to final grade. We plan the shoot with you, light the stage or scout locations, shoot with a small crew and deliver an edit ready for YouTube and socials.', '["Treatment and shot list", "Edited video in 4K and 1080p", "Vertical cut-downs for socials"]', '2 to 4 weeks from the shoot');
INSERT INTO services (id, slug, name, description, price_label, image_url, sort, category, details, deliverables, duration_label) VALUES ('svc_commercial_video', 'commercial-video', 'Promotional, commercial and corporate videos', 'Brand films, adverts, product launches and company profiles.', 'Quote per project', 'https://images.unsplash.com/photo-1632187981988-40f3cbaeef5e?w=1400&q=70&auto=format&fit=crop', 11, 'video', 'We work from your brief and brand guide to script, shoot and finish videos that sell, explain or introduce your business.', '["Script and storyboard", "Final video in agreed formats", "Licensed music"]', '2 to 6 weeks');
INSERT INTO services (id, slug, name, description, price_label, image_url, sort, category, details, deliverables, duration_label) VALUES ('svc_interviews', 'interviews', 'Interviews and visual storytelling', 'Documentary-style interviews, testimonials and short stories, lit and miked properly.', 'From ₦150,000', 'https://images.unsplash.com/photo-1515634928627-2a4e0dae3ddf?w=1400&q=70&auto=format&fit=crop', 12, 'video', 'Two-camera interviews on our set or on location with lavalier and boom audio, edited into a story with b-roll and captions.', '["Two-camera edit", "Captions", "Raw footage on request"]', 'Half-day shoot, 1 week edit');
INSERT INTO services (id, slug, name, description, price_label, image_url, sort, category, details, deliverables, duration_label) VALUES ('svc_video_post', 'video-post', 'Video editing, colour grading and post-production', 'Bring your footage. We cut, grade, mix and deliver.', 'From ₦40,000 / hr', 'https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?w=1400&q=70&auto=format&fit=crop', 13, 'video', 'Editing, colour grading, sound mix, motion titles and exports for every platform, in a calibrated suite.', '["Graded master", "Platform exports", "Project files on request"]', 'By the hour or per project');
INSERT INTO services (id, slug, name, description, price_label, image_url, sort, category, details, deliverables, duration_label) VALUES ('svc_bts_content', 'bts-content', 'Behind-the-scenes and promotional content', 'Studio vlogs, rollout teasers and behind-the-scenes clips from your sessions.', 'From ₦60,000', 'https://images.unsplash.com/photo-1560785219-cc81ab373cd3?w=1400&q=70&auto=format&fit=crop', 14, 'video', 'A shooter joins your session or shoot and turns it into short clips for your rollout.', '["3 to 5 short clips", "Vertical and square formats"]', 'Delivered in 3 working days');
INSERT INTO services (id, slug, name, description, price_label, image_url, sort, category, details, deliverables, duration_label) VALUES ('svc_video_podcast', 'video-podcast', 'Multi-camera podcast production', 'Three cameras, live switching and a finished episode ready to publish.', 'From ₦85,000 / episode', 'https://images.unsplash.com/photo-1471341971476-ae15ff5dd4ea?w=1400&q=70&auto=format&fit=crop', 21, 'podcast', 'We record every guest on camera and on their own mic, switch angles live and hand you a finished episode plus clips.', '["Full episode video", "Audio-only master", "3 short clips"]', '2 hours per episode');
INSERT INTO services (id, slug, name, description, price_label, image_url, sort, category, details, deliverables, duration_label) VALUES ('svc_podcast_editing', 'podcast-editing', 'Podcast editing and post-production', 'Clean-up, edits, levelling, music and show notes.', 'From ₦25,000 / episode', 'https://images.unsplash.com/photo-1668605335684-c97ce92cbd76?w=1400&q=70&auto=format&fit=crop', 22, 'podcast', 'Send your raw tracks or record with us. We remove mistakes and noise, balance voices, add music and master to podcast loudness.', '["Edited episode in MP3 and WAV", "Show notes", "Chapter markers"]', '2 to 3 working days');
INSERT INTO services (id, slug, name, description, price_label, image_url, sort, category, details, deliverables, duration_label) VALUES ('svc_podcast_intros', 'podcast-intros', 'Podcast intros, outros and sound design', 'Theme music, voiced intros and branded audio for your show.', 'From ₦40,000', 'https://images.unsplash.com/photo-1615458318132-1f151a3d18f4?w=1400&q=70&auto=format&fit=crop', 23, 'podcast', 'Original or licensed theme music, voiced intros and outros, and stings that make your show recognisable.', '["Intro and outro", "Stings and transitions", "Stems"]', '3 to 5 working days');
INSERT INTO services (id, slug, name, description, price_label, image_url, sort, category, details, deliverables, duration_label) VALUES ('svc_artist_portraits', 'artist-portraits', 'Studio photography and artist portraits', 'Press shots, cover art and portraits on the cyclorama or a styled set.', 'From ₦70,000', 'https://images.unsplash.com/photo-1641236210747-48bc43e4517f?w=1400&q=70&auto=format&fit=crop', 30, 'photo', 'A photographer, lighting and set for press photos, cover art and profile shots, with retouched selects delivered fast.', '["15 retouched images", "Full gallery to choose from", "Web and print sizes"]', '2 hours, delivered in 3 days');
INSERT INTO services (id, slug, name, description, price_label, image_url, sort, category, details, deliverables, duration_label) VALUES ('svc_product_photography', 'product-photography', 'Brand and product photography', 'Clean packshots, lifestyle setups and campaign images for your products.', 'Quote per project', 'https://images.unsplash.com/photo-1768076955015-dd4f057e96f6?w=1400&q=70&auto=format&fit=crop', 31, 'photo', 'Packshots on white, styled flat lays and campaign images, lit and retouched for e-commerce and ads.', '["Retouched product images", "White background and styled sets", "Marketplace sizes"]', 'Half or full day');
INSERT INTO services (id, slug, name, description, price_label, image_url, sort, category, details, deliverables, duration_label) VALUES ('svc_social_content', 'social-content', 'Social media content production', 'A day of photos and short videos planned around your content calendar.', 'From ₦250,000 / day', 'https://images.unsplash.com/photo-1611784728558-6c7d9b409cdf?w=1400&q=70&auto=format&fit=crop', 32, 'photo', 'We plan a shot list around your calendar, shoot photos and short videos in one day and deliver ready-to-post assets.', '["Planned shot list", "20 edited photos", "6 short videos"]', '1 day, delivered in 5 days');
INSERT INTO services (id, slug, name, description, price_label, image_url, sort, category, details, deliverables, duration_label) VALUES ('svc_reels', 'reels', 'Interviews, reels and short-form video', 'Vertical video for Instagram, TikTok and YouTube Shorts, shot and cut for the feed.', 'From ₦80,000', 'https://images.unsplash.com/photo-1587050265310-1a2d98ccce5f?w=1400&q=70&auto=format&fit=crop', 33, 'photo', 'Short interviews, talking heads and performance clips shot vertically with captions and on-trend edits.', '["5 edited reels", "Captions", "Cover frames"]', 'Half-day shoot');
UPDATE packages SET room_id = 'room_studio_a', service_category = 'music';
UPDATE packages SET deposit_percent = 0 WHERE slug = '1-hour';
UPDATE packages SET requires_approval = 1, description = 'A full-day lockout for EPs, groups and long projects. Sent as a request for studio approval.' WHERE slug = 'full-day';
INSERT INTO packages (id, slug, name, description, category, duration_min, price_kobo, includes, featured, active, sort, service_category, room_id, pricing, deposit_percent, requires_approval, price_note) VALUES ('pkg_production_3_hour', 'production-3-hour', 'Production Session, 3 Hours', 'Beat making or writing with a producer in Studio B.', 'session', 180, 6000000, '["Producer included", "Studio B production suite", "Stems and bounce at the end"]', 0, 1, 6, 'music', 'room_studio_b', 'fixed', NULL, 0, '');
INSERT INTO packages (id, slug, name, description, category, duration_min, price_kobo, includes, featured, active, sort, service_category, room_id, pricing, deposit_percent, requires_approval, price_note) VALUES ('pkg_podcast_hour', 'podcast-hour', 'Podcast Hour', 'Audio podcast for up to four guests, each on their own track.', 'session', 60, 2000000, '["Engineer included", "Four broadcast mics", "Files the same day"]', 0, 1, 10, 'podcast', 'room_podcast', 'fixed', 0, 0, '');
INSERT INTO packages (id, slug, name, description, category, duration_min, price_kobo, includes, featured, active, sort, service_category, room_id, pricing, deposit_percent, requires_approval, price_note) VALUES ('pkg_video_podcast_2_hour', 'video-podcast-2-hour', 'Video Podcast, 2 Hours', 'Three cameras, live switching and a finished episode.', 'post', 120, 8500000, '["Three camera angles", "Edited episode and audio master", "3 short clips"]', 0, 1, 11, 'podcast', 'room_podcast', 'fixed', NULL, 0, '');
INSERT INTO packages (id, slug, name, description, category, duration_min, price_kobo, includes, featured, active, sort, service_category, room_id, pricing, deposit_percent, requires_approval, price_note) VALUES ('pkg_stage_half_day', 'stage-half-day', 'Stage Hire, Half Day', 'The Stage with lighting and a technician for shoots and interviews. Sent as a request for studio approval.', 'session', 240, 15000000, '["Cyclorama and blackout", "Lighting package", "Studio technician"]', 0, 1, 20, 'video', 'room_stage', 'fixed', NULL, 1, '');
INSERT INTO packages (id, slug, name, description, category, duration_min, price_kobo, includes, featured, active, sort, service_category, room_id, pricing, deposit_percent, requires_approval, price_note) VALUES ('pkg_music_video', 'music-video', 'Music Video Production', 'Treatment, shoot and edit, priced to your concept.', 'post', 480, 0, '["Treatment and shot list", "Crew and lighting", "4K edit and social cut-downs"]', 0, 1, 21, 'video', NULL, 'quote', NULL, 1, 'Typically ₦800,000 to ₦3,000,000');
INSERT INTO packages (id, slug, name, description, category, duration_min, price_kobo, includes, featured, active, sort, service_category, room_id, pricing, deposit_percent, requires_approval, price_note) VALUES ('pkg_corporate_video', 'corporate-video', 'Commercial and Corporate Video', 'Scripted brand films, adverts and company profiles.', 'post', 480, 0, '["Script and storyboard", "Shoot and edit", "Licensed music"]', 0, 1, 22, 'video', NULL, 'quote', NULL, 1, 'Priced per project');
INSERT INTO packages (id, slug, name, description, category, duration_min, price_kobo, includes, featured, active, sort, service_category, room_id, pricing, deposit_percent, requires_approval, price_note) VALUES ('pkg_photo_session_2_hour', 'photo-session-2-hour', 'Photo Session, 2 Hours', 'Portraits or press shots with a photographer on the cyclorama.', 'session', 120, 7000000, '["Photographer and lighting", "15 retouched images", "Delivered in 3 days"]', 0, 1, 30, 'photo', 'room_stage', 'fixed', NULL, 0, '');
INSERT INTO packages (id, slug, name, description, category, duration_min, price_kobo, includes, featured, active, sort, service_category, room_id, pricing, deposit_percent, requires_approval, price_note) VALUES ('pkg_content_day', 'content-day', 'Content Day', 'A full day of photos and short videos for your channels. Sent as a request for studio approval.', 'post', 480, 25000000, '["Planned shot list", "20 photos and 6 short videos", "Delivered in 5 days"]', 0, 1, 31, 'photo', 'room_stage', 'fixed', NULL, 1, '');
UPDATE extras SET category = 'music';
INSERT INTO extras (id, slug, name, price_kobo, active, category) VALUES ('ext_episode_edit', 'episode-edit', 'Full episode edit', 2500000, 1, 'podcast');
INSERT INTO extras (id, slug, name, price_kobo, active, category) VALUES ('ext_makeup_artist', 'makeup-artist', 'Makeup artist', 3000000, 1, 'photo');
INSERT INTO extras (id, slug, name, price_kobo, active, category) VALUES ('ext_extra_retouches', 'extra-retouches', '10 extra retouched images', 2000000, 1, 'photo');
INSERT INTO extras (id, slug, name, price_kobo, active, category) VALUES ('ext_bts_clips', 'bts-clips', 'Behind-the-scenes clips', 4000000, 1, 'video');

CREATE TABLE bookings_tmp AS SELECT * FROM bookings;
DROP TABLE bookings;
CREATE TABLE bookings (
  id TEXT PRIMARY KEY,
  ref TEXT NOT NULL UNIQUE,
  user_id TEXT REFERENCES users(id),
  hold_id TEXT UNIQUE REFERENCES holds(id),
  room_id TEXT REFERENCES rooms(id),
  room_name TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  service_name TEXT NOT NULL,
  package_id TEXT NOT NULL,
  package_name TEXT NOT NULL,
  package_price_kobo INTEGER NOT NULL,
  extras TEXT NOT NULL DEFAULT '[]',
  total_kobo INTEGER NOT NULL,
  deposit_kobo INTEGER NOT NULL DEFAULT 0,
  amount_paid_kobo INTEGER NOT NULL DEFAULT 0,
  refunded_kobo INTEGER NOT NULL DEFAULT 0,
  date TEXT NOT NULL,
  start_min INTEGER NOT NULL,
  end_min INTEGER NOT NULL,
  people INTEGER NOT NULL,
  artist_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  project TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  reference_links TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'confirmed', 'completed', 'cancelled', 'no_show', 'rejected')),
  source TEXT NOT NULL DEFAULT 'online',
  created_by TEXT,
  pay_token TEXT,
  expires_at TEXT,
  decided_by TEXT,
  decided_at TEXT,
  decision_note TEXT NOT NULL DEFAULT '',
  cancel_reason TEXT NOT NULL DEFAULT '',
  rescheduled_at TEXT,
  reminder_sent_at TEXT,
  policy_version INTEGER NOT NULL,
  reschedules_used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
INSERT INTO bookings (id, ref, user_id, hold_id, room_id, room_name, category, service_name, package_id, package_name, package_price_kobo, extras, total_kobo,
  deposit_kobo, amount_paid_kobo, refunded_kobo, date, start_min, end_min, people, artist_name, contact_name, contact_email, contact_phone, notes,
  status, source, policy_version, reschedules_used, created_at, updated_at)
SELECT b.id, b.ref, b.user_id, b.hold_id, 'room_studio_a', 'Studio A', 'music', b.service_name, b.package_id, b.package_name, b.package_price_kobo, b.extras, b.total_kobo,
  0,
  COALESCE((SELECT SUM(p.amount_kobo) FROM payments p WHERE p.booking_id = b.id AND p.status IN ('success', 'refunded')), 0),
  COALESCE((SELECT SUM(r.amount_kobo) FROM refunds r WHERE r.booking_id = b.id), 0),
  b.date, b.start_min, b.end_min, b.people, b.artist_name, b.contact_name, b.contact_email, b.contact_phone, b.notes,
  b.status, 'online', b.policy_version, b.reschedules_used, b.created_at, b.updated_at
FROM bookings_tmp b;
DROP TABLE bookings_tmp;
CREATE INDEX idx_bookings_date ON bookings (date, status);
CREATE INDEX idx_bookings_user ON bookings (user_id);
CREATE INDEX idx_bookings_room ON bookings (room_id, date);
CREATE INDEX idx_bookings_email ON bookings (contact_email);

CREATE TABLE payments_tmp AS SELECT * FROM payments;
DROP TABLE payments;
CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  hold_id TEXT REFERENCES holds(id),
  booking_id TEXT REFERENCES bookings(id),
  user_id TEXT REFERENCES users(id),
  amount_kobo INTEGER NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('paystack', 'demo', 'manual')),
  kind TEXT NOT NULL DEFAULT 'full' CHECK (kind IN ('full', 'deposit', 'balance', 'manual')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'success', 'failed', 'refunded')),
  channel TEXT,
  verified_via TEXT,
  note TEXT NOT NULL DEFAULT '',
  recorded_by TEXT,
  refunded_kobo INTEGER NOT NULL DEFAULT 0,
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
INSERT INTO payments (id, reference, hold_id, booking_id, user_id, amount_kobo, provider, kind, status, channel, verified_via, refunded_kobo, paid_at, created_at)
SELECT p.id, p.reference, p.hold_id, p.booking_id, p.user_id, p.amount_kobo, p.provider, 'full', p.status, p.channel, p.verified_via,
  COALESCE((SELECT SUM(r.amount_kobo) FROM refunds r WHERE r.payment_id = p.id), 0), p.paid_at, p.created_at
FROM payments_tmp p;
DROP TABLE payments_tmp;
CREATE INDEX idx_payments_booking ON payments (booking_id);
CREATE INDEX idx_payments_user ON payments (user_id);

UPDATE holds SET room_id = 'room_studio_a' WHERE room_id IS NULL;

INSERT INTO team (id, name, role, bio, image_url, sort) VALUES ('team_1', 'Tobi Adeyemi', 'Head engineer', 'Records and mixes Afrobeats, gospel and alté sessions, and runs Studio A day to day.', '', 0);
INSERT INTO team (id, name, role, bio, image_url, sort) VALUES ('team_2', 'Kemi Okafor', 'Studio manager', 'Runs the calendar, bookings and client care, and makes sure every session starts on time.', '', 1);
INSERT INTO team (id, name, role, bio, image_url, sort) VALUES ('team_3', 'Seyi Bello', 'Producer', 'In-house producer for beats, arrangement and artist development.', '', 2);
INSERT INTO team (id, name, role, bio, image_url, sort) VALUES ('team_4', 'Ifeanyi Obi', 'Director of photography', 'Leads video and photo shoots on The Stage and on location.', '', 3);
INSERT INTO equipment (id, category, name, detail, room_id, sort) VALUES ('eq_1', 'Microphones', 'Neumann U87 Ai', 'Large-diaphragm condenser for lead vocals', 'room_studio_a', 0);
INSERT INTO equipment (id, category, name, detail, room_id, sort) VALUES ('eq_2', 'Microphones', 'Shure SM7B (4)', 'Broadcast dynamics, one per podcast guest', 'room_podcast', 1);
INSERT INTO equipment (id, category, name, detail, room_id, sort) VALUES ('eq_3', 'Microphones', 'Sennheiser MKH 416', 'Shotgun microphone for video and interviews', 'room_stage', 2);
INSERT INTO equipment (id, category, name, detail, room_id, sort) VALUES ('eq_4', 'Monitoring', 'Genelec 8040 monitors', 'Main monitoring in the control room', 'room_studio_a', 3);
INSERT INTO equipment (id, category, name, detail, room_id, sort) VALUES ('eq_5', 'Monitoring', 'Yamaha HS8 monitors', 'Near-field monitoring in the production suite', 'room_studio_b', 4);
INSERT INTO equipment (id, category, name, detail, room_id, sort) VALUES ('eq_6', 'Interfaces and outboard', 'Universal Audio Apollo x8', 'Recording interface with Unison preamps', 'room_studio_a', 5);
INSERT INTO equipment (id, category, name, detail, room_id, sort) VALUES ('eq_7', 'Interfaces and outboard', 'Neve 1073 preamp', 'Classic preamp and EQ for vocals', 'room_studio_a', 6);
INSERT INTO equipment (id, category, name, detail, room_id, sort) VALUES ('eq_8', 'Instruments', 'Nord Stage keyboard', 'Pianos, organs and synths', 'room_studio_b', 7);
INSERT INTO equipment (id, category, name, detail, room_id, sort) VALUES ('eq_9', 'Instruments', 'Akai MPC', 'Drum programming and sampling', 'room_studio_b', 8);
INSERT INTO equipment (id, category, name, detail, room_id, sort) VALUES ('eq_10', 'Cameras', 'Sony FX6 cinema cameras (2)', 'Full-frame cinema cameras for music videos and commercials', 'room_stage', 9);
INSERT INTO equipment (id, category, name, detail, room_id, sort) VALUES ('eq_11', 'Cameras', 'Sony A7S III (3)', 'Podcast and interview angles', 'room_podcast', 10);
INSERT INTO equipment (id, category, name, detail, room_id, sort) VALUES ('eq_12', 'Lighting', 'Aputure 600d key lights', 'Daylight LED keys with modifiers', 'room_stage', 11);
INSERT INTO equipment (id, category, name, detail, room_id, sort) VALUES ('eq_13', 'Lighting', 'Godox strobes', 'Studio flash for portraits and product work', 'room_stage', 12);
INSERT INTO equipment (id, category, name, detail, room_id, sort) VALUES ('eq_14', 'Software', 'Pro Tools, Logic Pro, Ableton Live and FL Studio', 'Recording, production and mixing', NULL, 13);
INSERT INTO equipment (id, category, name, detail, room_id, sort) VALUES ('eq_15', 'Software', 'DaVinci Resolve', 'Editing and colour grading', NULL, 14);
INSERT INTO gallery (id, image_url, caption, room_id, sort) VALUES ('gal_1', 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=1400&q=70&auto=format&fit=crop', 'Studio A control room', 'room_studio_a', 0);
INSERT INTO gallery (id, image_url, caption, room_id, sort) VALUES ('gal_2', 'https://images.unsplash.com/photo-1478737270239-2f02b77fc618?w=1400&q=70&auto=format&fit=crop', 'Vocal booth', 'room_studio_a', 1);
INSERT INTO gallery (id, image_url, caption, room_id, sort) VALUES ('gal_3', 'https://images.unsplash.com/photo-1741745977996-d9d9047f98db?w=1400&q=70&auto=format&fit=crop', 'Studio B production suite', 'room_studio_b', 2);
INSERT INTO gallery (id, image_url, caption, room_id, sort) VALUES ('gal_4', 'https://images.unsplash.com/photo-1559523161-0fc0d8b38a7a?w=1400&q=70&auto=format&fit=crop', 'Podcast Room', 'room_podcast', 3);
INSERT INTO gallery (id, image_url, caption, room_id, sort) VALUES ('gal_5', 'https://images.unsplash.com/photo-1612544409025-e1f6a56c1152?w=1400&q=70&auto=format&fit=crop', 'The Stage on a shoot day', 'room_stage', 4);
INSERT INTO gallery (id, image_url, caption, room_id, sort) VALUES ('gal_6', 'https://images.unsplash.com/photo-1768818928341-3b31b8965c6d?w=1400&q=70&auto=format&fit=crop', 'The Stage lighting setup', 'room_stage', 5);
INSERT INTO gallery (id, image_url, caption, room_id, sort) VALUES ('gal_7', 'https://images.unsplash.com/photo-1574517947730-55cb23e608c2?w=1400&q=70&auto=format&fit=crop', 'Mixing desk', 'room_studio_a', 6);
INSERT INTO gallery (id, image_url, caption, room_id, sort) VALUES ('gal_8', 'https://images.unsplash.com/photo-1615458318132-1f151a3d18f4?w=1400&q=70&auto=format&fit=crop', 'Podcast mixer', 'room_podcast', 7);
INSERT INTO portfolio (id, title, category, client, description, image_url, embed_url, link_url, year, featured, sort) VALUES ('work_1', 'Afrobeats single, recorded and mixed', 'music', 'Independent artist', 'Lead and backing vocals tracked in Studio A over two sessions, then mixed and mastered for streaming.', 'https://images.unsplash.com/photo-1617745546548-9324da9e2b7c?w=1400&q=70&auto=format&fit=crop', '', '', '2026', 1, 0);
INSERT INTO portfolio (id, title, category, client, description, image_url, embed_url, link_url, year, featured, sort) VALUES ('work_2', 'Performance music video', 'video', 'Record label', 'A one-day shoot on The Stage with three lighting setups and a 4K edit with vertical cut-downs.', 'https://images.unsplash.com/photo-1594394489098-74ac04c0fc2e?w=1400&q=70&auto=format&fit=crop', '', '', '2026', 1, 1);
INSERT INTO portfolio (id, title, category, client, description, image_url, embed_url, link_url, year, featured, sort) VALUES ('work_3', 'Weekly video podcast', 'podcast', 'Media brand', 'Three-camera episodes recorded in the Podcast Room, switched live and published with short clips.', 'https://images.unsplash.com/photo-1471341971476-ae15ff5dd4ea?w=1400&q=70&auto=format&fit=crop', '', '', '2026', 1, 2);
INSERT INTO portfolio (id, title, category, client, description, image_url, embed_url, link_url, year, featured, sort) VALUES ('work_4', 'Press photos and cover art', 'photo', 'Gospel artist', 'Portraits on the cyclorama for an album rollout, retouched for print, streaming and socials.', 'https://images.unsplash.com/photo-1641236210747-48bc43e4517f?w=1400&q=70&auto=format&fit=crop', '', '', '2025', 1, 3);
INSERT INTO portfolio (id, title, category, client, description, image_url, embed_url, link_url, year, featured, sort) VALUES ('work_5', 'Brand launch film', 'video', 'Consumer brand', 'A scripted launch film shot on location and finished with a full grade and sound mix.', 'https://images.unsplash.com/photo-1632187981988-40f3cbaeef5e?w=1400&q=70&auto=format&fit=crop', '', '', '2025', 0, 4);
INSERT INTO portfolio (id, title, category, client, description, image_url, embed_url, link_url, year, featured, sort) VALUES ('work_6', 'EP mix and master', 'music', 'Alté duo', 'Five tracks mixed and mastered, with stems and instrumentals delivered for sync.', 'https://images.unsplash.com/photo-1574517947730-55cb23e608c2?w=1400&q=70&auto=format&fit=crop', '', '', '2025', 0, 5);
INSERT INTO portfolio (id, title, category, client, description, image_url, embed_url, link_url, year, featured, sort) VALUES ('work_7', 'Product campaign', 'photo', 'Skincare brand', 'Packshots and styled sets for an e-commerce relaunch.', 'https://images.unsplash.com/photo-1768076955015-dd4f057e96f6?w=1400&q=70&auto=format&fit=crop', '', '', '2025', 0, 6);
INSERT INTO portfolio (id, title, category, client, description, image_url, embed_url, link_url, year, featured, sort) VALUES ('work_8', 'Interview series', 'video', 'Non-profit', 'Two-camera interviews edited into short stories with captions.', 'https://images.unsplash.com/photo-1515634928627-2a4e0dae3ddf?w=1400&q=70&auto=format&fit=crop', '', '', '2026', 0, 7);
INSERT INTO testimonials (id, quote, name, role, featured, sort) VALUES ('tst_1', 'Booked at midnight, recorded the next afternoon. The engineer was ready when I walked in.', 'Amaka Eze', 'Singer', 1, 0);
INSERT INTO testimonials (id, quote, name, role, featured, sort) VALUES ('tst_2', 'We shot our video podcast here every week for a season. Three cameras, clean audio and clips ready by Monday.', 'Chinedu Nwosu', 'Podcast host', 0, 1);
INSERT INTO testimonials (id, quote, name, role, featured, sort) VALUES ('tst_3', 'The Stage made our launch shoot easy. Lighting was ready, the crew knew the space and we wrapped early.', 'Funmi Adebayo', 'Brand manager', 0, 2);
INSERT INTO faqs (id, question, answer, sort) VALUES ('faq_1', 'How do I book a session?', 'Choose a service, pick a package and room, select a live time and pay a deposit or the full amount with Paystack. Some bookings, like full-day lockouts, stage hire and content days, are sent as requests and confirmed by the studio first.', 0);
INSERT INTO faqs (id, question, answer, sort) VALUES ('faq_2', 'What are your opening hours?', 'Monday to Saturday from 10:00 to 22:00 and Sunday from 14:00 to 20:00. Sessions outside these hours can be arranged on request.', 1);
INSERT INTO faqs (id, question, answer, sort) VALUES ('faq_3', 'How much does studio hire cost?', 'Studio A starts at ₦25,000 for one hour, with half-day and full-day rates. Every room has its own hourly rate for extra time. See Pricing for the full list.', 2);
INSERT INTO faqs (id, question, answer, sort) VALUES ('faq_4', 'Do I have to pay in full?', 'No. Most packages let you pay a 50% deposit to secure the slot and the balance before your session. Smaller bookings are paid in full.', 3);
INSERT INTO faqs (id, question, answer, sort) VALUES ('faq_5', 'Can I reschedule or cancel?', 'Reschedule once for free up to 48 hours before your session. Cancel 72 hours or more before for a full refund of what you paid, or 50% between 24 and 72 hours.', 4);
INSERT INTO faqs (id, question, answer, sort) VALUES ('faq_6', 'What happens if I arrive late?', 'Sessions start and end at the booked time so the next client is not delayed. Time lost to late arrival is not added on.', 5);
INSERT INTO faqs (id, question, answer, sort) VALUES ('faq_7', 'Can I bring my own producer, engineer or crew?', 'Yes. Tell us in your booking notes. Our engineer or technician still runs the room and the equipment.', 6);
INSERT INTO faqs (id, question, answer, sort) VALUES ('faq_8', 'What equipment is available?', 'See Studio and facilities for each room''s microphones, monitoring, cameras and lighting. Ask us if you need something specific.', 7);
INSERT INTO faqs (id, question, answer, sort) VALUES ('faq_9', 'Is production charged separately?', 'Studio hire covers the room and an engineer. Beat production, mixing, mastering, editing and post-production are priced separately unless your package includes them.', 8);
INSERT INTO faqs (id, question, answer, sort) VALUES ('faq_10', 'Can I get a custom quote?', 'Yes. For music videos, commercials, content days and long projects, send a quote request with your brief and budget and we reply within one working day.', 9);
INSERT INTO announcements (id, title, body, link_label, link_url, published) VALUES ('ann_1', 'Now booking video podcasts', 'Three cameras, live switching and a finished episode from ₦85,000.', 'See podcast packages', '/packages#podcast', 1);
UPDATE policies SET sort = sort + 1 WHERE sort >= 1;
INSERT INTO policies (slug, title, body, sort, kind) VALUES ('approvals', 'Booking approvals', 'Some bookings, such as full-day lockouts, stage hire and content days, are sent as requests. The studio replies within 24 hours. Once approved you have 24 hours to pay a deposit or the full amount to secure the slot. Requests that are not approved or paid in time are released.', 1, 'booking');
UPDATE policies SET body = 'Pay a deposit or the full amount at checkout by card, bank transfer or USSD through Paystack. Deposits are 50% unless the package says otherwise, and the balance is due before your session starts. Your booking is confirmed once Paystack verifies the payment.' WHERE slug = 'payment';
UPDATE policies SET body = 'Cancel 72 hours or more before your session for a full refund of what you have paid. Between 24 and 72 hours, 50% of what you paid is refunded. Under 24 hours or no-shows are not refunded.' WHERE slug = 'cancellations';
UPDATE policies SET body = 'Each room has a guest limit, shown when you book, that includes the artist or host. No smoking, drugs or weapons. Unsafe behaviour ends a session without a refund.' WHERE slug = 'guests-conduct';
UPDATE policies SET body = 'Overtime is billed at the room''s hourly rate in 30 minute blocks, and only when the room is free after your session.' WHERE slug = 'overtime';
INSERT INTO policies (slug, title, body, sort, kind) VALUES ('privacy', 'Privacy policy', 'Psych Records Entertainment Limited ("we") runs this website and the studio booking service. This policy explains what we collect, why, and the choices you have under the Nigeria Data Protection Act 2023.

## What we collect
- Your name, email address and phone number when you create an account, book, or send an enquiry.
- Booking details such as the service, date, time, number of people, project notes and reference links.
- Payment status and references. Card and bank details are entered on Paystack''s secure page and never reach our servers.
- Basic technical data such as your IP address for security and sign-in protection.

## Why we use it
- To take, confirm and manage your bookings, payments, refunds and receipts.
- To send booking emails, reminders and replies to your enquiries.
- To keep the service secure and prevent fraud and spam.

## Who we share it with
- Paystack, to process payments.
- Our email delivery provider, to send booking emails.
- Cloudflare, which hosts this website and its database.
We do not sell your data or share it for advertising.

## How long we keep it
Booking and payment records are kept for as long as the law requires for accounting. You can ask us to delete your account and any data we do not need to keep.

## Your rights
You can ask to see, correct or delete your personal data, or object to how we use it, by emailing us. We reply within 30 days.

## Cookies
We use one essential cookie to keep you signed in. If analytics is turned on, it measures visits without identifying you.

## Contact
Questions about this policy can be sent to the email address on our Contact page.', 100, 'legal');
INSERT INTO policies (slug, title, body, sort, kind) VALUES ('terms', 'Terms of service', 'These terms apply when you use this website or book with Psych Records Entertainment Limited ("the studio").

## Bookings
A booking is confirmed only when you receive a confirmation email with a booking reference. Requests that need approval are not confirmed until the studio approves them and your payment is verified, unless the studio confirms them in writing.

## Payments
Prices are shown in Naira and locked when you book. Deposits and balances are explained in the booking policies. Payments are processed by Paystack and verified on our server.

## Changes and cancellations
Rescheduling, cancellation and refund rules are set out in the booking policies, which you accept when you book.

## Using the studio
Follow the instructions of studio staff. You are responsible for damage to equipment or rooms caused by you or your guests. The studio may end a session without a refund for unsafe behaviour.

## Your work
You own the recordings, footage and images made for you once they are paid for in full. We will only use your work in our portfolio with your permission.

## Liability
We take care with your files, but keep your own copies. Our liability for any booking is limited to the amount you paid for it.

## Law
These terms are governed by the laws of the Federal Republic of Nigeria.', 101, 'legal');
UPDATE settings SET value = CAST(value AS INTEGER) + 1 WHERE key = 'policy_version';
INSERT OR IGNORE INTO settings (key, value) VALUES ('deposit_percent', '50');
INSERT OR IGNORE INTO settings (key, value) VALUES ('require_approval', '0');
INSERT OR IGNORE INTO settings (key, value) VALUES ('request_expiry_hours', '48');
INSERT OR IGNORE INTO settings (key, value) VALUES ('payment_window_hours', '24');
INSERT OR IGNORE INTO settings (key, value) VALUES ('reminder_hours', '24');
UPDATE content SET value = 'Record, shoot and create' WHERE key = 'hero_title' AND value = 'Your sound, recorded right.';
UPDATE content SET value = 'Music recording, video production, podcasts and photography. Check live availability, book a room, and pay a deposit or the full amount online.' WHERE key = 'hero_subtitle' AND value LIKE 'Book real studio time in Lekki%';
DELETE FROM content WHERE key IN ('testimonial_quote', 'testimonial_name');
INSERT OR IGNORE INTO content (key, value) VALUES ('hero_accent', 'under one roof.');
INSERT OR IGNORE INTO content (key, value) VALUES ('hero_image', '');
INSERT OR IGNORE INTO content (key, value) VALUES ('business_name', 'Psych Records Entertainment');
INSERT OR IGNORE INTO content (key, value) VALUES ('legal_name', 'Psych Records Entertainment Limited');
INSERT OR IGNORE INTO content (key, value) VALUES ('footer_blurb', 'A music, video, podcast and photography studio. Book rooms online, pay securely and walk in ready to create.');
INSERT OR IGNORE INTO content (key, value) VALUES ('contact_phone', '+234 812 555 0142');
INSERT OR IGNORE INTO content (key, value) VALUES ('contact_email', 'hello@psychrecords.ng');
INSERT OR IGNORE INTO content (key, value) VALUES ('whatsapp', '2348125550142');
INSERT OR IGNORE INTO content (key, value) VALUES ('map_query', 'Admiralty Way, Lekki Phase 1, Lagos');
INSERT OR IGNORE INTO content (key, value) VALUES ('hours_note', 'Sessions outside these hours by arrangement.');
INSERT OR IGNORE INTO content (key, value) VALUES ('social_instagram', 'https://instagram.com');
INSERT OR IGNORE INTO content (key, value) VALUES ('social_tiktok', 'https://tiktok.com');
INSERT OR IGNORE INTO content (key, value) VALUES ('social_youtube', 'https://youtube.com');
INSERT OR IGNORE INTO content (key, value) VALUES ('social_x', 'https://x.com');
INSERT OR IGNORE INTO content (key, value) VALUES ('about_title', 'Built for people who make things.');
INSERT OR IGNORE INTO content (key, value) VALUES ('about_intro', 'Psych Records Entertainment is a multimedia production studio for artists, labels, filmmakers, podcasters, creators and brands. We record, shoot and finish work in one building, with engineers, producers and crew who care about the result.');
INSERT OR IGNORE INTO content (key, value) VALUES ('about_vision', 'To be the studio Nigerian and international creatives trust with their best work.');
INSERT OR IGNORE INTO content (key, value) VALUES ('about_mission', 'Give every client a professional room, the right people and a clear process, from the first booking to the final file.');
INSERT OR IGNORE INTO content (key, value) VALUES ('about_philosophy', 'We prepare before you arrive, keep sessions on time and treat every project as if our name is on it, because it is.');
INSERT OR IGNORE INTO content (key, value) VALUES ('about_points', 'Everything under one roof: Music, video, podcast and photo production share one building, one crew and one calendar.
Engineers and crew included: Every booking comes with the people who know the room.
Live availability: See real open times and book without back-and-forth messages.
Clear prices: Packages, deposits and policies are published before you pay.');
INSERT OR IGNORE INTO content (key, value) VALUES ('about_image', 'https://images.unsplash.com/photo-1636226570637-3fbda7ca09dc?w=1400&q=70&auto=format&fit=crop');
INSERT OR IGNORE INTO content (key, value) VALUES ('studio_title', 'Rooms built for sound and picture.');
INSERT OR IGNORE INTO content (key, value) VALUES ('studio_intro', 'Four spaces under one roof: a recording room with a separate control room, a production suite, a podcast set and an open stage for video and photography.');
INSERT OR IGNORE INTO content (key, value) VALUES ('tour_url', '');
INSERT OR IGNORE INTO content (key, value) VALUES ('seo_title', 'Psych Records Entertainment | Music, video and podcast studio');
INSERT OR IGNORE INTO content (key, value) VALUES ('seo_description', 'Book music recording, video production, podcast and photography sessions at Psych Records Entertainment. Live availability, deposits and secure Paystack checkout.');
INSERT OR IGNORE INTO content (key, value) VALUES ('seo_image', '');
INSERT OR IGNORE INTO content (key, value) VALUES ('seo_indexing', '0');
INSERT OR IGNORE INTO content (key, value) VALUES ('analytics_ga', '');
INSERT OR IGNORE INTO content (key, value) VALUES ('analytics_cf', '');
INSERT OR IGNORE INTO content (key, value) VALUES ('gsc_verification', '');
INSERT INTO page_meta (path, title, description, image_url) VALUES ('/', '', '', '');
INSERT INTO page_meta (path, title, description, image_url) VALUES ('/services', 'Services', 'Music recording, production, mixing, video, podcast and photography services, with packages you can book online.', '');
INSERT INTO page_meta (path, title, description, image_url) VALUES ('/studio', 'Studio and facilities', 'Recording rooms, a production suite, a podcast set and a video and photo stage, with the equipment in each.', '');
INSERT INTO page_meta (path, title, description, image_url) VALUES ('/portfolio', 'Portfolio', 'Music, videos, podcasts and photography made at Psych Records Entertainment.', '');
INSERT INTO page_meta (path, title, description, image_url) VALUES ('/packages', 'Pricing and packages', 'Hourly, half-day and full-day studio rates, production packages, deposits and booking policies.', '');
INSERT INTO page_meta (path, title, description, image_url) VALUES ('/about', 'About us', 'Who we are, how we work and the team behind Psych Records Entertainment.', '');
INSERT INTO page_meta (path, title, description, image_url) VALUES ('/contact', 'Contact', 'Call, WhatsApp or send an enquiry. Find the studio on the map.', '');
INSERT INTO page_meta (path, title, description, image_url) VALUES ('/faq', 'FAQs', 'Answers about booking, opening hours, deposits, rescheduling, late arrivals, crew and custom quotes.', '');
INSERT INTO page_meta (path, title, description, image_url) VALUES ('/quote', 'Request a quote', 'Tell us about your music video, commercial, content day or long project and get a quote within one working day.', '');
INSERT INTO page_meta (path, title, description, image_url) VALUES ('/book', 'Book a session', 'Pick a service and package, see live availability and pay a deposit or the full amount online.', '');
INSERT INTO page_meta (path, title, description, image_url) VALUES ('/privacy', 'Privacy policy', '', '');
INSERT INTO page_meta (path, title, description, image_url) VALUES ('/terms', 'Terms of service', '', '');
UPDATE users SET email = 'manager@psychrecords.test', permissions = '["view_calendar","manage_bookings","update_booking_details","assist_clients","record_payments"]' WHERE email = 'dami@sessionsstudio.ng';
