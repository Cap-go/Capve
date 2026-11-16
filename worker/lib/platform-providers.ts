import { Validator } from "@cfworker/json-schema";
import { PLATFORMS, type PlatformId } from "../../shared/platforms";

export class PlatformError extends Error {}
type Params = Record<string, unknown>;
export type ProviderRequest = { url: string; method: string; body?: unknown };
const bases: Record<PlatformId, string> = {
  adcash: "https://adcash.myadcash.com/client-api/v1",
  propellerads: "https://ssp-api.propellerads.com/v5",
  richads: "https://api.richads.com/api/v2",
  trafficstars: "https://api.trafficstars.com",
};

export function prepareAction(provider: PlatformId, actionId: string, params: Params) {
  const action = PLATFORMS.find((p) => p.id === provider)?.actions.find((a) => a.id === actionId);
  if (!action) throw new PlatformError("This provider does not support that action.");
  const validation = new Validator(action.input_schema).validate(params);
  if (!validation.valid) throw new PlatformError("Invalid action parameters. Check the action input schema.");
  const id = String(params.campaign_id);
  const req = (path: string, method = "GET", body?: unknown): ProviderRequest => ({ url: bases[provider] + path, method, ...(body === undefined ? {} : { body }) });
  let request: ProviderRequest | undefined;
  switch (provider) {
    case "adcash":
      if (actionId === "list_campaigns") request = req("/campaigns");
      if (actionId === "get_campaign") request = req(`/campaigns/${id}`);
      if (actionId === "get_bids") request = req(`/campaigns/${id}/payouts`);
      if (actionId === "get_budget") request = req(`/campaigns/${id}/budget`);
      if (actionId === "set_budget") request = req(`/campaigns/${id}/budget`, "POST", { data: [{ amount: String(params.amount) }] });
      if (actionId === "set_zone_bid") request = req(`/campaigns/${id}/payouts`, "PATCH", { records: [{ country_code: params.country_code, zone: params.zone_id, bid: params.bid, ...(params.payout_type === "CPM" ? { quality_tier: null } : {}) }] });
      break;
    case "propellerads":
      if (actionId === "list_campaigns") request = req(`/adv/campaigns?page=${params.page ?? 1}&page_size=100`);
      if (actionId === "get_campaign") request = req(`/adv/campaigns/${id}`);
      if (actionId === "get_bids") request = req(`/adv/campaigns/${id}/rates/`);
      if (actionId === "get_zone_bids") request = req(`/adv/campaigns/${id}/zone_rates`);
      if (actionId === "set_status") request = req(`/adv/campaigns/${params.status === "active" ? "play" : "stop"}`, "PUT", { campaign_ids: [Number(id)] });
      if (actionId === "set_daily_budget") request = req(`/adv/campaigns/${id}`, "PATCH", { limit_daily_amount: params.amount });
      if (actionId === "set_zone_bid") request = req(`/adv/campaigns/${id}/zone_rates`, "PATCH", [{ zone_id: Number(params.zone_id), amount: params.bid }]);
      if (actionId === "get_excluded_zones") request = req(`/adv/campaigns/${id}/targeting/exclude/zone`);
      if (actionId === "exclude_zones") request = req(`/adv/campaigns/${id}/targeting/exclude/zone`, "PATCH", { zone: params.zone_ids });
      break;
    case "richads":
      if (actionId === "list_campaigns") request = req(`/campaigns?page=${params.page ?? 1}&perPage=100`);
      if (actionId === "get_campaign") request = req(`/campaigns/${id}`);
      if (actionId === "set_status") request = req(`/campaigns/${id}/status/${params.status === "active" ? "activate" : "pause"}`, "PUT");
      if (actionId === "set_bid") request = req(`/campaigns/${id}/bid`, "PATCH", { bid: params.bid });
      if (actionId === "set_daily_budget") request = req("/campaigns/bulk/budget", "PATCH", { updates: [{ id: Number(id), budget: params.amount }] });
      break;
    case "trafficstars":
      if (actionId === "list_campaigns") request = req("/v1.1/campaigns");
      if (actionId === "get_campaign") request = req(`/v1.1/campaigns/${id}`);
      if (actionId === "set_status") request = req(`/v2/campaigns/${params.status === "active" ? "run" : "pause"}`, "PUT", { campaign_ids: [Number(id)] });
      if (actionId === "set_bid") request = req(`/v1.1/campaigns/${id}`, "PATCH", { price: params.bid });
      if (actionId === "set_daily_budget") request = req(`/v1.1/campaigns/${id}`, "PATCH", { max_daily: params.amount });
      if (actionId === "get_zone_bids") request = req(`/v1.1/campaigns/${id}/prices`);
      if (actionId === "set_zone_bid") request = req(`/v1.1/campaigns/${id}/spot/${params.zone_id}/price`, "POST", { price: params.bid });
      break;
  }
  if (!request) throw new PlatformError("Action is unavailable.");
  return { action, request };
}

// Never return provider error bodies: some APIs echo request headers/credentials.
async function jsonRequest(url: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new PlatformError(`Provider returned HTTP ${response.status}. Check credentials, permissions and provider limits.`);
  if (response.status === 204) return null;
  if (!response.headers.get("content-type")?.includes("application/json")) throw new PlatformError("Provider returned an unexpected response format.");
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 1_000_000) { await reader.cancel(); throw new PlatformError("Provider response exceeded the size limit."); }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(all)); } catch { throw new PlatformError("Provider returned invalid JSON."); }
}

export async function executeProvider(provider: PlatformId, request: ProviderRequest, credential: string) {
  let token = credential;
  if (provider === "trafficstars") {
    const auth = await jsonRequest("https://api.trafficstars.com/v1/auth/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: credential }).toString(),
    }) as { access_token?: unknown } | null;
    if (!auth || typeof auth.access_token !== "string" || !auth.access_token) throw new PlatformError("Provider token exchange failed.");
    token = auth.access_token;
  }
  const data = await jsonRequest(request.url, {
    method: request.method,
    headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
  });
  return redact(data, [credential, token]);
}

function redact(data: unknown, secrets: string[]): unknown {
  if (typeof data === "string") return secrets.reduce((s, secret) => s.split(secret).join("[redacted]"), data);
  if (Array.isArray(data)) return data.map((v) => redact(v, secrets));
  if (data && typeof data === "object") return Object.fromEntries(Object.entries(data).map(([key, value]) => [redact(key, secrets) as string, /token|secret|password|authorization|api.?key/i.test(key) ? "[redacted]" : redact(value, secrets)]));
  return data;
}

export function providerRejected(data: unknown): boolean {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const row = data as Record<string, unknown>;
  return !!row.error || row.success === false || [row.failed, row.errors].some((value) => value && typeof value === "object" && Object.keys(value).length > 0);
}
