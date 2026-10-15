-- Multiple outgoing postbacks per campaign, traffic source or affiliate network.
-- Each postback can be limited to one conversion event (registration, ftd, ...).

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
CREATE INDEX IF NOT EXISTS idx_postbacks_program ON postbacks(program_id);
CREATE INDEX IF NOT EXISTS idx_postbacks_source ON postbacks(traffic_source_id);
CREATE INDEX IF NOT EXISTS idx_postbacks_network ON postbacks(network_id);

INSERT INTO postbacks (id, user_id, program_id, url, created_at)
SELECT 'pb_' || lower(hex(randomblob(8))), user_id, id, trim(s2s_postback_url), created_at
FROM programs WHERE trim(COALESCE(s2s_postback_url, '')) <> '';

INSERT INTO postbacks (id, user_id, traffic_source_id, url, created_at)
SELECT 'pb_' || lower(hex(randomblob(8))), user_id, id, trim(s2s_postback_url), created_at
FROM traffic_sources WHERE trim(COALESCE(s2s_postback_url, '')) <> '';

INSERT INTO postbacks (id, user_id, network_id, url, created_at)
SELECT 'pb_' || lower(hex(randomblob(8))), user_id, id, trim(postback_url_template), created_at
FROM affiliate_networks WHERE trim(COALESCE(postback_url_template, '')) <> '';

ALTER TABLE programs DROP COLUMN s2s_postback_url;
ALTER TABLE traffic_sources DROP COLUMN s2s_postback_url;
ALTER TABLE affiliate_networks DROP COLUMN postback_url_template;

-- Conversion event (registration, ftd, ...). NULL = plain conversion.
ALTER TABLE conversions ADD COLUMN event TEXT;
CREATE INDEX IF NOT EXISTS idx_conversions_program_event ON conversions(program_id, event);
