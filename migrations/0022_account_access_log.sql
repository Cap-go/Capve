-- The signed-in actor remains distinct from the account accessed during support.
CREATE TABLE account_access_log (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('impersonate', 'stop_impersonation')),
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_account_access_log_actor ON account_access_log(actor_user_id, created_at);
