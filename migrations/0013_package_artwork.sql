-- Package covers live with the site assets. /media is reserved for uploaded files in storage, so these paths 404 there.
UPDATE services SET image_url = '/artwork/ep-package.jpeg' WHERE slug = 'produce-ep';
UPDATE services SET image_url = '/artwork/lp-package.jpeg' WHERE slug = 'produce-album';
