import { TOKEN_SLOTS } from "../lib/source-templates";
import { ToolInputError, type McpTool } from "./tools";

// Kept in its own file so traffic-source / cost tools merge cleanly with tools.ts.
// ToolInputError is only used lazily inside `call`, so the circular import is safe.

type Args = Record<string, unknown>;

const str = (description: string) => ({ type: "string", description });
const int = (description: string) => ({ type: "integer", description });
const nullableStr = (description: string) => ({ type: ["string", "null"], description });

function schema(properties: Record<string, unknown>, required: string[] = []) {
  return { type: "object" as const, properties, required, additionalProperties: false };
}

function id(args: Args, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || !value.trim()) throw new ToolInputError(`${key} is required`);
  return encodeURIComponent(value.trim());
}

function pick(args: Args, keys: string[]) {
  return Object.fromEntries(keys.filter((key) => args[key] !== undefined).map((k) => [k, args[k]]));
}

const read = { readOnlyHint: true };
const write = { readOnlyHint: false, destructiveHint: false };
const overwrite = { readOnlyHint: false, destructiveHint: true, idempotentHint: true };

const tokenSchema = {
  type: "array",
  description:
    "Named tokens: each maps a query param of the source's traffic to a click slot and shows `name` in reports.",
  items: {
    type: "object",
    properties: {
      param: str("Query parameter on the campaign URL, e.g. zoneid."),
      name: str("Label shown in reports, e.g. Zone."),
      slot: { type: "string", enum: TOKEN_SLOTS, description: "Where the value is stored." },
      macro: str("The source's placeholder, e.g. [zone] or ${SUBID}."),
      kind: {
        type: "string",
        enum: ["campaign", "zone"],
        description: "Marks the source campaign id / zone id token for the cost API sync.",
      },
    },
    required: ["param", "slot"],
    additionalProperties: false,
  },
};

export const SOURCE_TOOLS: McpTool[] = [
  {
    name: "list_source_templates",
    title: "List traffic source and network templates",
    description:
      "Built-in traffic source presets (Adcash, PropellerAds, RichAds, Zeropark, TrafficStars, Facebook, Google Ads, TikTok) with tokens, macros and outgoing postback, plus affiliate network postback presets.",
    inputSchema: schema({}),
    annotations: read,
    call: () => ({ method: "GET", path: "/api/sources/templates" }),
  },
  {
    name: "create_traffic_source_from_template",
    title: "Create traffic source from template",
    description:
      "Create a traffic source with the template's cost model, named tokens and outgoing postback. Edit placeholders like YOUR_KEY afterwards with update_postback.",
    inputSchema: schema(
      {
        template_id: str("Template id from list_source_templates (e.g. adcash)."),
        name: str("Name (defaults to the template name)."),
        default_cost_cents: int("Default cost in cents."),
      },
      ["template_id"],
    ),
    annotations: write,
    call: (a) => ({
      method: "POST",
      path: "/api/sources/from-template",
      body: pick(a, ["template_id", "name", "default_cost_cents"]),
    }),
  },
  {
    name: "create_network_from_template",
    title: "Create affiliate network from template",
    description:
      "Create an affiliate network and get the incoming postback URLs (default, registration, ftd) with the network's macros, plus the offer URL parameter to add.",
    inputSchema: schema(
      {
        template_id: str("Network template id from list_source_templates (e.g. everflow)."),
        name: str("Name (defaults to the template name)."),
      },
      ["template_id"],
    ),
    annotations: write,
    call: (a) => ({
      method: "POST",
      path: "/api/sources/networks/from-template",
      body: pick(a, ["template_id", "name"]),
    }),
  },
  {
    name: "get_traffic_source_settings",
    title: "Get traffic source settings",
    description: "Tokens, cost API provider and last cost sync of a traffic source. The API key is never returned.",
    inputSchema: schema({ traffic_source_id: str("Traffic source id.") }, ["traffic_source_id"]),
    annotations: read,
    call: (a) => ({ method: "GET", path: `/api/sources/${id(a, "traffic_source_id")}/settings` }),
  },
  {
    name: "update_traffic_source_settings",
    title: "Update traffic source settings",
    description:
      "Replace the named tokens and/or set the cost API (api_provider: adcash) and API key (null clears it).",
    inputSchema: schema(
      {
        traffic_source_id: str("Traffic source id."),
        tokens: tokenSchema,
        api_provider: nullableStr("Cost API provider (adcash) or null."),
        api_key: nullableStr("Cost API key; stored encrypted, never returned. null clears it."),
      },
      ["traffic_source_id"],
    ),
    annotations: write,
    call: (a) => ({
      method: "PUT",
      path: `/api/sources/${id(a, "traffic_source_id")}/settings`,
      body: pick(a, ["tokens", "api_provider", "api_key"]),
    }),
  },
  {
    name: "sync_traffic_source_cost",
    title: "Sync cost from traffic source API",
    description:
      "Pull spend from the source's cost API now (default: yesterday and today, UTC) and write it onto its campaigns' clicks.",
    inputSchema: schema(
      { traffic_source_id: str("Traffic source id."), date: str("Only this day (YYYY-MM-DD).") },
      ["traffic_source_id"],
    ),
    annotations: overwrite,
    call: (a) => ({
      method: "POST",
      path: `/api/sources/${id(a, "traffic_source_id")}/sync-cost`,
      body: pick(a, ["date"]),
    }),
  },
  {
    name: "get_campaign_source_link",
    title: "Get campaign link for its traffic source",
    description:
      "Campaign URL with the traffic source's macros appended (paste into the source), plus token labels (sub1 → Zone).",
    inputSchema: schema({ campaign_id: str("Campaign id (prg_…).") }, ["campaign_id"]),
    annotations: read,
    call: (a) => ({ method: "GET", path: `/api/campaigns/${id(a, "campaign_id")}/source-link` }),
  },
  {
    name: "list_cost_updates",
    title: "List cost updates",
    description: "Manual and API cost updates applied to a campaign.",
    inputSchema: schema({ campaign_id: str("Campaign id (prg_…).") }, ["campaign_id"]),
    annotations: read,
    call: (a) => ({ method: "GET", path: `/api/campaigns/${id(a, "campaign_id")}/costs` }),
  },
  {
    name: "update_campaign_cost",
    title: "Update campaign cost",
    description:
      "Set the total cost of a campaign for a day or date range, optionally only for one token value (e.g. filter_dim=zoneid, filter_value=123). The total is spread evenly over matching clicks and replaces their previous cost.",
    inputSchema: schema(
      {
        campaign_id: str("Campaign id (prg_…)."),
        date: str("One UTC day (YYYY-MM-DD). Or use from/to."),
        from: str("Range start: ISO date/time or Unix ms."),
        to: str("Range end: ISO date/time or Unix ms (a date means end of that day)."),
        total_cents: int("Total cost in cents for the matching clicks."),
        filter_dim: str("Token param of the source (zoneid) or click field (sub1..sub10, country, external_id)."),
        filter_value: str("Value to match, e.g. the zone id."),
      },
      ["campaign_id", "total_cents"],
    ),
    annotations: overwrite,
    call: (a) => ({
      method: "POST",
      path: `/api/campaigns/${id(a, "campaign_id")}/costs`,
      body: pick(a, ["date", "from", "to", "total_cents", "filter_dim", "filter_value"]),
    }),
  },
];
