-- One studio address everywhere: the website, the footer, and the signature on booking emails.
UPDATE content SET value = 'bookings@psychstudios.com' WHERE key = 'contact_email';
UPDATE content SET value = '' WHERE key = 'footer_blurb';
