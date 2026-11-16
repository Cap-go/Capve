CREATE TABLE account_onboarding (
  account_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  dismissed INTEGER NOT NULL DEFAULT 0 CHECK (dismissed IN (0, 1)),
  email_tips INTEGER NOT NULL DEFAULT 0 CHECK (email_tips IN (0, 1)),
  consent_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE onboarding_email_events (
  event_key TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delivered_at INTEGER
);

CREATE TABLE onboarding_email_progress (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  cursor TEXT NOT NULL DEFAULT '',
  lease_token TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0
);
INSERT INTO onboarding_email_progress (id) VALUES (1);
