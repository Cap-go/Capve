CREATE TABLE bidding_settings (
  program_id TEXT PRIMARY KEY REFERENCES programs(id) ON DELETE CASCADE,
  config TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  next_run_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE bidding_runs (
  id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  result TEXT NOT NULL
);
CREATE INDEX idx_bidding_runs_campaign ON bidding_runs(program_id, created_at DESC);
