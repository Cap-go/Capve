import type { Schema } from "@cfworker/json-schema";

// Contracts follow the existing API envelopes; adding schemas does not rename response fields.
const text: Schema = { type: "string" };
const nullableText: Schema = { anyOf: [{ type: "string" }, { type: "null" }] };
const number: Schema = { type: "number" };
const integer: Schema = { type: "integer" };
const nullableNumber: Schema = { anyOf: [{ type: "number" }, { type: "null" }] };
const boolean: Schema = { type: "boolean" };
const timestamp: Schema = { type: "integer", description: "Unix timestamp in milliseconds." };
const cents: Schema = { type: "number", description: "Amount in cents; use the accompanying currency where present. Some stored costs and payouts can contain fractional cents." };
const array = (items: Schema, description?: string): Schema => ({ type: "array", items, ...(description ? { description } : {}) });
const object = (properties: Record<string, Schema>, required = Object.keys(properties)): Schema => ({
  type: "object", properties, required, additionalProperties: true,
});
const dictionary = (values: Schema, description: string): Schema => ({ type: "object", additionalProperties: values, description });
const nullable = (value: Schema): Schema => ({ anyOf: [value, { type: "null" }] });
const entityFields = { id: text, user_id: text, name: text, created_at: timestamp };
const entity = object(entityFields);
const programFields = {
  ...entityFields, slug: text, destination_url: nullableText, campaign_key: nullableText,
  group_id: nullableText, traffic_source_id: nullableText, tags: nullableText, status: text,
};
const program = object(programFields);
const source = object({ ...entityFields, cost_type: text, default_cost_cents: cents, postback_percent: number });
const lander = object({ ...entityFields, url: text });
const offer = object({ ...entityFields, network_id: nullableText, url: text, payout_cents: cents });
const affiliateFields = { id: text, program_id: text, name: text, code: text, created_at: timestamp };
const affiliate = object(affiliateFields);
const metricFields = {
  clicks: integer, bot_clicks: integer, lp_clicks: integer, leads: integer, revenue_cents: cents,
  cost_cents: cents, profit_cents: cents, lp_ctr: number, cr: number, epc_cents: cents,
  cpc_cents: cents, roi: { ...nullableNumber, description: "Return on investment percent; null when cost is zero." },
};
const eventFields = {
  events: dictionary(integer, "Approved conversion counts keyed by event name."),
  event_metrics: dictionary(object({ count: integer, revenue_cents: cents, cr: number, cpa_cents: nullableNumber }), "Metrics keyed by conversion event name."),
  revenue_by_currency: dictionary(cents, "Revenue by currency code; never sum different currencies."),
};
const groupedFields = {
  key: nullableText, label: text, unique_clicks: integer, bot_clicks: integer,
  metrics: object(metricFields), currency: text, ...eventFields,
};
const statsFields = {
  clicks: integer, bots: integer, conversions: integer, revenue_cents: cents, conversion_rate: number, ...eventFields,
};
const path = object({
  id: text, rotation_id: text, name: text, flow_type: text, weight: integer, sort_order: integer,
  direct_url: nullableText, lander_id: nullableText, offer_id: nullableText, enabled: boolean,
  created_at: timestamp, rule_id: nullableText,
});
const rule = object({
  id: text, program_id: text, name: text, sort_order: integer, timezone: text, enabled: boolean,
  created_at: timestamp, conditions: array(object({ field: text, op: text, values: array(text) })),
  paths: array(path),
}, ["id", "program_id", "name", "conditions", "timezone", "enabled", "sort_order", "created_at"]);
const rotation = object({
  rotation: object({ id: text, program_id: text, mode: text, fixed_path_id: nullableText, created_at: timestamp }),
  paths: array(path), rules: array(rule),
});
const filter = object({ program_id: text, bot_action: text, safe_page_url: nullableText, block_datacenter: boolean });
const blocklist = object({ id: text, kind: text, value: text, created_at: timestamp });
const postback = object({
  id: text, user_id: text, program_id: nullableText, traffic_source_id: nullableText,
  network_id: nullableText, event: nullableText, url: text, created_at: timestamp,
});
const postbackKey = object({ postback_key: object({ key: text, required: boolean, postback_url: text }) });
const automationRule = object({
  ...entityFields, program_id: text, kind: text, dimension: nullableText, min_clicks: nullableNumber,
  event: nullableText, roi_below: nullableNumber, spend_above_cents: nullableNumber, window_hours: integer,
  notify_email: nullableText, webhook_url: nullableText, enabled: boolean,
  last_run_at: nullableNumber, last_fired_at: nullableNumber,
});
const zone = object({
  id: text, user_id: text, program_id: text, dimension: text, value: text, rule_id: nullableText,
  reason: nullableText, created_at: timestamp,
});
const domain = object({
  id: text, user_id: text, hostname: text, created_at: timestamp, status: text, ssl_status: nullableText,
  dns_records: array(object({ type: text, name: text, value: text })), errors: array(text), checked_at: nullableNumber,
});
const token = object({ param: text, name: text, slot: text, macro: text, kind: text }, ["param", "name", "slot"]);
const sourceSettings = object({
  traffic_source_id: text, template: nullableText, tokens: array(token), api_provider: nullableText,
  has_api_key: boolean, last_sync_at: nullableNumber, last_sync_error: nullableText,
});
const costUpdate = object({
  id: text, user_id: text, program_id: nullableText, traffic_source_id: nullableText, from_ms: timestamp,
  to_ms: timestamp, filter_dim: nullableText, filter_value: nullableText, total_cents: cents,
  clicks_updated: integer, origin: text, created_at: timestamp,
});
const note = object({
  id: text, user_id: text, entity_type: text, entity_id: text, body: text, created_at: timestamp, updated_at: timestamp,
});
const member = object({ id: text, owner_user_id: text, email: text, role: text, created_at: timestamp, accepted_at: nullableNumber });
const trigger = object({ ...entityFields, program_id: nullableText, event: text, action_type: text, action_url: text, enabled: boolean });
const success = object({ ok: { type: "boolean", const: true } });
const postbackUrls = object({ default: text, registration: text, ftd: text });

const contracts: Record<string, Schema> = {
  whoami: object({ user: nullable(object({
    id: text, email: text, role: text, account_id: text, account_email: text,
    impersonating: boolean, is_platform_admin: boolean, email_verified: boolean,
  })) }),
  get_stripe_setup_status: object({
    checkedAt: timestamp, billingEnabled: boolean, automaticTaxEnabled: boolean, mode: text, accountId: nullableText,
    checks: array(object({ id: text, label: text, status: text, detail: text, href: text }, ["id", "label", "status", "detail"])),
  }),
  get_billing_status: object({
    enabled: boolean, plan: text, trialEndsAt: timestamp, subscriptionStatus: nullableText, clicks: integer,
    clickLimit: integer, period: text, reportsAllowed: boolean, reason: nullableText, checkoutReady: boolean, hasCustomer: boolean,
  }),
  list_campaigns: object({ programs: array(program, "Campaigns visible to this account; archived campaigns are excluded.") }),
  get_campaign: object({ program }),
  create_campaign: object({ program, convert_secret: { type: "string", description: "Server-only conversion secret shown once. Store securely; never embed in client code." } }),
  update_campaign: object({ program }),
  clone_campaign: object({ program }),
  bulk_update_campaigns: object({ updated: integer }),
  get_campaign_tracking: object({ tracking: object({
    postback_url: text, postback_key_required: boolean, campaign_url: nullableText,
    tracking_domain: nullable(object({ id: text, hostname: text })), offer_url_macro: text, redirect_params: array(text),
  }) }),
  get_campaign_stats: object({ program, totals: object(statsFields), currency: text, affiliates: array(object({ ...affiliateFields, ...statsFields })) }),
  list_clicks: object({ clicks: array(object({
    id: text, program_id: text, affiliate_id: text, ip: nullableText, user_agent: nullableText,
    created_at: timestamp, affiliate_name: text, affiliate_code: text, converted: boolean,
  })) }),
  list_conversions: object({ conversions: array(object({
    id: text, program_id: text, affiliate_id: text, click_id: nullableText, order_id: text,
    amount_cents: cents, status: text, status2: nullableText, event: nullableText, currency: text, created_at: timestamp,
    affiliate_name: text, affiliate_code: text,
  })) }),
  list_affiliates: object({ affiliates: array(affiliate) }),
  create_affiliate: object({ affiliate, tracking_url: text }),
  get_rotation: rotation,
  set_rotation: rotation,
  create_path: object({ path }),
  update_path: object({ path }),
  list_rules: object({ rules: array(rule) }),
  create_rule: object({ rule }),
  update_rule: object({ rule }),
  get_traffic_filter: object({ filter }),
  set_traffic_filter: object({ filter }),
  list_blocklist: object({ entries: array(blocklist), datacenter_asns: array(integer) }),
  add_to_blocklist: object({ entries: array(blocklist) }),
  list_groups: object({ groups: array(entity) }),
  create_group: object({ group: entity }),
  list_traffic_sources: object({ traffic_sources: array(source) }),
  create_traffic_source: object({ traffic_source: source }),
  update_traffic_source: object({ traffic_source: source }),
  list_networks: object({ networks: array(entity) }),
  create_network: object({ network: entity }),
  update_network: object({ network: entity }),
  list_landers: object({ landers: array(lander) }),
  create_lander: object({ lander }),
  update_lander: object({ lander }),
  list_offers: object({ offers: array(offer) }),
  create_offer: object({ offer }),
  update_offer: object({ offer }),
  list_postbacks: object({ postbacks: array(postback) }),
  create_postback: object({ postback }),
  update_postback: object({ postback }),
  get_postback_key: postbackKey,
  set_postback_key_required: postbackKey,
  rotate_postback_key: postbackKey,
  list_postback_deliveries: object({ deliveries: array(object({
    id: text, postback_id: text, conversion_id: nullableText, url: text, status_code: nullableNumber,
    error: nullableText, attempt: integer, ok: boolean, created_at: timestamp,
  })) }),
  report_campaigns: object({ campaigns: array(object({ ...programFields, metrics: object(metricFields), currency: text, ...eventFields })) }),
  report_grouped: object({ by: text, rows: array(object(groupedFields)) }),
  report_trends: object({ trends: array(object({
    date: text, clicks: integer, lp_clicks: integer, leads: integer, revenue_cents: cents, cost_cents: cents,
    events: eventFields.events,
  })) }),
  report_drilldown: {
    ...object({ by: array(text), timezone: text, rows: array({ $ref: "#/$defs/row" }) }),
    $defs: { row: object({ ...groupedFields, dimension: text, children: array({ $ref: "#/$defs/row" }) }, Object.keys(groupedFields)) },
  },
  list_triggers: object({ triggers: array(trigger) }),
  create_trigger: object({ trigger }),
  get_settings: object({ settings: object({ timezone: text }) }),
  update_settings: object({ settings: object({ timezone: text }) }),
  list_automation_rules: object({ rules: array(automationRule) }),
  create_automation_rule: object({ rule: automationRule }),
  set_automation_rule_enabled: object({ rule: automationRule }),
  run_automation_rule: object({ result: object({
    rule_id: text, fired: boolean, message: nullableText, blacklisted: array(text), notified: object({ email: boolean, webhook: boolean }),
  }) }),
  list_zone_blacklist: {
    type: "object", properties: { blacklist: array(zone), result: { type: "string", description: "Plain text or CSV export when format=txt or csv." } },
    anyOf: [{ required: ["blacklist"] }, { required: ["result"] }], additionalProperties: false,
  },
  add_zones_to_blacklist: object({ added: array(text, "Newly blacklisted zone values; existing entries are excluded.") }),
  list_tracking_domains: object({ tracking_domains: array(domain), automatic: boolean, cname_target: nullableText, setup: text }),
  add_tracking_domain: object({ tracking_domain: domain, setup: text }),
  set_campaign_tracking_domain: object({ ok: boolean, tracking_domain_id: nullableText }),
  list_notes: object({ notes: array(note) }),
  add_note: object({ note }),
  list_team: object({ members: array(member), role: text, account_id: text }),
  list_activity: object({ entries: array(object({ id: text, actor_email: text, action: text, created_at: timestamp })) }),
  invite_team_member: object({ member }),
  list_source_templates: object({
    traffic_sources: array(object({ id: text, name: text, cost_type: text, tokens: array(token), postback_url: nullableText, verified: boolean })),
    networks: array(object({ id: text, name: text, incoming_postback_urls: postbackUrls, offer_url_suffix: text })),
    cost_providers: array(object({ id: text, name: text })),
  }),
  create_traffic_source_from_template: object({ traffic_source: source, settings: sourceSettings, postback: nullable(postback) }),
  create_network_from_template: object({ network: entity, template: text, incoming_postback_urls: postbackUrls, offer_url_suffix: text }),
  get_traffic_source_settings: object({ settings: sourceSettings }),
  update_traffic_source_settings: object({ settings: sourceSettings }),
  sync_traffic_source_cost: object({ result: object({
    traffic_source_id: text, provider: text, days: array(text), rows: integer, updates: integer, clicks_updated: integer, total_cents: cents,
  }) }),
  get_campaign_source_link: object({
    traffic_source_id: nullableText, campaign_url: nullableText, tracking_url: nullableText, tokens: array(token),
    labels: dictionary(text, "Report labels keyed by click slot, for example sub1."),
  }),
  list_cost_updates: object({ cost_updates: array(costUpdate) }),
  update_campaign_cost: object({ cost_update: costUpdate }),
};

for (const name of [
  "delete_campaign", "delete_path", "delete_rule", "remove_from_blocklist", "delete_group",
  "delete_traffic_source", "delete_network", "delete_lander", "delete_offer", "delete_postback",
  "delete_trigger", "delete_automation_rule", "remove_blacklisted_zone", "delete_tracking_domain", "remove_team_member",
]) contracts[name] = success;

export function outputSchemaFor(name: string): Schema {
  const result = contracts[name];
  if (!result) throw new Error(`Missing MCP output schema for ${name}`);
  return result;
}
