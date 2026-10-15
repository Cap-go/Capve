import { Hono } from "hono";
import { getDrilldownReport, MAX_DRILLDOWN_LEVELS } from "../db/drilldown";
import { GROUP_DIMENSIONS, isGroupDimension, type GroupDimension } from "../db/reports";
import { requireUser } from "../lib/access";
import { zonedReportFilters } from "../lib/report-range";
import type { Env } from "../types";

const drilldown = new Hono<{ Bindings: Env }>();

export function parseDrilldownLevels(raw: string | undefined): GroupDimension[] | string {
  const levels = (raw ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (levels.length === 0 || levels.length > MAX_DRILLDOWN_LEVELS) {
    return `by must list 1 to ${MAX_DRILLDOWN_LEVELS} dimensions, comma separated`;
  }
  for (const level of levels) {
    if (!isGroupDimension(level)) {
      return `Unknown dimension "${level}". Use: ${GROUP_DIMENSIONS.join(", ")}`;
    }
  }
  if (new Set(levels).size !== levels.length) return "Each dimension can be used once";
  return levels as GroupDimension[];
}

/** Nested report: GET /api/reports/drilldown?by=campaign,sub1,country,offer */
drilldown.get("/", async (c) => {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);

  const levels = parseDrilldownLevels(c.req.query("by"));
  if (typeof levels === "string") return c.json({ error: levels }, 400);

  const limitRaw = Number(c.req.query("limit") ?? 50);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 200) : 50;
  const filters = await zonedReportFilters(c.env.DB, session.account_id, (k) => c.req.query(k));
  const rows = await getDrilldownReport(
    c.env.DB,
    session.account_id,
    levels,
    { ...filters, campaign_id: c.req.query("campaign_id")?.trim() || undefined },
    limit,
  );
  return c.json({ by: levels, timezone: filters.timezone, rows });
});

export { drilldown };
