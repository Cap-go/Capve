import { RULE_FIELDS } from "../lib/rules";
import { GROUP_DIMENSIONS, NON_ZONE_DIMENSIONS } from "../db/reports";
import { SOURCE_TOOLS } from "./tools-sources";
import { outputSchemaFor } from "./output-schemas";
import type { Schema } from "@cfworker/json-schema";

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

export type ToolDefinition = {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  annotations: { readOnlyHint: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean };
  call: (args: Args) => ApiCall;
};

export type McpTool = ToolDefinition & { outputSchema: Schema };

type Args = Record<string, unknown>;

const str = (description: string) => ({ type: "string", description });
const int = (description: string) => ({ type: "integer", description });
const bool = (description: string) => ({ type: "boolean", description });
const nullableStr = (description: string) => ({ anyOf: [{ type: "string" }, { type: "null" }], description });
const enumOf = (values: readonly string[], description: string) => ({
  type: "string",
  enum: values,
  description,
});

const campaignId = str("Campaign id (prg_…). Use list_campaigns to find it.");
const dateArg = (edge: string) =>
  str(
    `${edge} of the report window: ISO date (2026-01-31) or Unix milliseconds. Date-only bounds use the account timezone (get_settings); a date-only end includes that whole day.`,
  );

const reportFilters = {
  from: dateArg("Start"),
  to: dateArg("End"),
  group_id: str("Restrict the report to campaigns assigned to this group; use an id from list_groups."),
  traffic_source_id: str("Restrict the report to campaigns using this source; use an id from list_traffic_sources."),
  status: enumOf(["active", "paused", "archived"], "Filter by campaign lifecycle state. Omit to include active and paused campaigns and exclude archived ones."),
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
  name: str("Display label identifying this traffic path in the campaign rotation."),
  flow_type: enumOf(
    ["direct", "lander", "lander_offer", "offer"],
    "Visitor journey: direct uses direct_url; lander stops at a landing page; lander_offer sends its /lp click to an offer; offer redirects straight to an offer.",
  ),
  weight: { ...int("Relative share when choosing between paths; zero receives no traffic. Defaults to 100 on creation; omission preserves the weight on update."), minimum: 0 },
  sort_order: int("Priority for top_to_bottom selection; lower values are considered first."),
  direct_url: nullableStr("Destination for flow_type=direct (http/https)."),
  lander_id: nullableStr("Landing page to use; take its id from list_landers."),
  offer_id: nullableStr("Offer to send visitors to; take its id from list_offers."),
  enabled: bool("Whether the path receives traffic."),
  landers: {
    type: "array",
    description: "Weighted landers; replaces the list. Overrides lander_id.",
    maxItems: 50,
    items: {
      type: "object",
      properties: { lander_id: str("Landing page included in this path; take its id from list_landers."), weight: { ...int("Relative selection share among entries in this list; use a positive weight. Defaults to 100."), minimum: 0 } },
      required: ["lander_id"],
      additionalProperties: false,
    },
  },
  offers: {
    type: "array",
    description: "Weighted offers; replaces the list. Overrides offer_id.",
    maxItems: 50,
    items: {
      type: "object",
      properties: { offer_id: str("Offer included in this path; take its id from list_offers."), weight: { ...int("Relative selection share among entries in this list; use a positive weight. Defaults to 100."), minimum: 0 } },
      required: ["offer_id"],
      additionalProperties: false,
    },
  },
};

const ruleFields = {
  name: str("Display label identifying this rule in the campaign configuration."),
  conditions: {
    type: "array",
    maxItems: 20,
    description:
      "Conditions that must all match a click. Supplying this array replaces the previous conditions; an empty array matches every click.",
    items: {
      type: "object",
      properties: {
        field: enumOf(RULE_FIELDS, "Click attribute to test; sub-token fields contain values captured from the incoming tracking URL."),
        op: enumOf(["in", "not_in"], "Whether the click must match any supplied value (in) or none of them (not_in). Omission uses in."),
        values: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 500, description: "Alternatives for this condition. Use country/continent codes, numeric or AS-prefixed ASNs, datacenter/residential connections, yes/no bot flags, IPs or CIDRs, weekday names (mon..sun), or hours (9 or 9-17); other fields use their recorded text." },
      },
      required: ["field", "values"],
      additionalProperties: false,
    },
  },
  timezone: str("IANA timezone for weekday/hour conditions (default UTC)."),
  sort_order: int("Rule priority, lower first. Omit on creation to append after existing rules; omit on update to keep its order."),
  enabled: bool("Whether the rule is evaluated."),
};

const postbackOwner = {
  campaign_id: str("Campaign whose records or configuration to use; take its id from list_campaigns."),
  traffic_source_id: str("Traffic source whose configuration or postbacks to use; take its id from list_traffic_sources."),
  network_id: str("Network grouping the offers or postbacks; take its id from list_networks."),
};
const postbackEvent = nullableStr(
  "Conversion event this postback fires for (registration, ftd, deposit, ...); null = every conversion.",
);

const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "get_stripe_setup_status", title: "Platform Stripe setup status",
    description: "Platform admins only. Read deployed billing configuration and live Stripe account, Price, portal, webhook, and tax checks. Never returns credentials or changes settings.",
    inputSchema: schema({}), annotations: read,
    call: () => ({ method: "GET", path: "/api/admin/stripe" }),
  },
  {
    name: "get_billing_status", title: "Get billing status",
    description: "Read this account's plan, trial end, monthly click usage and reporting lock. Checkout and portal require the owner in the browser.",
    inputSchema: schema({}), annotations: read,
    call: () => ({ method: "GET", path: "/api/billing" }),
  },
  {
    name: "whoami",
    title: "Current user",
    description: "Identify the authenticated user and account before making changes. Returns user id, email, role (owner/admin/viewer), account_id and verification status. API tokens act on their personal account.",
    inputSchema: schema({}),
    annotations: read,
    call: () => ({ method: "GET", path: "/api/auth/me" }),
  },

  // Campaigns
  {
    name: "list_campaigns",
    title: "List campaigns",
    description: "List this account’s active and paused campaigns in programs, with names, tracking keys, default destinations, status, group/source assignments and tags. Archived campaigns are excluded.",
    inputSchema: schema({}),
    annotations: read,
    call: () => ({ method: "GET", path: "/api/programs" }),
  },
  {
    name: "get_campaign",
    title: "Get campaign",
    description: "Read one campaign using campaign_id from list_campaigns. Returns program with its name, destination, source, group and active/paused/archived status; no conversion secret.",
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
        name: str("Display name used to identify the campaign in the dashboard and reports."),
        destination_url: str("Optional default destination (http/https). Omit to route only through paths."),
        traffic_source_id: str("Source supplying this campaign’s traffic; take its id from list_traffic_sources. Omit to leave the campaign unassigned."),
        group_id: str("Group used to organize this campaign; take its id from list_groups. Omit to leave it ungrouped."),
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
        name: str("Replacement display name shown in the dashboard and reports."),
        destination_url: nullableStr("New default destination (http/https); null to clear."),
        traffic_source_id: nullableStr("Source supplying traffic; take its id from list_traffic_sources, or use null to remove the assignment."),
        group_id: nullableStr("Group used to organize campaigns; take its id from list_groups, or use null to remove the assignment."),
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
    description: "Apply the supplied status, group, traffic source or replacement tag text to selected campaigns in this account. Omitted fields stay unchanged; pausing or archiving stops their tracking redirects. Returns the number of campaigns updated.",
    inputSchema: schema(
      {
        campaign_ids: { type: "array", items: { type: "string", minLength: 1 }, minItems: 1, description: "Campaign ids from list_campaigns." },
        status: enumOf(["active", "paused", "archived"], "Lifecycle state to apply: pausing or archiving stops tracking redirects; active resumes them."),
        group_id: nullableStr("Group used to organize campaigns; take its id from list_groups, or use null to remove the assignment."),
        traffic_source_id: nullableStr("Source supplying traffic; take its id from list_traffic_sources, or use null to remove the assignment."),
        tags: nullableStr("Replacement tag text for each selected campaign, conventionally comma-separated; null clears it. This replaces the whole stored string."),
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
    inputSchema: schema({ campaign_id: campaignId, name: str("Display name for the copied campaign; omission uses the original name followed by (copy).") }, [
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
    description: "Recent clicks for a campaign, newest first: click id, affiliate name/code, IP, user agent, timestamp and whether converted. Use report_grouped for geo, device, sub-token and bot breakdowns.",
    inputSchema: schema(
      {
        campaign_id: campaignId,
        limit: { ...int("Number of log entries to return for this page; defaults to 50."), minimum: 1, maximum: 200 },
        offset: { ...int("Number of earlier log entries to skip when paging through the newest-first results."), minimum: 0 },
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
    description: "Read a campaign’s conversion log, newest first, with event, approval status, payout and currency, order/click references, affiliate identity and timestamps. Use the date window and pagination to inspect individual conversions.",
    inputSchema: schema(
      {
        campaign_id: campaignId,
        limit: { ...int("Number of log entries to return for this page; defaults to 50."), minimum: 1, maximum: 200 },
        offset: { ...int("Number of earlier log entries to skip when paging through the newest-first results."), minimum: 0 },
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
    inputSchema: schema({ campaign_id: campaignId, name: str("Display label for the partner or traffic placement represented by this affiliate tracking code.") }, [
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
      "Change how this campaign selects traffic paths. Supplied fields replace the current mode or fixed-path selection; omitted fields stay unchanged. For fix_on, select a path belonging to this campaign. Returns the updated rotation, default paths and routing rules.",
    inputSchema: schema(
      {
        campaign_id: campaignId,
        mode: enumOf(["normal", "smart", "fix_on", "top_to_bottom"], "How paths are selected: normal uses weights, smart keeps a visitor on their assigned path, fix_on uses fixed_path_id, and top_to_bottom takes the first enabled path."),
        fixed_path_id: nullableStr("Path selected by fix_on, from get_rotation paths or a rule’s paths in this campaign; null clears the selection."),
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
      { campaign_id: campaignId, path_id: str("Path to change or remove; take its id from get_rotation or list_rules for this campaign."), ...pathFields },
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
    description: "Permanently remove a traffic path and its weighted lander/offer assignments from this campaign. Future routing can no longer select it; the reusable lander and offer records remain.",
    inputSchema: schema({ campaign_id: campaignId, path_id: str("Path to change or remove; take its id from get_rotation or list_rules for this campaign.") }, [
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
    description: "Read a campaign’s routing rules in evaluation order, including matching conditions, timezone, enabled state and each rule’s traffic paths. Lower sort_order is evaluated first.",
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
    description: "Update a campaign’s routing rule. Supplied conditions replace the whole condition list; other omitted fields stay unchanged. Changes affect which future clicks select the rule’s paths. Returns the updated rule.",
    inputSchema: schema(
      { campaign_id: campaignId, rule_id: str("Routing rule to change or remove; take its id from list_rules for this campaign."), ...ruleFields },
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
    description: "Permanently delete a routing rule and all of its paths and weighted assignments. Fixed-path references to those paths are cleared; future clicks use the remaining rules or default paths.",
    inputSchema: schema({ campaign_id: campaignId, rule_id: str("Routing rule to change or remove; take its id from list_rules for this campaign.") }, [
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
    title: "Get campaign bot handling",
    description: "Read the campaign’s bot handling configuration: bot_action, safe_page_url and whether cloud/hosting ASNs are flagged. These settings determine how bot, blocklisted and optionally datacenter traffic is routed.",
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
        bot_action: enumOf(["route", "safe_page"], "Whether flagged clicks follow normal routing (route) or redirect to safe_page_url (safe_page)."),
        safe_page_url: nullableStr("HTTP(S) destination for flagged clicks. Omit to keep it; null or an empty string clears it. A URL must remain set when bot_action is safe_page."),
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
    description: "Read account-wide traffic matching entries, including their ids, IP/CIDR or ASN values or user-agent substrings, plus the built-in datacenter ASN list. Matches are flagged as bots; campaign bot handling determines their destination.",
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
        kind: enumOf(["ip", "asn", "ua"], "How values identify traffic: IP address/CIDR, autonomous system number, or a user-agent substring."),
        values: { type: "array", items: { type: "string", minLength: 1 }, minItems: 1, maxItems: 200, description: "IP addresses/CIDRs, ASN numbers, or user-agent substrings to flag, according to kind." },
      },
      ["kind", "values"],
    ),
    annotations: write,
    call: (a) => ({ method: "POST", path: "/api/antifraud/blocklist", body: pick(a, ["kind", "values"]) }),
  },
  {
    name: "remove_from_blocklist",
    title: "Remove from blocklist",
    description: "Permanently remove one account-wide bot-matching entry. Future clicks stop matching that entry, but may still be flagged by another entry or bot-detection rule.",
    inputSchema: schema({ entry_id: str("Account-wide blocklist entry to remove; take entries[].id from list_blocklist.") }, ["entry_id"]),
    annotations: destroy,
    call: (a) => ({ method: "DELETE", path: `/api/antifraud/blocklist/${id(a, "entry_id")}` }),
  },

  // Entities
  ...(
    [
      ["groups", "groups", "campaign groups", "Read this account’s campaign organization groups, with ids and display names to use when assigning campaigns or filtering reports."],
      ["traffic_sources", "traffic-sources", "traffic sources (cost model, postback share)", "Read this account’s traffic-source records, including ids, display names, cost models, fallback costs and the share of conversions sent to their postbacks."],
      ["networks", "networks", "affiliate networks", "Read the affiliate-network records in this account, with ids and display names used to group offers and network postbacks."],
      ["landers", "landers", "landing pages", "Read the reusable landing pages in this account, including ids, display names and destination URLs to use in campaign paths."],
      ["offers", "offers", "offers (URL, payout, network)", "Read the reusable offers in this account, including ids, display names, destination URLs, network assignments and base payouts in cents."],
    ] as const
  ).map(
    ([name, route, label, description]): ToolDefinition => ({
      name: `list_${name}`,
      title: `List ${label.split(" (")[0]}`,
      description,
      inputSchema: schema({}),
      annotations: read,
      call: () => ({ method: "GET", path: `/api/entities/${route}` }),
    }),
  ),
  {
    name: "create_group",
    title: "Create group",
    description: "Create a named group for organizing campaigns. Returns group with its id; pass that id as group_id to create_campaign or update_campaign.",
    inputSchema: schema({ name: str("Display label used to organize and filter campaigns in reports.") }, ["name"]),
    annotations: write,
    call: (a) => ({ method: "POST", path: "/api/entities/groups", body: pick(a, ["name"]) }),
  },
  {
    name: "delete_group",
    title: "Delete group",
    description: "Delete a campaign group. Campaigns in it are kept.",
    inputSchema: schema({ group_id: str("Campaign group to remove; take its id from list_groups.") }, ["group_id"]),
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
        cost_type: enumOf(["cpc", "cpm", "cpa"], "How traffic is charged: CPC per click, CPM per thousand clicks, or CPA once per converted click."),
        default_cost_cents: { ...int("Fallback charge in cents: per click for CPC, per thousand clicks for CPM, or once per converted click for CPA."), minimum: 0 },
        postback_percent: { ...int("Percentage of approved conversions to send to this source’s outgoing postbacks."), minimum: 0, maximum: 100 },
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
    description: "Create a named affiliate-network record in this account for grouping offers and outgoing postbacks. Returns the network record; add its postbacks separately with create_postback.",
    inputSchema: schema({ name: str("Display label for the affiliate network that groups offers and outgoing postbacks in this account.") }, ["name"]),
    annotations: write,
    call: (a) => ({ method: "POST", path: "/api/entities/networks", body: pick(a, ["name"]) }),
  },
  {
    name: "create_lander",
    title: "Create lander",
    description: "Create a landing page. Link its CTA to {lp_click_url} to track LP clicks.",
    inputSchema: schema({ name: str("Display label for this reusable landing page in paths and reports."), url: str("HTTP(S) landing-page destination that receives visitors assigned to this lander.") }, [
      "name",
      "url",
    ]),
    annotations: write,
    call: (a) => ({ method: "POST", path: "/api/entities/landers", body: pick(a, ["name", "url"]) }),
  },
  {
    name: "create_offer",
    title: "Create offer",
    description: "Create a reusable offer destination in this account, with a display name, optional network assignment and base payout. Returns the offer record for use in campaign paths. URL macros such as {clickid}, {sub1} and {country} are expanded when routing visitors.",
    inputSchema: schema(
      {
        name: str("Display label identifying this conversion offer in paths and reports."),
        url: str("HTTP(S) offer destination; tracking macros such as {clickid} are expanded when routing visitors."),
        network_id: nullableStr("Network grouping the offers or postbacks; take its id from list_networks."),
        payout_cents: { ...int("Base conversion payout in cents used when the incoming postback omits its amount; event-specific postbacks have separate payout handling."), minimum: 0 },
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
      ["traffic_source", "traffic-sources", "traffic source", "Source to change or remove; take its id from list_traffic_sources.", "Fails with 409 while campaigns use it. Its postbacks are deleted."],
      ["network", "networks", "affiliate network", "Network to change or remove; take its id from list_networks.", "Fails with 409 while offers use it. Its postbacks are deleted."],
      ["lander", "landers", "lander", "Landing page to remove; take its id from list_landers.", "Fails with 409 while paths use it or it has tracked clicks."],
      ["offer", "offers", "offer", "Offer to remove; take its id from list_offers.", "Fails with 409 while paths use it or it has tracked clicks."],
    ] as const
  ).map(
    ([name, route, label, idHelp, note]): ToolDefinition => ({
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
        traffic_source_id: str("Source to change or remove; take its id from list_traffic_sources."),
        name: str("Replacement display name shown in the dashboard and reports."),
        cost_type: enumOf(["cpc", "cpm", "cpa"], "How traffic is charged: CPC per click, CPM per thousand clicks, or CPA once per converted click."),
        default_cost_cents: { ...int("Fallback charge in cents according to the source cost model: per click (CPC), per thousand clicks (CPM), or once per converted click (CPA)."), minimum: 0 },
        postback_percent: { ...int("Percentage of approved conversions to send to this source’s outgoing postbacks."), minimum: 0, maximum: 100 },
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
    description: "Replace the display name of an existing affiliate-network record in this account; its offers and postbacks remain assigned. Omit name to leave it unchanged. Returns the network record.",
    inputSchema: schema({ network_id: str("Network to change or remove; take its id from list_networks."), name: str("Replacement display name shown in the dashboard and reports.") }, [
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
      { lander_id: str("Landing page to update; take its id from list_landers."), name: str("Replacement display name shown in the dashboard and reports."), url: str("Replacement HTTP(S) landing-page destination for visitors using this lander.") },
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
        offer_id: str("Offer to update; take its id from list_offers."),
        name: str("Replacement display name shown in the dashboard and reports."),
        url: str("Replacement HTTP(S) offer destination; tracking macros are expanded when routing visitors."),
        network_id: nullableStr("Affiliate network id; null to clear."),
        payout_cents: { ...int("Base conversion payout in cents used when the incoming postback omits its amount; event-specific postbacks have separate payout handling."), minimum: 0 },
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
      "Read outgoing conversion-notification configurations, optionally filtered by campaign, traffic source or network. Each record includes its id, owner assignment, destination URL and event filter; null event means all conversion events.",
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
      { postback_id: str("Outgoing postback to inspect, change or remove; take its id from list_postbacks."), event: postbackEvent, url: str("Replacement HTTP(S) destination for outgoing conversion notifications; supports the macros documented by create_postback.") },
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
    description: "Permanently remove an outgoing postback configuration so it is no longer selected for future conversions. Already sent notifications are not undone.",
    inputSchema: schema({ postback_id: str("Outgoing postback to inspect, change or remove; take its id from list_postbacks.") }, ["postback_id"]),
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
      "Generate a new incoming postback key and return postback_key with the new key, enforcement flag and URL template. The old key stops working immediately; update every network postback URL.",
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
      { postback_id: str("Outgoing postback to inspect, change or remove; take its id from list_postbacks."), limit: { ...int("Number of recent delivery attempts to return; defaults to 20."), minimum: 1, maximum: 100 } },
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
        by: enumOf(GROUP_DIMENSIONS, "Attribute used to aggregate clicks and conversions into report rows."),
        campaign_id: str("Restrict results to this campaign; take its id from list_campaigns."),
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
    description: "Read this account’s tracking-event webhooks, with ids, names, campaign scope, event, destination URL and enabled state. A null program_id means the trigger applies across campaigns.",
    inputSchema: schema({ campaign_id: str("Campaign whose applicable triggers to list, using its id from list_campaigns; also includes account-wide triggers. Omit for all account triggers.") }),
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
    description: "Register a best-effort HTTP GET webhook for click or conversion events in this account, optionally scoped to one campaign. When enabled, matching events invoke action_url with supported payload macros substituted. Returns the stored trigger configuration.",
    inputSchema: schema(
      {
        name: str("Display label identifying this event webhook in the account configuration."),
        event: enumOf(["conversion", "click"], "Tracking event that initiates the webhook: recording a click or receiving a conversion."),
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
    description: "Permanently remove an event webhook so future tracking events no longer invoke it. Previously sent webhook requests are not undone.",
    inputSchema: schema({ trigger_id: str("Event webhook to remove; take its id from list_triggers.") }, ["trigger_id"]),
    annotations: destroy,
    call: (a) => ({ method: "DELETE", path: `/api/ops/triggers/${id(a, "trigger_id")}` }),
  },

  // Drilldown, timezone, zone automation, tracking domains
  {
    name: "report_drilldown",
    title: "Drilldown report",
    description:
      "Aggregate campaign performance into a nested tree in the requested dimension order (for example campaign,sub1,country,offer). Returns by, the account timezone and rows with grouping keys/labels, metrics, currency, per-event results and children for the next level. Money is in cents; revenue_by_currency keeps currencies separate.",
    inputSchema: schema(
      {
        by: str(`Comma-separated grouping hierarchy, outermost first (e.g. campaign,sub1,country); 1 to 4 dimensions from: ${GROUP_DIMENSIONS.join(", ")}.`),
        campaign_id: str("Restrict results to this campaign; take its id from list_campaigns."),
        limit: { ...int("Maximum rows returned at each level of the report tree; defaults to 50."), minimum: 1, maximum: 200 },
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
    description: "Read the account report timezone (IANA name) before choosing date-only report bounds. Returns settings.timezone; changing it uses update_settings.",
    inputSchema: schema({}),
    annotations: read,
    call: () => ({ method: "GET", path: "/api/settings" }),
  },
  {
    name: "update_settings",
    title: "Set report timezone",
    description:
      "Set the report timezone (IANA name, e.g. Europe/Paris). Date grouping and YYYY-MM-DD report ranges use it.",
    inputSchema: schema({ timezone: str("Timezone used for report date grouping and date-only bounds, expressed as an IANA name such as Europe/Paris.") }, ["timezone"]),
    annotations: write,
    call: (a) => ({ method: "PUT", path: "/api/settings", body: pick(a, ["timezone"]) }),
  },
  {
    name: "list_automation_rules",
    title: "List automation rules",
    description: "Zone blacklist rules and ROI/spend alerts, optionally for one campaign.",
    inputSchema: schema({ campaign_id: str("Filter automation rules by campaign; take its id from list_campaigns. Omit for all account rules.") }),
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
        kind: enumOf(["zone_blacklist", "alert"], "Whether to record unconverted zones in the blacklist or send a notification when campaign ROI/spend thresholds are met."),
        name: str("Display label used in the rule list and notification messages."),
        dimension: enumOf(
          GROUP_DIMENSIONS.filter((d) => !NON_ZONE_DIMENSIONS.has(d)),
          "Click field containing the traffic source’s zone identifier for a blacklist rule; defaults to sub1.",
        ),
        min_clicks: int("Minimum clicks for one zone in the evaluation window before zero conversions can trigger blacklisting."),
        event: nullableStr(
          "zone_blacklist: event that counts (registration, ftd…); omit = any conversion.",
        ),
        roi_below: { type: "number", description: "alert: fire when ROI % is below this." },
        spend_above_cents: int("alert: fire when cost in cents is above this."),
        window_hours: { ...int("Hours of recent campaign data to evaluate; defaults to 24. Also sets the cooldown between repeated alert notifications."), minimum: 1, maximum: 720 },
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
    description: "Change whether an existing automation rule participates in scheduled evaluations. Disabling keeps the rule and its existing blacklist entries; manual runs remain available. Returns the updated rule.",
    inputSchema: schema({ rule_id: str("Automation rule to operate on; take its id from list_automation_rules."), enabled: bool("Whether scheduled evaluations may run this rule; disabling it keeps the rule and existing blacklist entries.") }, [
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
      "Evaluate a rule immediately; may blacklist zones and send configured email/webhook notifications. Returns newly blacklisted zones, whether the rule fired, and notification attempt flags; the email flag does not prove delivery.",
    inputSchema: schema({ rule_id: str("Automation rule to operate on; take its id from list_automation_rules.") }, ["rule_id"]),
    annotations: write,
    call: (a) => ({ method: "POST", path: `/api/automation/rules/${id(a, "rule_id")}/run` }),
  },
  {
    name: "delete_automation_rule",
    title: "Delete automation rule",
    description: "Permanently remove an automation rule, stopping future evaluations and notifications for it. Existing blacklisted zones remain and must be removed separately if desired.",
    inputSchema: schema({ rule_id: str("Automation rule to operate on; take its id from list_automation_rules.") }, ["rule_id"]),
    annotations: destroy,
    call: (a) => ({ method: "DELETE", path: `/api/automation/rules/${id(a, "rule_id")}` }),
  },
  {
    name: "list_zone_blacklist",
    title: "List blacklisted zones",
    description:
      "Read recorded blacklist entries for a campaign, optionally by zone dimension. JSON returns structuredContent.blacklist with entry ids and reasons. Text and CSV exports return a string in structuredContent.result; txt contains one zone per line for copying into the traffic source.",
    inputSchema: schema(
      {
        campaign_id: campaignId,
        dimension: str("Filter by the click field containing zone identifiers, such as sub1; omit to include entries from all dimensions."),
        format: enumOf(["json", "txt", "csv"], "Select JSON entries in structuredContent.blacklist or a text/CSV export in structuredContent.result. Omission returns JSON."),
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
    description: "Record manually selected traffic-source zone values in this campaign’s blacklist for the chosen click dimension. Returns newly added values, excluding duplicates. Export the blacklist to apply it at the traffic source.",
    inputSchema: schema(
      {
        campaign_id: campaignId,
        dimension: str("Click field containing the zone identifiers being recorded; defaults to sub1."),
        values: { type: "array", items: { type: "string", minLength: 1 }, minItems: 1, maxItems: 500, description: "Traffic-source zone identifiers as captured in the selected click dimension; existing entries are not added again." },
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
    description: "Permanently remove one stored campaign blacklist entry. This does not update the traffic source’s own blacklist; an enabled automation rule can add the value again if it still matches.",
    inputSchema: schema({ entry_id: str("Entry to remove; use blacklist[].id from list_zone_blacklist with JSON output, not the zone value.") }, ["entry_id"]),
    annotations: destroy,
    call: (a) => ({ method: "DELETE", path: `/api/automation/blacklist/${id(a, "entry_id")}` }),
  },
  {
    name: "list_tracking_domains",
    title: "List tracking domains",
    description:
      "Custom tracking hostnames of the account with their setup status (pending, active, failed, or manual when the install sets domains up by hand) and the DNS records still needed. Listing re-checks pending domains with Cloudflare.",
    inputSchema: schema({}),
    annotations: read,
    call: () => ({ method: "GET", path: "/api/tracking-domains" }),
  },
  {
    name: "add_tracking_domain",
    title: "Add tracking domain",
    description:
      "Register a custom tracking hostname (track.example.com); it serves only /r, /c, /lp and /click. With automatic setup (capve.app), the response lists the CNAME record to add and HTTPS is issued once it is live. Without it, add the hostname as a Custom Domain of the Worker in Cloudflare.",
    inputSchema: schema({ hostname: str("Hostname, e.g. track.example.com.") }, ["hostname"]),
    annotations: write,
    call: (a) => ({ method: "POST", path: "/api/tracking-domains", body: pick(a, ["hostname"]) }),
  },
  {
    name: "delete_tracking_domain",
    title: "Delete tracking domain",
    description: "Remove a registered tracking hostname and its managed Cloudflare custom hostname when automatic setup is configured. Campaigns using it fall back to the app URL. Existing links using the removed hostname may stop working.",
    inputSchema: schema({ domain_id: str("Registered tracking hostname to remove; take tracking_domains[].id from list_tracking_domains.") }, ["domain_id"]),
    annotations: destroy,
    call: (a) => ({ method: "DELETE", path: `/api/tracking-domains/${id(a, "domain_id")}` }),
  },
  {
    name: "set_campaign_tracking_domain",
    title: "Set campaign tracking domain",
    description: "Use a tracking domain for a campaign's links (null = app URL).",
    inputSchema: schema(
      { campaign_id: campaignId, tracking_domain_id: nullableStr("Registered hostname to use, from list_tracking_domains; omit or pass null to use the app URL.") },
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
    description: "Read the notes attached to one campaign or reusable entity in this account, newest updated first. Returns note ids, text, record references and creation/update timestamps.",
    inputSchema: schema(
      {
        entity_type: enumOf(
          ["program", "traffic_source", "network", "offer", "lander", "group"],
          "Kind of record the note belongs to; program refers to a campaign. Pair with that record’s entity_id.",
        ),
        entity_id: str("Record receiving the note, from the matching list tool: list_campaigns for program, or list_traffic_sources, list_networks, list_landers, list_offers, or list_groups."),
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
          "Kind of record the note belongs to; program refers to a campaign. Pair with that record’s entity_id.",
        ),
        entity_id: str("Record receiving the note, from the matching list tool: list_campaigns for program, or list_traffic_sources, list_networks, list_landers, list_offers, or list_groups."),
        body: str("Text recording context or a decision about the selected record."),
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
    description: "Read teammate memberships and pending invitations, plus the caller’s role and owner account id. The owner is represented by account_id, not a membership row.",
    inputSchema: schema({}),
    annotations: read,
    call: () => ({ method: "GET", path: "/api/ops/team" }),
  },
  {
    name: "list_activity",
    title: "List activity",
    description:
      "Read recent account audit entries, with actor email, action text and timestamp for changes such as campaign edits, settings, team membership and support access. Click traffic is not included.",
    inputSchema: schema({}),
    annotations: read,
    call: () => ({ method: "GET", path: "/api/ops/audit" }),
  },
  {
    name: "invite_team_member",
    title: "Invite team member",
    description: "Invite someone by email as admin (can edit) or viewer (read only). Owners only.",
    inputSchema: schema(
      { email: str("Email to invite."), role: enumOf(["admin", "viewer"], "Access granted to the invitee: admin can edit account data; viewer can read it.") },
      ["email", "role"],
    ),
    annotations: write,
    call: (a) => ({ method: "POST", path: "/api/ops/team", body: pick(a, ["email", "role"]) }),
  },
  {
    name: "remove_team_member",
    title: "Remove team member",
    description: "Remove a team member or pending invite. Owners only.",
    inputSchema: schema({ member_id: str("Membership or pending invitation to remove; use members[].id from list_team, not a user id.") }, ["member_id"]),
    annotations: destroy,
    call: (a) => ({ method: "DELETE", path: `/api/ops/team/${id(a, "member_id")}` }),
  },

  // Traffic source templates, tokens and cost (worker/mcp/tools-sources.ts)
  ...SOURCE_TOOLS,
  {
    name: "get_bidding_settings", title: "Get bidding beta settings",
    description: "Read campaign opt-in, decision limits and Workers AI availability. Beta is off by default.",
    inputSchema: schema({ campaign_id: str("Campaign whose bidding recommendations to configure or inspect; take its id from list_campaigns.") }, ["campaign_id"]), annotations: read,
    call: (a) => ({ method: "GET", path: `/api/bidding/${id(a, "campaign_id")}/settings` }),
  },
  {
    name: "set_bidding_settings", title: "Set bidding recommendation settings",
    description: "Explicitly opt a campaign into or out of AI bidding recommendations. Replaces settings; omitted limits use defaults. Does not change Adcash bids.",
    inputSchema: schema({ campaign_id: str("Campaign whose bidding recommendations to configure or inspect; take its id from list_campaigns."), enabled: bool("Explicit campaign opt-in."),
      dimension: enumOf(Array.from({length: 10}, (_, i) => `sub${i+1}`), "Click sub-token containing the Adcash zone identifier; match the traffic source’s token mapping."),
      currency: enumOf(["USD", "EUR"], "Currency of the recorded spend; analysis compares it with revenue in the same currency and does not convert currencies."),
      window_hours: int("Length in hours of the click window analyzed, ending before the conversion-lag interval."), conversion_lag_hours: int("Hours of recent clicks excluded from analysis so their conversions have time to arrive."),
      min_clicks: int("Minimum clicks for a zone before a bid change can be recommended."), min_spend_cents: int("Minimum recorded spend in cents for a zone before a bid change can be recommended."),
      min_conversions: int("Minimum distinct converted clicks for a zone before recommending a bid increase."), target_roi: int("Target profit divided by cost, expressed as a percentage; recommendations hold within ten percentage points of this target."),
      max_change_pct: int("Maximum magnitude of a recommended bid change, as a percentage of the existing bid.") }, ["campaign_id", "enabled"]), annotations: destroy,
    call: (a) => ({ method: "PUT", path: `/api/bidding/${id(a, "campaign_id")}/settings`,
      body: pick(a, ["enabled", "dimension", "currency", "window_hours", "conversion_lag_hours", "min_clicks", "min_spend_cents", "min_conversions", "target_roi", "max_change_pct"]) }),
  },
  {
    name: "analyze_bidding", title: "Analyze zone bidding (beta)",
    description: "Run Workers AI on aggregate mature zone metrics after opt-in; at most once per 15 minutes. Stores review-only recommendations; never changes external bids.",
    inputSchema: schema({ campaign_id: str("Campaign whose bidding recommendations to configure or inspect; take its id from list_campaigns.") }, ["campaign_id"]), annotations: write,
    call: (a) => ({ method: "POST", path: `/api/bidding/${id(a, "campaign_id")}/analyze` }),
  },
  {
    name: "get_bid_recommendations", title: "Get bid recommendations",
    description: "Latest beta recommendations for current settings, including evidence, reasons, model and click window. Returns null after settings change.",
    inputSchema: schema({ campaign_id: str("Campaign whose bidding recommendations to configure or inspect; take its id from list_campaigns.") }, ["campaign_id"]), annotations: read,
    call: (a) => ({ method: "GET", path: `/api/bidding/${id(a, "campaign_id")}/recommendations` }),
  },
];

// Annotations describe effects, including network calls and replacement of existing data.
const EXTERNAL_TOOLS = new Set([
  "get_stripe_setup_status", "list_tracking_domains", "add_tracking_domain", "delete_tracking_domain",
  "sync_traffic_source_cost", "run_automation_rule",
]);
const OVERWRITE_TOOLS = new Set([
  "bulk_update_campaigns", "run_automation_rule", "invite_team_member",
]);
export const TOOLS: McpTool[] = TOOL_DEFINITIONS.map((tool) => {
  const readOnlyHint = tool.annotations.readOnlyHint && tool.name !== "list_tracking_domains";
  const destructiveHint = !readOnlyHint && (tool.annotations.destructiveHint === true ||
    tool.name.startsWith("update_") || tool.name.startsWith("set_") || OVERWRITE_TOOLS.has(tool.name));
  return {
    ...tool,
    outputSchema: outputSchemaFor(tool.name),
    annotations: {
      readOnlyHint,
      destructiveHint,
      idempotentHint: readOnlyHint || (tool.annotations.idempotentHint ?? false),
      openWorldHint: EXTERNAL_TOOLS.has(tool.name),
    },
  };
});

export const TOOLS_BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]));
