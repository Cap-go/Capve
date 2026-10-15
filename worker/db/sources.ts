import { SUB_KEYS } from "../lib/click-context";
import type { SourceToken } from "../lib/source-templates";
import { id } from "../lib/utils";

export type SourceSettingsRow = {
  traffic_source_id: string;
  user_id: string;
  template: string | null;
  tokens: string;
  api_provider: string | null;
  api_key_sealed: string | null;
  last_sync_at: number | null;
  last_sync_error: string | null;
  updated_at: number;
};

/** Public view: the API key is never returned, only whether one is stored. */
export type SourceSettings = {
  traffic_source_id: string;
  template: string | null;
  tokens: SourceToken[];
  api_provider: string | null;
  has_api_key: boolean;
  last_sync_at: number | null;
  last_sync_error: string | null;
};

export function parseTokenJson(raw: string | null | undefined): SourceToken[] {
  try {
    const value = JSON.parse(raw ?? "[]");
    return Array.isArray(value) ? (value as SourceToken[]) : [];
  } catch {
    return [];
  }
}

export function publicSettings(row: SourceSettingsRow | null, sourceId: string): SourceSettings {
  return {
    traffic_source_id: sourceId,
    template: row?.template ?? null,
    tokens: parseTokenJson(row?.tokens),
    api_provider: row?.api_provider ?? null,
    has_api_key: Boolean(row?.api_key_sealed),
    last_sync_at: row?.last_sync_at ?? null,
    last_sync_error: row?.last_sync_error ?? null,
  };
}

export async function getSourceSettingsRow(db: D1Database, sourceId: string) {
  return db
    .prepare("SELECT * FROM traffic_source_settings WHERE traffic_source_id = ?")
    .bind(sourceId)
    .first<SourceSettingsRow>();
}

/** Tokens of a traffic source, for the click redirect. Empty when none are configured. */
export async function getSourceTokens(db: D1Database, sourceId: string): Promise<SourceToken[]> {
  const row = await db
    .prepare("SELECT tokens FROM traffic_source_settings WHERE traffic_source_id = ?")
    .bind(sourceId)
    .first<{ tokens: string }>();
  return parseTokenJson(row?.tokens);
}

export async function upsertSourceSettings(
  db: D1Database,
  userId: string,
  sourceId: string,
  patch: {
    template?: string | null;
    tokens?: SourceToken[];
    api_provider?: string | null;
    api_key_sealed?: string | null;
  },
): Promise<SourceSettings> {
  const current = await getSourceSettingsRow(db, sourceId);
  const next: SourceSettingsRow = {
    traffic_source_id: sourceId,
    user_id: userId,
    template: patch.template !== undefined ? patch.template : (current?.template ?? null),
    tokens: patch.tokens !== undefined ? JSON.stringify(patch.tokens) : (current?.tokens ?? "[]"),
    api_provider:
      patch.api_provider !== undefined ? patch.api_provider : (current?.api_provider ?? null),
    api_key_sealed:
      patch.api_key_sealed !== undefined ? patch.api_key_sealed : (current?.api_key_sealed ?? null),
    last_sync_at: current?.last_sync_at ?? null,
    last_sync_error: current?.last_sync_error ?? null,
    updated_at: Date.now(),
  };
  await db
    .prepare(
      `INSERT INTO traffic_source_settings
       (traffic_source_id, user_id, template, tokens, api_provider, api_key_sealed, last_sync_at, last_sync_error, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(traffic_source_id) DO UPDATE SET
         template = excluded.template, tokens = excluded.tokens, api_provider = excluded.api_provider,
         api_key_sealed = excluded.api_key_sealed, updated_at = excluded.updated_at`,
    )
    .bind(
      next.traffic_source_id,
      next.user_id,
      next.template,
      next.tokens,
      next.api_provider,
      next.api_key_sealed,
      next.last_sync_at,
      next.last_sync_error,
      next.updated_at,
    )
    .run();
  return publicSettings(next, sourceId);
}

export async function recordSyncResult(
  db: D1Database,
  sourceId: string,
  error: string | null,
): Promise<void> {
  await db
    .prepare(
      "UPDATE traffic_source_settings SET last_sync_at = ?, last_sync_error = ? WHERE traffic_source_id = ?",
    )
    .bind(Date.now(), error, sourceId)
    .run();
}

/** Sources with a cost API configured (for the scheduled sync). */
export async function listCostApiSources(db: D1Database) {
  const { results } = await db
    .prepare(
      `SELECT * FROM traffic_source_settings
       WHERE api_provider IS NOT NULL AND api_key_sealed IS NOT NULL`,
    )
    .all<SourceSettingsRow>();
  return results ?? [];
}

// ---------------------------------------------------------------------------
// Cost updates
// ---------------------------------------------------------------------------

/** Click columns a cost update can be filtered on. */
export const COST_FILTER_DIMS = [...SUB_KEYS, "country", "external_id"] as const;
export type CostFilterDim = (typeof COST_FILTER_DIMS)[number];

export function isCostFilterDim(value: unknown): value is CostFilterDim {
  return typeof value === "string" && (COST_FILTER_DIMS as readonly string[]).includes(value);
}

export type CostFilter = { dim: CostFilterDim; value: string };

export type CostUpdate = {
  id: string;
  user_id: string;
  program_id: string | null;
  traffic_source_id: string | null;
  from_ms: number;
  to_ms: number;
  filter_dim: string | null;
  filter_value: string | null;
  total_cents: number;
  clicks_updated: number;
  origin: "manual" | "api";
  created_at: number;
};

/**
 * Sets the cost of all matching clicks so they sum to `totalCents` exactly: every click gets
 * floor(total / n) cents and the first `total mod n` clicks (by time) one cent more.
 *
 * This overwrites `clicks.cost_cents` (it does not add), so re-running a sync for the same day
 * is idempotent. Reports already prefer per-click `cost_cents` over the source's default cost,
 * so cost, profit, ROI and CPC follow without report changes. Clicks outside the range or
 * filter keep their cost.
 */
export async function applyCostUpdate(
  db: D1Database,
  input: {
    userId: string;
    /** One campaign, or every campaign of the user that uses `trafficSourceId`. */
    programId?: string;
    trafficSourceId?: string | null;
    from: number;
    to: number;
    filters?: CostFilter[];
    totalCents: number;
    origin?: "manual" | "api";
  },
): Promise<CostUpdate> {
  const filters = input.filters ?? [];
  const now = Date.now();
  let updated = 0;
  const scope = input.programId
    ? { sql: "program_id = ?", binds: [input.programId] }
    : input.trafficSourceId
      ? {
          sql: "program_id IN (SELECT id FROM programs WHERE user_id = ? AND traffic_source_id = ?)",
          binds: [input.userId, input.trafficSourceId],
        }
      : null;
  if (scope) {
    const where = [
      scope.sql,
      "created_at >= ?",
      "created_at <= ?",
      // Bot clicks carry no cost in reports: spread the spend over human clicks only.
      "is_bot = 0",
      ...filters.map((f) => `${f.dim} = ?`),
    ].join(" AND ");
    const binds = [...scope.binds, input.from, input.to, ...filters.map((f) => f.value)];

    const count = await db
      .prepare(`SELECT COUNT(*) AS n FROM clicks WHERE ${where}`)
      .bind(...binds)
      .first<{ n: number }>();
    updated = count?.n ?? 0;
    if (updated > 0) {
      const base = Math.floor(input.totalCents / updated);
      const remainder = input.totalCents - base * updated;
      await db
        .prepare(
          `WITH matched AS (
             SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS rn FROM clicks WHERE ${where}
           )
           UPDATE clicks SET cost_cents = ? + CASE
             WHEN (SELECT rn FROM matched WHERE matched.id = clicks.id) <= ? THEN 1 ELSE 0 END
           WHERE id IN (SELECT id FROM matched)`,
        )
        .bind(...binds, base, remainder)
        .run();
    }
  }

  const filterDim = filters.map((f) => f.dim).join(",") || null;
  const filterValue = filters.map((f) => f.value).join(",") || null;
  const log: CostUpdate = {
    id: id("cst"),
    user_id: input.userId,
    program_id: input.programId ?? null,
    traffic_source_id: input.trafficSourceId ?? null,
    from_ms: input.from,
    to_ms: input.to,
    filter_dim: filterDim,
    filter_value: filterValue,
    total_cents: input.totalCents,
    clicks_updated: updated,
    origin: input.origin ?? "manual",
    created_at: now,
  };
  await db
    .prepare(
      `INSERT INTO cost_updates
       (id, user_id, program_id, traffic_source_id, from_ms, to_ms, filter_dim, filter_value, total_cents, clicks_updated, origin, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      log.id,
      log.user_id,
      log.program_id,
      log.traffic_source_id,
      log.from_ms,
      log.to_ms,
      log.filter_dim,
      log.filter_value,
      log.total_cents,
      log.clicks_updated,
      log.origin,
      log.created_at,
    )
    .run();
  return log;
}

/** Cost updates of a campaign, plus source-wide syncs of its traffic source. */
export async function listCostUpdates(
  db: D1Database,
  userId: string,
  programId: string,
  trafficSourceId: string | null,
  limit = 50,
): Promise<CostUpdate[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM cost_updates
       WHERE user_id = ? AND (program_id = ? OR (program_id IS NULL AND traffic_source_id = ?))
       ORDER BY created_at DESC LIMIT ?`,
    )
    .bind(userId, programId, trafficSourceId, limit)
    .all<CostUpdate>();
  return results ?? [];
}
