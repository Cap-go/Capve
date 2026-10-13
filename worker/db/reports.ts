import type { Program } from "../types";
import { approvedStatusSql, computeMetrics, type ReportFilters } from "../lib/metrics";

export type CampaignReportRow = Program & {
  group_name: string | null;
  traffic_source_name: string | null;
  cost_type: "cpc" | "cpm" | "cpa" | null;
  default_cost_cents: number;
  metrics: ReturnType<typeof computeMetrics>;
};

export type TrendPoint = {
  date: string;
  clicks: number;
  lp_clicks: number;
  leads: number;
  revenue_cents: number;
  cost_cents: number;
};

type ProgramRow = Program & {
  group_name: string | null;
  traffic_source_name: string | null;
  cost_type: "cpc" | "cpm" | "cpa" | null;
  default_cost_cents: number | null;
};

function programWhere(userId: string, filters: ReportFilters, alias = "p") {
  const clauses = [`${alias}.user_id = ?`];
  const binds: Array<string | number> = [userId];

  if (filters.group_id) {
    clauses.push(`${alias}.group_id = ?`);
    binds.push(filters.group_id);
  }
  if (filters.traffic_source_id) {
    clauses.push(`${alias}.traffic_source_id = ?`);
    binds.push(filters.traffic_source_id);
  }
  if (filters.status) {
    clauses.push(`${alias}.status = ?`);
    binds.push(filters.status);
  }

  return { sql: clauses.join(" AND "), binds };
}

function clickTimeClause(filters: ReportFilters, alias = "c") {
  const clauses: string[] = [];
  const binds: number[] = [];
  if (filters.from != null) {
    clauses.push(`${alias}.created_at >= ?`);
    binds.push(filters.from);
  }
  if (filters.to != null) {
    clauses.push(`${alias}.created_at <= ?`);
    binds.push(filters.to);
  }
  return {
    sql: clauses.length ? ` AND ${clauses.join(" AND ")}` : "",
    binds,
  };
}

function conversionTimeClause(filters: ReportFilters, alias = "cv") {
  const clauses: string[] = [];
  const binds: number[] = [];
  if (filters.from != null) {
    clauses.push(`${alias}.created_at >= ?`);
    binds.push(filters.from);
  }
  if (filters.to != null) {
    clauses.push(`${alias}.created_at <= ?`);
    binds.push(filters.to);
  }
  return {
    sql: clauses.length ? ` AND ${clauses.join(" AND ")}` : "",
    binds,
  };
}

const PROGRAM_COLUMNS =
  "p.id, p.user_id, p.name, p.slug, p.api_key, p.destination_url, p.s2s_postback_url, p.campaign_key, p.group_id, p.traffic_source_id, p.tags, p.status, p.created_at";

export const GROUP_DIMENSIONS = [
  "campaign",
  "date",
  "country",
  "region",
  "city",
  "device_type",
  "os",
  "browser",
  "isp",
  "referrer_domain",
  "offer",
  "lander",
  "path",
  "traffic_source",
  "affiliate",
  "sub1",
  "sub2",
  "sub3",
  "sub4",
  "sub5",
  "sub6",
  "sub7",
  "sub8",
  "sub9",
  "sub10",
] as const;

export type GroupDimension = (typeof GROUP_DIMENSIONS)[number];

export function isGroupDimension(value: string | undefined): value is GroupDimension {
  return !!value && (GROUP_DIMENSIONS as readonly string[]).includes(value);
}

type DimensionSql = {
  /** Group key over clicks (alias c, programs p). */
  click: string;
  /** Group key over conversions (alias cv, left-joined click c, programs p). */
  conv: string;
  label?: string;
  clickJoin?: string;
  convJoin?: string;
};

/** Conversions are attributed to their click's time (Binom); click-less ones use their own time. */
const CONV_TIME = "COALESCE(c.created_at, cv.created_at)";

function dimensionSql(by: GroupDimension): DimensionSql {
  switch (by) {
    case "campaign":
      return { click: "p.id", conv: "p.id", label: "p.name" };
    case "date":
      return {
        click: "strftime('%Y-%m-%d', c.created_at / 1000, 'unixepoch')",
        conv: `strftime('%Y-%m-%d', ${CONV_TIME} / 1000, 'unixepoch')`,
      };
    case "offer":
      return {
        click: "c.offer_id",
        conv: "c.offer_id",
        label: "o.name",
        clickJoin: "LEFT JOIN offers o ON o.id = c.offer_id",
        convJoin: "LEFT JOIN offers o ON o.id = c.offer_id",
      };
    case "lander":
      return {
        click: "c.lander_id",
        conv: "c.lander_id",
        label: "l.name",
        clickJoin: "LEFT JOIN landers l ON l.id = c.lander_id",
        convJoin: "LEFT JOIN landers l ON l.id = c.lander_id",
      };
    case "path":
      return {
        click: "c.path_id",
        conv: "c.path_id",
        label: "pa.name",
        clickJoin: "LEFT JOIN paths pa ON pa.id = c.path_id",
        convJoin: "LEFT JOIN paths pa ON pa.id = c.path_id",
      };
    case "traffic_source":
      return { click: "p.traffic_source_id", conv: "p.traffic_source_id", label: "ts.name" };
    case "affiliate":
      return {
        click: "c.affiliate_id",
        conv: "cv.affiliate_id",
        label: "a.name",
        clickJoin: "LEFT JOIN affiliates a ON a.id = c.affiliate_id",
        convJoin: "LEFT JOIN affiliates a ON a.id = cv.affiliate_id",
      };
    default:
      // Plain click columns (country, os, sub1…); `by` is validated against GROUP_DIMENSIONS.
      return { click: `c.${by}`, conv: `c.${by}` };
  }
}

export type GroupedReportRow = {
  key: string | null;
  label: string;
  unique_clicks: number;
  bot_clicks: number;
  metrics: ReturnType<typeof computeMetrics>;
};

export type GroupedReportOptions = ReportFilters & { campaign_id?: string };

/**
 * Report grouped by one dimension using two GROUP BY queries (clicks, conversions).
 * Cost = per-click `cost_cents` when present, else the traffic source model
 * (CPC per click, CPM per 1000 clicks, CPA per approved conversion).
 */
export async function getGroupedReport(
  db: D1Database,
  userId: string,
  by: GroupDimension,
  options: GroupedReportOptions,
): Promise<GroupedReportRow[]> {
  const dim = dimensionSql(by);
  const where = programWhere(userId, options);
  const campaignSql = options.campaign_id ? " AND p.id = ?" : "";
  const campaignBinds = options.campaign_id ? [options.campaign_id] : [];
  const clickTime = clickTimeClause(options, "c");
  const convTime = timeClause(options, CONV_TIME);
  const label = dim.label ?? "NULL";

  const [clickRows, convRows] = await Promise.all([
    db
      .prepare(
        `SELECT ${dim.click} AS k, MAX(${label}) AS label,
          COUNT(*) AS clicks,
          COALESCE(SUM(c.is_unique), 0) AS unique_clicks,
          COALESCE(SUM(c.is_bot), 0) AS bot_clicks,
          SUM(CASE WHEN c.lp_clicked_at IS NOT NULL THEN 1 ELSE 0 END) AS lp_clicks,
          COALESCE(SUM(CASE
            WHEN c.cost_cents IS NOT NULL THEN c.cost_cents
            WHEN ts.cost_type = 'cpm' THEN ts.default_cost_cents / 1000.0
            WHEN ts.cost_type = 'cpc' THEN ts.default_cost_cents
            ELSE 0 END), 0) AS cost
         FROM clicks c
         JOIN programs p ON p.id = c.program_id
         LEFT JOIN traffic_sources ts ON ts.id = p.traffic_source_id
         ${dim.clickJoin ?? ""}
         WHERE ${where.sql}${campaignSql}${clickTime.sql}
         GROUP BY k`,
      )
      .bind(...where.binds, ...campaignBinds, ...clickTime.binds)
      .all<{
        k: string | null;
        label: string | null;
        clicks: number;
        unique_clicks: number;
        bot_clicks: number;
        lp_clicks: number;
        cost: number;
      }>(),
    db
      .prepare(
        `SELECT ${dim.conv} AS k, MAX(${label}) AS label,
          COUNT(*) AS leads,
          COALESCE(SUM(cv.amount_cents), 0) AS revenue,
          COALESCE(SUM(CASE
            WHEN ts.cost_type = 'cpa' AND c.cost_cents IS NULL THEN ts.default_cost_cents
            ELSE 0 END), 0) AS cpa_cost
         FROM conversions cv
         JOIN programs p ON p.id = cv.program_id
         LEFT JOIN clicks c ON c.id = cv.click_id
         LEFT JOIN traffic_sources ts ON ts.id = p.traffic_source_id
         ${dim.convJoin ?? ""}
         WHERE ${where.sql}${campaignSql} AND ${approvedStatusSql("cv")}${convTime.sql}
         GROUP BY k`,
      )
      .bind(...where.binds, ...campaignBinds, ...convTime.binds)
      .all<{ k: string | null; label: string | null; leads: number; revenue: number; cpa_cost: number }>(),
  ]);

  type Acc = {
    key: string | null;
    label: string | null;
    clicks: number;
    unique_clicks: number;
    bot_clicks: number;
    lp_clicks: number;
    leads: number;
    revenue_cents: number;
    cost: number;
  };
  const groups = new Map<string, Acc>();
  const get = (key: string | null, labelValue: string | null) => {
    const mapKey = key ?? "\u0000";
    let acc = groups.get(mapKey);
    if (!acc) {
      acc = {
        key,
        label: labelValue,
        clicks: 0,
        unique_clicks: 0,
        bot_clicks: 0,
        lp_clicks: 0,
        leads: 0,
        revenue_cents: 0,
        cost: 0,
      };
      groups.set(mapKey, acc);
    }
    acc.label ??= labelValue;
    return acc;
  };

  for (const row of clickRows.results ?? []) {
    const acc = get(row.k, row.label);
    acc.clicks += row.clicks;
    acc.unique_clicks += row.unique_clicks;
    acc.bot_clicks += row.bot_clicks;
    acc.lp_clicks += row.lp_clicks;
    acc.cost += row.cost;
  }
  for (const row of convRows.results ?? []) {
    const acc = get(row.k, row.label);
    acc.leads += row.leads;
    acc.revenue_cents += row.revenue;
    acc.cost += row.cpa_cost;
  }

  const rows = [...groups.values()].map((acc) => ({
    key: acc.key,
    label: acc.label ?? acc.key ?? "(none)",
    unique_clicks: acc.unique_clicks,
    bot_clicks: acc.bot_clicks,
    metrics: computeMetrics({
      clicks: acc.clicks,
      lp_clicks: acc.lp_clicks,
      leads: acc.leads,
      revenue_cents: acc.revenue_cents,
      cost_cents: Math.round(acc.cost),
    }),
  }));

  if (by === "date") {
    return rows.sort((a, b) => (a.key ?? "").localeCompare(b.key ?? ""));
  }
  return rows.sort((a, b) => b.metrics.clicks - a.metrics.clicks || b.metrics.leads - a.metrics.leads);
}

function timeClause(filters: ReportFilters, column: string) {
  const clauses: string[] = [];
  const binds: number[] = [];
  if (filters.from != null) {
    clauses.push(`${column} >= ?`);
    binds.push(filters.from);
  }
  if (filters.to != null) {
    clauses.push(`${column} <= ?`);
    binds.push(filters.to);
  }
  return { sql: clauses.length ? ` AND ${clauses.join(" AND ")}` : "", binds };
}

export async function listCampaignReports(
  db: D1Database,
  userId: string,
  filters: ReportFilters,
): Promise<CampaignReportRow[]> {
  const where = programWhere(userId, filters);
  const [{ results }, grouped] = await Promise.all([
    db
      .prepare(
        `SELECT ${PROGRAM_COLUMNS},
          g.name AS group_name,
          ts.name AS traffic_source_name,
          ts.cost_type,
          ts.default_cost_cents
         FROM programs p
         LEFT JOIN groups g ON g.id = p.group_id
         LEFT JOIN traffic_sources ts ON ts.id = p.traffic_source_id
         WHERE ${where.sql}
         ORDER BY p.created_at DESC`,
      )
      .bind(...where.binds)
      .all<ProgramRow>(),
    getGroupedReport(db, userId, "campaign", filters),
  ]);

  const byCampaign = new Map(grouped.map((row) => [row.key, row.metrics]));
  const empty = computeMetrics({ clicks: 0, lp_clicks: 0, leads: 0, revenue_cents: 0, cost_cents: 0 });

  return (results ?? []).map((program) => ({
    ...program,
    group_name: program.group_name,
    traffic_source_name: program.traffic_source_name,
    cost_type: program.cost_type,
    default_cost_cents: program.default_cost_cents ?? 0,
    metrics: byCampaign.get(program.id) ?? empty,
  }));
}

export async function getCampaignTrends(
  db: D1Database,
  programId: string,
  userId: string,
  filters: ReportFilters,
): Promise<TrendPoint[]> {
  const rows = await getGroupedReport(db, userId, "date", {
    from: filters.from,
    to: filters.to,
    campaign_id: programId,
  });
  return rows
    .filter((row) => row.key)
    .map((row) => ({
      date: row.key as string,
      clicks: row.metrics.clicks,
      lp_clicks: row.metrics.lp_clicks,
      leads: row.metrics.leads,
      revenue_cents: row.metrics.revenue_cents,
      cost_cents: row.metrics.cost_cents,
    }));
}

export async function exportClickLogCsv(
  db: D1Database,
  programId: string,
  userId: string,
  filters: ReportFilters,
): Promise<Array<Array<string | number>>> {
  const program = await db
    .prepare("SELECT id FROM programs WHERE id = ? AND user_id = ?")
    .bind(programId, userId)
    .first();
  if (!program) return [];

  const clickTime = clickTimeClause(filters, "c");
  const { results } = await db
    .prepare(
      `SELECT
        c.id, c.created_at, a.code AS affiliate_code, a.name AS affiliate_name,
        c.ip, c.lander_id, c.offer_id, c.path_id,
        EXISTS(SELECT 1 FROM conversions cv WHERE cv.click_id = c.id) AS converted
       FROM clicks c
       JOIN affiliates a ON a.id = c.affiliate_id
       WHERE c.program_id = ?${clickTime.sql}
       ORDER BY c.created_at DESC`,
    )
    .bind(programId, ...clickTime.binds)
    .all<{
      id: string;
      created_at: number;
      affiliate_code: string;
      affiliate_name: string;
      ip: string | null;
      lander_id: string | null;
      offer_id: string | null;
      path_id: string | null;
      converted: number;
    }>();

  return (results ?? []).map((row) => [
    row.id,
    new Date(row.created_at).toISOString(),
    row.affiliate_code,
    row.affiliate_name,
    row.ip ?? "",
    row.lander_id ?? "",
    row.offer_id ?? "",
    row.path_id ?? "",
    row.converted ? "yes" : "no",
  ]);
}

export async function exportConversionsCsv(
  db: D1Database,
  programId: string,
  userId: string,
  filters: ReportFilters,
): Promise<Array<Array<string | number>>> {
  const program = await db
    .prepare("SELECT id FROM programs WHERE id = ? AND user_id = ?")
    .bind(programId, userId)
    .first();
  if (!program) return [];

  const convTime = conversionTimeClause(filters, "cv");
  const { results } = await db
    .prepare(
      `SELECT
        cv.order_id, cv.click_id, cv.created_at, cv.amount_cents, cv.status, cv.status2,
        cv.currency, a.code AS affiliate_code, a.name AS affiliate_name
       FROM conversions cv
       JOIN affiliates a ON a.id = cv.affiliate_id
       WHERE cv.program_id = ?${convTime.sql}
       ORDER BY cv.created_at DESC`,
    )
    .bind(programId, ...convTime.binds)
    .all<{
      order_id: string;
      click_id: string | null;
      created_at: number;
      amount_cents: number;
      status: string;
      status2: string | null;
      currency: string;
      affiliate_code: string;
      affiliate_name: string;
    }>();

  return (results ?? []).map((row) => [
    row.order_id,
    row.click_id ?? "",
    new Date(row.created_at).toISOString(),
    (row.amount_cents / 100).toFixed(2),
    row.status,
    row.status2 ?? "",
    row.currency,
    row.affiliate_code,
    row.affiliate_name,
  ]);
}
