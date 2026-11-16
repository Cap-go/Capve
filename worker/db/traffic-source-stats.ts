import { id } from "../lib/utils";

export type TrafficSourceDailyStats = {
  id: string;
  user_id: string;
  program_id: string;
  traffic_source_id: string;
  date: string;
  external_campaign_id: string | null;
  external_zone_id: string | null;
  impressions: number;
  spend_cents: number;
  origin: "api" | "manual";
  created_at: number;
  updated_at: number;
};

export type TrafficSourceCampaignMapping = {
  id: string;
  user_id: string;
  traffic_source_id: string;
  program_id: string;
  external_campaign_id: string;
  created_at: number;
};

/**
 * Upsert daily stats for a campaign from a traffic source cost API.
 * When a row exists for (program_id, date, external_campaign_id, external_zone_id),
 * reports should use this spend instead of summing click costs.
 */
export async function upsertDailyStats(
  db: D1Database,
  input: {
    userId: string;
    programId: string;
    trafficSourceId: string;
    date: string;
    externalCampaignId?: string;
    externalZoneId?: string;
    impressions: number;
    spendCents: number;
    origin?: "api" | "manual";
  },
): Promise<TrafficSourceDailyStats> {
  const now = Date.now();
  const existing = await db
    .prepare(
      `SELECT * FROM traffic_source_daily_stats 
       WHERE program_id = ? AND date = ? 
         AND COALESCE(external_campaign_id, '') = ? 
         AND COALESCE(external_zone_id, '') = ?`,
    )
    .bind(
      input.programId,
      input.date,
      input.externalCampaignId ?? "",
      input.externalZoneId ?? "",
    )
    .first<TrafficSourceDailyStats>();

  if (existing) {
    const updated: TrafficSourceDailyStats = {
      ...existing,
      impressions: input.impressions,
      spend_cents: input.spendCents,
      updated_at: now,
    };
    await db
      .prepare(
        `UPDATE traffic_source_daily_stats 
         SET impressions = ?, spend_cents = ?, updated_at = ? 
         WHERE id = ?`,
      )
      .bind(updated.impressions, updated.spend_cents, updated.updated_at, updated.id)
      .run();
    return updated;
  }

  const stats: TrafficSourceDailyStats = {
    id: id("tss"),
    user_id: input.userId,
    program_id: input.programId,
    traffic_source_id: input.trafficSourceId,
    date: input.date,
    external_campaign_id: input.externalCampaignId ?? null,
    external_zone_id: input.externalZoneId ?? null,
    impressions: input.impressions,
    spend_cents: input.spendCents,
    origin: input.origin ?? "api",
    created_at: now,
    updated_at: now,
  };

  await db
    .prepare(
      `INSERT INTO traffic_source_daily_stats 
       (id, user_id, program_id, traffic_source_id, date, external_campaign_id, external_zone_id, 
        impressions, spend_cents, origin, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      stats.id,
      stats.user_id,
      stats.program_id,
      stats.traffic_source_id,
      stats.date,
      stats.external_campaign_id,
      stats.external_zone_id,
      stats.impressions,
      stats.spend_cents,
      stats.origin,
      stats.created_at,
      stats.updated_at,
    )
    .run();

  return stats;
}

/**
 * Get daily stats for a campaign in a date range.
 */
export async function getDailyStats(
  db: D1Database,
  programId: string,
  from: string,
  to: string,
): Promise<TrafficSourceDailyStats[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM traffic_source_daily_stats 
       WHERE program_id = ? AND date >= ? AND date <= ? 
       ORDER BY date`,
    )
    .bind(programId, from, to)
    .all<TrafficSourceDailyStats>();
  return results ?? [];
}

/**
 * Get or create a mapping from external campaign ID to Capve campaign.
 */
export async function getCampaignMapping(
  db: D1Database,
  trafficSourceId: string,
  externalCampaignId: string,
): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT program_id FROM traffic_source_campaign_mapping 
       WHERE traffic_source_id = ? AND external_campaign_id = ?`,
    )
    .bind(trafficSourceId, externalCampaignId)
    .first<{ program_id: string }>();
  return row?.program_id ?? null;
}

/**
 * Set the mapping from an external campaign ID to a Capve campaign.
 */
export async function upsertCampaignMapping(
  db: D1Database,
  input: {
    userId: string;
    trafficSourceId: string;
    programId: string;
    externalCampaignId: string;
  },
): Promise<TrafficSourceCampaignMapping> {
  const existing = await db
    .prepare(
      `SELECT * FROM traffic_source_campaign_mapping 
       WHERE traffic_source_id = ? AND external_campaign_id = ?`,
    )
    .bind(input.trafficSourceId, input.externalCampaignId)
    .first<TrafficSourceCampaignMapping>();

  if (existing) {
    if (existing.program_id !== input.programId) {
      await db
        .prepare(
          `UPDATE traffic_source_campaign_mapping 
           SET program_id = ? WHERE id = ?`,
        )
        .bind(input.programId, existing.id)
        .run();
      return { ...existing, program_id: input.programId };
    }
    return existing;
  }

  const mapping: TrafficSourceCampaignMapping = {
    id: id("tsm"),
    user_id: input.userId,
    traffic_source_id: input.trafficSourceId,
    program_id: input.programId,
    external_campaign_id: input.externalCampaignId,
    created_at: Date.now(),
  };

  await db
    .prepare(
      `INSERT INTO traffic_source_campaign_mapping 
       (id, user_id, traffic_source_id, program_id, external_campaign_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      mapping.id,
      mapping.user_id,
      mapping.traffic_source_id,
      mapping.program_id,
      mapping.external_campaign_id,
      mapping.created_at,
    )
    .run();

  return mapping;
}

/**
 * List all campaign mappings for a traffic source.
 */
export async function listCampaignMappings(
  db: D1Database,
  trafficSourceId: string,
): Promise<TrafficSourceCampaignMapping[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM traffic_source_campaign_mapping 
       WHERE traffic_source_id = ? 
       ORDER BY created_at`,
    )
    .bind(trafficSourceId)
    .all<TrafficSourceCampaignMapping>();
  return results ?? [];
}

/**
 * Delete a campaign mapping.
 */
export async function deleteCampaignMapping(
  db: D1Database,
  mappingId: string,
): Promise<void> {
  await db
    .prepare("DELETE FROM traffic_source_campaign_mapping WHERE id = ?")
    .bind(mappingId)
    .run();
}
