-- Redirect/report performance + outgoing postback delivery log.

-- top_to_bottom rotation: atomic per-rotation counter instead of counting every click.
ALTER TABLE rotations ADD COLUMN rr_counter INTEGER NOT NULL DEFAULT 0;
-- Continue existing rotations where the old click-count index left off.
UPDATE rotations
SET rr_counter = (SELECT COUNT(*) FROM clicks WHERE clicks.program_id = rotations.program_id)
WHERE mode = 'top_to_bottom';

-- Report / stats indexes. The single-column program indexes are prefixes of these.
CREATE INDEX IF NOT EXISTS idx_conversions_program_created ON conversions(program_id, created_at);
DROP INDEX IF EXISTS idx_conversions_program;
CREATE INDEX IF NOT EXISTS idx_clicks_program_affiliate ON clicks(program_id, affiliate_id);
DROP INDEX IF EXISTS idx_clicks_program;

-- One row per outgoing postback attempt (initial + 1 retry on failure).
CREATE TABLE IF NOT EXISTS postback_deliveries (
  id TEXT PRIMARY KEY,
  postback_id TEXT NOT NULL REFERENCES postbacks(id) ON DELETE CASCADE,
  conversion_id TEXT,
  url TEXT NOT NULL,
  status_code INTEGER,
  error TEXT,
  attempt INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_postback_deliveries_postback ON postback_deliveries(postback_id, created_at);
CREATE INDEX IF NOT EXISTS idx_postback_deliveries_created ON postback_deliveries(created_at);
