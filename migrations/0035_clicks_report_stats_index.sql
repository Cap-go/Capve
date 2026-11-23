-- Covering index for campaign stats. The list query aggregates every click in the
-- selected period (hundreds of thousands to ~1M rows over a month). The previous
-- (program_id, created_at) index still forced a table lookup per click for
-- is_bot / cost / lp_clicked_at. This index answers that aggregation without
-- reading the wide clicks row.

CREATE INDEX IF NOT EXISTS idx_clicks_program_created_stats
  ON clicks(program_id, created_at, is_bot, is_unique, cost_cents, cpa_cost_cents, lp_clicked_at, id);
