-- Add table for storing replies to paid message requests
CREATE TABLE IF NOT EXISTS message_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_request_id INTEGER NOT NULL REFERENCES message_requests(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  username TEXT,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_message_responses_request ON message_responses(message_request_id);
