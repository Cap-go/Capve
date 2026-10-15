import { GROUP_DIMENSIONS } from "../db/reports";

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
  str(`${edge} of the report window: ISO date (2026-01-31) or Unix milliseconds.`);

const reportFilters = {
  from: dateArg("Start"),
  to: dateArg("End"),
  group_id: str("Only campaigns in this group."),
  traffic_source_id: str("Only campaigns from this traffic source."),
  status: enumOf(["active", "paused", "archived"], "Only campaigns with this status."),
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

/** Accepts ISO dates or Unix ms; the API expects Unix ms. */
function toMs(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "number") return String(value);
  const text = String(value).trim();
  if (/^\d+$/.test(text)) return text;
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

const pathFields = {
  name: str("Path name."),
  flow_type: enumOf(
    ["direct", "lander", "lander_offer", "offer"],
    "direct = direct_url; lander = lander only; lander_offer = lander then offer via /lp; offer = offer only.",
  ),
  weight: int("Rotation weight (default 100)."),
  sort_order: int("Order for top_to_bottom rotation."),
  direct_url: nullableStr("Destination for flow_type=direct (http/https)."),
  lander_id: nullableStr("Lander id (lp_…)."),
  offer_id: nullableStr("Offer id (off_…)."),
  enabled: bool("Whether the path receives traffic."),
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
      "All-time clicks, conversions, revenue and per-event counts (registration, ftd, ...) for one campaign, per affiliate.",
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
    description: "Add a traffic path (direct URL, lander, offer, or lander then offer) to a campaign.",
    inputSchema: schema({ campaign_id: campaignId, ...pathFields }, [
      "campaign_id",
      "name",
      "flow_type",
    ]),
    annotations: write,
    call: (a) => ({
      method: "POST",
      path: `/api/programs/${id(a, "campaign_id")}/paths`,
      body: pick(a, Object.keys(pathFields)),
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

  // Reports
  {
    name: "report_campaigns",
    title: "Campaign report",
    description:
      "Metrics per campaign: clicks, LP clicks, conversions, CR, revenue, cost, profit, ROI, EPC, CPC, plus per-event counts (events). Money in cents.",
    inputSchema: schema(reportFilters),
    annotations: read,
    call: (a) => ({ method: "GET", path: "/api/reports/campaigns", query: filters(a) }),
  },
  {
    name: "report_grouped",
    title: "Grouped report",
    description:
      "Metrics grouped by one dimension (country, os, offer, sub1, date…), across all campaigns or one, with per-event counts (events). Money in cents.",
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
    description: "Daily clicks, conversions, revenue and per-event counts for one campaign.",
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
];

export const TOOLS_BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]));
