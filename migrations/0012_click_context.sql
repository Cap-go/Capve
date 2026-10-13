-- Binom-style click context, LP clicks, per-click cost, conversion status updates

ALTER TABLE clicks ADD COLUMN country TEXT;
ALTER TABLE clicks ADD COLUMN region TEXT;
ALTER TABLE clicks ADD COLUMN city TEXT;
ALTER TABLE clicks ADD COLUMN device_type TEXT;
ALTER TABLE clicks ADD COLUMN os TEXT;
ALTER TABLE clicks ADD COLUMN browser TEXT;
ALTER TABLE clicks ADD COLUMN isp TEXT;
ALTER TABLE clicks ADD COLUMN referrer_domain TEXT;
ALTER TABLE clicks ADD COLUMN sub1 TEXT;
ALTER TABLE clicks ADD COLUMN sub2 TEXT;
ALTER TABLE clicks ADD COLUMN sub3 TEXT;
ALTER TABLE clicks ADD COLUMN sub4 TEXT;
ALTER TABLE clicks ADD COLUMN sub5 TEXT;
ALTER TABLE clicks ADD COLUMN sub6 TEXT;
ALTER TABLE clicks ADD COLUMN sub7 TEXT;
ALTER TABLE clicks ADD COLUMN sub8 TEXT;
ALTER TABLE clicks ADD COLUMN sub9 TEXT;
ALTER TABLE clicks ADD COLUMN sub10 TEXT;
ALTER TABLE clicks ADD COLUMN external_id TEXT;
ALTER TABLE clicks ADD COLUMN cost_cents INTEGER;
ALTER TABLE clicks ADD COLUMN visitor_hash TEXT;
ALTER TABLE clicks ADD COLUMN is_unique INTEGER NOT NULL DEFAULT 1;
ALTER TABLE clicks ADD COLUMN is_bot INTEGER NOT NULL DEFAULT 0;
ALTER TABLE clicks ADD COLUMN lp_clicked_at INTEGER;

ALTER TABLE conversions ADD COLUMN updated_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_clicks_program_created ON clicks(program_id, created_at);
CREATE INDEX IF NOT EXISTS idx_clicks_program_visitor ON clicks(program_id, visitor_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_conversions_click ON conversions(click_id);
