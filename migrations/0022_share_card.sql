-- The public share card is the tiger head and one line. Home page meta stays blank so it cannot add a second title.
UPDATE content SET value = 'The World is Yours - Book Your Next Recording Session' WHERE key = 'seo_title';
UPDATE content SET value = 'The World is Yours - Book Your Next Recording Session' WHERE key = 'seo_description';
UPDATE content SET value = '/brand/share.png' WHERE key = 'seo_image';
UPDATE page_meta SET title = '', description = '', image_url = '' WHERE path = '/';
