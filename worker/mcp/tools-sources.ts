import { TOKEN_SLOTS } from "../lib/source-templates";
import { ToolInputError, type ToolDefinition } from "./tools";

// Kept in its own file so traffic-source / cost tools merge cleanly with tools.ts.
// ToolInputError is only used lazily inside `call`, so the circular import is safe.

type Args = Record<string, unknown>;

const str = (description: string) => ({ type: "string", description });
const int = (description: string) => ({ type: "integer", description });
const nullableStr = (description: string) => ({ anyOf: [{ type: "string" }, { type: "null" }], description });

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
  maxItems: 20,
  description:
    "Named tokens: each maps a query param of the source's traffic to a click slot and shows `name` in reports.",
  items: {
    type: "object",
    properties: {
      param: str("Query parameter on the campaign URL, e.g. zoneid."),
      name: str("Label shown in reports, e.g. Zone."),
      slot: { type: "string", enum: TOKEN_SLOTS, description: "Click field that stores this incoming query parameter; use it as the dimension in reports, blacklist rules or bidding analysis." },
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

export const SOURCE_TOOLS: ToolDefinition[] = [
  {
    name: "list_source_templates",
    title: "List traffic source and network templates",
    description:
      "Read built-in traffic-source presets with cost models, token mappings, macros and outgoing postback templates, plus affiliate-network presets with incoming postback URLs and offer URL suffixes. Also returns available cost API providers; template ids feed the create-from-template tools.",
    inputSchema: schema({}),
    annotations: read,
    call: () => ({ method: "GET", path: "/api/sources/templates" }),
  },
  {
    name: "create_traffic_source_from_template",
    title: "Create traffic source from template",
    description:
      "Create a traffic source with the template's cost model, named tokens, cost API when the preset has one, and outgoing postbacks. A preset may create one all-events postback or one postback per event. Edit placeholders like YOUR_KEY afterwards with update_postback.",
    inputSchema: schema(
      {
        template_id: str("Template id from list_source_templates (e.g. adcash)."),
        name: str("Display label for the new account record; omission uses the template’s name."),
        default_cost_cents: { ...int("Fallback charge in cents using the template cost model: per click for CPC, per thousand clicks for CPM, or once per converted click for CPA."), minimum: 0 },
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
        name: str("Display label for the new account record; omission uses the template’s name."),
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
    inputSchema: schema({ traffic_source_id: str("Source whose integration settings or cost data to use; take its id from list_traffic_sources.") }, ["traffic_source_id"]),
    annotations: read,
    call: (a) => ({ method: "GET", path: `/api/sources/${id(a, "traffic_source_id")}/settings` }),
  },
  {
    name: "update_traffic_source_settings",
    title: "Update traffic source settings",
    description:
      "Update this traffic source’s integration settings. Supplied tokens replace the whole mapping; omitted fields stay unchanged. Configure api_provider and an encrypted API key for cost synchronization, or clear either with null. Returns settings with a key-presence flag, never the key.",
    inputSchema: schema(
      {
        traffic_source_id: str("Source whose integration settings or cost data to use; take its id from list_traffic_sources."),
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
      "Fetch spend using this source’s configured cost provider and stored API key, then replace costs on matching non-bot clicks across its campaigns. Campaign/zone token mappings determine matching; without them spend is spread across the source’s non-bot clicks for that day. Returns day, row, update, click and spend totals.",
    inputSchema: schema(
      { traffic_source_id: str("Source whose integration settings or cost data to use; take its id from list_traffic_sources."), date: str("UTC spend day to synchronize, as YYYY-MM-DD. Omit to synchronize yesterday and today in UTC.") },
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
      "Build the campaign’s tracking_url with its traffic source macros appended for pasting into the source. Also returns the base campaign_url, source id, token mappings and report labels. URL fields can be null when the campaign has no tracking key.",
    inputSchema: schema({ campaign_id: str("Campaign whose source link or cost records to use; take its id from list_campaigns.") }, ["campaign_id"]),
    annotations: read,
    call: (a) => ({ method: "GET", path: `/api/campaigns/${id(a, "campaign_id")}/source-link` }),
  },
  {
    name: "list_cost_updates",
    title: "List cost updates",
    description: "Read the latest cost-update records relevant to a campaign: its manual updates and source-wide API updates. Records describe the time window, filters, total spend, affected click count and origin, newest first.",
    inputSchema: schema({ campaign_id: str("Campaign whose source link or cost records to use; take its id from list_campaigns.") }, ["campaign_id"]),
    annotations: read,
    call: (a) => ({ method: "GET", path: `/api/campaigns/${id(a, "campaign_id")}/costs` }),
  },
  {
    name: "update_campaign_cost",
    title: "Update campaign cost",
    description:
      "Replace costs on this campaign’s non-bot clicks for a UTC day or date range; provide date or both from and to. Optionally restrict to an exact token value with filter_dim and filter_value. The total is spread evenly over matching clicks and replaces their previous cost. Returns the recorded update, including the affected click count.",
    inputSchema: schema(
      {
        campaign_id: str("Campaign whose source link or cost records to use; take its id from list_campaigns."),
        date: str("One UTC day (YYYY-MM-DD). Or use from/to."),
        from: str("Range start: ISO date/time or Unix ms."),
        to: str("Range end: ISO date/time or Unix ms (a date means end of that day)."),
        total_cents: { ...int("Aggregate spend in cents for the entire matching click set, not a per-click amount; divided evenly among those clicks."), minimum: 0 },
        filter_dim: str("Token param of the source (zoneid) or click field (sub1..sub10, country, external_id)."),
        filter_value: str("Exact captured value to match in filter_dim, such as a traffic-source zone identifier; used together with filter_dim."),
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
