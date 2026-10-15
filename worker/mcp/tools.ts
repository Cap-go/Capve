import { GROUP_DIMENSIONS } from "../db/reports";
import { SOURCE_TOOLS } from "./tools-sources";

/** Internal API request an MCP tool call maps to. Runs with the caller's bearer token. */
export type ApiCall = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
};

type JsonSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

export type McpTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  annotations: { readOnlyHint: boolean; destructiveHint?: boolean; idempotentHint?: boolean };
  call: (args: Args) => ApiCall;
};

type Args = Record<string, unknown>;

const str = (description: string) => ({ type: "string", description });
const int = (description: string) => ({ type: "integer", description });
const bool = (description: string) => ({ type: "boolean", description });
const nullableStr = (description: string) => ({ type: ["string", "null"], description });
const enumOf = (values: readonly string[], description: string) => ({
  type: "string",
  enum: values,
  description,
});

const campaignId = str("Campaign id (prg_…). Use list_campaigns to find it.");
const dateArg = (edge: string) =>
  str(
    `${edge} of the report window: ISO date (2026-01-31) or Unix milliseconds. A date-only end includes that whole day (UTC).`,
  );

const reportFilters = {
  from: dateArg("Start"),
  to: dateArg("End"),
  group_id: str("Only campaigns in this group."),
  traffic_source_id: str("Only campaigns from this traffic source."),
  status: enumOf(["active", "paused", "archived"], "Only campaigns with this status. Omitted = active + paused (archived hidden)."),
};

function schema(properties: Record<string, unknown>, required: string[] = []): JsonSchema {
  return { type: "object", properties, required, additionalProperties: false };
}

const read = { readOnlyHint: true };
const write = { readOnlyHint: false, destructiveHint: false };
const destroy = { readOnlyHint: false, destructiveHint: true, idempotentHint: true };

function id(args: Args, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || !value.trim()) throw new ToolInputError(`${key} is required`);
  return encodeURIComponent(value.trim());
}

/**
 * Accepts ISO dates or Unix ms; the API expects Unix ms. YYYY-MM-DD is passed through: the
 * API resolves it as a calendar day in the account timezone (`to` = end of that day).
 */
function toMs(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "number") return String(value);
  const text = String(value).trim();
  if (/^\d+$/.test(text)) return text;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const ms = Date.parse(text);
  if (Number.isNaN(ms)) throw new ToolInputError(`Invalid date: ${text}`);
  return String(ms);
}

function filters(args: Args) {
  return {
    from: toMs(args.from),
    to: toMs(args.to),
    group_id: args.group_id as string | undefined,
    traffic_source_id: args.traffic_source_id as string | undefined,
    status: args.status as string | undefined,
  };
}

function pick(args: Args, keys: string[]) {
  return Object.fromEntries(keys.filter((key) => args[key] !== undefined).map((k) => [k, args[k]]));
}

export class ToolInputError extends Error {}

const METRICS_NOTE =
  "Conversions count each converted click once (registration + FTD on one click = 1) plus click-less conversions; CR = conversions / clicks, max 100%. Cost is stored per click at click time (CPC/CPM), CPA is charged once per converted click. ROI is null without cost. Per-event metrics in event_metrics: count, revenue_cents, cr, cpa_cents. Money in cents; revenue is in `currency` and revenue_by_currency lists every currency (never summed).";

const pathFields = {
  name: str("Path name."),
  flow_type: enumOf(
    ["direct", "lander", "lander_offer", "offer"],
    "direct = direct_url; lander = lander only; lander_offer = lander then offer via /lp; offer = offer only.",
  ),
  weight: int("Rotation weight, integer >= 0 (default 100). 0 = no traffic."),
  sort_order: int("Order for top_to_bottom rotation."),
  direct_url: nullableStr("Destination for flow_type=direct (http/https)."),
  lander_id: nullableStr("Lander id (lp_…)."),
  offer_id: nullableStr("Offer id (off_…)."),
  enabled: bool("Whether the path receives traffic."),
  landers: {
    type: "array",
    description: "Weighted landers; replaces the list. Overrides lander_id.",
    items: {
      type: "object",
      properties: { lander_id: str("Lander id."), weight: int("Weight (default 100).") },
      required: ["lander_id"],
    },
  },
  offers: {
    type: "array",
    description: "Weighted offers; replaces the list. Overrides offer_id.",
    items: {
      type: "object",
      properties: { offer_id: str("Offer id."), weight: int("Weight (default 100).") },
      required: ["offer_id"],
    },
  },
};

const ruleFields = {
  name: str("Rule name."),
  conditions: {
    type: "array",
    description:
      "AND-ed conditions. field: country, region, city, device_type, os, browser, isp, asn, language, connection (datacenter|residential), bot (yes|no), referrer_domain, ip (IP or CIDR), weekday (mon..sun), hour (9 or 9-17), sub1..sub10. op: in | not_in.",
    items: {
      type: "object",
      properties: {
        field: str("Click field."),
        op: enumOf(["in", "not_in"], "Operator."),
        values: { type: "array", items: { type: "string" }, description: "Values (any match)." },
      },
      required: ["field", "values"],
    },
  },
  timezone: str("IANA timezone for weekday/hour conditions (default UTC)."),
  sort_order: int("Evaluation order (lower first)."),
  enabled: bool("Whether the rule is evaluated."),
};

const postbackOwner = {
  campaign_id: str("Campaign id (prg_…)."),
  traffic_source_id: str("Traffic source id."),
  network_id: str("Affiliate network id."),
};
const postbackEvent = nullableStr(
  "Conversion event this postback fires for (registration, ftd, deposit, ...); null = every conversion.",
);

export const TOOLS: McpTool[] = [
  {
    name: "whoami",
    title: "Current user",
    description: "Show the signed-in user, team role and account id this token acts as.",
    inputSchema: schema({}),
    annotations: read,
    call: () => ({ method: "GET", path: "/api/auth/me" }),
  },

  // Campaigns
  {
    name: "list_campaigns",
    title: "List campaigns",
    description: "List all campaigns (id, name, campaign_key, destination, status, group, source).",
    inputSchema: schema({}),
    annotations: read,
    call: () => ({ method: "GET", path: "/api/programs" }),
  },
  {
    name: "get_campaign",
    title: "Get campaign",
    description: "Get one campaign by id.",
    inputSchema: schema({ campaign_id: campaignId }, ["campaign_id"]),
    annotations: read,
    call: (a) => ({ method: "GET", path: `/api/programs/${id(a, "campaign_id")}` }),
  },
  {
    name: "create_campaign",
    title: "Create campaign",
    description:
      "Create a campaign. Returns the campaign (with campaign_key for /c/{key} links) and convert_secret, which is shown only once.",
    inputSchema: schema(
      {
        name: str("Campaign name."),
        destination_url: str("Optional default destination (http/https). Omit to route only through paths."),
        traffic_source_id: str("Optional traffic source id (src_…)."),
        group_id: str("Optional group id (grp_…)."),
      },
      ["name"],
    ),
    annotations: write,
    call: (a) => ({
      method: "POST",
      path: "/api/programs",
      body: pick(a, ["name", "destination_url", "traffic_source_id", "group_id"]),
    }),
  },
  {
    name: "update_campaign",
    title: "Update campaign",
    description:
      "Rename a campaign, change its default destination, traffic source or group, or pause/resume it. Postbacks: see create_postback.",
    inputSchema: schema(
      {
        campaign_id: campaignId,
        name: str("New name."),
        destination_url: nullableStr("New default destination (http/https); null to clear."),
        traffic_source_id: nullableStr("Traffic source id; null to clear."),
        group_id: nullableStr("Group id; null to clear."),
        status: enumOf(["active", "paused"], "active = links redirect; paused = links return 404."),
      },
      ["campaign_id"],
    ),
    annotations: write,
    call: (a) => ({
      method: "PATCH",
      path: `/api/programs/${id(a, "campaign_id")}`,
      body: pick(a, ["name", "destination_url", "traffic_source_id", "group_id", "status"]),
    }),
  },
  {
    name: "delete_campaign",
    title: "Delete campaign",
    description:
      "Delete (archive) a campaign: its links stop redirecting and it leaves list_campaigns. Clicks and conversions stay in reports (status=archived).",
    inputSchema: schema({ campaign_id: campaignId }, ["campaign_id"]),
    annotations: destroy,
    call: (a) => ({ method: "DELETE", path: `/api/programs/${id(a, "campaign_id")}` }),
  },
  {
    name: "bulk_update_campaigns",
    title: "Bulk update campaigns",
    description: "Set status, group, traffic source or tags on several campaigns at once (e.g. pause).",
    inputSchema: schema(
      {
        campaign_ids: { type: "array", items: { type: "string" }, description: "Campaign ids." },
        status: enumOf(["active", "paused", "archived"], "New status."),
        group_id: nullableStr("Group id; null to clear."),
        traffic_source_id: nullableStr("Traffic source id; null to clear."),
        tags: nullableStr("Comma-separated tags; null to clear."),
      },
      ["campaign_ids"],
    ),
    annotations: write,
    call: (a) => ({
      method: "POST",
      path: "/api/ops/programs/bulk",
      body: {
        program_ids: a.campaign_ids,
        ...pick(a, ["status", "group_id", "traffic_source_id", "tags"]),
      },
    }),
  },
  {
    name: "clone_campaign",
    title: "Clone campaign",
    description: "Copy a campaign with its rotation and paths.",
    inputSchema: schema({ campaign_id: campaignId, name: str("Name for the copy.") }, [
      "campaign_id",
    ]),
    annotations: write,
    call: (a) => ({
      method: "POST",
      path: `/api/ops/programs/${id(a, "campaign_id")}/clone`,
      body: pick(a, ["name"]),
    }),
  },
  {
    name: "get_campaign_tracking",
    title: "Campaign tracking setup",
    description:
      "Get the campaign link (/c/{key}), incoming postback URL template and macros to give to traffic sources and networks. For events add &event=registration (or ftd, ...) to the postback URL.",
    inputSchema: schema({ campaign_id: campaignId }, ["campaign_id"]),
    annotations: read,
    call: (a) => ({ method: "GET", path: `/api/programs/${id(a, "campaign_id")}/tracking` }),
  },
  {
    name: "get_campaign_stats",
    title: "Campaign stats",
    description:
      "All-time clicks, conversions, CR and revenue for one campaign, per affiliate. Conversions = converted clicks (a click with registration + FTD counts once) plus click-less conversions; CR is capped at 100%. Per-event metrics in event_metrics (count, revenue_cents, cr). revenue_cents is in `currency`; revenue_by_currency lists every currency.",
    inputSchema: schema({ campaign_id: campaignId }, ["campaign_id"]),
    annotations: read,
    call: (a) => ({ method: "GET", path: `/api/programs/${id(a, "campaign_id")}/stats` }),
  },
  {
    name: "list_clicks",
    title: "Click log",
    description: "Recent clicks for a campaign with geo, device, subs and bot flag.",
    inputSchema: schema(
      {
        campaign_id: campaignId,
        limit: int("Max rows (1-200, default 50)."),
        offset: int("Skip rows."),
        from: dateArg("Start"),
        to: dateArg("End"),
      },
      ["campaign_id"],
    ),
    annotations: read,
    call: (a) => ({
      method: "GET",
      path: `/api/programs/${id(a, "campaign_id")}/clicks`,
      query: {
        limit: a.limit as number | undefined,
        offset: a.offset as number | undefined,
        from: toMs(a.from),
        to: toMs(a.to),
      },
    }),
  },
  {
    name: "list_conversions",
    title: "Conversion log",
    description: "Recent conversions for a campaign (event, status, payout, click id).",
    inputSchema: schema(
      {
        campaign_id: campaignId,
        limit: int("Max rows (1-200, default 50)."),
        offset: int("Skip rows."),
        from: dateArg("Start"),
        to: dateArg("End"),
      },
      ["campaign_id"],
    ),
    annotations: read,
    call: (a) => ({
      method: "GET",
      path: `/api/programs/${id(a, "campaign_id")}/conversions`,
      query: {
        limit: a.limit as number | undefined,
        offset: a.offset as number | undefined,
        from: toMs(a.from),
        to: toMs(a.to),
      },
    }),
  },

  // Affiliates
  {
    name: "list_affiliates",
    title: "List affiliates",
    description: "List affiliates of a campaign with their /r/{code} tracking codes.",
    inputSchema: schema({ campaign_id: campaignId }, ["campaign_id"]),
    annotations: read,
    call: (a) => ({ method: "GET", path: `/api/programs/${id(a, "campaign_id")}/affiliates` }),
  },
  {
    name: "create_affiliate",
    title: "Create affiliate",
    description: "Add an affiliate to a campaign. Returns its tracking_url (/r/{code}).",
    inputSchema: schema({ campaign_id: campaignId, name: str("Affiliate name.") }, [
      "campaign_id",
      "name",
    ]),
    annotations: write,
    call: (a) => ({
      method: "POST",
      path: `/api/programs/${id(a, "campaign_id")}/affiliates`,
      body: pick(a, ["name"]),
    }),
  },

  // Routing
  {
    name: "get_rotation",
    title: "Get rotation",
    description: "Get a campaign's rotation mode and paths (landers, offers, weights).",
    inputSchema: schema({ campaign_id: campaignId }, ["campaign_id"]),
    annotations: read,
    call: (a) => ({ method: "GET", path: `/api/programs/${id(a, "campaign_id")}/rotation` }),
  },
  {
    name: "set_rotation",
    title: "Set rotation",
    description:
      "Set rotation mode: normal (weighted random), smart (sticky per visitor), fix_on (always fixed_path_id), top_to_bottom (first enabled path).",
    inputSchema: schema(
      {
        campaign_id: campaignId,
        mode: enumOf(["normal", "smart", "fix_on", "top_to_bottom"], "Rotation mode."),
        fixed_path_id: nullableStr("Path id for fix_on mode."),
      },
      ["campaign_id"],
    ),
    annotations: write,
    call: (a) => ({
      method: "PUT",
      path: `/api/programs/${id(a, "campaign_id")}/rotation`,
      body: pick(a, ["mode", "fixed_path_id"]),
    }),
  },
  {
    name: "create_path",
    title: "Create path",
    description:
      "Add a traffic path (direct URL, lander, offer, or lander then offer) to a campaign. Pass rule_id to add it to a routing rule instead of the default pool.",
    inputSchema: schema(
      {
        campaign_id: campaignId,
        ...pathFields,
        rule_id: nullableStr("Routing rule id (rul_…); omit for the default pool."),
      },
      ["campaign_id", "name", "flow_type"],
    ),
    annotations: write,
    call: (a) => ({
      method: "POST",
      path: `/api/programs/${id(a, "campaign_id")}/paths`,
      body: pick(a, [...Object.keys(pathFields), "rule_id"]),
    }),
  },
  {
    name: "update_path",
    title: "Update path",
    description: "Change a path's weight, target, order or enabled flag.",
    inputSchema: schema(
      { campaign_id: campaignId, path_id: str("Path id (pth_…)."), ...pathFields },
      ["campaign_id", "path_id"],
    ),
    annotations: write,
    call: (a) => ({
      method: "PATCH",
      path: `/api/programs/${id(a, "campaign_id")}/paths/${id(a, "path_id")}`,
      body: pick(a, Object.keys(pathFields)),
    }),
  },
  {
    name: "delete_path",
    title: "Delete path",
    description: "Remove a path from a campaign's rotation.",
    inputSchema: schema({ campaign_id: campaignId, path_id: str("Path id (pth_…).") }, [
      "campaign_id",
      "path_id",
    ]),
    annotations: destroy,
    call: (a) => ({
      method: "DELETE",
      path: `/api/programs/${id(a, "campaign_id")}/paths/${id(a, "path_id")}`,
    }),
  },
  {
    name: "list_rules",
    title: "List routing rules",
    description: "List a campaign's routing rules in evaluation order, with their paths.",
    inputSchema: schema({ campaign_id: campaignId }, ["campaign_id"]),
    annotations: read,
    call: (a) => ({ method: "GET", path: `/api/programs/${id(a, "campaign_id")}/rules` }),
  },
  {
    name: "create_rule",
    title: "Create routing rule",
    description:
      "Add a routing rule (e.g. country in DE,AT and device_type in mobile). First matching rule wins; then add paths with create_path rule_id. Unmatched clicks use the default paths.",
    inputSchema: schema({ campaign_id: campaignId, ...ruleFields }, ["campaign_id", "name"]),
    annotations: write,
    call: (a) => ({
      method: "POST",
      path: `/api/programs/${id(a, "campaign_id")}/rules`,
      body: pick(a, Object.keys(ruleFields)),
    }),
  },
  {
    name: "update_rule",
    title: "Update routing rule",
    description: "Change a rule's name, conditions, timezone, order or enabled flag.",
    inputSchema: schema(
      { campaign_id: campaignId, rule_id: str("Rule id (rul_…)."), ...ruleFields },
      ["campaign_id", "rule_id"],
    ),
    annotations: write,
    call: (a) => ({
      method: "PATCH",
      path: `/api/programs/${id(a, "campaign_id")}/rules/${id(a, "rule_id")}`,
      body: pick(a, Object.keys(ruleFields)),
    }),
  },
  {
    name: "delete_rule",
    title: "Delete routing rule",
    description: "Delete a routing rule and its paths.",
    inputSchema: schema({ campaign_id: campaignId, rule_id: str("Rule id (rul_…).") }, [
      "campaign_id",
      "rule_id",
    ]),
    annotations: destroy,
    call: (a) => ({
      method: "DELETE",
      path: `/api/programs/${id(a, "campaign_id")}/rules/${id(a, "rule_id")}`,
    }),
  },

  // Anti-fraud
  {
    name: "get_traffic_filter",
    title: "Get bot handling",
    description: "Get how a campaign handles bot / blocklisted / datacenter traffic.",
    inputSchema: schema({ campaign_id: campaignId }, ["campaign_id"]),
    annotations: read,
    call: (a) => ({ method: "GET", path: `/api/programs/${id(a, "campaign_id")}/traffic-filter` }),
  },
  {
    name: "set_traffic_filter",
    title: "Set bot handling",
    description:
      "Set a campaign's bot handling: bot_action route (count as bot, route normally) or safe_page (redirect flagged clicks to safe_page_url). block_datacenter flags cloud/hosting ASNs as bots.",
    inputSchema: schema(
      {
        campaign_id: campaignId,
        bot_action: enumOf(["route", "safe_page"], "Action for flagged traffic."),
        safe_page_url: nullableStr("Safe page URL (http/https)."),
        block_datacenter: bool("Flag datacenter / cloud ASNs as bots."),
      },
      ["campaign_id"],
    ),
    annotations: write,
    call: (a) => ({
      method: "PUT",
      path: `/api/programs/${id(a, "campaign_id")}/traffic-filter`,
      body: pick(a, ["bot_action", "safe_page_url", "block_datacenter"]),
    }),
  },
  {
    name: "list_blocklist",
    title: "List blocklist",
    description: "List the account blocklist (IP/CIDR, ASN, user-agent substrings) and built-in datacenter ASNs.",
    inputSchema: schema({}),
    annotations: read,
    call: () => ({ method: "GET", path: "/api/antifraud/blocklist" }),
  },
  {
    name: "add_to_blocklist",
    title: "Add to blocklist",
    description: "Block IPs/CIDRs, ASNs or user-agent substrings account-wide. Matching clicks are flagged as bots.",
    inputSchema: schema(
      {
        kind: enumOf(["ip", "asn", "ua"], "Entry type."),
        values: { type: "array", items: { type: "string" }, description: "Values to block." },
      },
      ["kind", "values"],
    ),
    annotations: write,
    call: (a) => ({ method: "POST", path: "/api/antifraud/blocklist", body: pick(a, ["kind", "values"]) }),
  },
  {
    name: "remove_from_blocklist",
    title: "Remove from blocklist",
    description: "Delete a blocklist entry.",
    inputSchema: schema({ entry_id: str("Blocklist entry id (blk_…).") }, ["entry_id"]),
    annotations: destroy,
    call: (a) => ({ method: "DELETE", path: `/api/antifraud/blocklist/${id(a, "entry_id")}` }),
  },

  // Entities
  ...(
    [
      ["groups", "groups", "campaign groups"],
      ["traffic_sources", "traffic-sources", "traffic sources (cost model, postback share)"],
      ["networks", "networks", "affiliate networks"],
      ["landers", "landers", "landing pages"],
      ["offers", "offers", "offers (URL, payout, network)"],
    ] as const
  ).map(
    ([name, route, label]): McpTool => ({
      name: `list_${name}`,
      title: `List ${label.split(" (")[0]}`,
      description: `List ${label}.`,
      inputSchema: schema({}),
      annotations: read,
      call: () => ({ method: "GET", path: `/api/entities/${route}` }),
    }),
  ),
  {
    name: "create_group",
    title: "Create group",
    description: "Create a campaign group.",
    inputSchema: schema({ name: str("Group name.") }, ["name"]),
    annotations: write,
    call: (a) => ({ method: "POST", path: "/api/entities/groups", body: pick(a, ["name"]) }),
  },
  {
    name: "delete_group",
    title: "Delete group",
    description: "Delete a campaign group. Campaigns in it are kept.",
    inputSchema: schema({ group_id: str("Group id.") }, ["group_id"]),
    annotations: destroy,
    call: (a) => ({ method: "DELETE", path: `/api/entities/groups/${id(a, "group_id")}` }),
  },
  {
    name: "create_traffic_source",
    title: "Create traffic source",
    description: "Create a traffic source with its cost model. Add its postbacks with create_postback.",
    inputSchema: schema(
      {
        name: str("Traffic source name."),
        cost_type: enumOf(["cpc", "cpm", "cpa"], "Cost model."),
        default_cost_cents: int("Default cost in cents (per click, per 1000 clicks, or per conversion)."),
        postback_percent: int("Share of conversions reported back to the source (0-100)."),
      },
      ["name"],
    ),
    annotations: write,
    call: (a) => ({
      method: "POST",
      path: "/api/entities/traffic-sources",
      body: pick(a, ["name", "cost_type", "default_cost_cents", "postback_percent"]),
    }),
  },
  {
    name: "create_network",
    title: "Create affiliate network",
    description: "Create an affiliate network. Add its postbacks with create_postback.",
    inputSchema: schema({ name: str("Network name.") }, ["name"]),
    annotations: write,
    call: (a) => ({ method: "POST", path: "/api/entities/networks", body: pick(a, ["name"]) }),
  },
  {
    name: "create_lander",
    title: "Create lander",
    description: "Create a landing page. Link its CTA to {lp_click_url} to track LP clicks.",
    inputSchema: schema({ name: str("Lander name."), url: str("Lander URL (http/https).") }, [
      "name",
      "url",
    ]),
    annotations: write,
    call: (a) => ({ method: "POST", path: "/api/entities/landers", body: pick(a, ["name", "url"]) }),
  },
  {
    name: "create_offer",
    title: "Create offer",
    description: "Create an offer. URL may use macros like {clickid}, {sub1}, {country}.",
    inputSchema: schema(
      {
        name: str("Offer name."),
        url: str("Offer URL (http/https)."),
        network_id: nullableStr("Affiliate network id."),
        payout_cents: int("Default payout in cents when the postback has none."),
      },
      ["name", "url"],
    ),
    annotations: write,
    call: (a) => ({
      method: "POST",
      path: "/api/entities/offers",
      body: pick(a, ["name", "url", "network_id", "payout_cents"]),
    }),
  },

  ...(
    [
      ["traffic_source", "traffic-sources", "traffic source", "Traffic source id (src_…).", "Fails with 409 while campaigns use it. Its postbacks are deleted."],
      ["network", "networks", "affiliate network", "Network id (net_…).", "Fails with 409 while offers use it. Its postbacks are deleted."],
      ["lander", "landers", "lander", "Lander id (lp_…).", "Fails with 409 while paths use it or it has tracked clicks."],
      ["offer", "offers", "offer", "Offer id (off_…).", "Fails with 409 while paths use it or it has tracked clicks."],
    ] as const
  ).map(
    ([name, route, label, idHelp, note]): McpTool => ({
      name: `delete_${name}`,
      title: `Delete ${label}`,
      description: `Delete a ${label}. ${note}`,
      inputSchema: schema({ [`${name}_id`]: str(idHelp) }, [`${name}_id`]),
      annotations: destroy,
      call: (a) => ({ method: "DELETE", path: `/api/entities/${route}/${id(a, `${name}_id`)}` }),
    }),
  ),
  {
    name: "update_traffic_source",
    title: "Update traffic source",
    description: "Change a traffic source's name, cost model or postback share.",
    inputSchema: schema(
      {
        traffic_source_id: str("Traffic source id (src_…)."),
        name: str("New name."),
        cost_type: enumOf(["cpc", "cpm", "cpa"], "Cost model."),
        default_cost_cents: int("Default cost in cents."),
        postback_percent: int("Share of conversions reported back to the source (0-100)."),
      },
      ["traffic_source_id"],
    ),
    annotations: write,
    call: (a) => ({
      method: "PATCH",
      path: `/api/entities/traffic-sources/${id(a, "traffic_source_id")}`,
      body: pick(a, ["name", "cost_type", "default_cost_cents", "postback_percent"]),
    }),
  },
  {
    name: "update_network",
    title: "Update affiliate network",
    description: "Rename an affiliate network.",
    inputSchema: schema({ network_id: str("Network id (net_…)."), name: str("New name.") }, [
      "network_id",
    ]),
    annotations: write,
    call: (a) => ({
      method: "PATCH",
      path: `/api/entities/networks/${id(a, "network_id")}`,
      body: pick(a, ["name"]),
    }),
  },
  {
    name: "update_lander",
    title: "Update lander",
    description: "Change a lander's name or URL.",
    inputSchema: schema(
      { lander_id: str("Lander id (lp_…)."), name: str("New name."), url: str("New URL (http/https).") },
      ["lander_id"],
    ),
    annotations: write,
    call: (a) => ({
      method: "PATCH",
      path: `/api/entities/landers/${id(a, "lander_id")}`,
      body: pick(a, ["name", "url"]),
    }),
  },
  {
    name: "update_offer",
    title: "Update offer",
    description: "Change an offer's name, URL, network or default payout.",
    inputSchema: schema(
      {
        offer_id: str("Offer id (off_…)."),
        name: str("New name."),
        url: str("New URL (http/https)."),
        network_id: nullableStr("Affiliate network id; null to clear."),
        payout_cents: int("Default payout in cents."),
      },
      ["offer_id"],
    ),
    annotations: write,
    call: (a) => ({
      method: "PATCH",
      path: `/api/entities/offers/${id(a, "offer_id")}`,
      body: pick(a, ["name", "url", "network_id", "payout_cents"]),
    }),
  },

  // Outgoing postbacks
  {
    name: "list_postbacks",
    title: "List postbacks",
    description:
      "List outgoing postbacks, optionally for one campaign, traffic source or network. Each has an optional event filter.",
    inputSchema: schema(postbackOwner),
    annotations: read,
    call: (a) => ({
      method: "GET",
      path: "/api/postbacks",
      query: pick(a, ["campaign_id", "traffic_source_id", "network_id"]) as Record<string, string>,
    }),
  },
  {
    name: "create_postback",
    title: "Create postback",
    description:
      "Add an outgoing postback (S2S/pixel URL) to exactly one campaign, traffic source or network. " +
      "Set event to fire it only for that conversion event (e.g. registration, ftd); omit to fire for every conversion. " +
      "Campaign postbacks fire on every status; traffic source and network ones on approved conversions only. " +
      "URL macros: {click_id} {external_id} {payout} {status} {status2} {event} {currency} {order_id} {affiliate_code}.",
    inputSchema: schema(
      { ...postbackOwner, event: postbackEvent, url: str("Postback URL (http/https) with macros.") },
      ["url"],
    ),
    annotations: write,
    call: (a) => ({
      method: "POST",
      path: "/api/postbacks",
      body: pick(a, ["campaign_id", "traffic_source_id", "network_id", "event", "url"]),
    }),
  },
  {
    name: "update_postback",
    title: "Update postback",
    description: "Change a postback's URL or event filter.",
    inputSchema: schema(
      { postback_id: str("Postback id (pb_…)."), event: postbackEvent, url: str("New URL.") },
      ["postback_id"],
    ),
    annotations: write,
    call: (a) => ({
      method: "PATCH",
      path: `/api/postbacks/${id(a, "postback_id")}`,
      body: pick(a, ["event", "url"]),
    }),
  },
  {
    name: "delete_postback",
    title: "Delete postback",
    description: "Delete an outgoing postback.",
    inputSchema: schema({ postback_id: str("Postback id (pb_…).") }, ["postback_id"]),
    annotations: destroy,
    call: (a) => ({ method: "DELETE", path: `/api/postbacks/${id(a, "postback_id")}` }),
  },
  {
    name: "get_postback_key",
    title: "Get incoming postback key",
    description:
      "Get the account's incoming postback key, whether it is required, and the incoming postback URL with &key= to give to networks. " +
      "Without a valid key, payouts are capped to the offer payout; when required, keyless postbacks are rejected (403).",
    inputSchema: schema({}),
    annotations: read,
    call: () => ({ method: "GET", path: "/api/ops/postback-key" }),
  },
  {
    name: "set_postback_key_required",
    title: "Require postback key",
    description:
      "Turn incoming postback key enforcement on or off. Turn it on only after every network postback URL includes &key=.",
    inputSchema: schema({ required: bool("Reject incoming postbacks without a valid key.") }, [
      "required",
    ]),
    annotations: write,
    call: (a) => ({ method: "PUT", path: "/api/ops/postback-key", body: pick(a, ["required"]) }),
  },
  {
    name: "rotate_postback_key",
    title: "Rotate postback key",
    description:
      "Generate a new incoming postback key. The old key stops working immediately; update every network postback URL.",
    inputSchema: schema({}),
    annotations: { readOnlyHint: false, destructiveHint: true },
    call: () => ({ method: "POST", path: "/api/ops/postback-key/rotate" }),
  },
  {
    name: "list_postback_deliveries",
    title: "List postback deliveries",
    description:
      "Recent delivery attempts of one outgoing postback (newest first): URL sent, HTTP status, error, attempt (1 = first try, 2 = retry). Use to debug postbacks that do not reach the network or traffic source.",
    inputSchema: schema(
      { postback_id: str("Postback id (pb_…)."), limit: int("Max attempts to return (1-100, default 20).") },
      ["postback_id"],
    ),
    annotations: read,
    call: (a) => ({
      method: "GET",
      path: `/api/postbacks/${id(a, "postback_id")}/deliveries`,
      query: { limit: a.limit as number | undefined },
    }),
  },

  // Reports
  {
    name: "report_campaigns",
    title: "Campaign report",
    description:
      `Metrics per campaign: clicks, LP clicks, conversions (metrics.leads), CR, revenue, cost, profit, ROI, EPC, CPC. ${METRICS_NOTE}`,
    inputSchema: schema(reportFilters),
    annotations: read,
    call: (a) => ({ method: "GET", path: "/api/reports/campaigns", query: filters(a) }),
  },
  {
    name: "report_grouped",
    title: "Grouped report",
    description:
      `Metrics grouped by one dimension (country, os, offer, sub1, date…), across all campaigns or one. ${METRICS_NOTE}`,
    inputSchema: schema(
      {
        by: enumOf(GROUP_DIMENSIONS, "Dimension to group by."),
        campaign_id: str("Only this campaign."),
        ...reportFilters,
      },
      ["by"],
    ),
    annotations: read,
    call: (a) => ({
      method: "GET",
      path: "/api/reports/grouped",
      query: { by: a.by as string, campaign_id: a.campaign_id as string | undefined, ...filters(a) },
    }),
  },
  {
    name: "report_trends",
    title: "Campaign trends",
    description:
      "Daily clicks, conversions (leads, one per converted click), revenue and per-event counts for one campaign.",
    inputSchema: schema({ campaign_id: campaignId, from: dateArg("Start"), to: dateArg("End") }, [
      "campaign_id",
    ]),
    annotations: read,
    call: (a) => ({
      method: "GET",
      path: `/api/reports/campaigns/${id(a, "campaign_id")}/trends`,
      query: { from: toMs(a.from), to: toMs(a.to) },
    }),
  },

  // Automation
  {
    name: "list_triggers",
    title: "List triggers",
    description: "List webhooks fired on clicks or conversions.",
    inputSchema: schema({ campaign_id: str("Only triggers for this campaign.") }),
    annotations: read,
    call: (a) => ({
      method: "GET",
      path: "/api/ops/triggers",
      query: { program_id: a.campaign_id as string | undefined },
    }),
  },
  {
    name: "create_trigger",
    title: "Create trigger",
    description: "Create a webhook called on every click or conversion.",
    inputSchema: schema(
      {
        name: str("Trigger name."),
        event: enumOf(["conversion", "click"], "Event that fires the webhook."),
        action_url: str("Webhook URL (http/https)."),
        campaign_id: nullableStr("Limit to one campaign; omit for all."),
        enabled: bool("Enabled (default true)."),
      },
      ["name", "event", "action_url"],
    ),
    annotations: write,
    call: (a) => ({
      method: "POST",
      path: "/api/ops/triggers",
      body: { ...pick(a, ["name", "event", "action_url", "enabled"]), program_id: a.campaign_id },
    }),
  },
  {
    name: "delete_trigger",
    title: "Delete trigger",
    description: "Delete a webhook trigger.",
    inputSchema: schema({ trigger_id: str("Trigger id.") }, ["trigger_id"]),
    annotations: destroy,
    call: (a) => ({ method: "DELETE", path: `/api/ops/triggers/${id(a, "trigger_id")}` }),
  },

  // Drilldown, timezone, zone automation, tracking domains
  {
    name: "report_drilldown",
    title: "Drilldown report",
    description:
      "Nested report over 1-4 dimensions (e.g. campaign,sub1,country,offer). Each row has the grouped-report metrics and children for the next level. Money in cents.",
    inputSchema: schema(
      {
        by: str(`Comma-separated dimensions, 1 to 4 of: ${GROUP_DIMENSIONS.join(", ")}.`),
        campaign_id: str("Only this campaign."),
        limit: int("Max children per row (default 50, max 200)."),
        ...reportFilters,
      },
      ["by"],
    ),
    annotations: read,
    call: (a) => ({
      method: "GET",
      path: "/api/reports/drilldown",
      query: {
        by: a.by as string,
        campaign_id: a.campaign_id as string | undefined,
        limit: a.limit as number | undefined,
        ...filters(a),
      },
    }),
  },
  {
    name: "get_settings",
    title: "Account settings",
    description: "Account settings, including the report timezone (IANA).",
    inputSchema: schema({}),
    annotations: read,
    call: () => ({ method: "GET", path: "/api/settings" }),
  },
  {
    name: "update_settings",
    title: "Update account settings",
    description:
      "Set the report timezone (IANA name, e.g. Europe/Paris). Date grouping and YYYY-MM-DD report ranges use it.",
    inputSchema: schema({ timezone: str("IANA timezone, e.g. UTC or Europe/Paris.") }, ["timezone"]),
    annotations: write,
    call: (a) => ({ method: "PUT", path: "/api/settings", body: pick(a, ["timezone"]) }),
  },
  {
    name: "list_automation_rules",
    title: "List automation rules",
    description: "Zone blacklist rules and ROI/spend alerts, optionally for one campaign.",
    inputSchema: schema({ campaign_id: str("Only rules of this campaign.") }),
    annotations: read,
    call: (a) => ({
      method: "GET",
      path: "/api/automation/rules",
      query: { campaign_id: a.campaign_id as string | undefined },
    }),
  },
  {
    name: "create_automation_rule",
    title: "Create automation rule",
    description:
      "kind=zone_blacklist: zones (dimension, e.g. sub1) with >= min_clicks and 0 conversions (or 0 of `event`) in the last window_hours are blacklisted. kind=alert: notify when ROI < roi_below and/or cost > spend_above_cents over window_hours. Evaluated every 15 minutes; notifications by email and/or webhook (POST JSON).",
    inputSchema: schema(
      {
        campaign_id: campaignId,
        kind: enumOf(["zone_blacklist", "alert"], "Rule type."),
        name: str("Rule name (optional)."),
        dimension: enumOf(
          GROUP_DIMENSIONS.filter((d) => !["campaign", "date", "traffic_source"].includes(d)),
          "zone_blacklist: dimension holding the zone (default sub1).",
        ),
        min_clicks: int("zone_blacklist: minimum clicks."),
        event: nullableStr(
          "zone_blacklist: event that counts (registration, ftd…); omit = any conversion.",
        ),
        roi_below: { type: "number", description: "alert: fire when ROI % is below this." },
        spend_above_cents: int("alert: fire when cost in cents is above this."),
        window_hours: int("Look-back window in hours (1-720, default 24)."),
        notify_email: str("Email to notify."),
        webhook_url: str("Webhook URL (http/https) receiving a JSON POST."),
        enabled: bool("Enabled (default true)."),
      },
      ["campaign_id", "kind"],
    ),
    annotations: write,
    call: (a) => ({
      method: "POST",
      path: "/api/automation/rules",
      body: pick(a, [
        "campaign_id",
        "kind",
        "name",
        "dimension",
        "min_clicks",
        "event",
        "roi_below",
        "spend_above_cents",
        "window_hours",
        "notify_email",
        "webhook_url",
        "enabled",
      ]),
    }),
  },
  {
    name: "set_automation_rule_enabled",
    title: "Enable/disable automation rule",
    description: "Enable or disable an automation rule.",
    inputSchema: schema({ rule_id: str("Rule id."), enabled: bool("Enabled.") }, [
      "rule_id",
      "enabled",
    ]),
    annotations: write,
    call: (a) => ({
      method: "PATCH",
      path: `/api/automation/rules/${id(a, "rule_id")}`,
      body: { enabled: a.enabled },
    }),
  },
  {
    name: "run_automation_rule",
    title: "Run automation rule now",
    description:
      "Evaluate a rule immediately; returns newly blacklisted zones or whether the alert fired.",
    inputSchema: schema({ rule_id: str("Rule id.") }, ["rule_id"]),
    annotations: write,
    call: (a) => ({ method: "POST", path: `/api/automation/rules/${id(a, "rule_id")}/run` }),
  },
  {
    name: "delete_automation_rule",
    title: "Delete automation rule",
    description: "Delete an automation rule (blacklisted zones stay).",
    inputSchema: schema({ rule_id: str("Rule id.") }, ["rule_id"]),
    annotations: destroy,
    call: (a) => ({ method: "DELETE", path: `/api/automation/rules/${id(a, "rule_id")}` }),
  },
  {
    name: "list_zone_blacklist",
    title: "List blacklisted zones",
    description:
      "Blacklisted zones of a campaign. format=txt returns one zone per line, ready to paste into the traffic source (e.g. Adcash).",
    inputSchema: schema(
      {
        campaign_id: campaignId,
        dimension: str("Only this dimension (e.g. sub1)."),
        format: enumOf(["json", "txt", "csv"], "Output format (default json)."),
      },
      ["campaign_id"],
    ),
    annotations: read,
    call: (a) => ({
      method: "GET",
      path: "/api/automation/blacklist",
      query: {
        campaign_id: a.campaign_id as string,
        dimension: a.dimension as string | undefined,
        format: a.format === "json" ? undefined : (a.format as string | undefined),
      },
    }),
  },
  {
    name: "add_zones_to_blacklist",
    title: "Blacklist zones",
    description: "Manually blacklist zones of a campaign.",
    inputSchema: schema(
      {
        campaign_id: campaignId,
        dimension: str("Dimension (default sub1)."),
        values: { type: "array", items: { type: "string" }, description: "Zone values." },
      },
      ["campaign_id", "values"],
    ),
    annotations: write,
    call: (a) => ({
      method: "POST",
      path: "/api/automation/blacklist",
      body: pick(a, ["campaign_id", "dimension", "values"]),
    }),
  },
  {
    name: "remove_blacklisted_zone",
    title: "Remove blacklisted zone",
    description: "Remove one entry from the zone blacklist.",
    inputSchema: schema({ entry_id: str("Blacklist entry id (zbl_…).") }, ["entry_id"]),
    annotations: destroy,
    call: (a) => ({ method: "DELETE", path: `/api/automation/blacklist/${id(a, "entry_id")}` }),
  },
  {
    name: "list_tracking_domains",
    title: "List tracking domains",
    description: "Custom tracking hostnames of the account.",
    inputSchema: schema({}),
    annotations: read,
    call: () => ({ method: "GET", path: "/api/tracking-domains" }),
  },
  {
    name: "add_tracking_domain",
    title: "Add tracking domain",
    description:
      "Register a custom tracking hostname (track.example.com). It must also be added as a Custom Domain of the Worker in Cloudflare; it serves only /r, /c, /lp and /click.",
    inputSchema: schema({ hostname: str("Hostname, e.g. track.example.com.") }, ["hostname"]),
    annotations: write,
    call: (a) => ({ method: "POST", path: "/api/tracking-domains", body: pick(a, ["hostname"]) }),
  },
  {
    name: "delete_tracking_domain",
    title: "Delete tracking domain",
    description: "Remove a tracking domain; campaigns using it fall back to the app URL.",
    inputSchema: schema({ domain_id: str("Tracking domain id (dom_…).") }, ["domain_id"]),
    annotations: destroy,
    call: (a) => ({ method: "DELETE", path: `/api/tracking-domains/${id(a, "domain_id")}` }),
  },
  {
    name: "set_campaign_tracking_domain",
    title: "Set campaign tracking domain",
    description: "Use a tracking domain for a campaign's links (null = app URL).",
    inputSchema: schema(
      { campaign_id: campaignId, tracking_domain_id: nullableStr("Tracking domain id, or null.") },
      ["campaign_id"],
    ),
    annotations: write,
    call: (a) => ({
      method: "PUT",
      path: `/api/tracking-domains/campaigns/${id(a, "campaign_id")}`,
      body: { tracking_domain_id: a.tracking_domain_id ?? null },
    }),
  },

  // Notes
  {
    name: "list_notes",
    title: "List notes",
    description: "List notes on a campaign or entity.",
    inputSchema: schema(
      {
        entity_type: enumOf(
          ["program", "traffic_source", "network", "offer", "lander", "group"],
          "Entity type (program = campaign).",
        ),
        entity_id: str("Entity id."),
      },
      ["entity_type", "entity_id"],
    ),
    annotations: read,
    call: (a) => ({
      method: "GET",
      path: "/api/ops/notes",
      query: { entity_type: a.entity_type as string, entity_id: a.entity_id as string },
    }),
  },
  {
    name: "add_note",
    title: "Add note",
    description: "Attach a note to a campaign or entity (e.g. why a change was made).",
    inputSchema: schema(
      {
        entity_type: enumOf(
          ["program", "traffic_source", "network", "offer", "lander", "group"],
          "Entity type (program = campaign).",
        ),
        entity_id: str("Entity id."),
        body: str("Note text."),
      },
      ["entity_type", "entity_id", "body"],
    ),
    annotations: write,
    call: (a) => ({
      method: "POST",
      path: "/api/ops/notes",
      body: pick(a, ["entity_type", "entity_id", "body"]),
    }),
  },

  // Team
  {
    name: "list_team",
    title: "List team",
    description: "List team members and their roles.",
    inputSchema: schema({}),
    annotations: read,
    call: () => ({ method: "GET", path: "/api/ops/team" }),
  },
  {
    name: "invite_team_member",
    title: "Invite team member",
    description: "Invite someone by email as admin (can edit) or viewer (read only). Owners only.",
    inputSchema: schema(
      { email: str("Email to invite."), role: enumOf(["admin", "viewer"], "Role.") },
      ["email", "role"],
    ),
    annotations: write,
    call: (a) => ({ method: "POST", path: "/api/ops/team", body: pick(a, ["email", "role"]) }),
  },
  {
    name: "remove_team_member",
    title: "Remove team member",
    description: "Remove a team member or pending invite. Owners only.",
    inputSchema: schema({ member_id: str("Team member id.") }, ["member_id"]),
    annotations: destroy,
    call: (a) => ({ method: "DELETE", path: `/api/ops/team/${id(a, "member_id")}` }),
  },

  // Traffic source templates, tokens and cost (worker/mcp/tools-sources.ts)
  ...SOURCE_TOOLS,
];

export const TOOLS_BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]));
