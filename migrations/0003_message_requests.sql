-- Schema for storing message requests tied to payment requests
CREATE TABLE IF NOT EXISTS message_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_request_id INTEGER NOT NULL REFERENCES payment_requests(id) ON DELETE CASCADE,
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  sender_name TEXT,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'awaiting_payment',
  last_error TEXT,
  telegram_message_id INTEGER,
  telegram_chat_id TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (status IN ('awaiting_payment', 'signature_saved', 'paid', 'sent', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_message_requests_wallet ON message_requests(wallet_address);
CREATE INDEX IF NOT EXISTS idx_message_requests_status ON message_requests(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_message_requests_payment ON message_requests(payment_request_id);
