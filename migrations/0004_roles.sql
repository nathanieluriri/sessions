ALTER TABLE users ADD COLUMN level TEXT NOT NULL DEFAULT '';
UPDATE users SET level = 'ceo' WHERE role = 'ceo';
UPDATE users SET level = 'custom' WHERE role = 'admin';

ALTER TABLE payments ADD COLUMN checked_by TEXT REFERENCES users(id);
ALTER TABLE payments ADD COLUMN checked_at TEXT;

ALTER TABLE categories ADD COLUMN bookable INTEGER NOT NULL DEFAULT 1;
UPDATE categories SET bookable = 0 WHERE slug != 'music';
