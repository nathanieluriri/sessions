-- Receipts can be shared by a token link, the same way bookings carry pay_token.
ALTER TABLE payments ADD COLUMN receipt_token TEXT;
UPDATE payments SET receipt_token = lower(hex(randomblob(18))) WHERE receipt_token IS NULL;
