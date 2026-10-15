-- Account settings (report timezone), automation rules + zone blacklist, custom tracking domains.

CREATE TABLE IF NOT EXISTS account_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  updated_at INTEGER NOT NULL
);

-- kind = 'zone_blacklist': zones (values of `dimension`, e.g. sub1) with >= min_clicks and
--   no conversions (or none of `event`) in the last window_hours get blacklisted.
-- kind = 'alert': fires when every set condition holds over the last window_hours:
--   ROI < roi_below and/or cost > spend_above_cents.
CREATE TABLE IF NOT EXISTS automation_rules (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  program_id TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  dimension TEXT,
  min_clicks INTEGER,
  event TEXT,
  roi_below REAL,
  spend_above_cents INTEGER,
  window_hours INTEGER NOT NULL DEFAULT 24,
  notify_email TEXT,
  webhook_url TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run_at INTEGER,
  last_fired_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_automation_rules_user ON automation_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_automation_rules_program ON automation_rules(program_id);

CREATE TABLE IF NOT EXISTS zone_blacklist (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  program_id TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  dimension TEXT NOT NULL,
  value TEXT NOT NULL,
  rule_id TEXT,
  reason TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(program_id, dimension, value)
);

CREATE INDEX IF NOT EXISTS idx_zone_blacklist_user ON zone_blacklist(user_id);

CREATE TABLE IF NOT EXISTS tracking_domains (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  hostname TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tracking_domains_user ON tracking_domains(user_id);

ALTER TABLE programs ADD COLUMN tracking_domain_id TEXT REFERENCES tracking_domains(id) ON DELETE SET NULL;
