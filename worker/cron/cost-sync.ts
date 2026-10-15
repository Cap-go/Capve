import {
  applyCostUpdate,
  isCostFilterDim,
  listCostApiSources,
  recordSyncResult,
  type CostFilter,
  type SourceSettingsRow,
} from "../db/sources";
import { openSecret } from "../lib/secret-box";
import type { SourceToken } from "../lib/source-templates";
import type { Env } from "../types";
import { COST_PROVIDERS, type FetchFn, type SpendRow } from "./cost-providers";

const DAY_MS = 24 * 60 * 60 * 1000;

function utcDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export type CostSyncResult = {
  traffic_source_id: string;
  provider: string;
  days: string[];
  rows: number;
  updates: number;
  clicks_updated: number;
  total_cents: number;
};

function slotFor(tokens: SourceToken[], kind: "campaign" | "zone") {
  const slot = tokens.find((t) => t.kind === kind)?.slot;
  return isCostFilterDim(slot) ? slot : null;
}

/**
 * Pulls spend for `days` from the source's cost API and writes it onto the clicks of every
 * campaign using that source. Spend rows are matched to clicks through the source's tokens:
 * the token with kind "campaign" (e.g. campaignid → sub2) and kind "zone" (zoneid → sub1).
 * Without those tokens the day's spend is spread over all the source's clicks of that day.
 */
export async function syncSourceCost(
  env: Pick<Env, "DB" | "AUTH_SECRET">,
  settings: SourceSettingsRow,
  options: { days?: string[]; fetchFn?: FetchFn; now?: number } = {},
): Promise<CostSyncResult> {
  const provider = settings.api_provider ? COST_PROVIDERS[settings.api_provider] : undefined;
  if (!provider) throw new Error(`Unknown cost provider: ${settings.api_provider ?? "none"}`);
  if (!settings.api_key_sealed) throw new Error("No API key stored for this traffic source");
  const apiKey = await openSecret(settings.api_key_sealed, env.AUTH_SECRET);
  if (!apiKey) throw new Error("Stored API key cannot be decrypted (AUTH_SECRET changed?) — set it again");

  const now = options.now ?? Date.now();
  const days = options.days ?? [utcDate(now - DAY_MS), utcDate(now)];
  const sorted = [...days].sort();
  const rows = await provider.fetchSpend(
    apiKey,
    { from: sorted[0], to: sorted[sorted.length - 1] },
    options.fetchFn,
  );

  let tokens: SourceToken[] = [];
  try {
    tokens = JSON.parse(settings.tokens) as SourceToken[];
  } catch {
    tokens = [];
  }
  const campaignSlot = slotFor(tokens, "campaign");
  const zoneSlot = slotFor(tokens, "zone");

  // Sum spend per (day, filters) at the granularity the tokens allow.
  const groups = new Map<string, { date: string; filters: CostFilter[]; cents: number }>();
  for (const row of rows as SpendRow[]) {
    if (!days.includes(row.date)) continue;
    const filters: CostFilter[] = [];
    if (campaignSlot && row.campaign_id) filters.push({ dim: campaignSlot, value: row.campaign_id });
    if (zoneSlot && row.zone_id) filters.push({ dim: zoneSlot, value: row.zone_id });
    const key = `${row.date}|${filters.map((f) => `${f.dim}=${f.value}`).join("&")}`;
    const group = groups.get(key) ?? { date: row.date, filters, cents: 0 };
    group.cents += row.spend_cents;
    groups.set(key, group);
  }

  const result: CostSyncResult = {
    traffic_source_id: settings.traffic_source_id,
    provider: provider.id,
    days,
    rows: rows.length,
    updates: 0,
    clicks_updated: 0,
    total_cents: 0,
  };
  for (const group of groups.values()) {
    const from = Date.parse(`${group.date}T00:00:00Z`);
    const update = await applyCostUpdate(env.DB, {
      userId: settings.user_id,
      trafficSourceId: settings.traffic_source_id,
      from,
      to: from + DAY_MS - 1,
      filters: group.filters,
      totalCents: group.cents,
      origin: "api",
    });
    result.updates += 1;
    result.clicks_updated += update.clicks_updated;
    result.total_cents += group.cents;
  }
  return result;
}

/** Sync every source with a cost API. Errors are stored per source and do not stop the run. */
export async function syncAllSourceCosts(
  env: Pick<Env, "DB" | "AUTH_SECRET">,
  options: { fetchFn?: FetchFn; now?: number } = {},
): Promise<CostSyncResult[]> {
  const results: CostSyncResult[] = [];
  for (const settings of await listCostApiSources(env.DB)) {
    try {
      results.push(await syncSourceCost(env, settings, options));
      await recordSyncResult(env.DB, settings.traffic_source_id, null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await recordSyncResult(env.DB, settings.traffic_source_id, message.slice(0, 500));
    }
  }
  return results;
}
