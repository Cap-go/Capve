export type CampaignMetrics = {
  clicks: number;
  lp_clicks: number;
  /** Conversions: distinct converted clicks + click-less conversions (events do not add up). */
  leads: number;
  revenue_cents: number;
  cost_cents: number;
  profit_cents: number;
  lp_ctr: number;
  cr: number;
  epc_cents: number;
  cpc_cents: number;
  /** null when there is no cost. */
  roi: number | null;
};

export function computeMetrics(input: {
  clicks: number;
  lp_clicks: number;
  leads: number;
  revenue_cents: number;
  cost_cents: number;
}): CampaignMetrics {
  const { clicks, lp_clicks, leads, revenue_cents, cost_cents } = input;
  const profit_cents = revenue_cents - cost_cents;

  return {
    clicks,
    lp_clicks,
    leads,
    revenue_cents,
    cost_cents,
    profit_cents,
    lp_ctr: clicks > 0 ? round2((lp_clicks / clicks) * 100) : 0,
    cr: conversionRatePct(leads, clicks),
    epc_cents: clicks > 0 ? Math.round(revenue_cents / clicks) : 0,
    cpc_cents: clicks > 0 ? Math.round(cost_cents / clicks) : 0,
    roi: cost_cents > 0 ? round2((profit_cents / cost_cents) * 100) : null,
  };
}

/**
 * CR in percent. Click-less conversions (affiliate code / cookie) cannot be matched to a
 * click, so the rate is capped at 100%.
 */
export function conversionRatePct(conversions: number, clicks: number): number {
  if (clicks <= 0) return 0;
  return round2((Math.min(conversions, clicks) / clicks) * 100);
}

export type EventMetrics = {
  /** Converted clicks (or click-less conversions) with this event. */
  count: number;
  revenue_cents: number;
  cr: number;
  /** Cost per event; null when there is no cost data. */
  cpa_cents: number | null;
};

export function computeEventMetrics(
  events: Record<string, { count: number; revenue_cents: number }>,
  clicks: number,
  costCents: number | null,
): Record<string, EventMetrics> {
  return Object.fromEntries(
    Object.entries(events).map(([event, { count, revenue_cents }]) => [
      event,
      {
        count,
        revenue_cents,
        cr: conversionRatePct(count, clicks),
        cpa_cents: costCents != null && costCents > 0 && count > 0 ? Math.round(costCents / count) : null,
      },
    ]),
  );
}

/**
 * Most used currency (ties: USD, then alphabetical). Revenue fields hold this currency only;
 * other currencies are reported in `revenue_by_currency` and never summed together.
 */
export function primaryCurrency(counts: Map<string, number>): string {
  let best = "USD";
  let bestCount = -1;
  for (const [currency, count] of [...counts].sort(([a], [b]) =>
    a === "USD" ? -1 : b === "USD" ? 1 : a.localeCompare(b),
  )) {
    if (count > bestCount) {
      best = currency;
      bestCount = count;
    }
  }
  return best;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function costForTraffic(
  costType: "cpc" | "cpm" | "cpa",
  defaultCostCents: number,
  clicks: number,
  leads: number,
): number {
  switch (costType) {
    case "cpc":
      return clicks * defaultCostCents;
    case "cpm":
      return Math.round((clicks * defaultCostCents) / 1000);
    case "cpa":
      return leads * defaultCostCents;
    default:
      return 0;
  }
}

/**
 * Conversion statuses that do NOT count as leads/revenue in reports.
 * Every other status (lead, sale, approved, pending, …) counts as an approved conversion.
 */
export const REJECTED_STATUSES = [
  "rejected",
  "declined",
  "reversed",
  "refunded",
  "chargeback",
  "canceled",
  "cancelled",
  "trash",
  "fraud",
] as const;

export function isApprovedStatus(status: string | null | undefined): boolean {
  return !(REJECTED_STATUSES as readonly string[]).includes((status ?? "lead").trim().toLowerCase());
}

/** SQL predicate matching approved conversions (status not in REJECTED_STATUSES). */
export function approvedStatusSql(alias = "cv"): string {
  const list = REJECTED_STATUSES.map((s) => `'${s}'`).join(", ");
  return `LOWER(${alias}.status) NOT IN (${list})`;
}

export type ReportFilters = {
  from?: number;
  to?: number;
  group_id?: string;
  traffic_source_id?: string;
  status?: string;
};

export function parseReportFilters(query: Record<string, string | undefined>): ReportFilters {
  const fromRaw = query.from?.trim();
  const toRaw = query.to?.trim();
  return {
    from: fromRaw ? Number(fromRaw) : undefined,
    to: toRaw ? Number(toRaw) : undefined,
    group_id: query.group_id?.trim() || undefined,
    traffic_source_id: query.traffic_source_id?.trim() || undefined,
    status: query.status?.trim() || undefined,
  };
}

export function csvEscape(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(headers: string[], rows: Array<Array<string | number>>): string {
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(row.map((cell) => csvEscape(cell)).join(","));
  }
  return `${lines.join("\n")}\n`;
}
