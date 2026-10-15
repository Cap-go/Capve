import type { Env } from "../types";

/** Postback delivery log entries are kept this long. */
export const POSTBACK_DELIVERY_RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Parses RAW_CLICK_RETENTION_DAYS; null (off) unless a positive integer. */
export function rawClickRetentionDays(value: string | undefined): number | null {
  const days = Number(value?.trim());
  return Number.isInteger(days) && days > 0 ? days : null;
}

/**
 * Deletes raw clicks older than `retentionDays` that have no conversion, per campaign
 * (uses idx_clicks_program_created) and in bounded batches so one run stays within
 * the cron CPU/time budget. Returns the number of deleted clicks.
 */
export async function purgeRawClicks(
  db: D1Database,
  retentionDays: number,
  options: { batchSize?: number; maxBatches?: number; now?: number } = {},
): Promise<number> {
  const batchSize = options.batchSize ?? 1000;
  let batchesLeft = options.maxBatches ?? 100;
  const cutoff = (options.now ?? Date.now()) - retentionDays * DAY_MS;

  const { results: programs } = await db
    .prepare("SELECT id FROM programs ORDER BY id")
    .all<{ id: string }>();

  let deleted = 0;
  for (const program of programs ?? []) {
    while (batchesLeft > 0) {
      batchesLeft--;
      const result = await db
        .prepare(
          `DELETE FROM clicks WHERE id IN (
             SELECT c.id FROM clicks c
             WHERE c.program_id = ? AND c.created_at < ?
               AND NOT EXISTS (SELECT 1 FROM conversions cv WHERE cv.click_id = c.id)
             LIMIT ?
           )`,
        )
        .bind(program.id, cutoff, batchSize)
        .run();
      const changes = result.meta.changes ?? 0;
      deleted += changes;
      if (changes < batchSize) break;
    }
    if (batchesLeft <= 0) break;
  }
  return deleted;
}

export async function purgePostbackDeliveries(db: D1Database, now = Date.now()): Promise<number> {
  const result = await db
    .prepare("DELETE FROM postback_deliveries WHERE created_at < ?")
    .bind(now - POSTBACK_DELIVERY_RETENTION_DAYS * DAY_MS)
    .run();
  return result.meta.changes ?? 0;
}

/** Cron entry point: delivery log pruning always; raw click retention only when configured. */
export async function runRetention(env: Pick<Env, "DB" | "RAW_CLICK_RETENTION_DAYS">) {
  const deliveries = await purgePostbackDeliveries(env.DB);
  const days = rawClickRetentionDays(env.RAW_CLICK_RETENTION_DAYS);
  const clicks = days ? await purgeRawClicks(env.DB, days) : 0;
  console.log(`retention: deleted ${clicks} raw clicks, ${deliveries} postback deliveries`);
  return { clicks, deliveries };
}
