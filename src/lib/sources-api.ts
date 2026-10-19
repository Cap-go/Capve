import { useEffect, useState } from "react";
import { request, type AffiliateNetwork, type Postback, type TrafficSource } from "./api";

export type TokenSlot =
  | "sub1" | "sub2" | "sub3" | "sub4" | "sub5" | "sub6" | "sub7" | "sub8" | "sub9" | "sub10"
  | "external_id" | "cost";

export const TOKEN_SLOTS: TokenSlot[] = [
  ...Array.from({ length: 10 }, (_, i) => `sub${i + 1}` as TokenSlot),
  "external_id",
  "cost",
];

export type SourceToken = {
  param: string;
  name: string;
  slot: TokenSlot;
  macro?: string;
  kind?: "campaign" | "zone";
};

export type SourceTemplate = {
  id: string;
  name: string;
  cost_type: "cpc" | "cpm" | "cpa";
  tokens: SourceToken[];
  postback_url: string | null;
  cost_api?: string;
  verified: boolean;
  notes?: string;
};

export type NetworkTemplate = {
  id: string;
  name: string;
  offer_param: string;
  verified: boolean;
  notes?: string;
  incoming_postback_urls: { default: string; registration: string; ftd: string };
  offer_url_suffix: string;
};

export type SourceSettings = {
  traffic_source_id: string;
  template: string | null;
  tokens: SourceToken[];
  api_provider: string | null;
  has_api_key: boolean;
  last_sync_at: number | null;
  last_sync_error: string | null;
};

export type SourceLink = {
  traffic_source_id: string | null;
  campaign_url: string | null;
  tracking_url: string | null;
  tokens: SourceToken[];
  labels: Partial<Record<TokenSlot, string>>;
};

export type CostUpdate = {
  id: string;
  program_id: string | null;
  from_ms: number;
  to_ms: number;
  filter_dim: string | null;
  filter_value: string | null;
  total_cents: number;
  clicks_updated: number;
  origin: "manual" | "api";
  created_at: number;
};

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const sourcesApi = {
  templates: () =>
    request<{
      traffic_sources: SourceTemplate[];
      networks: NetworkTemplate[];
      cost_providers: Array<{ id: string; name: string }>;
    }>("/api/sources/templates"),
  createSourceFromTemplate: (template_id: string, name?: string) =>
    request<{ traffic_source: TrafficSource; settings: SourceSettings; postback: Postback | null }>(
      "/api/sources/from-template",
      json("POST", { template_id, name }),
    ),
  createNetworkFromTemplate: (template_id: string, name?: string) =>
    request<{
      network: AffiliateNetwork;
      incoming_postback_urls: NetworkTemplate["incoming_postback_urls"];
      offer_url_suffix: string;
    }>("/api/sources/networks/from-template", json("POST", { template_id, name })),
  settings: (sourceId: string) =>
    request<{ settings: SourceSettings }>(`/api/sources/${sourceId}/settings`),
  updateSettings: (
    sourceId: string,
    patch: { tokens?: SourceToken[]; api_provider?: string | null; api_key?: string | null },
  ) => request<{ settings: SourceSettings }>(`/api/sources/${sourceId}/settings`, json("PUT", patch)),
  syncCost: (sourceId: string, date?: string) =>
    request<{ result: { updates: number; clicks_updated: number; total_cents: number } }>(
      `/api/sources/${sourceId}/sync-cost`,
      json("POST", date ? { date } : {}),
    ),
  sourceLink: (campaignId: string) => request<SourceLink>(`/api/campaigns/${campaignId}/source-link`),
  costUpdates: (campaignId: string) =>
    request<{ cost_updates: CostUpdate[] }>(`/api/campaigns/${campaignId}/costs`),
  updateCost: (
    campaignId: string,
    body: { from: string | number; to: string | number; total_cents: number; filter_dim?: string; filter_value?: string },
  ) => request<{ cost_update: CostUpdate }>(`/api/campaigns/${campaignId}/costs`, json("POST", body)),
};

/** Token labels for a campaign (`{ sub1: "Zone" }`), for report column / group-by names. */
export function useSubLabels(campaignId: string | null | undefined): Partial<Record<TokenSlot, string>> {
  const [labels, setLabels] = useState<Partial<Record<TokenSlot, string>>>({});
  useEffect(() => {
    setLabels({});
    if (!campaignId) return;
    let cancelled = false;
    sourcesApi
      .sourceLink(campaignId)
      .then((link) => !cancelled && setLabels(link.labels))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [campaignId]);
  return labels;
}

/** Renames `sub1`… options to the source's token names ("Zone (sub1)"). */
export function withSubLabels<T extends { value: string; label: string }>(
  options: T[],
  labels: Partial<Record<TokenSlot, string>>,
): T[] {
  return options.map((o) => {
    const name = labels[o.value as TokenSlot];
    return name ? { ...o, label: `${name} (${o.value})` } : o;
  });
}
