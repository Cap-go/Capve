import { Hono, type Context } from "hono";
import {
  exportClickLogCsv,
  exportConversionsCsv,
  getCampaignTrends,
  getGroupedReport,
  GROUP_DIMENSIONS,
  isGroupDimension,
  listCampaignReports,
} from "../db/reports";
import type { Env } from "../types";
import { parseReportFilters, toCsv } from "../lib/metrics";
import { requireUser } from "../lib/access";

const reports = new Hono<{ Bindings: Env }>();

/** Event names present in report rows, for one CSV column per event. */
function eventNames(rows: Array<{ events: Record<string, number> }>): string[] {
  return [...new Set(rows.flatMap((row) => Object.keys(row.events)))].sort();
}

reports.get("/campaigns", async (c) => {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);

  const filters = parseReportFilters({
    from: c.req.query("from"),
    to: c.req.query("to"),
    group_id: c.req.query("group_id"),
    traffic_source_id: c.req.query("traffic_source_id"),
    status: c.req.query("status"),
  });

  const campaigns = await listCampaignReports(c.env.DB, session.account_id, filters);
  return c.json({ campaigns });
});

reports.get("/campaigns.csv", async (c) => {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);

  const filters = parseReportFilters({
    from: c.req.query("from"),
    to: c.req.query("to"),
    group_id: c.req.query("group_id"),
    traffic_source_id: c.req.query("traffic_source_id"),
    status: c.req.query("status"),
  });

  const campaigns = await listCampaignReports(c.env.DB, session.account_id, filters);
  const events = eventNames(campaigns);
  const rows = campaigns.map((row) => [
    row.name,
    row.campaign_key ?? row.slug,
    row.status,
    row.group_name ?? "",
    row.traffic_source_name ?? "",
    row.metrics.clicks,
    row.metrics.lp_clicks,
    row.metrics.lp_ctr,
    row.metrics.leads,
    row.metrics.cr,
    (row.metrics.revenue_cents / 100).toFixed(2),
    (row.metrics.cost_cents / 100).toFixed(2),
    (row.metrics.profit_cents / 100).toFixed(2),
    row.metrics.roi,
    (row.metrics.epc_cents / 100).toFixed(2),
    (row.metrics.cpc_cents / 100).toFixed(2),
    ...events.map((event) => row.events[event] ?? 0),
  ]);

  const csv = toCsv(
    [
      "Campaign",
      "Key",
      "Status",
      "Group",
      "Source",
      "Clicks",
      "LP Clicks",
      "LP CTR %",
      "Leads",
      "CR %",
      "Revenue",
      "Cost",
      "Profit",
      "ROI %",
      "EPC",
      "CPC",
      ...events,
    ],
    rows,
  );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="campaigns.csv"',
    },
  });
});

async function groupedReport(c: Context<{ Bindings: Env }>) {
  const session = await requireUser(c);
  if (!session) return { error: c.json({ error: "Unauthorized" }, 401) };

  const by = c.req.query("by")?.trim();
  if (!isGroupDimension(by)) {
    return {
      error: c.json({ error: `by must be one of: ${GROUP_DIMENSIONS.join(", ")}` }, 400),
    };
  }

  const filters = parseReportFilters({
    from: c.req.query("from"),
    to: c.req.query("to"),
    group_id: c.req.query("group_id"),
    traffic_source_id: c.req.query("traffic_source_id"),
    status: c.req.query("status"),
  });
  const campaignId = c.req.query("campaign_id")?.trim() || undefined;
  const rows = await getGroupedReport(c.env.DB, session.account_id, by, {
    ...filters,
    campaign_id: campaignId,
  });
  return { by, rows };
}

/** Binom-style report grouped by one dimension (country, os, offer, sub1, date, …). */
reports.get("/grouped", async (c) => {
  const result = await groupedReport(c);
  if ("error" in result) return result.error;
  return c.json({ by: result.by, rows: result.rows });
});

reports.get("/grouped.csv", async (c) => {
  const result = await groupedReport(c);
  if ("error" in result) return result.error;
  const events = eventNames(result.rows);
  const csv = toCsv(
    [
      result.by,
      "Clicks",
      "Unique",
      "Bots",
      "LP Clicks",
      "Conversions",
      "CR %",
      "Revenue",
      "Cost",
      "Profit",
      "ROI %",
      "EPC",
      ...events,
    ],
    result.rows.map((row) => [
      row.label,
      row.metrics.clicks,
      row.unique_clicks,
      row.bot_clicks,
      row.metrics.lp_clicks,
      row.metrics.leads,
      row.metrics.cr,
      (row.metrics.revenue_cents / 100).toFixed(2),
      (row.metrics.cost_cents / 100).toFixed(2),
      (row.metrics.profit_cents / 100).toFixed(2),
      row.metrics.roi,
      (row.metrics.epc_cents / 100).toFixed(2),
      ...events.map((event) => row.events[event] ?? 0),
    ]),
  );
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="report-${result.by}.csv"`,
    },
  });
});

reports.get("/campaigns/:id/trends", async (c) => {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);

  const filters = parseReportFilters({
    from: c.req.query("from"),
    to: c.req.query("to"),
  });

  const trends = await getCampaignTrends(c.env.DB, c.req.param("id"), session.account_id, filters);
  return c.json({ trends });
});

reports.get("/clicks.csv", async (c) => {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);

  const programId = c.req.query("program_id");
  if (!programId) return c.json({ error: "program_id required" }, 400);

  const filters = parseReportFilters({
    from: c.req.query("from"),
    to: c.req.query("to"),
  });

  const rows = await exportClickLogCsv(c.env.DB, programId, session.account_id, filters);
  const csv = toCsv(
    [
      "click_id",
      "time",
      "affiliate_code",
      "affiliate_name",
      "ip",
      "lander_id",
      "offer_id",
      "path_id",
      "converted",
    ],
    rows,
  );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="clicklog.csv"',
    },
  });
});

reports.get("/conversions.csv", async (c) => {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);

  const programId = c.req.query("program_id");
  if (!programId) return c.json({ error: "program_id required" }, 400);

  const filters = parseReportFilters({
    from: c.req.query("from"),
    to: c.req.query("to"),
  });

  const rows = await exportConversionsCsv(c.env.DB, programId, session.account_id, filters);
  const csv = toCsv(
    [
      "order_id",
      "click_id",
      "time",
      "amount",
      "status",
      "status2",
      "event",
      "currency",
      "affiliate_code",
      "affiliate_name",
    ],
    rows,
  );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="conversions.csv"',
    },
  });
});

export { reports };
