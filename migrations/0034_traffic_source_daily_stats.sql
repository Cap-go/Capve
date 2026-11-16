-- Daily traffic source statistics: impressions and spend imported from cost APIs.
-- When a row exists for (campaign, day), its spend is used instead of summed click costs.

CREATE TABLE IF NOT EXISTS traffic_source_daily_stats (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  program_id TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  traffic_source_id TEXT NOT NULL REFERENCES traffic_sources(id) ON DELETE CASCADE,
  -- UTC calendar day (YYYY-MM-DD)
  date TEXT NOT NULL,
  -- Source's campaign identifier (e.g. Adcash campaign_id 459729072)
  external_campaign_id TEXT,
  -- Source's zone/placement identifier (e.g. Adcash zone_id)
  external_zone_id TEXT,
  impressions INTEGER NOT NULL DEFAULT 0,
  spend_cents INTEGER NOT NULL,
  origin TEXT NOT NULL DEFAULT 'api',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(program_id, date, external_campaign_id, external_zone_id)
);

CREATE INDEX IF NOT EXISTS idx_traffic_source_daily_stats_program_date 
  ON traffic_source_daily_stats(program_id, date);
CREATE INDEX IF NOT EXISTS idx_traffic_source_daily_stats_source_date 
  ON traffic_source_daily_stats(traffic_source_id, date);

-- Mapping from external campaign identifiers to Capve campaigns.
-- When the cost API returns stats for an external campaign ID, we use this to map it to the right program.
CREATE TABLE IF NOT EXISTS traffic_source_campaign_mapping (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  traffic_source_id TEXT NOT NULL REFERENCES traffic_sources(id) ON DELETE CASCADE,
  program_id TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  -- The traffic source's campaign identifier (e.g. "459729072" for Adcash)
  external_campaign_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(traffic_source_id, external_campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_traffic_source_campaign_mapping_source 
  ON traffic_source_campaign_mapping(traffic_source_id, external_campaign_id);
CREATE INDEX IF NOT EXISTS idx_traffic_source_campaign_mapping_program 
  ON traffic_source_campaign_mapping(program_id);
