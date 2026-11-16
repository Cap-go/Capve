import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import worker from "../worker";
import { prepareAction, executeProvider, providerRejected } from "../worker/lib/platform-providers";
import { PLATFORMS, type PlatformId, type PlatformResult } from "../shared/platforms";
import { registerTestUser } from "./helpers";
import { initSql } from "./schema";
import migration from "../migrations/0032_platform_management.sql?raw";

let headers: Record<string, string>;
let accountId: string;
async function api(path: string, method = "GET", body?: unknown, auth = headers) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`http://localhost${path}`, { method, headers: auth, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
async function source() {
  const res = await api("/api/entities/traffic-sources", "POST", { name: "Platform test" });
  expect(res.status).toBe(201);
  const { traffic_source } = await res.json<{ traffic_source: { id: string } }>();
  return { id: traffic_source.id, base: `/api/platforms/sources/${traffic_source.id}` };
}
const config = (provider: PlatformId = "richads", revision = 0) => ({ provider, enabled: true, allow_writes: true, credential: "private-test-provider-key", revision });
const change = (overrides = {}) => ({ action: "set_bid", params: { campaign_id: "123", bid: 0.05 }, revision: 1, operation_id: crypto.randomUUID(), ...overrides });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

describe("optional platform management", () => {
  beforeAll(async () => {
    for (const sql of initSql.split(";").map((s) => s.trim()).filter(Boolean)) await env.DB.prepare(sql).run();
    ({ authHeaders: headers } = await registerTestUser());
    const user = await env.DB.prepare("SELECT id FROM users LIMIT 1").first<{ id: string }>();
    accountId = user!.id;
  });
  afterEach(() => vi.restoreAllMocks());

  it("uses the migration schema and advertises only the four providers with documented actions", async () => {
    for (const name of ["platform_connections", "platform_operations"]) {
      expect(migration).toContain(`CREATE TABLE ${name}`);
      expect(await env.DB.prepare("SELECT name FROM sqlite_master WHERE name=?").bind(name).first()).toBeTruthy();
    }
    const res = await api("/api/platforms");
    const data = await res.json<{ beta: boolean; providers: { id: string }[] }>();
    expect(data.beta).toBe(true);
    expect(data.providers.map((p) => p.id)).toEqual(["adcash", "propellerads", "richads", "trafficstars"]);
  });

  it("starts disabled, encrypts credentials, and keeps write access separately opt-in", async () => {
    const s = await source();
    expect(await (await api(s.base)).json()).toMatchObject({ settings: { enabled: false, allow_writes: false, has_credential: false, revision: 0 } });
    const spy = vi.spyOn(globalThis, "fetch");
    expect((await api(`${s.base}/execute`, "POST", change())).status).toBe(409);
    const configured = await api(s.base, "PUT", { ...config(), allow_writes: false });
    expect(configured.status).toBe(200);
    expect(await configured.text()).not.toContain("private-test-provider-key");
    const stored = await env.DB.prepare("SELECT credential_sealed FROM platform_connections WHERE traffic_source_id=?").bind(s.id).first<{ credential_sealed: string }>();
    expect(stored?.credential_sealed).toMatch(/^v1\./);
    expect(stored?.credential_sealed).not.toContain("private-test-provider-key");
    expect((await api(`${s.base}/execute`, "POST", change())).status).toBe(403);
    expect(spy).not.toHaveBeenCalled();
  });

  it("clears credentials on provider change and rejects stale revisions", async () => {
    const s = await source();
    await api(s.base, "PUT", config());
    expect((await api(s.base, "PUT", config("trafficstars", 0))).status).toBe(409);
    const res = await api(s.base, "PUT", { provider: "trafficstars", enabled: false, allow_writes: false, revision: 1 });
    expect(await res.json()).toMatchObject({ settings: { has_credential: false, revision: 2, enabled: false } });
    expect((await api(`${s.base}/execute`, "POST", change())).status).toBe(409);
  });

  it("requires authentication, ownership and write role", async () => {
    const s = await source();
    const stranger = await registerTestUser();
    const viewer = await registerTestUser();
    await env.DB.prepare("INSERT INTO team_members (id,owner_user_id,email,role,created_at,accepted_at) VALUES (?,?,?,'viewer',?,?)").bind(crypto.randomUUID(), accountId, viewer.email, Date.now(), Date.now()).run();
    for (const [path, method, body] of [[s.base, "GET", undefined], [s.base, "PUT", config()], [`${s.base}/read`, "POST", { action: "get_campaign", params: { campaign_id: "123" }, revision: 1 }], [`${s.base}/execute`, "POST", change()], [`${s.base}/operations`, "GET", undefined]] as const) {
      expect((await api(path, method, body, {})).status).toBe(401);
      expect((await api(path, method, body, stranger.authHeaders)).status).toBe(404);
    }
    expect((await api(s.base, "PUT", config(), viewer.authHeaders)).status).toBe(403);
    expect((await api(`${s.base}/execute`, "POST", change(), viewer.authHeaders)).status).toBe(403);
  });

  it("validates actions before network access and cannot send writes through read endpoint", async () => {
    const s = await source(); await api(s.base, "PUT", config());
    const spy = vi.spyOn(globalThis, "fetch");
    for (const input of [change({ action: "arbitrary_proxy" }), change({ params: { campaign_id: "../auth/token", bid: 1 } }), change({ params: { campaign_id: "123", bid: -1 } }), change({ params: { campaign_id: "123", bid: 1, url: "https://evil.example" } }), change({ operation_id: undefined })]) {
      expect((await api(`${s.base}/execute`, "POST", input)).status).toBe(400);
    }
    expect((await api(`${s.base}/read`, "POST", change())).status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
    expect(PLATFORMS.some((provider) => (provider.id as string) === "zeropark")).toBe(false);
  });

  it("sends a live change once, logs it and returns the same outcome for retries", async () => {
    const s = await source(); await api(s.base, "PUT", config());
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ id: 123, bid: 0.05 }));
    const input = change();
    const first = await (await api(`${s.base}/execute`, "POST", input)).json<{ result: PlatformResult }>();
    expect(first.result.status).toBe("accepted");
    expect(await (await api(`${s.base}/execute`, "POST", input)).json()).toEqual(first);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("https://api.richads.com/api/v2/campaigns/123/bid", expect.objectContaining({ method: "PATCH", body: '{"bid":0.05}', redirect: "manual", headers: expect.objectContaining({ Authorization: "Bearer private-test-provider-key" }) }));
    expect((await api(`${s.base}/execute`, "POST", { ...input, params: { campaign_id: "123", bid: 0.06 } })).status).toBe(409);
    const log = await (await api(`${s.base}/operations`)).json<{ operations: { actor_id: string; result: PlatformResult }[] }>();
    expect(log.operations).toHaveLength(1); expect(log.operations[0].actor_id).toBe(accountId); expect(log.operations[0].result).toEqual({ ...first.result, data: null });
  });

  it("does not resend concurrent or interrupted operations", async () => {
    const s = await source(); await api(s.base, "PUT", config());
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("timeout private-test-provider-key"));
    const input = change();
    const responses = await Promise.all([api(`${s.base}/execute`, "POST", input), api(`${s.base}/execute`, "POST", input)]);
    for (const res of responses) { const data = await res.text(); expect(data).toContain('"unknown"'); expect(data).not.toContain("private-test-provider-key"); }
    expect(fetch).toHaveBeenCalledTimes(1);
    await api(`${s.base}/execute`, "POST", input);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("reports HTTP-200 provider failures and redacts returned secrets", async () => {
    const s = await source(); await api(s.base, "PUT", config("propellerads"));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ message: "Failure", errors: { "123": "Denied private-test-provider-key" }, access_token: "other-secret", "private-test-provider-key": "echoed as key" }));
    const res = await api(`${s.base}/execute`, "POST", change({ action: "set_status", params: { campaign_id: "123", status: "active" } }));
    const data = await res.text(); expect(data).toContain('"failed"'); expect(data).not.toContain("private-test-provider-key"); expect(data).not.toContain("other-secret");
    expect(providerRejected({ failed: [123], success: [] })).toBe(true);
    expect(providerRejected({ updated: [], failed: [{ id: 123 }] })).toBe(true);
  });

  it("does not follow redirects or expose upstream authentication errors", async () => {
    const request = prepareAction("richads", "get_campaign", { campaign_id: "123" }).request;
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("secret", { status: 302, headers: { Location: "https://evil.example" } }));
    await expect(executeProvider("richads", request, "credential")).rejects.toThrow("HTTP 302");
    expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockResolvedValue(new Response("login page", { headers: { "Content-Type": "text/html" } }));
    await expect(executeProvider("richads", request, "credential")).rejects.toThrow("unexpected response format");
    fetch.mockResolvedValue(json({ value: "x".repeat(1_000_001) }));
    await expect(executeProvider("richads", request, "credential")).rejects.toThrow("size limit");
  });

  it("exchanges TrafficStars offline credentials", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json({ access_token: "short-access-token" })).mockResolvedValueOnce(json({ id: 123 }));
    await executeProvider("trafficstars", prepareAction("trafficstars", "get_campaign", { campaign_id: "123" }).request, "offline-key");
    expect(fetch.mock.calls[0]).toEqual(["https://api.trafficstars.com/v1/auth/token", expect.objectContaining({ method: "POST", body: "grant_type=refresh_token&refresh_token=offline-key" })]);
    expect(fetch.mock.calls[1][1]?.headers).toMatchObject({ Authorization: "Bearer short-access-token" });

  });
});

describe("documented provider wire contracts", () => {
  it.each([
    ["adcash", "set_budget", { campaign_id: "123", amount: 500 }, "POST", "/campaigns/123/budget", { data: [{ amount: "500" }] }],
    ["adcash", "set_zone_bid", { campaign_id: "123", country_code: "EE", zone_id: "1234567-10115687-0", bid: 1.5, payout_type: "CPM" }, "PATCH", "/campaigns/123/payouts", { records: [{ country_code: "EE", zone: "1234567-10115687-0", bid: 1.5, quality_tier: null }] }],
    ["propellerads", "set_zone_bid", { campaign_id: "123", zone_id: "456", bid: 1.23 }, "PATCH", "/adv/campaigns/123/zone_rates", [{ zone_id: 456, amount: 1.23 }]],
    ["propellerads", "set_status", { campaign_id: "123", status: "paused" }, "PUT", "/adv/campaigns/stop", { campaign_ids: [123] }],
    ["propellerads", "set_daily_budget", { campaign_id: "123", amount: 100 }, "PATCH", "/adv/campaigns/123", { limit_daily_amount: 100 }],
    ["propellerads", "exclude_zones", { campaign_id: "123", zone_ids: ["456"] }, "PATCH", "/adv/campaigns/123/targeting/exclude/zone", { zone: ["456"] }],
    ["richads", "set_daily_budget", { campaign_id: "123", amount: 100 }, "PATCH", "/campaigns/bulk/budget", { updates: [{ id: 123, budget: 100 }] }],
    ["richads", "set_status", { campaign_id: "123", status: "active" }, "PUT", "/campaigns/123/status/activate", undefined],
    ["trafficstars", "set_bid", { campaign_id: "123", bid: 0.2 }, "PATCH", "/v1.1/campaigns/123", { price: 0.2 }],
    ["trafficstars", "set_zone_bid", { campaign_id: "123", zone_id: "456", bid: 0.0007 }, "POST", "/v1.1/campaigns/123/spot/456/price", { price: 0.0007 }],
    ["trafficstars", "set_status", { campaign_id: "123", status: "paused" }, "PUT", "/v2/campaigns/pause", { campaign_ids: [123] }],
  ] as const)("%s %s uses the documented request", (provider, action, params, method, path, body) => {
    const prepared = prepareAction(provider, action, params);
    expect(prepared.request.method).toBe(method); expect(prepared.request.url.endsWith(path)).toBe(true); expect(prepared.request.body).toEqual(body);
  });
  it("every advertised action has a validated request builder", () => {
    for (const provider of PLATFORMS) for (const action of provider.actions) {
      const params: Record<string, unknown> = {};
      for (const key of action.input_schema.required) {
        const field = action.input_schema.properties[key];
        params[key] = field.enum?.[0] ?? (field.type === "array" ? ["456"] : field.type === "number" ? 100 : key === "country_code" ? "EE" : "123");
      }
      expect(prepareAction(provider.id, action.id, params).request.url).toMatch(/^https:\/\//);
    }
  });
});
