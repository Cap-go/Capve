-- Who changed an account. Click traffic and conversions stay in their own tables.
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_audit_log_account ON audit_log(account_id, created_at DESC);
