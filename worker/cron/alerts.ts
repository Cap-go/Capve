import {
  addZonesToBlacklist,
  listDueAutomationRules,
  markRuleRun,
  type AutomationRule,
} from "../db/automation";
import { getGroupedReport } from "../db/reports";
import { sendEmail } from "../lib/email";
import { computeMetrics } from "../lib/metrics";
import { parseHttpUrl } from "../lib/urls";
import type { Env } from "../types";
import type { ScheduledJob } from "./index";

const HOUR_MS = 60 * 60 * 1000;
/** Rules evaluated per cron run; the rest follow on the next runs (least recently run first). */
const RULES_PER_RUN = 50;

export type RuleEvaluation = {
  rule_id: string;
  fired: boolean;
  message: string | null;
  /** zone_blacklist: zones newly blacklisted by this run. */
  blacklisted: string[];
  notified: { email: boolean; webhook: boolean };
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

async function notify(
  env: Env,
  rule: AutomationRule,
  message: string,
  payload: Record<string, unknown>,
): Promise<{ email: boolean; webhook: boolean }> {
  const sent = { email: false, webhook: false };
  const appUrl = (env.APP_URL ?? "").replace(/\/$/, "");
  if (rule.notify_email) {
    try {
      await sendEmail(env, {
        to: rule.notify_email,
        subject: `Capve: ${rule.name}`,
        text: `${message}\n\n${appUrl}/app\n\n— Capve`,
        html: `<p>${escapeHtml(message).replace(/\n/g, "<br>")}</p><p><a href="${escapeHtml(appUrl)}/app">Open Capve</a></p>`,
      });
      sent.email = true;
    } catch (err) {
      console.error(`[automation] email failed for ${rule.id}`, err);
    }
  }
  if (rule.webhook_url && parseHttpUrl(rule.webhook_url)) {
    try {
      const res = await fetch(rule.webhook_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rule_id: rule.id, rule_name: rule.name, kind: rule.kind, message, ...payload }),
        signal: AbortSignal.timeout(5000),
      });
      sent.webhook = res.ok;
    } catch (err) {
      console.error(`[automation] webhook failed for ${rule.id}`, err);
    }
  }
  return sent;
}

/** Evaluates one rule over its last `window_hours`, blacklists zones and sends alerts. */
export async function evaluateAutomationRule(
  env: Env,
  rule: AutomationRule,
  now = Date.now(),
): Promise<RuleEvaluation> {
  const window = { campaign_id: rule.program_id, from: now - rule.window_hours * HOUR_MS, to: now };
  const result: RuleEvaluation = {
    rule_id: rule.id,
    fired: false,
    message: null,
    blacklisted: [],
    notified: { email: false, webhook: false },
  };

  if (rule.kind === "zone_blacklist" && rule.dimension) {
    const minClicks = Math.max(rule.min_clicks ?? 1, 1);
    const rows = await getGroupedReport(env.DB, rule.user_id, rule.dimension, window);
    const losers = rows.filter((row) => {
      if (row.key == null || row.key === "" || row.metrics.clicks < minClicks) return false;
      const conversions = rule.event ? (row.events[rule.event] ?? 0) : row.metrics.leads;
      return conversions === 0;
    });
    const goal = rule.event ?? "conversions";
    result.blacklisted = await addZonesToBlacklist(
      env.DB,
      { user_id: rule.user_id, program_id: rule.program_id, dimension: rule.dimension, rule_id: rule.id },
      losers.map((row) => ({
        value: row.key as string,
        reason: `${row.metrics.clicks} clicks, 0 ${goal} in ${rule.window_hours}h`,
      })),
    );
    if (result.blacklisted.length > 0) {
      result.fired = true;
      result.message = `${rule.name}: blacklisted ${result.blacklisted.length} ${rule.dimension} value(s) with >= ${minClicks} clicks and 0 ${goal} in the last ${rule.window_hours}h:\n${result.blacklisted.join("\n")}`;
      result.notified = await notify(env, rule, result.message, {
        campaign_id: rule.program_id,
        dimension: rule.dimension,
        zones: result.blacklisted,
      });
    }
  } else if (rule.kind === "alert") {
    const cooling = rule.last_fired_at != null && now - rule.last_fired_at < rule.window_hours * HOUR_MS;
    const [row] = await getGroupedReport(env.DB, rule.user_id, "campaign", window);
    const metrics =
      row?.metrics ?? computeMetrics({ clicks: 0, lp_clicks: 0, leads: 0, revenue_cents: 0, cost_cents: 0 });
    const conditions: boolean[] = [];
    if (rule.roi_below != null) conditions.push(metrics.cost_cents > 0 && metrics.roi < rule.roi_below);
    if (rule.spend_above_cents != null) conditions.push(metrics.cost_cents > rule.spend_above_cents);
    if (!cooling && conditions.length > 0 && conditions.every(Boolean)) {
      result.fired = true;
      const money = (cents: number) => (cents / 100).toFixed(2);
      result.message = `${rule.name}: last ${rule.window_hours}h — cost ${money(metrics.cost_cents)}, revenue ${money(metrics.revenue_cents)}, ROI ${metrics.roi}%, clicks ${metrics.clicks}, conversions ${metrics.leads}.`;
      result.notified = await notify(env, rule, result.message, {
        campaign_id: rule.program_id,
        metrics,
        events: row?.events ?? {},
      });
    }
  }

  await markRuleRun(env.DB, rule.id, now, result.fired);
  return result;
}

/** Cron entry point: evaluates due rules of active campaigns. */
export async function runAutomationRules(env: Env, now = Date.now()): Promise<RuleEvaluation[]> {
  const rules = await listDueAutomationRules(env.DB, RULES_PER_RUN);
  const results: RuleEvaluation[] = [];
  for (const rule of rules) {
    try {
      results.push(await evaluateAutomationRule(env, rule, now));
    } catch (err) {
      console.error(`[automation] rule ${rule.id} failed`, err);
    }
  }
  return results;
}

export const automationJob: ScheduledJob = {
  name: "automation-rules",
  run: (env, controller) => runAutomationRules(env, controller.scheduledTime),
};
