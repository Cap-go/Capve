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
const describe = (value: Schema, description: string): Schema => ({ ...value, description });
const array = (items: Schema, description?: string): Schema => ({ type: "array", items, ...(description ? { description } : {}) });
const object = (properties: Record<string, Schema>, required = Object.keys(properties)): Schema => ({
  type: "object", properties, required, additionalProperties: true,
});
const dictionary = (values: Schema, description: string): Schema => ({ type: "object", additionalProperties: values, description });
const nullable = (value: Schema): Schema => ({ anyOf: [value, { type: "null" }] });
const entityFields = {
  id: describe(text, "Record id to pass to tools that operate on this entity."),
  user_id: describe(text, "Owner account id for this record."),
  name: describe(text, "Display name shown in the dashboard and reports."),
  created_at: describe(timestamp, "Record creation time, in Unix milliseconds."),
};
const entity = object(entityFields);
const programFields = {
  ...entityFields,
  slug: describe(text, "Campaign slug generated from its name."),
  destination_url: describe(nullableText, "Default redirect destination; null when none is configured."),
  campaign_key: describe(nullableText, "Public key used in /c/{key} tracking links; not a conversion secret."),
  group_id: describe(nullableText, "Assigned campaign group id, or null when ungrouped."),
  traffic_source_id: describe(nullableText, "Assigned traffic source id, or null when unassigned."),
  tags: describe(nullableText, "Stored tag text, conventionally comma-separated; null when cleared."),
  status: describe(text, "Campaign lifecycle state: active, paused or archived."),
};
const program = describe(object(programFields), "Campaign configuration; API field names use program for a campaign.");
const source = describe(object({
  ...entityFields,
  cost_type: describe(text, "Charging model: CPC per click, CPM per thousand clicks, or CPA once per converted click."),
  default_cost_cents: describe(cents, "Fallback charge in cents for one unit of the cost model; may contain fractional cents."),
  postback_percent: describe(number, "Percentage of approved conversions sent to the source’s outgoing postbacks."),
}), "Stored traffic-source configuration.");
const lander = describe(object({ ...entityFields, url: describe(text, "Landing-page destination URL used by campaign paths.") }), "Reusable landing-page record.");
const offer = describe(object({
  ...entityFields, network_id: describe(nullableText, "Affiliate network grouping this offer, or null when unassigned."),
  url: describe(text, "Offer destination URL, which may contain tracking macros."),
  payout_cents: describe(cents, "Base conversion payout in cents when the postback omits its amount; event-specific payouts are handled separately."),
}), "Reusable conversion-offer record.");
const affiliateFields = {
  id: describe(text, "Affiliate record id."), program_id: describe(text, "Campaign this affiliate belongs to."),
  name: describe(text, "Display label for the affiliate or traffic placement."),
  code: describe(text, "Public tracking code used in /r/{code} links and affiliate_code conversion calls."),
  created_at: timestamp,
};
const affiliate = describe(object(affiliateFields), "Affiliate identity and tracking code for a campaign.");
const metricFields = {
  clicks: describe(integer, "Recorded clicks in this report row."),
  bot_clicks: describe(integer, "Clicks flagged as bots within the click total."),
  lp_clicks: describe(integer, "Tracked clicks from landing pages to offers."),
  leads: describe(integer, "Distinct converted clicks plus conversions without a click; multiple events on one click count once."),
  revenue_cents: describe(cents, "Approved revenue in cents in the accompanying report currency."),
  cost_cents: describe(cents, "Recorded traffic cost in cents; can include fractional cents."),
  profit_cents: describe(cents, "Revenue minus cost, in cents."),
  lp_ctr: describe(number, "Landing-page clicks divided by non-bot clicks, as a percentage."),
  cr: describe(number, "Conversions divided by non-bot clicks, as a percentage capped at 100."),
  epc_cents: describe(cents, "Revenue per non-bot click in cents."),
  cpc_cents: describe(cents, "Cost per non-bot click in cents."),
  roi: { ...nullableNumber, description: "Return on investment percent; null when cost is zero." },
};
const eventFields = {
  events: dictionary(integer, "Approved conversion counts keyed by event name."),
  event_metrics: dictionary(object({
    count: describe(integer, "Approved conversions for this event."),
    revenue_cents: describe(cents, "Approved event revenue in cents in the report currency."),
    cr: describe(number, "Event conversions divided by non-bot clicks, as a percentage capped at 100."),
    cpa_cents: describe(nullableNumber, "Cost per event conversion in cents; null when cost or the event count is zero or unavailable."),
  }), "Metrics keyed by conversion event name."),
  revenue_by_currency: dictionary(cents, "Revenue by currency code; never sum different currencies."),
};
const groupedFields = {
  key: nullableText, label: text, unique_clicks: integer, bot_clicks: integer,
  metrics: object(metricFields), currency: text, ...eventFields,
};
const statsFields = {
  clicks: integer, bots: integer, conversions: integer, revenue_cents: cents, conversion_rate: number, ...eventFields,
};
const path = describe(object({
  id: describe(text, "Path id for update_path, delete_path or fixed-path selection."),
  rotation_id: describe(text, "Campaign rotation containing this path."),
  name: describe(text, "Display label identifying the path."),
  flow_type: describe(text, "Visitor journey: direct URL, lander, offer, or lander followed by offer."),
  weight: describe(integer, "Relative traffic share among paths; zero receives no traffic."),
  sort_order: describe(integer, "Selection priority for top_to_bottom rotation, lower first."),
  direct_url: describe(nullableText, "Destination for a direct flow, or null when unset."),
  lander_id: describe(nullableText, "Single landing-page target, or null; weighted landers can override this."),
  offer_id: describe(nullableText, "Single offer target, or null; weighted offers can override this."),
  enabled: describe(boolean, "Whether the path is available for traffic selection."),
  created_at: timestamp,
  rule_id: describe(nullableText, "Routing rule owning the path; null means the default path pool."),
}), "Traffic path configuration within a campaign rotation.");
const rule = describe(object({
  id: describe(text, "Routing rule id for updates, deletion or assigning paths."),
  program_id: describe(text, "Campaign whose incoming clicks this rule evaluates."),
  name: describe(text, "Display label identifying the rule."),
  sort_order: describe(integer, "Evaluation priority, lower first."),
  timezone: describe(text, "IANA timezone used for weekday and hour conditions."),
  enabled: describe(boolean, "Whether routing evaluates this rule."),
  created_at: timestamp,
  conditions: array(object({
    field: describe(text, "Click attribute being tested."),
    op: describe(text, "in matches any listed value; not_in excludes all listed values."),
    values: array(text, "Alternative match values for this condition, normalized for the selected field."),
  }), "Conditions that must all match for the rule to apply."),
  paths: array(path, "Traffic paths assigned to this rule, when included by the endpoint."),
}, ["id", "program_id", "name", "conditions", "timezone", "enabled", "sort_order", "created_at"]), "Campaign routing rule; the first matching enabled rule supplies its paths.");
const rotation = object({
  rotation: describe(object({
    id: describe(text, "Rotation configuration id."), program_id: describe(text, "Campaign whose paths are selected."),
    mode: describe(text, "Path selection strategy: weighted random, sticky visitor assignment, fixed path or ordered selection."),
    fixed_path_id: describe(nullableText, "Selected path for fix_on mode, or null when unset."), created_at: timestamp,
  }), "Campaign-level path selection settings."),
  paths: array(path, "Default traffic paths used when no routing rule supplies paths."),
  rules: array(rule, "Routing rules in evaluation order, including their assigned paths."),
});
const filter = describe(object({
  program_id: describe(text, "Campaign whose traffic is classified and routed."),
  bot_action: describe(text, "route follows normal routing for flagged clicks; safe_page redirects them to the configured safe page."),
  safe_page_url: describe(nullableText, "Safe-page destination for flagged clicks, or null when unset."),
  block_datacenter: describe(boolean, "Whether known cloud/hosting ASNs are flagged as bots."),
}), "Bot handling configuration, including account-blocklisted traffic.");
const blocklist = object({
  id: describe(text, "Entry id accepted by remove_from_blocklist."),
  kind: describe(text, "Matching method: IP/CIDR, ASN or user-agent substring."),
  value: describe(text, "Address, network, ASN or substring matched against incoming clicks."), created_at: timestamp,
});
const postback = describe(object({
  id: describe(text, "Outgoing postback id for editing, deletion or inspecting deliveries."),
  user_id: entityFields.user_id,
  program_id: describe(nullableText, "Campaign owning this postback, or null for another owner type."),
  traffic_source_id: describe(nullableText, "Traffic source owning this postback, or null for another owner type."),
  network_id: describe(nullableText, "Affiliate network owning this postback, or null for another owner type."),
  event: describe(nullableText, "Conversion event that triggers this postback; null matches every event."),
  url: describe(text, "Outgoing notification URL template; macros are substituted during delivery."), created_at: timestamp,
}), "Outgoing conversion-notification configuration.");
const postbackKey = object({ postback_key: describe(object({
  key: describe(text, "Current incoming postback authentication key; share only with the sending network/server."),
  required: describe(boolean, "Whether incoming postbacks without a valid key are rejected."),
  postback_url: describe(text, "Incoming postback URL template containing the current key for network setup."),
}), "Current account incoming-postback credentials and enforcement setting.") });
const automationRule = describe(object({
  ...entityFields, program_id: describe(text, "Campaign evaluated by the rule."),
  kind: describe(text, "zone_blacklist records unconverted zones; alert evaluates campaign ROI/spend thresholds."),
  dimension: describe(nullableText, "Click field holding zone identifiers for blacklisting; null when unused."),
  min_clicks: describe(nullableNumber, "Minimum clicks per zone before checking for zero conversions; null when unused."),
  event: describe(nullableText, "Conversion event counted by a blacklist rule; null counts any conversion."),
  roi_below: describe(nullableNumber, "Alert ROI threshold in percent; null disables this condition."),
  spend_above_cents: describe(nullableNumber, "Alert cost threshold in cents; null disables this condition."),
  window_hours: describe(integer, "Lookback duration in hours and cooldown between repeated alert notifications."),
  notify_email: describe(nullableText, "Notification recipient email, or null when email is not configured."),
  webhook_url: describe(nullableText, "Notification endpoint receiving JSON POSTs, or null when unused."),
  enabled: describe(boolean, "Whether scheduled evaluation is enabled."),
  last_run_at: describe(nullableNumber, "Last evaluation time in Unix milliseconds, or null if never run."),
  last_fired_at: describe(nullableNumber, "Last time the rule fired, in Unix milliseconds, or null if never fired."),
}), "Stored automation configuration and latest evaluation timestamps.");
const zone = object({
  id: describe(text, "Blacklist entry id accepted by remove_blacklisted_zone."), user_id: entityFields.user_id,
  program_id: describe(text, "Campaign this blacklist entry belongs to."),
  dimension: describe(text, "Click field holding the traffic-source zone identifier."),
  value: describe(text, "Zone identifier recorded for export to the traffic source."),
  rule_id: describe(nullableText, "Id of the automation rule that created the entry, retained even if the rule is deleted; null for manual entries."),
  reason: describe(nullableText, "Recorded explanation for blacklisting, or null when absent."), created_at: timestamp,
});
const domain = describe(object({
  id: describe(text, "Tracking-domain id for campaign assignment or deletion."), user_id: entityFields.user_id,
  hostname: describe(text, "Custom hostname used for tracking links."), created_at: timestamp,
  status: describe(text, "Setup state: pending, active, failed or manual."),
  ssl_status: describe(nullableText, "Cloudflare certificate provisioning status, or null when unavailable."),
  dns_records: array(object({
    type: describe(text, "DNS record type to create."), name: describe(text, "DNS record hostname."),
    value: describe(text, "DNS record target or verification value."),
  }), "DNS records required to complete hostname setup."),
  errors: array(text, "Reported setup or certificate errors."),
  checked_at: describe(nullableNumber, "Last provisioning check in Unix milliseconds, or null if not checked."),
}), "Registered tracking hostname and provisioning details.");
const token = object({
  param: describe(text, "Incoming tracking URL query parameter."),
  name: describe(text, "Human-readable report label for this parameter."),
  slot: describe(text, "Click field storing the parameter value."),
  macro: describe(text, "Traffic-source placeholder inserted into the campaign URL."),
  kind: describe(text, "Whether this token identifies the source campaign or zone for cost synchronization."),
}, ["param", "name", "slot"]);
const sourceSettings = describe(object({
  traffic_source_id: describe(text, "Traffic source these integration settings belong to."),
  template: describe(nullableText, "Preset id used to create this source, or null for a custom source."),
  tokens: array(token, "Named query-parameter mappings used in tracking URLs and reports."),
  api_provider: describe(nullableText, "Configured cost API provider id, or null when disabled."),
  has_api_key: describe(boolean, "Whether an encrypted cost API key is stored; the key itself is not returned."),
  last_sync_at: describe(nullableNumber, "Last recorded cost-sync attempt in Unix milliseconds, or null if none."),
  last_sync_error: describe(nullableText, "Latest recorded sync error; null when no error is stored."),
}), "Traffic-source token mappings and cost integration status, without credentials.");
const costUpdate = describe(object({
  id: describe(text, "Cost-update audit record id."), user_id: entityFields.user_id,
  program_id: describe(nullableText, "Campaign targeted by a manual update; null for source-wide updates."),
  traffic_source_id: describe(nullableText, "Traffic source targeted by an API update, or null for campaign-only updates."),
  from_ms: describe(timestamp, "Inclusive start of the affected click window, in Unix milliseconds."),
  to_ms: describe(timestamp, "Inclusive end of the affected click window, in Unix milliseconds."),
  filter_dim: describe(nullableText, "Click-filter dimensions stored as comma-separated names; null for an unfiltered update."),
  filter_value: describe(nullableText, "Filter values stored in the same order as filter_dim, comma-separated; null when unfiltered."),
  total_cents: describe(cents, "Aggregate spend submitted for the matching clicks, in cents."),
  clicks_updated: describe(integer, "Number of clicks whose costs were replaced."),
  origin: describe(text, "Whether the update was submitted manually or through API cost synchronization."), created_at: timestamp,
}), "Audit record of a cost replacement over a click window.");
const note = describe(object({
  id: describe(text, "Note record id."), user_id: entityFields.user_id,
  entity_type: describe(text, "Record category the note belongs to; program means campaign."),
  entity_id: describe(text, "Id of the record this note is attached to."), body: describe(text, "Saved note text."),
  created_at: timestamp, updated_at: describe(timestamp, "Last note update time, in Unix milliseconds."),
}), "Note attached to a campaign or account entity.");
const member = describe(object({
  id: describe(text, "Membership or invitation id accepted by remove_team_member."),
  owner_user_id: describe(text, "Owner account the invitation grants access to."),
  email: describe(text, "Invited teammate’s email address."),
  role: describe(text, "Granted account access: admin can edit; viewer can read."), created_at: timestamp,
  accepted_at: describe(nullableNumber, "Invitation acceptance time in Unix milliseconds; null for a pending invite."),
}), "Team membership or pending invitation; distinct from a user record.");
const trigger = describe(object({
  ...entityFields, program_id: describe(nullableText, "Campaign receiving this trigger; null applies across the account."),
  event: describe(text, "Tracking event that invokes the webhook: click or conversion."),
  action_type: describe(text, "Configured trigger action type (webhook)."),
  action_url: describe(text, "HTTP GET webhook URL template, expanded with event payload values."),
  enabled: describe(boolean, "Whether matching tracking events invoke this trigger."),
}), "Stored tracking-event webhook configuration.");
const success = object({ ok: { type: "boolean", const: true, description: "The requested removal or archival completed successfully." } });
const postbackUrls = object({
  default: describe(text, "Incoming conversion postback template using this network’s macros."),
  registration: describe(text, "Incoming postback template for registration events."),
  ftd: describe(text, "Incoming postback template for first-time-deposit events."),
});

const biddingConfig = describe(object({
  enabled: describe(boolean, "Whether this campaign has opted into the recommendation beta."),
  dimension: describe(text, "Click sub-token containing the Adcash zone identifier."),
  currency: describe(text, "Confirmed spend currency used to compare revenue; no currency conversion is performed."),
  window_hours: describe(integer, "Duration in hours of the analyzed click window."),
  conversion_lag_hours: describe(integer, "Recent hours excluded from the click window to allow conversions to arrive."),
  min_clicks: describe(integer, "Minimum zone clicks before a bid change can be recommended."),
  min_spend_cents: describe(integer, "Minimum zone spend in cents before a bid change can be recommended."),
  min_conversions: describe(integer, "Minimum distinct converted clicks before recommending a bid increase."),
  target_roi: describe(integer, "Target profit divided by cost, as a percentage."),
  max_change_pct: describe(integer, "Maximum absolute recommended percentage change to the existing bid."),
}), "Opt-in and evidence limits for review-only bidding recommendations; these do not apply external bids.");
const biddingSettings = {
  config: biddingConfig,
  revision: describe(integer, "Settings revision attached to analyses; changing settings invalidates the visible latest run."),
  next_run_at: describe(timestamp, "Earliest next analysis after the cooldown, in Unix milliseconds; zero when no cooldown is stored. This does not schedule a run."),
};
const biddingRun = describe(object({
  id: describe(text, "Stored analysis run id."), created_at: timestamp,
  result: describe(object({
    model: describe(text, "Workers AI model used for this analysis."),
    from: describe(timestamp, "Inclusive start of the mature click window, in Unix milliseconds."),
    to: describe(timestamp, "Exclusive end of the mature click window, in Unix milliseconds."), config: biddingConfig,
    decisions: array(object({
      zone: describe(text, "Adcash zone identifier from the configured click dimension."),
      clicks: describe(integer, "Eligible non-bot clicks for the zone in the analyzed window."),
      conversions: describe(integer, "Distinct clicks with an approved, non-pending conversion; multiple events on one click count once."),
      cost_cents: describe(cents, "Recorded zone spend in cents in the configured currency."),
      revenue_cents: describe(cents, "Approved zone revenue in cents in the configured currency."),
      roi: describe(nullableNumber, "Zone profit divided by cost as a percentage; null when cost is zero."),
      change_pct: describe(integer, "Suggested bid change percentage; zero means hold. No bid is applied."),
      reason: describe(text, "Explanation for holding, raising or lowering the bid recommendation."),
    }), "Per-zone recommendations and their supporting aggregate metrics."),
  }), "Model output after deterministic evidence and bid-change limits are enforced."),
}), "Saved review-only bidding analysis.");

const onboarding = object({
  accountId: text, campaignId: nullableText,
  steps: object({ verify: boolean, campaign: boolean, click: boolean, conversion: boolean }),
  nextStep: { anyOf: [{ type: "string", enum: ["verify", "campaign", "click", "conversion"] }, { type: "null" }] },
  complete: boolean, dismissed: boolean, emailTips: boolean,
});
const contracts: Record<string, Schema> = {
  get_onboarding: onboarding,
  update_onboarding: onboarding,
  get_bidding_settings: object({
    ...biddingSettings, available: describe(boolean, "Whether this install has a Workers AI binding; not a live model-health check."),
    model: describe(text, "Workers AI model configured for recommendations."), beta: describe(boolean, "Marks this feature as beta."),
  }),
  set_bidding_settings: object(biddingSettings),
  analyze_bidding: object({ run: biddingRun }),
  get_bid_recommendations: object({ run: describe(nullable(biddingRun), "Latest analysis for the current settings revision; null if none exists or settings changed.") }),
  whoami: object({ user: describe(nullable(object({
    id: describe(text, "Authenticated user id."), email: describe(text, "Authenticated user’s email address."),
    role: describe(text, "Effective role in the selected account: owner, admin or viewer."),
    account_id: describe(text, "Account owner id used to scope dashboard data."),
    account_email: describe(text, "Selected account owner’s email address."),
    impersonating: describe(boolean, "Whether the session is using support impersonation."),
    is_platform_admin: describe(boolean, "Whether the authenticated user has platform administration access."),
    email_verified: describe(boolean, "Whether the authenticated user’s email is verified."),
  })), "Authenticated identity and effective account context; null if there is no authenticated user.") }),
  get_stripe_setup_status: object({
    checkedAt: describe(timestamp, "Time these diagnostics were requested, in Unix milliseconds."),
    billingEnabled: describe(boolean, "Whether hosted billing and reporting limits are enabled on this install."),
    automaticTaxEnabled: describe(boolean, "Whether Checkout is configured to collect automatic tax."),
    mode: describe(text, "Stripe key mode: live, test or unknown."),
    accountId: describe(nullableText, "Stripe account id verified by the live probe; null if unavailable."),
    checks: array(object({
      id: describe(text, "Diagnostic identifier."), label: describe(text, "Human-readable check name."),
      status: describe(text, "ready passed, attention needs action, disabled is not enabled, and unknown could not be verified."),
      detail: describe(text, "Observed configuration or reason the check needs attention."),
      href: describe(text, "Relevant Stripe dashboard page when available."),
    }, ["id", "label", "status", "detail"]), "Configuration and live Stripe probe results; no credential values are returned."),
  }),
  get_billing_status: object({
    enabled: describe(boolean, "Whether hosted billing and reporting limits are enabled."),
    plan: describe(text, "Account billing plan identifier."), trialEndsAt: describe(timestamp, "Trial expiration in Unix milliseconds."),
    subscriptionStatus: describe(nullableText, "Stored Stripe subscription state; null when no state is recorded."),
    unlimited: describe(boolean, "Whether the account is comped with no click allowance or trial expiry."),
    clicks: describe(integer, "Account click usage in the reported UTC calendar month."),
    clickLimit: describe(integer, "Monthly click allowance for the account’s plan; not enforced when unlimited is true."),
    period: describe(text, "Usage month in UTC, formatted YYYY-MM."),
    reportsAllowed: describe(boolean, "Whether billing currently permits report access."),
    reason: describe(nullableText, "Reporting lock reason: traffic_limit or trial_expired; null when reports are allowed."),
    checkoutReady: describe(boolean, "Whether Stripe key and both plan price ids are configured; does not verify them with Stripe."),
    hasCustomer: describe(boolean, "Whether the account has a stored Stripe customer id."),
  }),
  list_campaigns: object({ programs: array(program, "Campaigns visible to this account; archived campaigns are excluded.") }),
  get_campaign: object({ program }),
  create_campaign: object({ program, convert_secret: { type: "string", description: "Server-only conversion secret shown once. Store securely; never embed in client code." } }),
  update_campaign: object({ program }),
  clone_campaign: object({ program }),
  bulk_update_campaigns: object({ updated: describe(integer, "Number of owned campaign records updated.") }),
  get_campaign_tracking: object({ tracking: describe(object({
    postback_url: describe(text, "Incoming postback URL template to configure at the network."),
    postback_key_required: describe(boolean, "Whether incoming postbacks require the account’s valid key."),
    campaign_url: describe(nullableText, "Campaign tracking link, or null when no tracking key exists."),
    tracking_domain: describe(nullable(object({ id: describe(text, "Assigned tracking-domain record id."), hostname: describe(text, "Assigned custom tracking hostname.") })), "Assigned custom tracking domain, or null when the app hostname is used."),
    offer_url_macro: describe(text, "Click-id macro to include in offer URLs for conversion attribution."),
    redirect_params: array(text, "Tracking parameters available on redirect URLs."),
  }), "Links and macros for connecting traffic sources and affiliate networks.") }),
  get_campaign_stats: object({ program, totals: object(statsFields), currency: text, affiliates: array(object({ ...affiliateFields, ...statsFields })) }),
  list_clicks: object({ clicks: array(object({
    id: describe(text, "Tracked click id used for conversion attribution."), program_id: describe(text, "Campaign that received the click."),
    affiliate_id: describe(text, "Affiliate credited with the click."), ip: describe(nullableText, "Recorded visitor IP address, or null when unavailable."),
    user_agent: describe(nullableText, "Recorded browser user-agent string, or null when unavailable."), created_at: timestamp,
    affiliate_name: describe(text, "Affiliate display name."), affiliate_code: describe(text, "Affiliate’s public tracking code."),
    converted: describe(boolean, "Whether any conversion record is linked to this click, regardless of approval status."),
  }), "Requested page of campaign click records, newest first.") }),
  list_conversions: object({ conversions: array(object({
    id: describe(text, "Conversion record id."), program_id: describe(text, "Campaign credited with the conversion."),
    affiliate_id: describe(text, "Affiliate credited with the conversion."),
    click_id: describe(nullableText, "Attributed click id, or null for a conversion without a click."),
    order_id: describe(text, "Order or transaction reference supplied with the conversion."),
    amount_cents: describe(cents, "Recorded conversion payout in cents in currency."),
    status: describe(text, "Stored conversion approval status."), status2: describe(nullableText, "Additional status supplied by the sender, or null."),
    event: describe(nullableText, "Conversion event name, or null for an unspecified event."),
    currency: describe(text, "Currency of amount_cents."), created_at: timestamp,
    affiliate_name: describe(text, "Affiliate display name."), affiliate_code: describe(text, "Affiliate’s public tracking code."),
  }), "Requested page of campaign conversion records, newest first.") }),
  list_affiliates: object({ affiliates: array(affiliate, "Affiliates registered for the selected campaign.") }),
  create_affiliate: object({ affiliate, tracking_url: describe(text, "Ready-to-use /r/{code} link for this affiliate.") }),
  get_rotation: rotation,
  set_rotation: rotation,
  create_path: object({ path }),
  update_path: object({ path }),
  list_rules: object({ rules: array(rule, "Campaign routing rules in evaluation order, with their paths.") }),
  create_rule: object({ rule }),
  update_rule: object({ rule }),
  get_traffic_filter: object({ filter }),
  set_traffic_filter: object({ filter }),
  list_blocklist: object({ entries: array(blocklist, "Account-wide bot-matching entries."), datacenter_asns: array(integer, "Built-in cloud/hosting ASN numbers used by datacenter filtering.") }),
  add_to_blocklist: object({ entries: array(blocklist, "Complete account blocklist after adding the submitted values, including existing entries.") }),
  list_groups: object({ groups: array(entity, "Campaign groups owned by this account.") }),
  create_group: object({ group: describe(entity, "Created campaign organization group.") }),
  list_traffic_sources: object({ traffic_sources: array(source, "Traffic sources owned by this account.") }),
  create_traffic_source: object({ traffic_source: source }),
  update_traffic_source: object({ traffic_source: source }),
  list_networks: object({ networks: array(entity, "Affiliate networks owned by this account.") }),
  create_network: object({ network: describe(entity, "Created affiliate-network grouping record.") }),
  update_network: object({ network: describe(entity, "Affiliate-network record after the requested rename.") }),
  list_landers: object({ landers: array(lander, "Reusable landing pages owned by this account.") }),
  create_lander: object({ lander }),
  update_lander: object({ lander }),
  list_offers: object({ offers: array(offer, "Reusable offers owned by this account.") }),
  create_offer: object({ offer }),
  update_offer: object({ offer }),
  list_postbacks: object({ postbacks: array(postback, "Outgoing postbacks matching the owner filters.") }),
  create_postback: object({ postback }),
  update_postback: object({ postback }),
  get_postback_key: postbackKey,
  set_postback_key_required: postbackKey,
  rotate_postback_key: postbackKey,
  list_postback_deliveries: object({ deliveries: array(object({
    id: describe(text, "Delivery-attempt record id."), postback_id: describe(text, "Outgoing postback configuration that was delivered."),
    conversion_id: describe(nullableText, "Conversion that initiated delivery, or null when not recorded."),
    url: describe(text, "Actual notification URL after macro substitution."),
    status_code: describe(nullableNumber, "HTTP response status, or null when no HTTP response was received."),
    error: describe(nullableText, "Recorded delivery error, or null when none was recorded."),
    attempt: describe(integer, "Attempt number: one for the initial request, two for its retry."),
    ok: describe(boolean, "Whether the delivery received a successful HTTP response."), created_at: timestamp,
  }), "Recent attempts for the selected outgoing postback, newest first.") }),
  report_campaigns: object({ campaigns: array(object({ ...programFields, metrics: object(metricFields), currency: text, ...eventFields })) }),
  report_grouped: object({ by: text, rows: array(object(groupedFields)) }),
  report_trends: object({ trends: array(object({
    date: describe(text, "Report day in the account timezone, formatted YYYY-MM-DD."),
    clicks: metricFields.clicks, lp_clicks: metricFields.lp_clicks, leads: metricFields.leads,
    revenue_cents: describe(cents, "Approved revenue in cents in the most-used report currency. This endpoint omits its code; use report_grouped by date for currency metadata."), cost_cents: metricFields.cost_cents,
    events: eventFields.events,
  }), "Daily campaign aggregates for the requested window.") }),
  report_drilldown: {
    ...object({ by: array(text), timezone: text, rows: array({ $ref: "#/$defs/row" }) }),
    $defs: { row: object({ ...groupedFields, dimension: text, children: array({ $ref: "#/$defs/row" }) }, Object.keys(groupedFields)) },
  },
  list_triggers: object({ triggers: array(trigger, "Account event webhooks matching the campaign filter.") }),
  create_trigger: object({ trigger }),
  get_settings: object({ settings: describe(object({ timezone: describe(text, "Account IANA timezone for report date grouping and date-only bounds.") }), "Current reporting settings.") }),
  update_settings: object({ settings: describe(object({ timezone: describe(text, "Account IANA timezone for report date grouping and date-only bounds.") }), "Reporting settings after the timezone update.") }),
  list_automation_rules: object({ rules: array(automationRule, "Account automation rules matching the campaign filter.") }),
  create_automation_rule: object({ rule: automationRule }),
  set_automation_rule_enabled: object({ rule: automationRule }),
  run_automation_rule: object({ result: describe(object({
    rule_id: describe(text, "Automation rule evaluated."),
    fired: describe(boolean, "Whether this run added blacklist entries or triggered an alert outside its cooldown."),
    message: describe(nullableText, "Notification text generated when the rule fired; null otherwise."),
    blacklisted: array(text, "Zone values newly added by this run; existing entries are excluded."),
    notified: describe(object({
      email: describe(boolean, "Whether the configured email send completed without throwing. This does not prove delivery; an install without email transport can return true without sending. False also covers no email attempt."),
      webhook: describe(boolean, "Whether a webhook returned a successful HTTP response; false also covers no webhook attempt."),
    }), "Notification outcomes for this evaluation."),
  }), "Immediate evaluation outcome, including blacklist changes and notifications.") }),
  list_zone_blacklist: {
    type: "object",
    description: "JSON format returns blacklist entries. Text and CSV formats return the export string in result; the MCP text content is the JSON serialization of this same envelope.",
    properties: {
      blacklist: array(zone, "Stored entries for JSON format, including ids required to remove individual entries."),
      result: { type: "string", description: "Export payload for txt or csv: newline-separated unique zone values, or CSV with dimension,value,reason,rule_id,blacklisted_at columns. Read this string rather than treating the MCP text content as raw CSV." },
    },
    anyOf: [{ required: ["blacklist"] }, { required: ["result"] }], additionalProperties: false,
  },
  add_zones_to_blacklist: object({ added: array(text, "Newly blacklisted zone values; existing entries are excluded.") }),
  list_tracking_domains: object({
    tracking_domains: array(domain, "Tracking hostnames registered to this account."),
    automatic: describe(boolean, "Whether automatic Cloudflare hostname provisioning is configured on this install."),
    cname_target: describe(nullableText, "CNAME destination for automatic setup, or null when unavailable."),
    setup: describe(text, "Instructions for completing tracking hostname setup."),
  }),
  add_tracking_domain: object({ tracking_domain: domain, setup: describe(text, "Instructions for completing this hostname’s setup.") }),
  set_campaign_tracking_domain: object({
    ok: describe(boolean, "Whether the campaign domain assignment was saved."),
    tracking_domain_id: describe(nullableText, "Assigned tracking-domain id; null selects the app URL."),
  }),
  list_notes: object({ notes: array(note, "Notes for the requested record, newest updated first.") }),
  add_note: object({ note }),
  list_team: object({
    members: array(member, "Teammate memberships and pending invitations; the owner is not a membership row."),
    role: describe(text, "Caller’s effective role in this account."), account_id: describe(text, "Owner account id for this team."),
  }),
  list_activity: object({ entries: array(object({
    id: describe(text, "Audit entry id."), actor_email: describe(text, "Email of the actor recorded for this change."),
    action: describe(text, "Human-readable description of the recorded account action."), created_at: timestamp,
  }), "Recent account audit entries, newest first; excludes click traffic.") }),
  invite_team_member: object({ member }),
  list_source_templates: object({
    traffic_sources: array(object({
      id: describe(text, "Preset id accepted by create_traffic_source_from_template."), name: describe(text, "Traffic-source preset name."),
      cost_type: describe(text, "Charging model supplied by this traffic-source preset."),
      tokens: array(token, "Preset query parameters, source macros and click-slot mappings."),
      postback_url: describe(nullableText, "Single all-events postback, or null when the preset uses per-event postbacks."),
      postbacks: array(object({
        event: describe(nullableText, "Conversion event that fires this postback, or null for every event."),
        url: describe(text, "Outgoing postback URL with placeholders such as YOUR_KEY or YOUR_ID to replace before use."),
      }, ["event", "url"]), "Postbacks created with the source. One all-events URL, or one URL per event."),
      cost_api: describe(nullableText, "Cost API pre-selected for this preset, or null when none exists."),
      verified: describe(boolean, "Whether this preset is marked verified in the built-in catalog."),
    }), "Built-in traffic-source presets."),
    networks: array(object({
      id: describe(text, "Preset id accepted by create_network_from_template."), name: describe(text, "Affiliate-network preset name."),
      incoming_postback_urls: describe(postbackUrls, "Network-specific incoming conversion URL templates."),
      offer_url_suffix: describe(text, "Query parameter suffix to append to offer URLs for click attribution."),
    }), "Built-in affiliate-network presets."),
    cost_providers: array(object({ id: describe(text, "Provider id accepted by update_traffic_source_settings."), name: describe(text, "Cost API provider display name.") }), "Supported cost-sync integrations."),
  }),
  create_traffic_source_from_template: object({
    traffic_source: source,
    settings: sourceSettings,
    postback: nullable(postback),
    postbacks: array(postback, "Every outgoing postback created from the preset."),
  }),
  create_network_from_template: object({
    network: describe(entity, "Created affiliate-network record."), template: describe(text, "Preset id used to create the network."),
    incoming_postback_urls: describe(postbackUrls, "Network-specific incoming conversion URL templates."),
    offer_url_suffix: describe(text, "Query parameter suffix to append to offer URLs for click attribution."),
  }),
  get_traffic_source_settings: object({ settings: sourceSettings }),
  update_traffic_source_settings: object({ settings: sourceSettings }),
  sync_traffic_source_cost: object({ result: describe(object({
    traffic_source_id: describe(text, "Source whose spend was fetched and applied."), provider: describe(text, "Cost API provider used."),
    days: array(text, "Requested UTC spend days, formatted YYYY-MM-DD."),
    rows: describe(integer, "Spend rows returned by the provider before filtering to the requested days."),
    updates: describe(integer, "Cost-update records written after grouping spend by day and available token filters."),
    clicks_updated: describe(integer, "Sum of click counts affected by the cost updates."),
    total_cents: describe(cents, "Sum of spend submitted in the cost updates, in cents; does not imply every group had matching clicks."),
  }), "Cost-sync results across this source’s campaigns.") }),
  get_campaign_source_link: object({
    traffic_source_id: describe(nullableText, "Assigned traffic source id, or null when unassigned."),
    campaign_url: describe(nullableText, "Base /c/{key} URL on the app hostname, or null when no tracking key exists."),
    tracking_url: describe(nullableText, "Campaign URL with source macros appended, ready to paste into the traffic source; null without a tracking key."),
    tokens: array(token, "Token mappings used to build the link."),
    labels: dictionary(text, "Report labels keyed by click slot, for example sub1."),
  }),
  list_cost_updates: object({ cost_updates: array(costUpdate, "Recent campaign-specific and source-wide cost updates relevant to the campaign, newest first.") }),
  update_campaign_cost: object({ cost_update: costUpdate }),
};

const platformSettings = object({
  traffic_source_id: text, provider: nullableText, enabled: boolean, allow_writes: boolean,
  has_credential: boolean, revision: integer,
});
const platformResult = object({
  provider: text, action: text, status: { type: "string", enum: ["accepted", "failed", "unknown"] },
  data: { description: "Provider-specific JSON response with credentials redacted; null for transport failures. Interpret using the provider action documentation." },
  operation_id: nullableText, message: text,
});
contracts.list_platform_integrations = object({ beta: boolean, providers: array(object({
  id: text, name: text, credential_label: text, setup: text, documentation_url: text, limitation: nullableText,
  actions: array(object({ id: text, title: text, description: text, read_only: boolean, input_schema: { type: "object", description: "JSON Schema for the provider-specific action parameters." } })),
})) });
contracts.get_platform_connection = object({ settings: platformSettings });
contracts.configure_platform_connection = object({ settings: platformSettings });
contracts.read_platform_data = object({ result: platformResult });
contracts.execute_platform_action = object({ result: platformResult });
contracts.list_platform_operations = object({ operations: array(object({
  operation_id: text, actor_id: text, provider: text, action: text, created_at: timestamp,
  request: { type: "object", description: "Provider, connection revision, action and parameters recorded before dispatch." }, result: nullable(platformResult),
})) });

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
