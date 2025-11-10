-- Add optional descriptions to groups and capture message ratings
ALTER TABLE groups ADD COLUMN description TEXT;

CREATE TABLE IF NOT EXISTS message_ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_request_id INTEGER NOT NULL UNIQUE REFERENCES message_requests(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
