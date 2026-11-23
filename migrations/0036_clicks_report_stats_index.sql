-- Covering index for campaign stats. The list query aggregates every click in a
-- bounded window (at most seven days of one campaign). It reads only these
-- columns, so the scan does not touch the wide clicks row, the click id, or
-- cpa_cost_cents. Converted clicks and CPA cost are a separate query that
-- starts from conversions and looks the click up by primary key.

DROP INDEX IF EXISTS idx_clicks_program_created_stats;

CREATE INDEX IF NOT EXISTS idx_clicks_program_created_stats
  ON clicks(program_id, created_at, is_bot, is_unique, cost_cents, lp_clicked_at);
