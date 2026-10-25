CREATE TABLE billing_email_progress (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  cursor TEXT NOT NULL DEFAULT '',
  lease_token TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0
);
INSERT INTO billing_email_progress (id) VALUES (1);
