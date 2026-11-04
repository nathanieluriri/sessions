-- Each service can follow the site default, or use an icon or its photograph.
ALTER TABLE services ADD COLUMN card_art TEXT NOT NULL DEFAULT 'default';

-- The EP and album keep their cover pictures. Everything else follows the default (icons).
UPDATE services SET card_art = 'photo' WHERE slug IN ('produce-ep', 'produce-album');
