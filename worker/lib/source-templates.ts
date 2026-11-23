import { SUB_KEYS, parseCostCents, type ClickContext, type SubKey } from "./click-context";

/** Click field a traffic-source query parameter is stored in. */
export type TokenSlot = SubKey | "external_id" | "cost";

export const TOKEN_SLOTS: readonly TokenSlot[] = [...SUB_KEYS, "external_id", "cost"];

/**
 * One named token of a traffic source: `?{param}={macro}` on the campaign URL is stored in
 * `slot` and shown as `name` in reports. `kind` tells the cost sync which token carries the
 * source's campaign id / zone id.
 */
export type SourceToken = {
  param: string;
  name: string;
  slot: TokenSlot;
  /** Placeholder the traffic source replaces, e.g. `[zoneid]` or `${SUBID}`. */
  macro?: string;
  kind?: "campaign" | "zone";
};

/** One outgoing postback created with a traffic source. `event: null` fires for every conversion. */
export type SourceTemplatePostback = {
  event: string | null;
  url: string;
};

export type SourceTemplate = {
  id: string;
  name: string;
  cost_type: "cpc" | "cpm" | "cpa";
  tokens: SourceToken[];
  /**
   * Single all-events outgoing postback. Ignored when `postbacks` is set.
   * null = no postback (pixel/API only), unless `postbacks` lists event URLs.
   */
  postback_url: string | null;
  /**
   * Per-event outgoing postbacks. When set, these are created instead of `postback_url`.
   * Adcash uses one conversion key per event and omits payout unless the advertiser adds it.
   */
  postbacks?: SourceTemplatePostback[];
  /** Cost API adapter that can pull spend for this source. */
  cost_api?: "adcash";
  /** false = macro names come from public docs we could not verify; edit after creating. */
  verified: boolean;
  notes?: string;
};

/** Adcash S2S pixel. Payout is omitted; advertisers append `&payout={payout}` only to send revenue. */
export const ADCASH_POSTBACK_URL =
  "https://www.adcash.com/script/register_event.php?key=YOUR_KEY&cid={external_id}";

/** Postbacks to create for a template. Per-event entries win over the single `postback_url`. */
export function sourceTemplatePostbacks(template: SourceTemplate): SourceTemplatePostback[] {
  if (template.postbacks && template.postbacks.length > 0) return template.postbacks;
  if (template.postback_url) return [{ event: null, url: template.postback_url }];
  return [];
}

/** Template as returned by the API: every preset includes the postbacks that will be created. */
export function publicSourceTemplate(template: SourceTemplate) {
  return {
    ...template,
    cost_api: template.cost_api ?? null,
    postbacks: sourceTemplatePostbacks(template),
  };
}

/**
 * Built-in traffic source presets. Macro names follow each network's public docs; entries with
 * `verified: false` should be checked against the source's tracking settings after creation.
 */
export const SOURCE_TEMPLATES: SourceTemplate[] = [
  {
    id: "adcash",
    name: "Adcash",
    cost_type: "cpm",
    tokens: [
      { param: "zoneid", name: "Zone", slot: "sub1", macro: "[zone]", kind: "zone" },
      { param: "campaignid", name: "Campaign", slot: "sub2", macro: "[campaign]", kind: "campaign" },
      { param: "country", name: "Country", slot: "sub3", macro: "[country]" },
      { param: "cost", name: "Cost", slot: "cost", macro: "[redirection_cost]" },
      { param: "clickid", name: "Click ID", slot: "external_id", macro: "[clickid]" },
    ],
    postback_url: null,
    postbacks: [
      { event: "registration", url: ADCASH_POSTBACK_URL },
      { event: "ftd", url: ADCASH_POSTBACK_URL },
    ],
    cost_api: "adcash",
    verified: true,
    notes:
      "Click URL macros are verified live. Replace YOUR_KEY on each postback with that event's conversion key from Adcash → Conversion tracking. Append &payout={payout} only when sending revenue.",
  },
  {
    id: "propellerads",
    name: "PropellerAds",
    cost_type: "cpm",
    tokens: [
      { param: "zoneid", name: "Zone", slot: "sub1", macro: "{zone_id}", kind: "zone" },
      { param: "campaignid", name: "Campaign", slot: "sub2", macro: "{campaign_id}", kind: "campaign" },
      { param: "country", name: "Country", slot: "sub4", macro: "{country}" },
      { param: "cost", name: "Cost", slot: "cost", macro: "{cost}" },
      { param: "clickid", name: "Click ID", slot: "external_id", macro: "${SUBID}" },
    ],
    postback_url:
      "https://ad.propellerads.com/conversion.php?aid=YOUR_AID&pid=&tid=YOUR_TID&visitor_id={external_id}&payout={payout}",
    verified: true,
    notes: "Replace YOUR_AID / YOUR_TID with the values from PropellerAds → Tracking.",
  },
  {
    id: "richads",
    name: "RichAds",
    cost_type: "cpm",
    tokens: [
      { param: "zoneid", name: "Publisher", slot: "sub1", macro: "[PUBLISHER_ID]", kind: "zone" },
      { param: "siteid", name: "Site", slot: "sub2", macro: "[SITE_ID]" },
      { param: "campaignid", name: "Campaign", slot: "sub3", macro: "[CAMPAIGN_ID]", kind: "campaign" },
      { param: "creativeid", name: "Creative", slot: "sub4", macro: "[CREATIVE_ID]" },
      { param: "cost", name: "Cost", slot: "cost", macro: "[BID]" },
      { param: "clickid", name: "Click ID", slot: "external_id", macro: "[CLICK_ID]" },
    ],
    postback_url: "https://xml.richads.com/conversion?key=YOUR_KEY&clickid={external_id}&payout={payout}",
    verified: false,
  },
  {
    id: "zeropark",
    name: "Zeropark",
    cost_type: "cpc",
    tokens: [
      { param: "target", name: "Target", slot: "sub1", macro: "{target}", kind: "zone" },
      { param: "source", name: "Source", slot: "sub2", macro: "{source}" },
      { param: "campaignid", name: "Campaign", slot: "sub3", macro: "{campaign_id}", kind: "campaign" },
      { param: "geo", name: "Country", slot: "sub4", macro: "{geo}" },
      { param: "cost", name: "Cost", slot: "cost", macro: "{visit_cost}" },
      { param: "clickid", name: "Click ID", slot: "external_id", macro: "{cid}" },
    ],
    postback_url: "https://postback.zeroredirect1.com/zppostback/YOUR_ID?cid={external_id}&payout={payout}",
    verified: true,
    notes: "Replace YOUR_ID with the postback id from Zeropark → Tracking.",
  },
  {
    id: "trafficstars",
    name: "TrafficStars",
    cost_type: "cpm",
    tokens: [
      { param: "spotid", name: "Spot", slot: "sub1", macro: "{spot_id}", kind: "zone" },
      { param: "siteid", name: "Site", slot: "sub2", macro: "{site_id}" },
      { param: "campaignid", name: "Campaign", slot: "sub3", macro: "{campaign_id}", kind: "campaign" },
      { param: "creativeid", name: "Creative", slot: "sub4", macro: "{creative_id}" },
      { param: "cost", name: "Cost", slot: "cost", macro: "{cost}" },
      { param: "clickid", name: "Click ID", slot: "external_id", macro: "{click_id}" },
    ],
    postback_url:
      "https://tsyndicate.com/api/v1/conversions/s2s?key=YOUR_KEY&clickid={external_id}&value={payout}",
    verified: false,
  },
  {
    id: "facebook",
    name: "Facebook / Meta",
    cost_type: "cpc",
    tokens: [
      { param: "campaignid", name: "Campaign", slot: "sub1", macro: "{{campaign.id}}", kind: "campaign" },
      { param: "adsetid", name: "Ad set", slot: "sub2", macro: "{{adset.id}}" },
      { param: "adid", name: "Ad", slot: "sub3", macro: "{{ad.id}}" },
      { param: "placement", name: "Placement", slot: "sub4", macro: "{{placement}}" },
      { param: "site", name: "Site source", slot: "sub5", macro: "{{site_source_name}}" },
      { param: "fbclid", name: "fbclid", slot: "external_id" },
    ],
    postback_url: null,
    verified: true,
    notes: "fbclid is added by Meta automatically. Send conversions with the Conversions API.",
  },
  {
    id: "google-ads",
    name: "Google Ads",
    cost_type: "cpc",
    tokens: [
      { param: "campaignid", name: "Campaign", slot: "sub1", macro: "{campaignid}", kind: "campaign" },
      { param: "adgroupid", name: "Ad group", slot: "sub2", macro: "{adgroupid}" },
      { param: "creative", name: "Ad", slot: "sub3", macro: "{creative}" },
      { param: "keyword", name: "Keyword", slot: "sub4", macro: "{keyword}" },
      { param: "placement", name: "Placement", slot: "sub5", macro: "{placement}" },
      { param: "device", name: "Device", slot: "sub6", macro: "{device}" },
      { param: "gclid", name: "gclid", slot: "external_id", macro: "{gclid}" },
    ],
    postback_url: null,
    verified: true,
    notes: "Import conversions to Google Ads by gclid (offline conversions).",
  },
  {
    id: "tiktok",
    name: "TikTok Ads",
    cost_type: "cpc",
    tokens: [
      { param: "campaignid", name: "Campaign", slot: "sub1", macro: "__CAMPAIGN_ID__", kind: "campaign" },
      { param: "adgroupid", name: "Ad group", slot: "sub2", macro: "__AID__" },
      { param: "adid", name: "Ad", slot: "sub3", macro: "__CID__" },
      { param: "placement", name: "Placement", slot: "sub4", macro: "__PLACEMENT__" },
      { param: "ttclid", name: "ttclid", slot: "external_id", macro: "__CALLBACK_PARAM__" },
    ],
    postback_url: null,
    verified: false,
    notes: "Send conversions with the TikTok Events API using ttclid.",
  },
];

/** Incoming postback preset for an affiliate network platform. */
export type NetworkTemplate = {
  id: string;
  name: string;
  /** Offer URL parameter that carries Capve's click id, e.g. `aff_sub={click_id}`. */
  offer_param: string;
  /** Network macros used in the incoming postback URL. */
  click_macro: string;
  payout_macro: string;
  status_macro?: string;
  /** false = ready-to-paste postbacks omit payout. YesPlay rejects `{payout}`. */
  include_payout?: boolean;
  verified: boolean;
  notes?: string;
};

export const NETWORK_TEMPLATES: NetworkTemplate[] = [
  {
    id: "generic",
    name: "Generic (clickid / payout / status)",
    offer_param: "clickid",
    click_macro: "{clickid}",
    payout_macro: "{payout}",
    status_macro: "{status}",
    verified: true,
  },
  {
    id: "tune",
    name: "TUNE / HasOffers",
    offer_param: "aff_sub",
    click_macro: "{aff_sub}",
    payout_macro: "{payout}",
    verified: true,
  },
  {
    id: "everflow",
    name: "Everflow",
    offer_param: "sub1",
    click_macro: "{sub1}",
    payout_macro: "{payout_amount}",
    verified: true,
  },
  {
    id: "cake",
    name: "CAKE",
    offer_param: "s2",
    click_macro: "#s2#",
    payout_macro: "#price#",
    verified: true,
  },
  {
    id: "affise",
    name: "Affise",
    offer_param: "sub1",
    click_macro: "{sub1}",
    payout_macro: "{sum}",
    status_macro: "{status}",
    verified: true,
  },
  {
    id: "cellxpert",
    name: "Cellxpert (casino)",
    offer_param: "subid",
    click_macro: "{subid}",
    payout_macro: "{commission}",
    verified: false,
    notes: "Set one postback per event (registration, FTD) in Cellxpert.",
  },
  {
    id: "affilka",
    name: "Affilka / SOFTSWISS (casino)",
    offer_param: "var",
    click_macro: "{var}",
    payout_macro: "{commission}",
    verified: false,
    notes: "Set one postback per event (registration, first deposit) in Affilka.",
  },
  {
    id: "yesplay",
    name: "YesPlay",
    offer_param: "subid1",
    click_macro: "${subid1}",
    payout_macro: "${commission}",
    include_payout: false,
    verified: true,
    notes: "YesPlay rejects {payout} with 400. Use only cnv_id and event by default.",
  },
  {
    id: "tonybet",
    name: "Tonybet",
    offer_param: "clickid",
    click_macro: "{clickid}",
    payout_macro: "{payout}",
    verified: false,
  },
  {
    id: "myaffiliates",
    name: "MyAffiliates (casino)",
    offer_param: "payload",
    click_macro: "{payload}",
    payout_macro: "{amount}",
    verified: false,
  },
];

/** Legacy macros, keyed by their lower-case form. Click id `${SUBID}` is not in this map. */
const PROPELLER_MACRO_FIX: Record<string, string> = {
  "${zoneid}": "{zone_id}",
  "${campaignid}": "{campaign_id}",
  "${geo}": "{country}",
  "${cost}": "{cost}",
  "${bannerid}": "${bannerid}",
};

function canonicalPropellerMacro(macro: string | undefined): string | undefined {
  if (!macro) return macro;
  const key = macro.toLowerCase();
  // Own-property check: "constructor" and "toString" are inherited and are not macros.
  return Object.prototype.hasOwnProperty.call(PROPELLER_MACRO_FIX, key) ? PROPELLER_MACRO_FIX[key] : macro;
}

function isPropellerCountryMacro(macro: string | undefined): boolean {
  if (!macro) return false;
  const lower = macro.toLowerCase();
  return lower === "${geo}" || lower === "{country}";
}

type RewrittenPropellerToken = { token: SourceToken; renamedFromGeo: boolean };

function rewritePropellerToken(token: SourceToken): RewrittenPropellerToken | null {
  const macro = canonicalPropellerMacro(token.macro);
  if (token.param.toLowerCase() === "bannerid" && macro?.toLowerCase() === "${bannerid}") return null;
  const renamedFromGeo = token.param.toLowerCase() === "geo" && isPropellerCountryMacro(token.macro);
  const param = renamedFromGeo ? "country" : token.param;
  const next = param === token.param && macro === token.macro ? token : { ...token, param, macro };
  return { token: next, renamedFromGeo };
}

/**
 * PropellerAds creatives must use
 * `zoneid={zone_id}&campaignid={campaign_id}&country={country}&cost={cost}&clickid=${SUBID}`.
 * Click ID is the only `$` macro (`${SUBID}`). Older presets stored `${zoneid}`, `${campaignid}`,
 * `${geo}` and `${cost}` in any letter case, which PropellerAds leaves unreplaced. This rewrites
 * only those macros, drops the old `bannerid` token and renames a `geo` country parameter to
 * `country`. When that rename would duplicate an existing `country` param, the pre-existing
 * country token is kept. Other tokens stay as stored.
 */
export function normalizePropellerTokens(tokens: SourceToken[]): SourceToken[] {
  const rewritten: RewrittenPropellerToken[] = [];
  for (const token of tokens) {
    const next = rewritePropellerToken(token);
    if (next) rewritten.push(next);
  }
  const chosen = new Map<string, RewrittenPropellerToken>();
  const order: string[] = [];
  for (const item of rewritten) {
    const key = item.token.param.toLowerCase();
    const prev = chosen.get(key);
    if (!prev) {
      chosen.set(key, item);
      order.push(key);
      continue;
    }
    if (prev.renamedFromGeo && !item.renamedFromGeo) chosen.set(key, item);
  }
  return order.map((param) => chosen.get(param)!.token);
}

/** Set when a PropellerAds save would put two tokens on the same query param after rewriting. */
export function propellerTokenConflict(tokens: SourceToken[]): string | null {
  const params = new Set<string>();
  for (const token of tokens) {
    const next = rewritePropellerToken(token);
    if (!next) continue;
    const key = next.token.param.toLowerCase();
    if (params.has(key)) return `Duplicate token param: ${key}`;
    params.add(key);
  }
  return null;
}

export function findSourceTemplate(id: string): SourceTemplate | undefined {
  return SOURCE_TEMPLATES.find((t) => t.id === id);
}

export function findNetworkTemplate(id: string): NetworkTemplate | undefined {
  return NETWORK_TEMPLATES.find((t) => t.id === id);
}

/** Incoming postback URLs (default + one per event) using the network's macros. */
export function networkPostbackUrls(appUrl: string, template: NetworkTemplate) {
  const parts = [`cnv_id=${template.click_macro}`];
  if (template.include_payout !== false) parts.push(`payout=${template.payout_macro}`);
  if (template.status_macro) parts.push(`cnv_status=${template.status_macro}`);
  const url = `${appUrl.replace(/\/$/, "")}/click?${parts.join("&")}`;
  return {
    default: url,
    registration: `${url}&event=registration`,
    ftd: `${url}&event=ftd`,
  };
}

const PARAM_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;
export const MAX_TOKENS = 20;

/** Validates user-supplied tokens. Returns an error message or the cleaned list. */
export function parseTokens(raw: unknown): SourceToken[] | string {
  if (!Array.isArray(raw)) return "tokens must be an array";
  if (raw.length > MAX_TOKENS) return `At most ${MAX_TOKENS} tokens`;
  const tokens: SourceToken[] = [];
  const params = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") return "Each token needs param, name and slot";
    const t = item as Record<string, unknown>;
    const param = typeof t.param === "string" ? t.param.trim() : "";
    const name = typeof t.name === "string" ? t.name.trim().slice(0, 40) : "";
    const slot = t.slot as TokenSlot;
    if (!PARAM_PATTERN.test(param)) return `Invalid token param: ${param || "(empty)"}`;
    if (params.has(param)) return `Duplicate token param: ${param}`;
    if (!TOKEN_SLOTS.includes(slot)) return `slot must be one of: ${TOKEN_SLOTS.join(", ")}`;
    params.add(param);
    const token: SourceToken = { param, name: name || param, slot };
    if (typeof t.macro === "string" && t.macro.trim()) token.macro = t.macro.trim().slice(0, 64);
    if (t.kind === "campaign" || t.kind === "zone") token.kind = t.kind;
    tokens.push(token);
  }
  return tokens;
}

/**
 * Copies the source's named query params into the click's slots. A mapped value wins over the
 * built-in `sub1`..`sub10` / `clickid` / `cost` params for the same slot.
 */
export function applySourceTokens<T extends Pick<ClickContext, SubKey | "external_id" | "cost_cents">>(
  url: URL,
  tokens: SourceToken[],
  context: T,
): T {
  const next = { ...context };
  for (const token of tokens) {
    const value = url.searchParams.get(token.param)?.trim().slice(0, 255);
    if (!value) continue;
    if (token.slot === "cost") {
      const cents = parseCostCents(value);
      if (cents != null) next.cost_cents = cents;
    } else {
      next[token.slot] = value;
    }
  }
  return next;
}

/**
 * Click-id placeholders a traffic source fills on its own campaign URL (`[clickid]`, `${SUBID}`, …).
 * Pasted into an offer or destination, they stay literal: the source never sees that URL.
 * Capve fills them with its own click id, the same value as `{click_id}`.
 * Curly `{name}` macros are excluded so `{external_id}` and `{gclid}` keep their own meaning.
 */
export function passthroughClickMacros(templates: readonly SourceTemplate[] = SOURCE_TEMPLATES): string[] {
  const macros: string[] = [];
  for (const template of templates) {
    for (const token of template.tokens) {
      if (token.slot !== "external_id" || !token.macro) continue;
      if (/^\{[a-z0-9_]+\}$/i.test(token.macro)) continue;
      if (!macros.includes(token.macro)) macros.push(token.macro);
    }
  }
  return macros;
}

/** `?zoneid=[zone]&clickid=[clickid]…` for the source's tokens that have a macro. */
export function trackingUrlWithMacros(campaignUrl: string, tokens: SourceToken[]): string {
  const query = tokens
    .filter((t) => t.macro)
    .map((t) => `${encodeURIComponent(t.param)}=${t.macro}`)
    .join("&");
  if (!query) return campaignUrl;
  return `${campaignUrl}${campaignUrl.includes("?") ? "&" : "?"}${query}`;
}

/** `{ sub1: "Zone", … }` for report column / group-by labels. */
export function tokenLabels(tokens: SourceToken[]): Partial<Record<TokenSlot, string>> {
  const labels: Partial<Record<TokenSlot, string>> = {};
  for (const token of tokens) labels[token.slot] ??= token.name;
  return labels;
}
