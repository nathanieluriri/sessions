-- Podcast work is requested by quote. The last price stays stored so it can be switched back on.
UPDATE packages SET pricing = 'quote'
WHERE service_category = 'podcast'
   OR service_slug IN (SELECT slug FROM services WHERE category = 'podcast');

UPDATE services SET price_label = 'Request a quote' WHERE category = 'podcast';

UPDATE extras SET pricing = 'quote'
WHERE category = 'podcast'
   OR service_slug IN (SELECT slug FROM services WHERE category = 'podcast');
