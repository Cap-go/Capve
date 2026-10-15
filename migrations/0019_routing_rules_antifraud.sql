-- Routing rules (Binom-style), weighted landers/offers per path, anti-fraud.

-- Ordered per-campaign rules. conditions = JSON array of
-- {"field": "country", "op": "in" | "not_in", "values": ["DE", "AT"]} (AND).
CREATE TABLE IF NOT EXISTS routing_rules (
  id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL REFERENCES programs(id),
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  conditions TEXT NOT NULL DEFAULT '[]',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_routing_rules_program ON routing_rules(program_id, sort_order);

-- NULL = default path pool; otherwise the path belongs to a rule.
ALTER TABLE paths ADD COLUMN rule_id TEXT;
CREATE INDEX IF NOT EXISTS idx_paths_rule ON paths(rule_id);

-- Several weighted landers / offers per path. paths.lander_id / offer_id stay as the
-- first item for backward compatibility.
CREATE TABLE IF NOT EXISTS path_landers (
  id TEXT PRIMARY KEY,
  path_id TEXT NOT NULL REFERENCES paths(id) ON DELETE CASCADE,
  lander_id TEXT NOT NULL REFERENCES landers(id),
  weight INTEGER NOT NULL DEFAULT 100,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_path_landers_path ON path_landers(path_id);

CREATE TABLE IF NOT EXISTS path_offers (
  id TEXT PRIMARY KEY,
  path_id TEXT NOT NULL REFERENCES paths(id) ON DELETE CASCADE,
  offer_id TEXT NOT NULL REFERENCES offers(id),
  weight INTEGER NOT NULL DEFAULT 100,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_path_offers_path ON path_offers(path_id);

INSERT INTO path_landers (id, path_id, lander_id, weight, created_at)
  SELECT 'pli_' || id, id, lander_id, 100, created_at FROM paths WHERE lander_id IS NOT NULL;

INSERT INTO path_offers (id, path_id, offer_id, weight, created_at)
  SELECT 'poi_' || id, id, offer_id, 100, created_at FROM paths WHERE offer_id IS NOT NULL;

-- Per-account blocklist: kind = ip (IP or CIDR), asn (number), ua (substring).
CREATE TABLE IF NOT EXISTS blocklist_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('ip', 'asn', 'ua')),
  value TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, kind, value)
);

CREATE INDEX IF NOT EXISTS idx_blocklist_user ON blocklist_entries(user_id);

-- Per-campaign handling of bot / blocked traffic.
-- bot_action: 'route' = count (as bot) and route normally; 'safe_page' = redirect to safe_page_url.
CREATE TABLE IF NOT EXISTS campaign_traffic_filters (
  program_id TEXT PRIMARY KEY REFERENCES programs(id),
  bot_action TEXT NOT NULL DEFAULT 'route' CHECK (bot_action IN ('route', 'safe_page')),
  safe_page_url TEXT,
  block_datacenter INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
