import type { Program } from "../types";
import {
  approvedStatusSql,
  computeEventMetrics,
  computeMetrics,
  primaryCurrency,
  type EventMetrics,
  type ReportFilters,
} from "../lib/metrics";

export type CampaignReportRow = Program & {
  group_name: string | null;
  traffic_source_name: string | null;
  cost_type: "cpc" | "cpm" | "cpa" | null;
  default_cost_cents: number;
  metrics: ReturnType<typeof computeMetrics>;
  events: EventCounts;
  event_metrics: Record<string, EventMetrics>;
  currency: string;
  revenue_by_currency: Record<string, number>;
};

/** Approved conversions per event (registration, ftd, ...). Plain conversions are not listed. */
export type EventCounts = Record<string, number>;

export type TrendPoint = {
  date: string;
  clicks: number;
  lp_clicks: number;
  leads: number;
  revenue_cents: number;
  cost_cents: number;
  events: EventCounts;
};

type ProgramRow = Program & {
  group_name: string | null;
  traffic_source_name: string | null;
  cost_type: "cpc" | "cpm" | "cpa" | null;
  default_cost_cents: number | null;
};

/**
 * Campaign filter. Without a `status` filter, archived (deleted) campaigns are hidden:
 * "all" means active + paused; `status=archived` shows them. `includeArchived` is used
 * when one campaign is requested by id.
 */
function programWhere(userId: string, filters: ReportFilters, alias = "p", includeArchived = false) {
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
  } else if (!includeArchived) {
    clauses.push(`${alias}.status != 'archived'`);
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
  "p.id, p.user_id, p.name, p.slug, p.api_key, p.destination_url, p.campaign_key, p.group_id, p.traffic_source_id, p.tags, p.status, p.created_at";

export const GROUP_DIMENSIONS = [
  "campaign",
  "date",
  "country",
  "continent",
  "region",
  "city",
  "device_type",
  "os",
  "browser",
  "isp",
  "asn",
  "connection",
  "language",
  "referrer_domain",
  "offer",
  "lander",
  "path",
  "traffic_source",
  "affiliate",
  "network",
  "hour",
  "weekday",
  "week",
  "month",
  "ip",
  "ip_range",
  "user_agent",
  "uniqueness",
  "bot",
  "external_id",
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

/** Time-of-click dimensions: report rows are sorted by key instead of by clicks. */
export const TIME_DIMENSIONS: ReadonlySet<GroupDimension> = new Set([
  "date",
  "hour",
  "weekday",
  "week",
  "month",
]);

/** Dimensions that cannot hold a traffic zone (automation zone blacklist). */
export const NON_ZONE_DIMENSIONS: ReadonlySet<string> = new Set([
  "campaign",
  "traffic_source",
  "uniqueness",
  "bot",
  ...TIME_DIMENSIONS,
]);

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

/** strftime modifier shifting UTC to the account timezone (see worker/lib/timezone.ts). */
function tzModifier(offsetMinutes: number | undefined): string {
  const minutes = Math.trunc(Number(offsetMinutes) || 0);
  return minutes ? `, '${minutes > 0 ? "+" : "-"}${Math.abs(minutes)} minutes'` : "";
}

/** Click time formatted with strftime in the account timezone. */
function timeSql(format: string, tzOffsetMinutes?: number): DimensionSql {
  const tz = tzModifier(tzOffsetMinutes);
  return {
    click: `strftime('${format}', c.created_at / 1000, 'unixepoch'${tz})`,
    conv: `strftime('${format}', ${CONV_TIME} / 1000, 'unixepoch'${tz})`,
  };
}

/** Boolean click flag as a readable key, e.g. 1 → "unique", 0 → "repeat". */
function flagSql(column: string, yes: string, no: string): DimensionSql {
  const sql = `CASE WHEN ${column} IS NULL THEN NULL WHEN ${column} = 1 THEN '${yes}' ELSE '${no}' END`;
  return { click: sql, conv: sql };
}

/** Weekday key sortable Monday-first: "1 Monday" … "7 Sunday". */
function weekdaySql(dayOfWeek: string): string {
  const days = ["7 Sunday", "1 Monday", "2 Tuesday", "3 Wednesday", "4 Thursday", "5 Friday", "6 Saturday"];
  return `CASE ${dayOfWeek} ${days.map((d, i) => `WHEN '${i}' THEN '${d}'`).join(" ")} END`;
}

/** IPv4 → its /24 range (`1.2.3.xxx`); other addresses are kept as they are. */
const IP_RANGE_SQL =
  "CASE WHEN c.ip LIKE '%.%.%.%' AND instr(c.ip, ':') = 0 THEN rtrim(c.ip, '0123456789') || 'xxx' ELSE c.ip END";

function dimensionSql(by: GroupDimension, tzOffsetMinutes?: number): DimensionSql {
  switch (by) {
    case "campaign":
      return { click: "p.id", conv: "p.id", label: "p.name" };
    case "date":
      return timeSql("%Y-%m-%d", tzOffsetMinutes);
    case "hour":
      return timeSql("%H", tzOffsetMinutes);
    case "weekday": {
      const day = timeSql("%w", tzOffsetMinutes);
      return { click: weekdaySql(day.click), conv: weekdaySql(day.conv) };
    }
    case "week":
      return timeSql("%Y-W%W", tzOffsetMinutes);
    case "month":
      return timeSql("%Y-%m", tzOffsetMinutes);
    case "network":
      // The clicked offer's affiliate network (offers.network_id).
      return {
        click: "ofn.network_id",
        conv: "ofn.network_id",
        label: "nw.name",
        clickJoin:
          "LEFT JOIN offers ofn ON ofn.id = c.offer_id LEFT JOIN affiliate_networks nw ON nw.id = ofn.network_id",
        convJoin:
          "LEFT JOIN offers ofn ON ofn.id = c.offer_id LEFT JOIN affiliate_networks nw ON nw.id = ofn.network_id",
      };
    case "asn":
      // Key is the AS number; label adds the ISP name seen on those clicks.
      return {
        click: "c.asn",
        conv: "c.asn",
        label: "CASE WHEN c.asn IS NULL THEN NULL ELSE 'AS' || c.asn || COALESCE(' · ' || c.isp, '') END",
      };
    case "ip_range":
      return { click: IP_RANGE_SQL, conv: IP_RANGE_SQL };
    case "uniqueness":
      return flagSql("c.is_unique", "unique", "repeat");
    case "bot":
      return flagSql("c.is_bot", "bot", "human");
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
      // Source stored on the click at click time; click-less conversions use the campaign's.
      return {
        click: "c.traffic_source_id",
        conv: "COALESCE(c.traffic_source_id, p.traffic_source_id)",
        label: "tsd.name",
        clickJoin: "LEFT JOIN traffic_sources tsd ON tsd.id = c.traffic_source_id",
        convJoin:
          "LEFT JOIN traffic_sources tsd ON tsd.id = COALESCE(c.traffic_source_id, p.traffic_source_id)",
      };
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
  events: EventCounts;
  event_metrics: Record<string, EventMetrics>;
  /** Currency of `metrics.revenue_cents` (most used currency in the report). */
  currency: string;
  /** Approved revenue per currency (cents); currencies are never summed together. */
  revenue_by_currency: Record<string, number>;
};

export type GroupedReportOptions = ReportFilters & {
  campaign_id?: string;
  /** Account timezone offset (minutes east of UTC) for `date` buckets. */
  tz_offset_minutes?: number;
  /**
   * Extra dimensions (drilldown): rows are then grouped by every dimension and `key`/`label`
   * are JSON arrays with one entry per dimension. See worker/db/drilldown.ts.
   */
  then_by?: GroupDimension[];
};

/** One composite dimension over several (JSON array keys/labels). */
function combinedDimensionSql(dims: DimensionSql[]): DimensionSql {
  return {
    click: `json_array(${dims.map((d) => d.click).join(", ")})`,
    conv: `json_array(${dims.map((d) => d.conv).join(", ")})`,
    label: `json_array(${dims.map((d) => d.label ?? "NULL").join(", ")})`,
    clickJoin: dims.map((d) => d.clickJoin ?? "").join(" "),
    convJoin: dims.map((d) => d.convJoin ?? "").join(" "),
  };
}

/** Approved conversion exists for click `c` (conversions follow their click's time). */
const CLICK_CONVERTED = `EXISTS(SELECT 1 FROM conversions cv WHERE cv.click_id = c.id AND ${approvedStatusSql("cv")})`;

/**
 * Report grouped by one dimension using two GROUP BY queries (clicks, conversions).
 * Conversions = distinct converted clicks + click-less conversions, so a click with
 * registration + FTD is one conversion (per-event counts are in `events`).
 * Cost uses values stored on the click at click time: `cost_cents` (CPC/CPM or `cost`
 * URL param) plus `cpa_cost_cents` once per converted click. Click-less conversions are
 * charged the campaign's current CPA rate. Bot clicks (`is_bot`) are counted in `clicks`
 * and `bot_clicks` but carry no cost and are left out of CR / EPC / CPC denominators.
 */
export async function getGroupedReport(
  db: D1Database,
  userId: string,
  by: GroupDimension,
  options: GroupedReportOptions,
): Promise<GroupedReportRow[]> {
  const dims = [by, ...(options.then_by ?? [])].map((d) =>
    dimensionSql(d, options.tz_offset_minutes),
  );
  const dim = dims.length === 1 ? dims[0] : combinedDimensionSql(dims);
  const where = programWhere(userId, options, "p", Boolean(options.campaign_id));
  const campaignSql = options.campaign_id ? " AND p.id = ?" : "";
  const campaignBinds = options.campaign_id ? [options.campaign_id] : [];
  const clickTime = clickTimeClause(options, "c");
  const convTime = timeClause(options, CONV_TIME);
  // A conversion never precedes its click, so `cv.created_at >= from` is implied by the
  // click-time window: an index-friendly prefilter (idx_conversions_program_created).
  const convFloor =
    options.from != null
      ? { sql: " AND cv.created_at >= ?", binds: [options.from] }
      : { sql: "", binds: [] as number[] };
  const label = dim.label ?? "NULL";

  const [clickRows, convRows] = await Promise.all([
    db
      .prepare(
        `SELECT ${dim.click} AS k, MAX(${label}) AS label,
          COUNT(*) AS clicks,
          COALESCE(SUM(c.is_unique), 0) AS unique_clicks,
          COALESCE(SUM(c.is_bot), 0) AS bot_clicks,
          SUM(CASE WHEN c.lp_clicked_at IS NOT NULL AND c.is_bot = 0 THEN 1 ELSE 0 END) AS lp_clicks,
          SUM(CASE WHEN ${CLICK_CONVERTED} THEN 1 ELSE 0 END) AS converted_clicks,
          COALESCE(SUM(CASE WHEN c.is_bot = 0 THEN c.cost_cents END), 0)
            + COALESCE(SUM(CASE WHEN c.is_bot = 0 AND c.cpa_cost_cents IS NOT NULL AND ${CLICK_CONVERTED}
                THEN c.cpa_cost_cents ELSE 0 END), 0) AS cost
         FROM clicks c
         JOIN programs p ON p.id = c.program_id
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
        converted_clicks: number;
        cost: number;
      }>(),
    db
      .prepare(
        `SELECT ${dim.conv} AS k, cv.event AS ev, UPPER(cv.currency) AS cur, MAX(${label}) AS label,
          COUNT(DISTINCT COALESCE(cv.click_id, cv.id)) AS units,
          SUM(CASE WHEN cv.click_id IS NULL THEN 1 ELSE 0 END) AS clickless,
          COALESCE(SUM(cv.amount_cents), 0) AS revenue,
          COALESCE(SUM(CASE
            WHEN cv.click_id IS NULL AND ts.cost_type = 'cpa' THEN ts.default_cost_cents
            ELSE 0 END), 0) AS cpa_cost
         FROM conversions cv
         JOIN programs p ON p.id = cv.program_id
         LEFT JOIN clicks c ON c.id = cv.click_id
         LEFT JOIN traffic_sources ts ON ts.id = p.traffic_source_id
         ${dim.convJoin ?? ""}
         WHERE ${where.sql}${campaignSql} AND ${approvedStatusSql("cv")}${convTime.sql}${convFloor.sql}
         GROUP BY k, ev, cur`,
      )
      .bind(...where.binds, ...campaignBinds, ...convTime.binds, ...convFloor.binds)
      .all<{
        k: string | null;
        ev: string | null;
        cur: string | null;
        label: string | null;
        units: number;
        clickless: number;
        revenue: number;
        cpa_cost: number;
      }>(),
  ]);

  type Acc = {
    key: string | null;
    label: string | null;
    clicks: number;
    unique_clicks: number;
    bot_clicks: number;
    lp_clicks: number;
    leads: number;
    cost: number;
    revenue_by_currency: Record<string, number>;
    events: Record<string, { count: number; revenue_by_currency: Record<string, number> }>;
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
        cost: 0,
        revenue_by_currency: {},
        events: {},
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
    acc.leads += row.converted_clicks;
    acc.cost += row.cost;
  }
  const currencyCounts = new Map<string, number>();
  for (const row of convRows.results ?? []) {
    const acc = get(row.k, row.label);
    const cur = row.cur || "USD";
    acc.leads += row.clickless;
    acc.cost += row.cpa_cost;
    acc.revenue_by_currency[cur] = (acc.revenue_by_currency[cur] ?? 0) + row.revenue;
    currencyCounts.set(cur, (currencyCounts.get(cur) ?? 0) + row.units);
    if (row.ev) {
      const ev = (acc.events[row.ev] ??= { count: 0, revenue_by_currency: {} });
      ev.count += row.units;
      ev.revenue_by_currency[cur] = (ev.revenue_by_currency[cur] ?? 0) + row.revenue;
    }
  }
  const currency = primaryCurrency(currencyCounts);

  const rows = [...groups.values()].map((acc) => {
    const cost_cents = Math.round(acc.cost);
    return {
      key: acc.key,
      label: acc.label ?? acc.key ?? "(none)",
      unique_clicks: acc.unique_clicks,
      bot_clicks: acc.bot_clicks,
      metrics: computeMetrics({
        clicks: acc.clicks,
        bot_clicks: acc.bot_clicks,
        lp_clicks: acc.lp_clicks,
        leads: acc.leads,
        revenue_cents: acc.revenue_by_currency[currency] ?? 0,
        cost_cents,
      }),
      events: Object.fromEntries(Object.entries(acc.events).map(([ev, e]) => [ev, e.count])),
      event_metrics: computeEventMetrics(
        Object.fromEntries(
          Object.entries(acc.events).map(([ev, e]) => [
            ev,
            { count: e.count, revenue_cents: e.revenue_by_currency[currency] ?? 0 },
          ]),
        ),
        acc.clicks - acc.bot_clicks,
        cost_cents,
      ),
      currency,
      revenue_by_currency: acc.revenue_by_currency,
    };
  });

  if (TIME_DIMENSIONS.has(by)) {
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

  const byCampaign = new Map(grouped.map((row) => [row.key, row]));
  const empty = computeMetrics({ clicks: 0, lp_clicks: 0, leads: 0, revenue_cents: 0, cost_cents: 0 });
  const currency = grouped[0]?.currency ?? "USD";

  return (results ?? []).map((program) => ({
    ...program,
    group_name: program.group_name,
    traffic_source_name: program.traffic_source_name,
    cost_type: program.cost_type,
    default_cost_cents: program.default_cost_cents ?? 0,
    metrics: byCampaign.get(program.id)?.metrics ?? empty,
    events: byCampaign.get(program.id)?.events ?? {},
    event_metrics: byCampaign.get(program.id)?.event_metrics ?? {},
    currency,
    revenue_by_currency: byCampaign.get(program.id)?.revenue_by_currency ?? {},
  }));
}

export async function getCampaignTrends(
  db: D1Database,
  programId: string,
  userId: string,
  filters: ReportFilters & { tz_offset_minutes?: number },
): Promise<TrendPoint[]> {
  const rows = await getGroupedReport(db, userId, "date", {
    from: filters.from,
    to: filters.to,
    campaign_id: programId,
    tz_offset_minutes: filters.tz_offset_minutes,
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
      events: row.events,
    }));
}

/** Hard cap on rows per CSV export; exports are streamed in keyset-paginated pages. */
export const EXPORT_MAX_ROWS = 100_000;
const EXPORT_PAGE_SIZE = 2_000;

export type ExportOptions = { maxRows?: number; pageSize?: number };

type CsvRow = Array<string | number>;

async function ownsProgram(db: D1Database, programId: string, userId: string) {
  const program = await db
    .prepare("SELECT id FROM programs WHERE id = ? AND user_id = ?")
    .bind(programId, userId)
    .first();
  return Boolean(program);
}

/**
 * Pages of `(created_at DESC, id DESC)` rows; each page resumes after the last row of
 * the previous one, so memory stays bounded and no OFFSET scan is needed.
 */
async function* keysetPages<T extends { created_at: number; row_key: string }>(
  fetchPage: (
    after: { created_at: number; row_key: string } | null,
    limit: number,
  ) => Promise<T[]>,
  options: ExportOptions,
): AsyncGenerator<T[]> {
  const maxRows = options.maxRows ?? EXPORT_MAX_ROWS;
  const pageSize = options.pageSize ?? EXPORT_PAGE_SIZE;
  let sent = 0;
  let after: { created_at: number; row_key: string } | null = null;
  while (sent < maxRows) {
    const limit = Math.min(pageSize, maxRows - sent);
    const rows = await fetchPage(after, limit);
    if (rows.length > 0) {
      sent += rows.length;
      yield rows;
    }
    if (rows.length < limit) return;
    const last = rows[rows.length - 1]!;
    after = { created_at: last.created_at, row_key: last.row_key };
  }
}

export async function* exportClickLogCsv(
  db: D1Database,
  programId: string,
  userId: string,
  filters: ReportFilters,
  options: ExportOptions = {},
): AsyncGenerator<CsvRow[]> {
  if (!(await ownsProgram(db, programId, userId))) return;

  const clickTime = clickTimeClause(filters, "c");
  const pages = keysetPages(async (after, limit) => {
    const cursorSql = after ? " AND (c.created_at < ? OR (c.created_at = ? AND c.id < ?))" : "";
    const cursorBinds = after ? [after.created_at, after.created_at, after.row_key] : [];
    const { results } = await db
      .prepare(
        `SELECT
          c.id AS row_key, c.created_at, a.code AS affiliate_code, a.name AS affiliate_name,
          c.ip, c.lander_id, c.offer_id, c.path_id,
          EXISTS(SELECT 1 FROM conversions cv WHERE cv.click_id = c.id) AS converted
         FROM clicks c
         JOIN affiliates a ON a.id = c.affiliate_id
         WHERE c.program_id = ?${clickTime.sql}${cursorSql}
         ORDER BY c.created_at DESC, c.id DESC
         LIMIT ?`,
      )
      .bind(programId, ...clickTime.binds, ...cursorBinds, limit)
      .all<{
        row_key: string;
        created_at: number;
        affiliate_code: string;
        affiliate_name: string;
        ip: string | null;
        lander_id: string | null;
        offer_id: string | null;
        path_id: string | null;
        converted: number;
      }>();
    return results ?? [];
  }, options);

  for await (const rows of pages) {
    yield rows.map((row) => [
      row.row_key,
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
}

export async function* exportConversionsCsv(
  db: D1Database,
  programId: string,
  userId: string,
  filters: ReportFilters,
  options: ExportOptions = {},
): AsyncGenerator<CsvRow[]> {
  if (!(await ownsProgram(db, programId, userId))) return;

  const convTime = conversionTimeClause(filters, "cv");
  const pages = keysetPages(async (after, limit) => {
    const cursorSql = after ? " AND (cv.created_at < ? OR (cv.created_at = ? AND cv.id < ?))" : "";
    const cursorBinds = after ? [after.created_at, after.created_at, after.row_key] : [];
    const { results } = await db
      .prepare(
        `SELECT
          cv.id AS row_key, cv.order_id, cv.click_id, cv.created_at, cv.amount_cents, cv.status,
          cv.status2, cv.event, cv.currency, a.code AS affiliate_code, a.name AS affiliate_name
         FROM conversions cv
         JOIN affiliates a ON a.id = cv.affiliate_id
         WHERE cv.program_id = ?${convTime.sql}${cursorSql}
         ORDER BY cv.created_at DESC, cv.id DESC
         LIMIT ?`,
      )
      .bind(programId, ...convTime.binds, ...cursorBinds, limit)
      .all<{
        row_key: string;
        order_id: string;
        click_id: string | null;
        created_at: number;
        amount_cents: number;
        status: string;
        status2: string | null;
        event: string | null;
        currency: string;
        affiliate_code: string;
        affiliate_name: string;
      }>();
    return results ?? [];
  }, options);

  for await (const rows of pages) {
    yield rows.map((row) => [
      row.order_id,
      row.click_id ?? "",
      new Date(row.created_at).toISOString(),
      (row.amount_cents / 100).toFixed(2),
      row.status,
      row.status2 ?? "",
      row.event ?? "",
      row.currency,
      row.affiliate_code,
      row.affiliate_name,
    ]);
  }
}
