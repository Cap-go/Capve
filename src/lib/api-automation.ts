import { request, type CampaignMetrics, type EventCounts } from "./api";

/** Drilldown, account settings, automation rules, zone blacklist and tracking domains API. */

export type DrilldownNode = {
  key: string | null;
  label: string;
  dimension: string;
  path: Array<string | null>;
  unique_clicks: number;
  bot_clicks: number;
  metrics: CampaignMetrics;
  events: EventCounts;
  children: DrilldownNode[];
};

export type AccountSettings = { timezone: string };

export type AutomationRule = {
  id: string;
  program_id: string;
  name: string;
  kind: "zone_blacklist" | "alert";
  dimension: string | null;
  min_clicks: number | null;
  event: string | null;
  roi_below: number | null;
  spend_above_cents: number | null;
  window_hours: number;
  notify_email: string | null;
  webhook_url: string | null;
  enabled: boolean;
  last_run_at: number | null;
  last_fired_at: number | null;
  created_at: number;
};

export type NewAutomationRule = {
  campaign_id: string;
  kind: AutomationRule["kind"];
  name?: string;
  dimension?: string;
  min_clicks?: number;
  event?: string | null;
  roi_below?: number | null;
  spend_above_cents?: number | null;
  window_hours?: number;
  notify_email?: string;
  webhook_url?: string;
};

export type RuleEvaluation = {
  rule_id: string;
  fired: boolean;
  message: string | null;
  blacklisted: string[];
};

export type ZoneBlacklistEntry = {
  id: string;
  program_id: string;
  dimension: string;
  value: string;
  rule_id: string | null;
  reason: string | null;
  created_at: number;
};

export type TrackingDomain = { id: string; hostname: string; created_at: number };

function qs(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  return search.toString();
}

const json = (body: unknown) => JSON.stringify(body);

export const automationApi = {
  drilldown: (params: { by: string[]; campaign_id?: string; from?: number; to?: number }) =>
    request<{ by: string[]; timezone: string; rows: DrilldownNode[] }>(
      `/api/reports/drilldown?${qs({ ...params, by: params.by.join(",") })}`,
    ),

  settings: () => request<{ settings: AccountSettings }>("/api/settings"),
  updateSettings: (settings: AccountSettings) =>
    request<{ settings: AccountSettings }>("/api/settings", { method: "PUT", body: json(settings) }),

  rules: (campaignId: string) =>
    request<{ rules: AutomationRule[] }>(`/api/automation/rules?${qs({ campaign_id: campaignId })}`),
  createRule: (rule: NewAutomationRule) =>
    request<{ rule: AutomationRule }>("/api/automation/rules", { method: "POST", body: json(rule) }),
  setRuleEnabled: (ruleId: string, enabled: boolean) =>
    request<{ rule: AutomationRule }>(`/api/automation/rules/${ruleId}`, {
      method: "PATCH",
      body: json({ enabled }),
    }),
  runRule: (ruleId: string) =>
    request<{ result: RuleEvaluation }>(`/api/automation/rules/${ruleId}/run`, { method: "POST" }),
  deleteRule: (ruleId: string) =>
    request<{ ok: boolean }>(`/api/automation/rules/${ruleId}`, { method: "DELETE" }),

  blacklist: (campaignId: string) =>
    request<{ blacklist: ZoneBlacklistEntry[] }>(
      `/api/automation/blacklist?${qs({ campaign_id: campaignId })}`,
    ),
  blacklistExportUrl: (campaignId: string, format: "txt" | "csv") =>
    `/api/automation/blacklist?${qs({ campaign_id: campaignId, format })}`,
  addToBlacklist: (campaignId: string, dimension: string, values: string[]) =>
    request<{ added: string[] }>("/api/automation/blacklist", {
      method: "POST",
      body: json({ campaign_id: campaignId, dimension, values }),
    }),
  removeFromBlacklist: (entryId: string) =>
    request<{ ok: boolean }>(`/api/automation/blacklist/${entryId}`, { method: "DELETE" }),

  trackingDomains: () =>
    request<{ tracking_domains: TrackingDomain[]; setup: string }>("/api/tracking-domains"),
  addTrackingDomain: (hostname: string) =>
    request<{ tracking_domain: TrackingDomain; setup: string }>("/api/tracking-domains", {
      method: "POST",
      body: json({ hostname }),
    }),
  deleteTrackingDomain: (domainId: string) =>
    request<{ ok: boolean }>(`/api/tracking-domains/${domainId}`, { method: "DELETE" }),
  setCampaignTrackingDomain: (campaignId: string, domainId: string | null) =>
    request<{ ok: boolean }>(`/api/tracking-domains/campaigns/${campaignId}`, {
      method: "PUT",
      body: json({ tracking_domain_id: domainId }),
    }),
};
