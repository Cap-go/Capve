-- Store traffic source and cost on each click at click time, so changing a
-- traffic source's CPC/CPM/CPA or a campaign's source does not rewrite history.
-- cost_cents: CPC/CPM cost of the click (or the `cost` passed on the click URL).
-- cpa_cost_cents: CPA rate charged once if the click converts.

ALTER TABLE clicks ADD COLUMN traffic_source_id TEXT;
ALTER TABLE clicks ADD COLUMN cpa_cost_cents INTEGER;

-- One-time backfill of existing clicks from the current settings.
UPDATE clicks SET traffic_source_id = (
  SELECT p.traffic_source_id FROM programs p WHERE p.id = clicks.program_id
) WHERE traffic_source_id IS NULL;

UPDATE clicks SET cpa_cost_cents = (
  SELECT ts.default_cost_cents FROM traffic_sources ts
  WHERE ts.id = clicks.traffic_source_id AND ts.cost_type = 'cpa'
) WHERE cost_cents IS NULL AND traffic_source_id IS NOT NULL;

UPDATE clicks SET cost_cents = (
  SELECT CASE ts.cost_type
    WHEN 'cpc' THEN ts.default_cost_cents
    WHEN 'cpm' THEN ts.default_cost_cents / 1000.0
    END
  FROM traffic_sources ts WHERE ts.id = clicks.traffic_source_id
) WHERE cost_cents IS NULL AND traffic_source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clicks_traffic_source ON clicks(traffic_source_id);
