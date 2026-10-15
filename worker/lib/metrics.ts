export type CampaignMetrics = {
  clicks: number;
  lp_clicks: number;
  leads: number;
  revenue_cents: number;
  cost_cents: number;
  profit_cents: number;
  lp_ctr: number;
  cr: number;
  epc_cents: number;
  cpc_cents: number;
  roi: number;
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
    cr: clicks > 0 ? round2((leads / clicks) * 100) : 0,
    epc_cents: clicks > 0 ? Math.round(revenue_cents / clicks) : 0,
    cpc_cents: clicks > 0 ? Math.round(cost_cents / clicks) : 0,
    roi: cost_cents > 0 ? round2((profit_cents / cost_cents) * 100) : 0,
  };
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

/** Statuses that are not rejected but not approved yet either (no source/network postback). */
export const PENDING_STATUSES = ["pending", "hold"] as const;

/** Approved for outgoing traffic-source / network postbacks: not rejected and not pending/hold. */
export function isPostbackApprovedStatus(status: string | null | undefined): boolean {
  const value = (status ?? "lead").trim().toLowerCase();
  return isApprovedStatus(value) && !(PENDING_STATUSES as readonly string[]).includes(value);
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
  let text = value == null ? "" : String(value);
  // Neutralise spreadsheet formulas (CSV injection): =, +, -, @, tab, CR.
  // Plain numbers (e.g. negative profit "-12.50") are left alone.
  if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) {
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
