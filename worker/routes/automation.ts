import { Hono } from "hono";
import {
  addZonesToBlacklist,
  createAutomationRule,
  deleteAutomationRule,
  deleteBlacklistEntry,
  getAutomationRule,
  listAutomationRules,
  listZoneBlacklist,
  setAutomationRuleEnabled,
  type NewAutomationRule,
} from "../db/automation";
import { isGroupDimension } from "../db/reports";
import { evaluateAutomationRule } from "../cron/alerts";
import { requireUser, requireWrite } from "../lib/access";
import { toCsv } from "../lib/metrics";
import { optionalHttpUrl } from "../lib/urls";
import type { Env } from "../types";

/** Dimensions that can be blacklisted as zones (not campaign/date/traffic source). */
const NON_ZONE_DIMENSIONS = new Set(["campaign", "date", "traffic_source"]);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const automation = new Hono<{ Bindings: Env }>();

async function campaignBelongsTo(db: D1Database, programId: string, userId: string) {
  return !!(await db
    .prepare("SELECT id FROM programs WHERE id = ? AND user_id = ?")
    .bind(programId, userId)
    .first());
}

type RuleBody = {
  campaign_id?: unknown;
  name?: unknown;
  kind?: unknown;
  dimension?: unknown;
  min_clicks?: unknown;
  event?: unknown;
  roi_below?: unknown;
  spend_above_cents?: unknown;
  window_hours?: unknown;
  notify_email?: unknown;
  webhook_url?: unknown;
  enabled?: unknown;
};

const optionalNumber = (value: unknown) =>
  value === undefined || value === null || value === "" ? null : Number(value);

/** Validates a rule body; returns the rule input (without campaign check) or an error. */
export function parseRuleBody(body: RuleBody): (NewAutomationRule & { program_id: string }) | string {
  const programId = typeof body.campaign_id === "string" ? body.campaign_id.trim() : "";
  if (!programId) return "campaign_id required";
  if (body.kind !== "zone_blacklist" && body.kind !== "alert") {
    return "kind must be zone_blacklist or alert";
  }

  const windowHours = optionalNumber(body.window_hours) ?? 24;
  if (!Number.isInteger(windowHours) || windowHours < 1 || windowHours > 720) {
    return "window_hours must be an integer between 1 and 720";
  }

  const email = typeof body.notify_email === "string" ? body.notify_email.trim() : "";
  if (email && !EMAIL.test(email)) return "notify_email must be an email address";
  const webhook = optionalHttpUrl(typeof body.webhook_url === "string" ? body.webhook_url : null);
  if (webhook === false) return "webhook_url must be an http(s) URL";

  const event = typeof body.event === "string" && body.event.trim() ? body.event.trim().slice(0, 64) : null;
  const base = {
    program_id: programId,
    kind: body.kind,
    window_hours: windowHours,
    notify_email: email || null,
    webhook_url: webhook,
    enabled: body.enabled !== false,
    dimension: null,
    min_clicks: null,
    event: null,
    roi_below: null,
    spend_above_cents: null,
  } satisfies Omit<NewAutomationRule, "name">;

  if (body.kind === "zone_blacklist") {
    const dimension = typeof body.dimension === "string" ? body.dimension.trim() : "sub1";
    if (!isGroupDimension(dimension) || NON_ZONE_DIMENSIONS.has(dimension)) {
      return "dimension must be a click dimension such as sub1…sub10, isp, country";
    }
    const minClicks = optionalNumber(body.min_clicks);
    if (minClicks === null || !Number.isInteger(minClicks) || minClicks < 1) {
      return "min_clicks must be a positive integer";
    }
    const name =
      (typeof body.name === "string" && body.name.trim()) ||
      `Blacklist ${dimension}: ${minClicks}+ clicks, 0 ${event ?? "conversions"} in ${windowHours}h`;
    return { ...base, name: name.slice(0, 120), dimension, min_clicks: minClicks, event };
  }

  const roiBelow = optionalNumber(body.roi_below);
  const spendAbove = optionalNumber(body.spend_above_cents);
  if (roiBelow !== null && !Number.isFinite(roiBelow)) return "roi_below must be a number";
  if (spendAbove !== null && (!Number.isInteger(spendAbove) || spendAbove < 0)) {
    return "spend_above_cents must be a non-negative integer";
  }
  if (roiBelow === null && spendAbove === null) return "Set roi_below and/or spend_above_cents";
  if (!base.notify_email && !base.webhook_url) return "Set notify_email and/or webhook_url";
  const parts = [
    roiBelow !== null ? `ROI < ${roiBelow}%` : null,
    spendAbove !== null ? `spend > ${(spendAbove / 100).toFixed(2)}` : null,
  ].filter(Boolean);
  const name =
    (typeof body.name === "string" && body.name.trim()) ||
    `Alert: ${parts.join(" and ")} in ${windowHours}h`;
  return { ...base, name: name.slice(0, 120), roi_below: roiBelow, spend_above_cents: spendAbove };
}

automation.get("/rules", async (c) => {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  const rules = await listAutomationRules(
    c.env.DB,
    session.account_id,
    c.req.query("campaign_id")?.trim() || undefined,
  );
  return c.json({ rules });
});

automation.post("/rules", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;
  const body = await c.req.json<RuleBody>().catch(() => ({}) as RuleBody);
  const input = parseRuleBody(body);
  if (typeof input === "string") return c.json({ error: input }, 400);
  if (!(await campaignBelongsTo(c.env.DB, input.program_id, session.account_id))) {
    return c.json({ error: "Invalid campaign_id" }, 400);
  }
  const rule = await createAutomationRule(c.env.DB, session.account_id, input);
  return c.json({ rule }, 201);
});

automation.patch("/rules/:id", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;
  const body = await c.req.json<{ enabled?: unknown }>().catch(() => ({}) as { enabled?: unknown });
  if (typeof body.enabled !== "boolean") return c.json({ error: "enabled must be a boolean" }, 400);
  const ok = await setAutomationRuleEnabled(c.env.DB, c.req.param("id"), session.account_id, body.enabled);
  if (!ok) return c.json({ error: "Not found" }, 404);
  return c.json({ rule: await getAutomationRule(c.env.DB, c.req.param("id"), session.account_id) });
});

automation.delete("/rules/:id", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;
  const ok = await deleteAutomationRule(c.env.DB, c.req.param("id"), session.account_id);
  if (!ok) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

/** Evaluate a rule now (same as the cron run). */
automation.post("/rules/:id/run", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;
  const rule = await getAutomationRule(c.env.DB, c.req.param("id"), session.account_id);
  if (!rule) return c.json({ error: "Not found" }, 404);
  return c.json({ result: await evaluateAutomationRule(c.env, rule) });
});

/** Blacklisted zones. format=txt → one value per line (paste into Adcash), format=csv. */
automation.get("/blacklist", async (c) => {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  const programId = c.req.query("campaign_id")?.trim();
  if (!programId) return c.json({ error: "campaign_id required" }, 400);
  const entries = await listZoneBlacklist(
    c.env.DB,
    session.account_id,
    programId,
    c.req.query("dimension")?.trim() || undefined,
  );
  const format = c.req.query("format");
  if (format === "txt") {
    const values = [...new Set(entries.map((entry) => entry.value))];
    return c.text(values.length ? `${values.join("\n")}\n` : "", 200, {
      "Content-Type": "text/plain; charset=utf-8",
    });
  }
  if (format === "csv") {
    const csv = toCsv(
      ["dimension", "value", "reason", "rule_id", "blacklisted_at"],
      entries.map((entry) => [
        entry.dimension,
        entry.value,
        entry.reason ?? "",
        entry.rule_id ?? "",
        new Date(entry.created_at).toISOString(),
      ]),
    );
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="blacklist.csv"',
      },
    });
  }
  return c.json({ blacklist: entries });
});

automation.post("/blacklist", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;
  const body = await c.req
    .json<{ campaign_id?: unknown; dimension?: unknown; values?: unknown }>()
    .catch(() => ({}) as { campaign_id?: unknown; dimension?: unknown; values?: unknown });
  const programId = typeof body.campaign_id === "string" ? body.campaign_id.trim() : "";
  const dimension = typeof body.dimension === "string" ? body.dimension.trim() : "sub1";
  if (!isGroupDimension(dimension) || NON_ZONE_DIMENSIONS.has(dimension)) {
    return c.json({ error: "dimension must be a click dimension such as sub1" }, 400);
  }
  const values = Array.isArray(body.values)
    ? [...new Set(body.values.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean))]
    : [];
  if (values.length === 0 || values.length > 500) {
    return c.json({ error: "values must list 1 to 500 zones" }, 400);
  }
  if (!programId || !(await campaignBelongsTo(c.env.DB, programId, session.account_id))) {
    return c.json({ error: "Invalid campaign_id" }, 400);
  }
  const added = await addZonesToBlacklist(
    c.env.DB,
    { user_id: session.account_id, program_id: programId, dimension, rule_id: null },
    values.map((value) => ({ value: value.slice(0, 200), reason: "manual" })),
  );
  return c.json({ added }, 201);
});

automation.delete("/blacklist/:id", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;
  const ok = await deleteBlacklistEntry(c.env.DB, c.req.param("id"), session.account_id);
  if (!ok) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

export { automation };
