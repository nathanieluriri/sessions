-- The homepage intro no longer mentions photography or podcast hourly rates.
UPDATE content
SET value = trim(replace(value, ' Photography is ₦40,000 per hour and the podcast studio is ₦60,000 per hour.', ''))
WHERE key = 'hero_subtitle';
