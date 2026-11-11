-- The public studio address is on the .ng domain, which is the one that can send and receive.
UPDATE content SET value = REPLACE(value, 'bookings@psychstudios.com', 'bookings@psychstudios.ng') WHERE value LIKE '%bookings@psychstudios.com%';
UPDATE content SET value = 'bookings@psychstudios.ng' WHERE key = 'contact_email';
UPDATE policies SET body = REPLACE(body, 'bookings@psychstudios.com', 'bookings@psychstudios.ng') WHERE body LIKE '%bookings@psychstudios.com%';
UPDATE faqs SET answer = REPLACE(answer, 'bookings@psychstudios.com', 'bookings@psychstudios.ng') WHERE answer LIKE '%bookings@psychstudios.com%';
UPDATE page_meta SET description = REPLACE(description, 'bookings@psychstudios.com', 'bookings@psychstudios.ng') WHERE description LIKE '%bookings@psychstudios.com%';

CREATE TABLE IF NOT EXISTS inbox (
  id TEXT PRIMARY KEY,
  from_email TEXT NOT NULL,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
