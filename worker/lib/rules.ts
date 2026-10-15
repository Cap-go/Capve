/**
 * Binom-style routing rules: ordered per campaign, every condition must match (AND),
 * first matching rule wins and its paths replace the default pool.
 */
import type { ClickContext } from "./click-context";
import { SUB_KEYS } from "./click-context";
import { ipMatches } from "./ip";
import type {
  PathWithEntities,
  RoutingRuleWithPaths,
  RuleCondition,
  RuleField,
  RuleOperator,
} from "../types-routing";

export const RULE_FIELDS: readonly RuleField[] = [
  "country",
  "region",
  "city",
  "device_type",
  "os",
  "browser",
  "isp",
  "asn",
  "language",
  "connection",
  "bot",
  "referrer_domain",
  "ip",
  "weekday",
  "hour",
  ...SUB_KEYS,
];

const OPERATORS: readonly RuleOperator[] = ["in", "not_in"];
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const MAX_CONDITIONS = 20;
const MAX_VALUES = 500;

/** Everything a rule can look at for one click. */
export type RuleContext = Pick<
  ClickContext,
  | "ip"
  | "country"
  | "region"
  | "city"
  | "device_type"
  | "os"
  | "browser"
  | "isp"
  | "referrer_domain"
  | "is_bot"
  | (typeof SUB_KEYS)[number]
> & {
  asn: number | null;
  /** Primary Accept-Language tag, lowercased (e.g. `de-de`). */
  language: string | null;
  is_datacenter: boolean;
  now: number;
};

/** First tag of an Accept-Language header, e.g. `de-DE,de;q=0.9` → `de-de`. */
export function primaryLanguage(header: string | null | undefined): string | null {
  const first = header?.split(",")[0]?.split(";")[0]?.trim().toLowerCase();
  if (!first || first === "*") return null;
  return first.slice(0, 35);
}

export function parseAsn(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim().replace(/^as/i, "");
  if (!/^\d{1,10}$/.test(text)) return null;
  return Number(text);
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Hour (0-23) and weekday (`sun`…`sat`) of `now` in `timezone`. */
export function localTime(now: number, timezone: string): { hour: number; weekday: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(new Date(now));
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const weekday = (parts.find((p) => p.type === "weekday")?.value ?? "").slice(0, 3).toLowerCase();
  return { hour, weekday };
}

function normalizeWeekday(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (/^[0-6]$/.test(v)) return WEEKDAYS[Number(v)];
  const short = v.slice(0, 3);
  return (WEEKDAYS as readonly string[]).includes(short) ? short : null;
}

/** `9` or `9-17` (inclusive; `22-3` wraps midnight). */
function parseHourRange(value: string): [number, number] | null {
  const m = value.trim().match(/^(\d{1,2})(?:\s*-\s*(\d{1,2}))?$/);
  if (!m) return null;
  const from = Number(m[1]);
  const to = m[2] === undefined ? from : Number(m[2]);
  if (from > 23 || to > 23) return null;
  return [from, to];
}

function hourInRange(hour: number, [from, to]: [number, number]): boolean {
  return from <= to ? hour >= from && hour <= to : hour >= from || hour <= to;
}

function truthy(value: string): boolean | null {
  const v = value.trim().toLowerCase();
  if (["yes", "true", "1", "bot"].includes(v)) return true;
  if (["no", "false", "0", "human"].includes(v)) return false;
  return null;
}

/** Validates a single value for a field; returns the normalized value or null. */
function normalizeValue(field: RuleField, raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  switch (field) {
    case "country":
      return /^[a-z]{2}$/i.test(value) ? value.toUpperCase() : null;
    case "asn": {
      const asn = parseAsn(value);
      return asn === null ? null : String(asn);
    }
    case "ip":
      return ipMatches("0.0.0.0", value) === null ? null : value.toLowerCase();
    case "weekday":
      return normalizeWeekday(value);
    case "hour":
      return parseHourRange(value) ? value.replace(/\s/g, "") : null;
    case "bot": {
      const flag = truthy(value);
      return flag === null ? null : flag ? "yes" : "no";
    }
    case "connection": {
      const v = value.toLowerCase();
      return v === "datacenter" || v === "residential" ? v : null;
    }
    default:
      return value.slice(0, 255).toLowerCase();
  }
}

/** Parses untrusted conditions from the API. */
export function parseConditions(
  raw: unknown,
): { conditions: RuleCondition[] } | { error: string } {
  if (raw === undefined || raw === null) return { conditions: [] };
  if (!Array.isArray(raw)) return { error: "conditions must be an array" };
  if (raw.length > MAX_CONDITIONS) return { error: `At most ${MAX_CONDITIONS} conditions` };

  const conditions: RuleCondition[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return { error: "Invalid condition" };
    const { field, op, values } = item as { field?: unknown; op?: unknown; values?: unknown };
    if (typeof field !== "string" || !RULE_FIELDS.includes(field as RuleField)) {
      return { error: `Invalid condition field: ${String(field)}` };
    }
    const operator = (op ?? "in") as RuleOperator;
    if (!OPERATORS.includes(operator)) return { error: `Invalid operator: ${String(op)}` };

    const list =
      typeof values === "string" ? values.split(",") : Array.isArray(values) ? values : null;
    if (!list) return { error: `values required for ${field}` };
    const normalized: string[] = [];
    for (const v of list) {
      if (typeof v !== "string" && typeof v !== "number") {
        return { error: `Invalid value for ${field}` };
      }
      if (String(v).trim() === "") continue;
      const n = normalizeValue(field as RuleField, String(v));
      if (n === null) return { error: `Invalid value for ${field}: ${String(v)}` };
      if (!normalized.includes(n)) normalized.push(n);
    }
    if (normalized.length === 0) return { error: `values required for ${field}` };
    if (normalized.length > MAX_VALUES) return { error: `Too many values for ${field}` };
    conditions.push({ field: field as RuleField, op: operator, values: normalized });
  }
  return { conditions };
}

function lower(value: string | null | undefined): string | null {
  return value ? value.toLowerCase() : null;
}

/** Does the click's value for `field` match any of `values`? */
function fieldMatches(
  field: RuleField,
  values: string[],
  ctx: RuleContext,
  timezone: string,
): boolean {
  switch (field) {
    case "country":
      return !!ctx.country && values.includes(ctx.country.toUpperCase());
    case "isp": {
      const isp = lower(ctx.isp);
      return !!isp && values.some((v) => isp.includes(v));
    }
    case "asn":
      return ctx.asn !== null && values.includes(String(ctx.asn));
    case "language": {
      const lang = ctx.language;
      if (!lang) return false;
      const primary = lang.split("-")[0];
      return values.some((v) => v === lang || v === primary);
    }
    case "connection":
      return values.includes(ctx.is_datacenter ? "datacenter" : "residential");
    case "bot":
      return values.includes(ctx.is_bot ? "yes" : "no");
    case "referrer_domain": {
      const ref = lower(ctx.referrer_domain);
      return !!ref && values.some((v) => ref === v || ref.endsWith(`.${v}`));
    }
    case "ip":
      return !!ctx.ip && values.some((v) => ipMatches(ctx.ip!, v) === true);
    case "weekday":
      return values.includes(localTime(ctx.now, timezone).weekday);
    case "hour": {
      const { hour } = localTime(ctx.now, timezone);
      return values.some((v) => {
        const range = parseHourRange(v);
        return !!range && hourInRange(hour, range);
      });
    }
    default: {
      const value = lower(ctx[field]);
      return !!value && values.includes(value);
    }
  }
}

export function conditionMatches(
  condition: RuleCondition,
  ctx: RuleContext,
  timezone = "UTC",
): boolean {
  const hit = fieldMatches(condition.field, condition.values, ctx, timezone);
  return condition.op === "not_in" ? !hit : hit;
}

export function ruleMatches(
  rule: { conditions: RuleCondition[]; timezone: string },
  ctx: RuleContext,
): boolean {
  return rule.conditions.every((c) => conditionMatches(c, ctx, rule.timezone));
}

/**
 * Path pool for a click: the enabled paths of the first enabled rule that matches and has at
 * least one enabled path; otherwise the default pool.
 */
export function selectRulePaths(
  rules: RoutingRuleWithPaths[],
  defaultPaths: PathWithEntities[],
  ctx: RuleContext,
): { rule_id: string | null; paths: PathWithEntities[] } {
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (!rule.paths.some((p) => p.enabled)) continue;
    if (ruleMatches(rule, ctx)) return { rule_id: rule.id, paths: rule.paths };
  }
  return { rule_id: null, paths: defaultPaths };
}

/** Weighted random pick over items with a `weight` (min weight 1). */
export function weightedItem<T extends { weight: number }>(items: T[]): T | null {
  if (items.length === 0) return null;
  const total = items.reduce((sum, item) => sum + Math.max(item.weight, 1), 0);
  let roll = Math.random() * total;
  for (const item of items) {
    roll -= Math.max(item.weight, 1);
    if (roll <= 0) return item;
  }
  return items[items.length - 1] ?? null;
}
