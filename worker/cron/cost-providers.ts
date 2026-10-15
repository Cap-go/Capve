/** One spend row reported by a traffic source API, for one UTC day. */
export type SpendRow = {
  /** YYYY-MM-DD (UTC). */
  date: string;
  /** The source's own campaign id, when the report is broken down by campaign. */
  campaign_id?: string;
  /** The source's zone / placement id, when broken down by zone. */
  zone_id?: string;
  spend_cents: number;
};

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export interface CostProvider {
  id: string;
  name: string;
  /** Spend for each day in [from, to] (YYYY-MM-DD, inclusive). Throws on API errors. */
  fetchSpend(apiKey: string, range: { from: string; to: string }, fetchFn?: FetchFn): Promise<SpendRow[]>;
}

function firstString(row: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return undefined;
}

function firstNumber(row: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = Number(row[key]);
    if (row[key] != null && row[key] !== "" && Number.isFinite(value)) return value;
  }
  return undefined;
}

/**
 * Adcash advertiser statistics.
 *
 * TODO(adcash-api): confirm the endpoint, auth header and field names against the Adcash
 * advertiser API docs (https://adcash.com) with a real key. The parser below accepts the common
 * shapes (`data` / `rows` / `items` / top-level array, `spend` / `cost` / `expenses` in
 * currency units) so only `ADCASH_STATS_URL` and the query params should need adjusting.
 */
export const ADCASH_STATS_URL = "https://api.adcash.com/v2/advertiser/statistics";

export const adcashProvider: CostProvider = {
  id: "adcash",
  name: "Adcash",
  async fetchSpend(apiKey, range, fetchFn = fetch) {
    const url = new URL(ADCASH_STATS_URL);
    url.searchParams.set("date_from", range.from);
    url.searchParams.set("date_to", range.to);
    url.searchParams.set("group_by", "date,campaign,zone");
    const res = await fetchFn(url.toString(), {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`Adcash API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const body = (await res.json()) as unknown;
    const list = Array.isArray(body)
      ? body
      : ((body as Record<string, unknown>)?.data ??
        (body as Record<string, unknown>)?.rows ??
        (body as Record<string, unknown>)?.items);
    if (!Array.isArray(list)) throw new Error("Adcash API: unexpected response shape");

    const rows: SpendRow[] = [];
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const date = firstString(row, ["date", "day"])?.slice(0, 10);
      const spend = firstNumber(row, ["spend", "cost", "expenses", "amount"]);
      if (!date || spend === undefined || spend < 0) continue;
      rows.push({
        date,
        campaign_id: firstString(row, ["campaign_id", "campaignId", "campaign"]),
        zone_id: firstString(row, ["zone_id", "zoneId", "zone"]),
        spend_cents: Math.round(spend * 100),
      });
    }
    return rows;
  },
};

export const COST_PROVIDERS: Record<string, CostProvider> = {
  [adcashProvider.id]: adcashProvider,
};
