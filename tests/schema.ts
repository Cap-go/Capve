export const initSql = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  name TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0,
  is_platform_admin INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_hash ON auth_tokens(token_hash);

CREATE TABLE IF NOT EXISTS programs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  api_key TEXT NOT NULL,
  destination_url TEXT,
  convert_secret TEXT,
  campaign_key TEXT,
  group_id TEXT,
  traffic_source_id TEXT,
  tags TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  tracking_domain_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_programs_user ON programs(user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_programs_campaign_key_global
  ON programs(campaign_key) WHERE campaign_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS traffic_sources (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  cost_type TEXT NOT NULL DEFAULT 'cpc',
  default_cost_cents INTEGER NOT NULL DEFAULT 0,
  postback_percent INTEGER NOT NULL DEFAULT 100,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS affiliate_networks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS landers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS offers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  network_id TEXT,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  payout_cents INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS affiliates (
  id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL REFERENCES programs(id),
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_affiliates_program ON affiliates(program_id);
CREATE INDEX IF NOT EXISTS idx_affiliates_code ON affiliates(code);

CREATE TABLE IF NOT EXISTS clicks (
  id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL REFERENCES programs(id),
  affiliate_id TEXT NOT NULL REFERENCES affiliates(id),
  ip TEXT,
  user_agent TEXT,
  path_id TEXT,
  lander_id TEXT,
  offer_id TEXT,
  country TEXT,
  region TEXT,
  city TEXT,
  device_type TEXT,
  os TEXT,
  browser TEXT,
  isp TEXT,
  referrer_domain TEXT,
  sub1 TEXT,
  sub2 TEXT,
  sub3 TEXT,
  sub4 TEXT,
  sub5 TEXT,
  sub6 TEXT,
  sub7 TEXT,
  sub8 TEXT,
  sub9 TEXT,
  sub10 TEXT,
  external_id TEXT,
  cost_cents INTEGER,
  visitor_hash TEXT,
  is_unique INTEGER NOT NULL DEFAULT 1,
  is_bot INTEGER NOT NULL DEFAULT 0,
  lp_clicked_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_clicks_affiliate ON clicks(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_clicks_program_created ON clicks(program_id, created_at);
CREATE INDEX IF NOT EXISTS idx_clicks_program_visitor ON clicks(program_id, visitor_hash, created_at);

CREATE TABLE IF NOT EXISTS rotations (
  id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL UNIQUE REFERENCES programs(id),
  mode TEXT NOT NULL DEFAULT 'normal',
  fixed_path_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS paths (
  id TEXT PRIMARY KEY,
  rotation_id TEXT NOT NULL REFERENCES rotations(id),
  name TEXT NOT NULL,
  flow_type TEXT NOT NULL,
  weight INTEGER NOT NULL DEFAULT 100,
  sort_order INTEGER NOT NULL DEFAULT 0,
  direct_url TEXT,
  lander_id TEXT,
  offer_id TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS visitor_assignments (
  id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL REFERENCES programs(id),
  visitor_key TEXT NOT NULL,
  path_id TEXT NOT NULL REFERENCES paths(id),
  created_at INTEGER NOT NULL,
  UNIQUE(program_id, visitor_key)
);

CREATE TABLE IF NOT EXISTS conversions (
  id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL REFERENCES programs(id),
  affiliate_id TEXT NOT NULL REFERENCES affiliates(id),
  click_id TEXT REFERENCES clicks(id),
  order_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'lead',
  status2 TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  event TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER,
  UNIQUE(program_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_conversions_affiliate ON conversions(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_conversions_program ON conversions(program_id);
CREATE INDEX IF NOT EXISTS idx_conversions_click ON conversions(click_id);

CREATE TABLE IF NOT EXISTS team_members (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  accepted_at INTEGER,
  UNIQUE(owner_user_id, email)
);

CREATE TABLE IF NOT EXISTS entity_notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS triggers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  program_id TEXT,
  name TEXT NOT NULL,
  event TEXT NOT NULL,
  action_type TEXT NOT NULL,
  action_url TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS api_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  prefix TEXT NOT NULL,
  last_used_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_tokens_user ON api_tokens(user_id);

CREATE TABLE IF NOT EXISTS postbacks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  program_id TEXT REFERENCES programs(id) ON DELETE CASCADE,
  traffic_source_id TEXT REFERENCES traffic_sources(id) ON DELETE CASCADE,
  network_id TEXT REFERENCES affiliate_networks(id) ON DELETE CASCADE,
  event TEXT,
  url TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_postbacks_user ON postbacks(user_id);

CREATE TABLE IF NOT EXISTS account_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  updated_at INTEGER NOT NULL
);

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
`;
