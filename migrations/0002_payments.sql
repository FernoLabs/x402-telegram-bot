-- Schema for storing payment requests and pending payments
CREATE TABLE IF NOT EXISTS payment_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_id TEXT NOT NULL UNIQUE,
  nonce TEXT NOT NULL,
  group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL,
  network TEXT NOT NULL,
  recipient TEXT NOT NULL,
  memo TEXT,
  instructions TEXT,
  resource TEXT,
  description TEXT,
  asset_address TEXT,
  asset_type TEXT,
  checkout_url TEXT,
  facilitator_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TEXT NOT NULL,
  last_signature TEXT,
  last_payer_address TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (status IN ('pending', 'submitted', 'confirmed', 'expired', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_payment_requests_group_id ON payment_requests(group_id);
CREATE INDEX IF NOT EXISTS idx_payment_requests_payment_id ON payment_requests(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_requests_status ON payment_requests(status);

CREATE TABLE IF NOT EXISTS pending_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL REFERENCES payment_requests(id) ON DELETE CASCADE,
  signature TEXT,
  wire_transaction TEXT,
  payer_address TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (status IN ('pending', 'submitted', 'confirmed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_pending_payments_request_id ON pending_payments(request_id);
CREATE INDEX IF NOT EXISTS idx_pending_payments_signature ON pending_payments(signature);
CREATE INDEX IF NOT EXISTS idx_pending_payments_payer ON pending_payments(payer_address);
