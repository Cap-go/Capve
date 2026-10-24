CREATE TABLE account_billing (
  account_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter', 'pro')),
  trial_started_at INTEGER NOT NULL,
  trial_ends_at INTEGER NOT NULL,
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  subscription_status TEXT,
  subscription_ends_at INTEGER,
  stripe_event_created INTEGER NOT NULL DEFAULT 0
);
-- Existing accounts get a fresh 14 days from migration, not from their original signup.
INSERT INTO account_billing (account_id, trial_started_at, trial_ends_at)
SELECT id, unixepoch() * 1000, (unixepoch() + 14 * 86400) * 1000 FROM users;

-- Durable usage survives raw-click retention and campaign deletion. UTC calendar months.
CREATE TABLE billing_usage (
  account_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, period)
);
INSERT INTO billing_usage (account_id, period, clicks)
SELECT p.user_id, strftime('%Y-%m', c.created_at / 1000, 'unixepoch'), COUNT(*)
FROM clicks c JOIN programs p ON p.id = c.program_id
GROUP BY p.user_id, strftime('%Y-%m', c.created_at / 1000, 'unixepoch');
CREATE TRIGGER billing_count_click AFTER INSERT ON clicks BEGIN
  INSERT INTO billing_usage (account_id, period, clicks)
  SELECT user_id, strftime('%Y-%m', NEW.created_at / 1000, 'unixepoch'), 1
  FROM programs WHERE id = NEW.program_id
  ON CONFLICT (account_id, period) DO UPDATE SET clicks = clicks + 1;
END;

CREATE TABLE billing_email_events (
  event_key TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  delivered_at INTEGER,
  claimed_until INTEGER NOT NULL DEFAULT 0
);

-- One in-flight checkout per account, including a stable trial end and retry key.
CREATE TABLE billing_checkouts (
  account_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  plan TEXT NOT NULL,
  trial_end INTEGER,
  expires_at INTEGER NOT NULL,
  session_id TEXT
);
