-- Photos that showed people who are not Black now point at local pictures of Black adults, or at the same room with those faces removed.
UPDATE rooms SET image_url = '/photos/studio-a.jpg' WHERE image_url LIKE '%1598488035139%';
UPDATE gallery SET image_url = '/photos/studio-a.jpg' WHERE image_url LIKE '%1598488035139%';
UPDATE portfolio SET image_url = '/photos/studio-a.jpg' WHERE image_url LIKE '%1598488035139%';
UPDATE services SET image_url = '/photos/studio-a.jpg' WHERE image_url LIKE '%1598488035139%';
UPDATE services SET gallery = REPLACE(gallery, 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04', '/photos/studio-a.jpg') WHERE gallery LIKE '%1598488035139%';
UPDATE content SET value = '/photos/studio-a.jpg' WHERE value LIKE '%1598488035139%';
UPDATE page_meta SET image_url = '/photos/studio-a.jpg' WHERE image_url LIKE '%1598488035139%';
UPDATE team SET image_url = '/photos/studio-a.jpg' WHERE image_url LIKE '%1598488035139%';

UPDATE rooms SET image_url = '/photos/podcast-room.jpg' WHERE image_url LIKE '%1559523161%';
UPDATE gallery SET image_url = '/photos/podcast-room.jpg' WHERE image_url LIKE '%1559523161%';
UPDATE portfolio SET image_url = '/photos/podcast-room.jpg' WHERE image_url LIKE '%1559523161%';
UPDATE services SET image_url = '/photos/podcast-room.jpg' WHERE image_url LIKE '%1559523161%';
UPDATE services SET gallery = REPLACE(gallery, 'https://images.unsplash.com/photo-1559523161-0fc0d8b38a7a', '/photos/podcast-room.jpg') WHERE gallery LIKE '%1559523161%';
UPDATE content SET value = '/photos/podcast-room.jpg' WHERE value LIKE '%1559523161%';
UPDATE page_meta SET image_url = '/photos/podcast-room.jpg' WHERE image_url LIKE '%1559523161%';

UPDATE rooms SET image_url = '/photos/the-stage.jpg' WHERE image_url LIKE '%1612544409025%';
UPDATE gallery SET image_url = '/photos/the-stage.jpg' WHERE image_url LIKE '%1612544409025%';
UPDATE portfolio SET image_url = '/photos/the-stage.jpg' WHERE image_url LIKE '%1612544409025%';
UPDATE services SET image_url = '/photos/the-stage.jpg' WHERE image_url LIKE '%1612544409025%';
UPDATE services SET gallery = REPLACE(gallery, 'https://images.unsplash.com/photo-1612544409025-e1f6a56c1152', '/photos/the-stage.jpg') WHERE gallery LIKE '%1612544409025%';
UPDATE content SET value = '/photos/the-stage.jpg' WHERE value LIKE '%1612544409025%';
UPDATE page_meta SET image_url = '/photos/the-stage.jpg' WHERE image_url LIKE '%1612544409025%';

UPDATE rooms SET image_url = '/photos/portraits.jpg' WHERE image_url LIKE '%1641236210747%';
UPDATE gallery SET image_url = '/photos/portraits.jpg' WHERE image_url LIKE '%1641236210747%';
UPDATE portfolio SET image_url = '/photos/portraits.jpg' WHERE image_url LIKE '%1641236210747%';
UPDATE services SET image_url = '/photos/portraits.jpg' WHERE image_url LIKE '%1641236210747%';
UPDATE services SET gallery = REPLACE(gallery, 'https://images.unsplash.com/photo-1641236210747-48bc43e4517f', '/photos/portraits.jpg') WHERE gallery LIKE '%1641236210747%';
UPDATE content SET value = '/photos/portraits.jpg' WHERE value LIKE '%1641236210747%';
UPDATE page_meta SET image_url = '/photos/portraits.jpg' WHERE image_url LIKE '%1641236210747%';

UPDATE rooms SET image_url = '/photos/interviews.jpg' WHERE image_url LIKE '%1515634928627%';
UPDATE gallery SET image_url = '/photos/interviews.jpg' WHERE image_url LIKE '%1515634928627%';
UPDATE portfolio SET image_url = '/photos/interviews.jpg' WHERE image_url LIKE '%1515634928627%';
UPDATE services SET image_url = '/photos/interviews.jpg' WHERE image_url LIKE '%1515634928627%';
UPDATE services SET gallery = REPLACE(gallery, 'https://images.unsplash.com/photo-1515634928627-2a4e0dae3ddf', '/photos/interviews.jpg') WHERE gallery LIKE '%1515634928627%';
UPDATE content SET value = '/photos/interviews.jpg' WHERE value LIKE '%1515634928627%';
UPDATE page_meta SET image_url = '/photos/interviews.jpg' WHERE image_url LIKE '%1515634928627%';

UPDATE rooms SET image_url = '/photos/commercial.jpg' WHERE image_url LIKE '%1632187981988%';
UPDATE gallery SET image_url = '/photos/commercial.jpg' WHERE image_url LIKE '%1632187981988%';
UPDATE portfolio SET image_url = '/photos/commercial.jpg' WHERE image_url LIKE '%1632187981988%';
UPDATE services SET image_url = '/photos/commercial.jpg' WHERE image_url LIKE '%1632187981988%';
UPDATE services SET gallery = REPLACE(gallery, 'https://images.unsplash.com/photo-1632187981988-40f3cbaeef5e', '/photos/commercial.jpg') WHERE gallery LIKE '%1632187981988%';
UPDATE content SET value = '/photos/commercial.jpg' WHERE value LIKE '%1632187981988%';
UPDATE page_meta SET image_url = '/photos/commercial.jpg' WHERE image_url LIKE '%1632187981988%';

UPDATE services SET image_url = '/photos/artist-development.jpg' WHERE image_url LIKE '%1604513843888%';
UPDATE portfolio SET image_url = '/photos/artist-development.jpg' WHERE image_url LIKE '%1604513843888%';
UPDATE gallery SET image_url = '/photos/artist-development.jpg' WHERE image_url LIKE '%1604513843888%';
UPDATE services SET gallery = REPLACE(gallery, 'https://images.unsplash.com/photo-1604513843888-824303218a45', '/photos/artist-development.jpg') WHERE gallery LIKE '%1604513843888%';

UPDATE services SET image_url = '/photos/social-content.jpg' WHERE image_url LIKE '%1611784728558%';
UPDATE portfolio SET image_url = '/photos/social-content.jpg' WHERE image_url LIKE '%1611784728558%';
UPDATE gallery SET image_url = '/photos/social-content.jpg' WHERE image_url LIKE '%1611784728558%';
UPDATE services SET gallery = REPLACE(gallery, 'https://images.unsplash.com/photo-1611784728558-6c7d9b409cdf', '/photos/social-content.jpg') WHERE gallery LIKE '%1611784728558%';

UPDATE services SET image_url = '/photos/reels.jpg' WHERE image_url LIKE '%1587050265310%';
UPDATE portfolio SET image_url = '/photos/reels.jpg' WHERE image_url LIKE '%1587050265310%';
UPDATE gallery SET image_url = '/photos/reels.jpg' WHERE image_url LIKE '%1587050265310%';
UPDATE services SET gallery = REPLACE(gallery, 'https://images.unsplash.com/photo-1587050265310-1a2d98ccce5f', '/photos/reels.jpg') WHERE gallery LIKE '%1587050265310%';

UPDATE services SET image_url = '/photos/arrangement.jpg' WHERE image_url LIKE '%1611093791822%';
UPDATE portfolio SET image_url = '/photos/arrangement.jpg' WHERE image_url LIKE '%1611093791822%';
UPDATE gallery SET image_url = '/photos/arrangement.jpg' WHERE image_url LIKE '%1611093791822%';
UPDATE services SET gallery = REPLACE(gallery, 'https://images.unsplash.com/photo-1611093791822-15086535830b', '/photos/arrangement.jpg') WHERE gallery LIKE '%1611093791822%';

UPDATE services SET image_url = '/photos/mixing.jpg' WHERE image_url LIKE '%1610716632424%';
UPDATE portfolio SET image_url = '/photos/mixing.jpg' WHERE image_url LIKE '%1610716632424%';
UPDATE gallery SET image_url = '/photos/mixing.jpg' WHERE image_url LIKE '%1610716632424%';
UPDATE services SET gallery = REPLACE(gallery, 'https://images.unsplash.com/photo-1610716632424-4d45990bcd48', '/photos/mixing.jpg') WHERE gallery LIKE '%1610716632424%';

UPDATE services SET image_url = '/photos/podcast-editing.jpg' WHERE image_url LIKE '%1668605335684%';
UPDATE portfolio SET image_url = '/photos/podcast-editing.jpg' WHERE image_url LIKE '%1668605335684%';
UPDATE gallery SET image_url = '/photos/podcast-editing.jpg' WHERE image_url LIKE '%1668605335684%';
UPDATE services SET gallery = REPLACE(gallery, 'https://images.unsplash.com/photo-1668605335684-c97ce92cbd76', '/photos/podcast-editing.jpg') WHERE gallery LIKE '%1668605335684%';

UPDATE services SET image_url = '/photos/product.jpg' WHERE image_url LIKE '%1768076955015%';
UPDATE portfolio SET image_url = '/photos/product.jpg' WHERE image_url LIKE '%1768076955015%';
UPDATE gallery SET image_url = '/photos/product.jpg' WHERE image_url LIKE '%1768076955015%';
UPDATE services SET gallery = REPLACE(gallery, 'https://images.unsplash.com/photo-1768076955015-dd4f057e96f6', '/photos/product.jpg') WHERE gallery LIKE '%1768076955015%';

UPDATE content SET value = '/photos/about.jpg' WHERE value LIKE '%1636226570637%';
UPDATE services SET image_url = '/photos/about.jpg' WHERE image_url LIKE '%1636226570637%';
UPDATE gallery SET image_url = '/photos/about.jpg' WHERE image_url LIKE '%1636226570637%';

UPDATE services SET image_url = '/photos/bts.jpg' WHERE image_url LIKE '%1560785219%';
UPDATE portfolio SET image_url = '/photos/bts.jpg' WHERE image_url LIKE '%1560785219%';
UPDATE gallery SET image_url = '/photos/bts.jpg' WHERE image_url LIKE '%1560785219%';
UPDATE services SET gallery = REPLACE(gallery, 'https://images.unsplash.com/photo-1560785219-cc81ab373cd3', '/photos/bts.jpg') WHERE gallery LIKE '%1560785219%';

UPDATE services SET image_url = '/photos/music-video.jpg' WHERE image_url LIKE '%1594394489098%';
UPDATE portfolio SET image_url = '/photos/music-video.jpg' WHERE image_url LIKE '%1594394489098%';
UPDATE gallery SET image_url = '/photos/music-video.jpg' WHERE image_url LIKE '%1594394489098%';
UPDATE services SET gallery = REPLACE(gallery, 'https://images.unsplash.com/photo-1594394489098-74ac04c0fc2e', '/photos/music-video.jpg') WHERE gallery LIKE '%1594394489098%';
