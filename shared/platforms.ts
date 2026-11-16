// Public capability catalog shared by the console, API validation and MCP discovery.
export const PLATFORM_IDS = ["adcash", "propellerads", "richads", "trafficstars"] as const;
export type PlatformId = typeof PLATFORM_IDS[number];
export type ActionField = {
  type: "string" | "number" | "integer" | "array";
  description: string;
  enum?: string[];
  minimum?: number;
  exclusiveMinimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minItems?: number;
  maxItems?: number;
  items?: object;
};
export type PlatformAction = {
  id: string;
  title: string;
  description: string;
  read_only: boolean;
  input_schema: { type: "object"; properties: Record<string, ActionField>; required: string[]; additionalProperties: false };
};
export type Platform = {
  id: PlatformId;
  name: string;
  credential_label: string;
  setup: string;
  documentation_url: string;
  limitation: string | null;
  actions: PlatformAction[];
};
const campaign: ActionField = { type: "string", pattern: "^[1-9][0-9]{0,14}$", description: "Campaign ID in the advertising platform, not a Capve campaign ID. Find it in the provider campaign list." };
const amount = (description: string): ActionField => ({ type: "number", exclusiveMinimum: 0, maximum: 1000000, description });
const zones: ActionField = { type: "array", minItems: 1, maxItems: 100, items: { type: "string", pattern: "^[1-9][0-9]{0,14}$" }, description: "Placement IDs from the provider's reports. Adds these exclusions without replacing existing exclusions." };
const action = (id: string, title: string, description: string, read_only: boolean, properties: Record<string, ActionField> = {}, required = Object.keys(properties)): PlatformAction => ({ id, title, description, read_only, input_schema: { type: "object", properties, required, additionalProperties: false } });
const detail = action("get_campaign", "Get campaign", "Read the provider's current campaign configuration, including its status and bid/budget fields where returned.", true, { campaign_id: campaign });
const status = action("set_status", "Pause or resume campaign", "Change delivery on the advertising platform. Resuming can spend money immediately; provider approval and balance rules still apply.", false, { campaign_id: campaign, status: { type: "string", enum: ["paused", "active"], description: "Requested delivery state on the advertising platform." } });
const paginated = action("list_campaigns", "List campaigns", "Read one page of provider campaigns and its pagination metadata. Use their IDs for subsequent provider actions.", true, { page: { type: "integer", minimum: 1, maximum: 100000, description: "Provider result page; omission starts at the first page." } }, []);

export const PLATFORMS: Platform[] = [
  {
    id: "adcash", name: "Adcash", credential_label: "Client API access token (15-minute lifetime)",
    setup: "Use the access_token returned by the Client API /auth/token exchange. This is separate from the Reporting API key and the long-lived Client API token.",
    documentation_url: "https://support.adcash.com/en/categories/50-client-api",
    limitation: "Temporary access tokens only; automatic Client API token exchange and pause/resume await the signed-in API reference. Re-enter an access token after it expires.",
    actions: [
      action("list_campaigns", "List campaigns", "Read Adcash's first campaign page with provider pagination metadata.", true), detail,
      action("get_bids", "Get payouts and bids", "Read the campaign payout records, including country, zone, quality tier and bid values.", true, { campaign_id: campaign }),
      action("get_budget", "Get campaign budget", "Read the active campaign budget from Adcash.", true, { campaign_id: campaign }),
      action("set_budget", "Set campaign budget", "Create or update the active campaign budget on Adcash. This is the campaign budget, not a daily cap.", false, { campaign_id: campaign, amount: { ...amount("Active campaign budget in the Adcash account currency (EUR or USD), not cents."), minimum: 100 } }),
      action("set_zone_bid", "Set zone bid", "Update one country/zone payout record. Match the payout type to the campaign; CPM zone bids use no quality tier. Review existing payouts before changing them.", false, { campaign_id: campaign, country_code: { type: "string", pattern: "^[A-Z]{2}$", description: "Country targeted by this payout record, as returned by get_bids." }, zone_id: { ...campaign, pattern: "^[0-9]+(?:-[0-9]+){0,2}$", maxLength: 80, description: "Adcash zone ID from Performance grouped by Zone or Source." }, bid: amount("Bid in the Adcash account currency and campaign payout model, not cents."), payout_type: { type: "string", enum: ["CPM", "CPC", "CPA"], description: "Existing campaign payout model. CPM is priced per thousand impressions; CPC per click; CPA per action." } }),
    ],
  },
  {
    id: "propellerads", name: "PropellerAds", credential_label: "Advertiser API token",
    setup: "Generate an advertiser API token in your PropellerAds profile.", documentation_url: "https://ssp-api.propellerads.com/v5/docs/", limitation: null,
    actions: [paginated, detail, status,
      action("get_bids", "Get campaign rates", "Read current and historical country rates, with amount, countries and start/end times.", true, { campaign_id: campaign }),
      action("get_zone_bids", "Get zone rates", "Read the campaign's custom zone bid rates.", true, { campaign_id: campaign }),
      action("set_zone_bid", "Set zone bid", "Update the custom rate for one PropellerAds zone.", false, { campaign_id: campaign, zone_id: campaign, bid: amount("Zone rate in USD, using the campaign rate model; not cents.") }),
      action("set_daily_budget", "Set daily budget", "Change the campaign daily spending limit, preserving its other configuration.", false, { campaign_id: campaign, amount: amount("Daily spending limit in USD, not cents.") }),
      action("get_excluded_zones", "Get excluded zones", "Read the campaign zone exclusion list.", true, { campaign_id: campaign }),
      action("exclude_zones", "Exclude zones", "Append zones to campaign exclusions on PropellerAds; existing exclusions remain.", false, { campaign_id: campaign, zone_ids: zones }),
    ],
  },
  {
    id: "richads", name: "RichAds", credential_label: "Advertiser API key",
    setup: "Copy your advertiser API key from RichAds Settings.", documentation_url: "https://api.richads.com/public/doc/api", limitation: null,
    actions: [paginated, detail, status,
      action("set_bid", "Set campaign bid", "Change the campaign bid on RichAds; campaign-type limits are enforced by the provider.", false, { campaign_id: campaign, bid: amount("Bid in USD: CPM for pops, CPC for push/display; not cents.") }),
      action("set_daily_budget", "Set daily budget", "Update an existing limited daily budget. RichAds rejects campaigns with an unlimited budget; this action does not change budget mode or pacing.", false, { campaign_id: campaign, amount: amount("Daily budget in USD, not cents.") }),
    ],
  },
  {
    id: "trafficstars", name: "TrafficStars", credential_label: "Profile API key / offline refresh token",
    setup: "Generate an API key on the TrafficStars profile page. Capve exchanges it for a temporary access token on the server.", documentation_url: "https://docs.trafficstars.com/#/_campaigns", limitation: null,
    actions: [action("list_campaigns", "List campaigns", "Read the TrafficStars campaign list, excluding archived campaigns by provider default.", true), detail, status,
      action("set_bid", "Set direct campaign bid", "Change the direct-traffic price. This does not change the separate RTB price.", false, { campaign_id: campaign, bid: amount("Price per action or per thousand impressions for CPM, in the provider account currency; not cents.") }),
      action("set_daily_budget", "Set daily budget", "Change the campaign daily spending maximum while preserving other fields.", false, { campaign_id: campaign, amount: amount("Daily spending maximum in the provider account currency, not cents.") }),
      action("get_zone_bids", "Get spot prices", "Read custom spot prices for the campaign.", true, { campaign_id: campaign }),
      action("set_zone_bid", "Set spot bid", "Set a custom campaign price for one TrafficStars spot.", false, { campaign_id: campaign, zone_id: { ...campaign, description: "TrafficStars spot ID from the provider's placement reports." }, bid: amount("Price per action or per thousand impressions for CPM, in the provider account currency; not cents.") }),
    ],
  },
];

export type PlatformSettings = { traffic_source_id: string; provider: PlatformId | null; enabled: boolean; allow_writes: boolean; has_credential: boolean; revision: number };
export type PlatformResult = { provider: PlatformId; action: string; status: "accepted" | "failed" | "unknown"; data: unknown; operation_id: string | null; message: string };
