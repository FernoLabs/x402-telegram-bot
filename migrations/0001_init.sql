-- Initial schema for the x402 Telegram auction bot
CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT,
  telegram_id TEXT NOT NULL,
  min_bid REAL NOT NULL,
  owner_address TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  total_earned REAL NOT NULL DEFAULT 0,
  message_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auctions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  bidder_address TEXT NOT NULL,
  bidder_name TEXT,
  amount REAL NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  tx_hash TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  posted_at TEXT,
  telegram_message_id INTEGER,
  telegram_chat_id TEXT,
  error_reason TEXT,
  CHECK (status IN ('pending', 'posted', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_auctions_group_id ON auctions(group_id);
CREATE INDEX IF NOT EXISTS idx_auctions_telegram ON auctions(telegram_message_id, telegram_chat_id);

CREATE TABLE IF NOT EXISTS responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  auction_id INTEGER NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  username TEXT,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_responses_auction ON responses(auction_id);
