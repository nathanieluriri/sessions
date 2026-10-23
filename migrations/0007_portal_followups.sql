-- Notifications can point at a booking, and a booking remembers when its client was last told about a delivery.
ALTER TABLE notifications ADD COLUMN booking_id TEXT;
ALTER TABLE bookings ADD COLUMN delivery_notified_at TEXT;
