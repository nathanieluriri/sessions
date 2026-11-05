-- Video, podcast and photography are requested by quote. The last price stays stored so it can be switched back on.
UPDATE packages SET pricing = 'quote'
WHERE service_category IN ('video', 'podcast', 'photo')
   OR service_slug IN (SELECT slug FROM services WHERE category IN ('video', 'podcast', 'photo'));

UPDATE services SET price_label = 'Request a quote' WHERE category IN ('video', 'podcast', 'photo');

UPDATE extras SET pricing = 'quote'
WHERE category IN ('video', 'podcast', 'photo')
   OR service_slug IN (SELECT slug FROM services WHERE category IN ('video', 'podcast', 'photo'));
