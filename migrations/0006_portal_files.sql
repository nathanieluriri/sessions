-- Portal files: deliveries from the studio, uploads from clients, and limited revisions.

CREATE TABLE booking_files (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id),
  direction TEXT NOT NULL CHECK (direction IN ('delivery', 'upload')),
  title TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size INTEGER NOT NULL DEFAULT 0,
  declared_size INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  note TEXT NOT NULL DEFAULT '',
  upload_id TEXT,
  parts TEXT NOT NULL DEFAULT '[]',
  state TEXT NOT NULL DEFAULT 'uploading' CHECK (state IN ('uploading', 'ready', 'removed')),
  released INTEGER NOT NULL DEFAULT 0,
  delivered_at TEXT,
  download_count INTEGER NOT NULL DEFAULT 0,
  first_downloaded_at TEXT,
  uploaded_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  completed_at TEXT
);
CREATE INDEX idx_booking_files_booking ON booking_files (booking_id, direction, state);
CREATE INDEX idx_booking_files_stale ON booking_files (state, created_at);

CREATE TABLE revision_requests (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  note TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  resolved_at TEXT,
  resolved_by TEXT REFERENCES users(id)
);
CREATE INDEX idx_revision_requests_booking ON revision_requests (booking_id, status);
