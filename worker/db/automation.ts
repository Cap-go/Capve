import { id } from "../lib/utils";
import type { GroupDimension } from "./reports";

export type AutomationRuleKind = "zone_blacklist" | "alert";

export type AutomationRule = {
  id: string;
  user_id: string;
  program_id: string;
  name: string;
  kind: AutomationRuleKind;
  /** zone_blacklist: dimension holding the zone (sub1…sub10, isp, …). */
  dimension: GroupDimension | null;
  /** zone_blacklist: minimum clicks before a zone without conversions is blacklisted. */
  min_clicks: number | null;
  /** zone_blacklist: conversion event that counts (registration, ftd…); null = any conversion. */
  event: string | null;
  /** alert: fire when ROI (%) is below this. */
  roi_below: number | null;
  /** alert: fire when cost (cents) is above this. */
  spend_above_cents: number | null;
  window_hours: number;
  notify_email: string | null;
  webhook_url: string | null;
  enabled: boolean;
  last_run_at: number | null;
  last_fired_at: number | null;
  created_at: number;
};

export type ZoneBlacklistEntry = {
  id: string;
  user_id: string;
  program_id: string;
  dimension: string;
  value: string;
  rule_id: string | null;
  reason: string | null;
  created_at: number;
};

type RuleRow = Omit<AutomationRule, "enabled"> & { enabled: number };

const RULE_COLUMNS =
  "id, user_id, program_id, name, kind, dimension, min_clicks, event, roi_below, spend_above_cents, window_hours, notify_email, webhook_url, enabled, last_run_at, last_fired_at, created_at";

function toRule(row: RuleRow): AutomationRule {
  return { ...row, enabled: row.enabled === 1 };
}

export async function listAutomationRules(
  db: D1Database,
  userId: string,
  programId?: string,
): Promise<AutomationRule[]> {
  const stmt = programId
    ? db
        .prepare(
          `SELECT ${RULE_COLUMNS} FROM automation_rules WHERE user_id = ? AND program_id = ? ORDER BY created_at DESC`,
        )
        .bind(userId, programId)
    : db
        .prepare(`SELECT ${RULE_COLUMNS} FROM automation_rules WHERE user_id = ? ORDER BY created_at DESC`)
        .bind(userId);
  const { results } = await stmt.all<RuleRow>();
  return (results ?? []).map(toRule);
}

export async function getAutomationRule(
  db: D1Database,
  ruleId: string,
  userId: string,
): Promise<AutomationRule | null> {
  const row = await db
    .prepare(`SELECT ${RULE_COLUMNS} FROM automation_rules WHERE id = ? AND user_id = ?`)
    .bind(ruleId, userId)
    .first<RuleRow>();
  return row ? toRule(row) : null;
}

/** Enabled rules of active campaigns, least recently run first (round-robin across cron runs). */
export async function listDueAutomationRules(
  db: D1Database,
  limit: number,
): Promise<AutomationRule[]> {
  const { results } = await db
    .prepare(
      `SELECT ${RULE_COLUMNS.split(", ")
        .map((col) => `r.${col}`)
        .join(", ")}
       FROM automation_rules r JOIN programs p ON p.id = r.program_id AND p.user_id = r.user_id
       WHERE r.enabled = 1 AND p.status = 'active'
       ORDER BY COALESCE(r.last_run_at, 0) ASC
       LIMIT ?`,
    )
    .bind(limit)
    .all<RuleRow>();
  return (results ?? []).map(toRule);
}

export type NewAutomationRule = Omit<
  AutomationRule,
  "id" | "user_id" | "last_run_at" | "last_fired_at" | "created_at"
>;

export async function createAutomationRule(
  db: D1Database,
  userId: string,
  input: NewAutomationRule,
): Promise<AutomationRule> {
  const rule: AutomationRule = {
    ...input,
    id: id("rule"),
    user_id: userId,
    last_run_at: null,
    last_fired_at: null,
    created_at: Date.now(),
  };
  await db
    .prepare(
      `INSERT INTO automation_rules (${RULE_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      rule.id,
      rule.user_id,
      rule.program_id,
      rule.name,
      rule.kind,
      rule.dimension,
      rule.min_clicks,
      rule.event,
      rule.roi_below,
      rule.spend_above_cents,
      rule.window_hours,
      rule.notify_email,
      rule.webhook_url,
      rule.enabled ? 1 : 0,
      rule.last_run_at,
      rule.last_fired_at,
      rule.created_at,
    )
    .run();
  return rule;
}

export async function setAutomationRuleEnabled(
  db: D1Database,
  ruleId: string,
  userId: string,
  enabled: boolean,
): Promise<boolean> {
  const result = await db
    .prepare("UPDATE automation_rules SET enabled = ? WHERE id = ? AND user_id = ?")
    .bind(enabled ? 1 : 0, ruleId, userId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function deleteAutomationRule(
  db: D1Database,
  ruleId: string,
  userId: string,
): Promise<boolean> {
  const result = await db
    .prepare("DELETE FROM automation_rules WHERE id = ? AND user_id = ?")
    .bind(ruleId, userId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function markRuleRun(
  db: D1Database,
  ruleId: string,
  runAt: number,
  fired: boolean,
): Promise<void> {
  await db
    .prepare(
      fired
        ? "UPDATE automation_rules SET last_run_at = ?, last_fired_at = ? WHERE id = ?"
        : "UPDATE automation_rules SET last_run_at = ? WHERE id = ?",
    )
    .bind(...(fired ? [runAt, runAt, ruleId] : [runAt, ruleId]))
    .run();
}

export async function listZoneBlacklist(
  db: D1Database,
  userId: string,
  programId: string,
  dimension?: string,
): Promise<ZoneBlacklistEntry[]> {
  const stmt = dimension
    ? db
        .prepare(
          "SELECT * FROM zone_blacklist WHERE user_id = ? AND program_id = ? AND dimension = ? ORDER BY created_at DESC",
        )
        .bind(userId, programId, dimension)
    : db
        .prepare(
          "SELECT * FROM zone_blacklist WHERE user_id = ? AND program_id = ? ORDER BY created_at DESC",
        )
        .bind(userId, programId);
  const { results } = await stmt.all<ZoneBlacklistEntry>();
  return results ?? [];
}

/** Adds zones (ignores ones already listed). Returns the newly blacklisted values. */
export async function addZonesToBlacklist(
  db: D1Database,
  entry: { user_id: string; program_id: string; dimension: string; rule_id: string | null },
  zones: Array<{ value: string; reason: string }>,
): Promise<string[]> {
  if (zones.length === 0) return [];
  const now = Date.now();
  const results = await db.batch(
    zones.map((zone) =>
      db
        .prepare(
          `INSERT OR IGNORE INTO zone_blacklist (id, user_id, program_id, dimension, value, rule_id, reason, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id("zbl"),
          entry.user_id,
          entry.program_id,
          entry.dimension,
          zone.value,
          entry.rule_id,
          zone.reason,
          now,
        ),
    ),
  );
  return zones.filter((_, i) => (results[i]?.meta.changes ?? 0) > 0).map((zone) => zone.value);
}

export async function deleteBlacklistEntry(
  db: D1Database,
  entryId: string,
  userId: string,
): Promise<boolean> {
  const result = await db
    .prepare("DELETE FROM zone_blacklist WHERE id = ? AND user_id = ?")
    .bind(entryId, userId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}
