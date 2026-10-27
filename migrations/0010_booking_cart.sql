CREATE TABLE booking_carts (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('active', 'paying', 'confirmed', 'cancelled')) DEFAULT 'active',
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE booking_cart_items (
  cart_id TEXT NOT NULL REFERENCES booking_carts(id),
  hold_id TEXT NOT NULL UNIQUE REFERENCES holds(id),
  booking_id TEXT UNIQUE REFERENCES bookings(id),
  total_kobo INTEGER NOT NULL,
  deposit_kobo INTEGER NOT NULL,
  PRIMARY KEY (cart_id, hold_id)
);

CREATE TABLE payment_allocations (
  payment_id TEXT NOT NULL REFERENCES payments(id),
  booking_id TEXT NOT NULL REFERENCES bookings(id),
  amount_kobo INTEGER NOT NULL,
  refunded_kobo INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (payment_id, booking_id)
);

ALTER TABLE payments ADD COLUMN cart_id TEXT REFERENCES booking_carts(id);
CREATE UNIQUE INDEX idx_payments_one_pending_cart ON payments (cart_id) WHERE cart_id IS NOT NULL AND status = 'pending';