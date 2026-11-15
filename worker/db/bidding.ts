import { BIDDING_DEFAULTS, BIDDING_MODEL, type BiddingConfig, type BiddingResult, type BiddingRun } from "../../shared/bidding";
import { BiddingError, modelDecisions, parseBiddingConfig, ruleDecision, type ZoneEvidence } from "../lib/bidding";
import { approvedStatusSql } from "../lib/metrics";
import type { Env } from "../types";

export async function biddingSettings(db: D1Database, campaignId: string) {
  const row = await db.prepare("SELECT config, revision, next_run_at FROM bidding_settings WHERE program_id = ?")
    .bind(campaignId).first<{ config: string; revision: number; next_run_at: number }>();
  return { config: row ? parseBiddingConfig(JSON.parse(row.config)) : { ...BIDDING_DEFAULTS },
    revision: row?.revision ?? 0, next_run_at: row?.next_run_at ?? 0 };
}

export async function latestBiddingRun(db: D1Database, campaignId: string): Promise<BiddingRun | null> {
  const row = await db.prepare(`SELECT r.id, r.created_at, r.result FROM bidding_runs r
    JOIN bidding_settings s ON s.program_id = r.program_id AND s.revision = r.revision
    WHERE r.program_id = ? ORDER BY r.created_at DESC LIMIT 1`).bind(campaignId)
    .first<{ id: string; created_at: number; result: string }>();
  return row ? { ...row, result: JSON.parse(row.result) as BiddingResult } : null;
}

export async function analyzeBidding(env: Env, campaignId: string, accountId: string, now = Date.now()): Promise<BiddingRun> {
  const campaign = await env.DB.prepare("SELECT status FROM programs WHERE id = ? AND user_id = ?")
    .bind(campaignId, accountId).first<{ status: string }>();
  if (!campaign || campaign.status !== "active") throw new BiddingError("Choose an active campaign", 409);
  const { config, revision } = await biddingSettings(env.DB, campaignId);
  if (!config.enabled) throw new BiddingError("Enable the bidding beta for this campaign first", 409);
  if (!env.AI) throw new BiddingError("Workers AI is not configured on this install", 503);
  const claimed = await env.DB.prepare(`UPDATE bidding_settings SET next_run_at = ?
    WHERE program_id = ? AND revision = ? AND next_run_at <= ?`).bind(now + 15 * 60_000, campaignId, revision, now).run();
  if (!claimed.meta.changes) throw new BiddingError("Analysis is limited to once every 15 minutes per campaign", 429);

  const to = now - config.conversion_lag_hours * 3600_000;
  const from = to - config.window_hours * 3600_000;
  // Pre-aggregate conversions per click so multiple events never multiply spend or converted clicks.
  // All observations belong to the same mature click cohort, including later-arriving conversions.
  const rows = await env.DB.prepare(`WITH cohort AS (
    SELECT * FROM clicks WHERE program_id = ? AND created_at >= ? AND created_at < ? AND is_bot = 0
      AND ${config.dimension} IS NOT NULL AND TRIM(${config.dimension}) != ''
  ), cv AS (
    SELECT click_id, COUNT(*) AS conversions,
      SUM(CASE WHEN currency = ? THEN amount_cents ELSE 0 END) AS revenue_cents,
      SUM(CASE WHEN currency != ? THEN 1 ELSE 0 END) AS foreign_revenue
    FROM conversions WHERE click_id IN (SELECT id FROM cohort) AND program_id = ? AND created_at <= ? AND ${approvedStatusSql("conversions")}
      AND LOWER(TRIM(status)) NOT IN ('pending', 'hold') GROUP BY click_id
  ) SELECT c.${config.dimension} AS zone, COUNT(*) AS clicks,
    SUM(CASE WHEN cv.conversions > 0 THEN 1 ELSE 0 END) AS conversions,
    COALESCE(SUM(c.cost_cents), 0) AS cost_cents,
    SUM(CASE WHEN c.cost_cents IS NULL OR c.cost_cents < 0 THEN 1 ELSE 0 END) AS unknown_costs,
    COALESCE(SUM(cv.revenue_cents), 0) AS revenue_cents,
    COALESCE(SUM(cv.foreign_revenue), 0) AS foreign_revenue
    FROM cohort c LEFT JOIN cv ON cv.click_id = c.id
    GROUP BY c.${config.dimension} ORDER BY c.${config.dimension} LIMIT 101`)
    .bind(campaignId, from, to, config.currency, config.currency, campaignId, now).all<ZoneEvidence>();
  if (rows.results.length > 100) throw new BiddingError("Beta supports up to 100 zones per window. Shorten the analysis window.");
  const decisions = await modelDecisions(env.AI, rows.results.map((row) => ruleDecision(row, config)));
  const result: BiddingResult = { model: BIDDING_MODEL, from, to, config, decisions };
  const run = { id: `bid_${crypto.randomUUID()}`, created_at: now, result };
  const saved = await env.DB.prepare(`INSERT INTO bidding_runs (id, program_id, revision, created_at, result)
    SELECT ?, ?, ?, ?, ? WHERE EXISTS (
      SELECT 1 FROM bidding_settings s JOIN programs p ON p.id = s.program_id
      WHERE s.program_id = ? AND s.revision = ? AND p.status = 'active' AND p.user_id = ?
    )`).bind(run.id, campaignId, revision, now, JSON.stringify(result), campaignId, revision, accountId).run();
  if (!saved.meta.changes) throw new BiddingError("Settings or campaign changed during analysis. Result discarded.", 409);
  await env.DB.prepare(`DELETE FROM bidding_runs WHERE program_id = ? AND id NOT IN (
    SELECT id FROM bidding_runs WHERE program_id = ? ORDER BY created_at DESC LIMIT 20
  )`).bind(campaignId, campaignId).run();
  return run;
}
