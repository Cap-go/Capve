-- Traffic source templates, named tokens, cost API settings and campaign cost updates.

-- Per-source settings kept out of traffic_sources so other columns can evolve independently.
CREATE TABLE IF NOT EXISTS traffic_source_settings (
  traffic_source_id TEXT PRIMARY KEY REFERENCES traffic_sources(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  template TEXT,
  -- JSON array of {param, name, slot, macro?, kind?}, slot = sub1..sub10 | external_id | cost
  tokens TEXT NOT NULL DEFAULT '[]',
  api_provider TEXT,
  -- AES-GCM sealed with AUTH_SECRET, never returned by the API
  api_key_sealed TEXT,
  last_sync_at INTEGER,
  last_sync_error TEXT,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_traffic_source_settings_provider ON traffic_source_settings(api_provider);

-- Audit log of cost updates. The cost itself is written to clicks.cost_cents (spread evenly
-- over matching clicks), so every report picks it up without formula changes.
CREATE TABLE IF NOT EXISTS cost_updates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  program_id TEXT REFERENCES programs(id) ON DELETE CASCADE,
  traffic_source_id TEXT REFERENCES traffic_sources(id) ON DELETE SET NULL,
  from_ms INTEGER NOT NULL,
  to_ms INTEGER NOT NULL,
  filter_dim TEXT,
  filter_value TEXT,
  total_cents INTEGER NOT NULL,
  clicks_updated INTEGER NOT NULL,
  origin TEXT NOT NULL DEFAULT 'manual',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cost_updates_program ON cost_updates(program_id, created_at);
