import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { adcashProvider } from "../worker/cron/cost-providers";
import { syncSourceCost } from "../worker/cron/cost-sync";
import { getSourceSettingsRow } from "../worker/db/sources";
import { applySourceTokens, parseTokens, SOURCE_TEMPLATES } from "../worker/lib/source-templates";
import { registerTestUser } from "./helpers";
import { initSql } from "./schema";

const MERCHANT = "https://merchant.example.com/casino";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

let authHeaders: Record<string, string>;

async function api<T>(method: string, path: string, body?: unknown, status = 200): Promise<T> {
  const res = await SELF.fetch(`http://localhost${path}`, {
    method,
    headers: authHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  expect(res.status, JSON.stringify(data)).toBe(status);
  return data as T;
}

async function adcashCampaign() {
  const { traffic_source, settings, postback } = await api<{
    traffic_source: { id: string; cost_type: string };
    settings: { tokens: Array<{ param: string; slot: string }>; api_provider: string | null };
    postback: { url: string } | null;
  }>("POST", "/api/sources/from-template", { template_id: "adcash", name: "Adcash pops" }, 201);
  const { program } = await api<{ program: { id: string; campaign_key: string } }>(
    "POST",
    "/api/programs",
    {
      name: `Casino ${crypto.randomUUID().slice(0, 6)}`,
      destination_url: MERCHANT,
      traffic_source_id: traffic_source.id,
    },
    201,
  );
  return { source: traffic_source, settings, postback, program };
}

async function click(campaignKey: string, query: string) {
  const res = await SELF.fetch(`http://localhost/c/${campaignKey}?${query}`, {
    redirect: "manual",
    headers: { "User-Agent": UA },
  });
  expect(res.status).toBe(302);
  return new URL(res.headers.get("Location")!).searchParams.get("click_id")!;
}

function clickRow(clickId: string) {
  return env.DB.prepare("SELECT sub1, sub2, sub3, external_id, cost_cents FROM clicks WHERE id = ?")
    .bind(clickId)
    .first<{ sub1: string | null; sub2: string | null; sub3: string | null; external_id: string | null; cost_cents: number | null }>();
}

const today = () => new Date().toISOString().slice(0, 10);

describe("traffic source templates, tokens and cost", () => {
  beforeAll(async () => {
    for (const statement of initSql.split(";").map((s) => s.trim()).filter(Boolean)) {
      await env.DB.prepare(statement).run();
    }
    ({ authHeaders } = await registerTestUser());
  });

  it("lists built-in source and network templates", async () => {
    const data = await api<{
      traffic_sources: Array<{ id: string }>;
      networks: Array<{ id: string; incoming_postback_urls: { ftd: string } }>;
    }>("GET", "/api/sources/templates");
    const ids = data.traffic_sources.map((t) => t.id);
    for (const id of ["adcash", "propellerads", "richads", "zeropark", "trafficstars", "facebook", "google-ads", "tiktok"]) {
      expect(ids).toContain(id);
    }
    const everflow = data.networks.find((n) => n.id === "everflow")!;
    expect(everflow.incoming_postback_urls.ftd).toBe(
      "http://localhost:5173/click?cnv_id={sub1}&payout={payout_amount}&event=ftd",
    );
  });

  it("every built-in template has valid tokens", () => {
    for (const template of SOURCE_TEMPLATES) {
      expect(parseTokens(template.tokens), template.id).toEqual(template.tokens);
    }
  });

  it("creates a traffic source from a template with tokens and postback", async () => {
    const { source, settings, postback } = await adcashCampaign();
    expect(source.cost_type).toBe("cpm");
    expect(settings.api_provider).toBe("adcash");
    expect(settings.tokens.find((t) => t.param === "zoneid")?.slot).toBe("sub1");
    expect(postback?.url).toContain("{external_id}");
  });

  it("creates a network from a template with incoming postback URLs", async () => {
    const data = await api<{ network: { id: string }; offer_url_suffix: string; incoming_postback_urls: { default: string } }>(
      "POST",
      "/api/sources/networks/from-template",
      { template_id: "tune" },
      201,
    );
    expect(data.network.id).toBeTruthy();
    expect(data.offer_url_suffix).toBe("aff_sub={click_id}");
    expect(data.incoming_postback_urls.default).toContain("cnv_id={aff_sub}");
  });

  it("maps the source's named params to subs on click", async () => {
    const { program } = await adcashCampaign();
    const clickId = await click(program.campaign_key, "zoneid=9001&campaignid=77&clickid=adc-1&cost=0.05&sub3=keep");
    const row = await clickRow(clickId);
    expect(row).toMatchObject({ sub1: "9001", sub2: "77", external_id: "adc-1", cost_cents: 5 });

    const link = await api<{ tracking_url: string; labels: Record<string, string> }>(
      "GET",
      `/api/campaigns/${program.id}/source-link`,
    );
    expect(link.tracking_url).toContain(`/c/${program.campaign_key}?zoneid=[zone]&campaignid=[campaign]`);
    expect(link.labels.sub1).toBe("Zone");
    expect(link.labels.sub2).toBe("Campaign");
  });

  it("applySourceTokens lets mapped params win over raw subs", () => {
    const out = applySourceTokens(
      new URL("https://x.test/c/k?zoneid=1&sub1=raw"),
      [{ param: "zoneid", name: "Zone", slot: "sub1" }],
      { sub1: "raw", sub2: null, sub3: null, sub4: null, sub5: null, sub6: null, sub7: null, sub8: null, sub9: null, sub10: null, external_id: null, cost_cents: null },
    );
    expect(out.sub1).toBe("1");
  });

  it("cost update spreads total over matching clicks and drives report cost/ROI", async () => {
    const { program } = await adcashCampaign();
    const a = await click(program.campaign_key, "zoneid=123&clickid=c1");
    const b = await click(program.campaign_key, "zoneid=123&clickid=c2");
    const other = await click(program.campaign_key, "zoneid=456&clickid=c3");

    const { cost_update } = await api<{ cost_update: { clicks_updated: number; filter_dim: string } }>(
      "POST",
      `/api/campaigns/${program.id}/costs`,
      { date: today(), total_cents: 1001, filter_dim: "zoneid", filter_value: "123" },
      201,
    );
    expect(cost_update.clicks_updated).toBe(2);
    expect(cost_update.filter_dim).toBe("sub1");
    const costs = [(await clickRow(a))!.cost_cents, (await clickRow(b))!.cost_cents].sort();
    expect(costs).toEqual([500, 501]);
    expect((await clickRow(other))!.cost_cents).toBeNull();

    // Re-running replaces (does not add to) the previous cost.
    await api("POST", `/api/campaigns/${program.id}/costs`, { date: today(), total: "10.01", filter_dim: "sub1", filter_value: "123" }, 201);

    const pb = await SELF.fetch(`http://localhost/click?cnv_id=${a}&payout=20`);
    expect(pb.status).toBe(200);

    const { campaigns } = await api<{
      campaigns: Array<{ id: string; metrics: { cost_cents: number; revenue_cents: number; roi: number } }>;
    }>("GET", "/api/reports/campaigns");
    const row = campaigns.find((r) => r.id === program.id)!;
    expect(row.metrics.cost_cents).toBe(1001);
    expect(row.metrics.revenue_cents).toBe(2000);
    expect(row.metrics.roi).toBeCloseTo(((2000 - 1001) / 1001) * 100, 1);

    const { cost_updates } = await api<{ cost_updates: unknown[] }>("GET", `/api/campaigns/${program.id}/costs`);
    expect(cost_updates).toHaveLength(2);
  });

  it("rejects invalid cost updates", async () => {
    const { program } = await adcashCampaign();
    await api("POST", `/api/campaigns/${program.id}/costs`, { total_cents: 100 }, 400);
    await api("POST", `/api/campaigns/${program.id}/costs`, { date: today(), total_cents: -1 }, 400);
    await api("POST", `/api/campaigns/${program.id}/costs`, { date: today(), total_cents: 1, filter_dim: "ip", filter_value: "x" }, 400);
  });

  it("stores the cost API key encrypted and never returns it", async () => {
    const { source } = await adcashCampaign();
    const { settings } = await api<{ settings: Record<string, unknown> }>(
      "PUT",
      `/api/sources/${source.id}/settings`,
      { api_provider: "adcash", api_key: "secret-adcash-key" },
    );
    expect(settings.has_api_key).toBe(true);
    expect(JSON.stringify(settings)).not.toContain("secret-adcash-key");
    const row = await getSourceSettingsRow(env.DB, source.id);
    expect(row?.api_key_sealed).toMatch(/^v1\./);
    expect(row?.api_key_sealed).not.toContain("secret-adcash-key");

    await api("PUT", `/api/sources/${source.id}/settings`, { tokens: [{ param: "bad param", slot: "sub1" }] }, 400);
    await api("PUT", `/api/sources/${source.id}/settings`, { api_provider: "nope" }, 400);
  });

  it("Adcash adapter parses spend rows from a mocked API", async () => {
    const calls: string[] = [];
    const rows = await adcashProvider.fetchSpend("k", { from: "2026-10-14", to: "2026-10-15" }, async (url, init) => {
      calls.push(url);
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer k");
      return Response.json({
        data: [
          { date: "2026-10-14", campaign_id: 77, zone_id: "123", spend: "1.5" },
          { day: "2026-10-15", campaign: "77", zone: "456", cost: 2 },
          { date: "2026-10-15", spend: "oops" },
        ],
      });
    });
    expect(calls[0]).toContain("date_from=2026-10-14");
    expect(rows).toEqual([
      { date: "2026-10-14", campaign_id: "77", zone_id: "123", spend_cents: 150 },
      { date: "2026-10-15", campaign_id: "77", zone_id: "456", spend_cents: 200 },
    ]);

    await expect(
      adcashProvider.fetchSpend("k", { from: "2026-10-14", to: "2026-10-14" }, async () => new Response("nope", { status: 401 })),
    ).rejects.toThrow("Adcash API 401");
  });

  it("syncs Adcash spend onto clicks by campaign and zone token", async () => {
    const { source, program } = await adcashCampaign();
    const z1 = await click(program.campaign_key, "zoneid=123&campaignid=77&clickid=s1");
    const z2 = await click(program.campaign_key, "zoneid=456&campaignid=77&clickid=s2");
    await api("PUT", `/api/sources/${source.id}/settings`, { api_key: "k" });

    const day = today();
    const row = (await getSourceSettingsRow(env.DB, source.id))!;
    const result = await syncSourceCost(env, row, {
      days: [day],
      fetchFn: async () =>
        Response.json([
          { date: day, campaign_id: "77", zone_id: "123", spend: 3 },
          { date: day, campaign_id: "77", zone_id: "456", spend: 1.25 },
          { date: "2000-01-01", campaign_id: "77", zone_id: "123", spend: 99 },
        ]),
    });
    expect(result).toMatchObject({ updates: 2, clicks_updated: 2, total_cents: 425 });
    expect((await clickRow(z1))!.cost_cents).toBe(300);
    expect((await clickRow(z2))!.cost_cents).toBe(125);

    const { cost_updates } = await api<{ cost_updates: Array<{ origin: string }> }>("GET", `/api/campaigns/${program.id}/costs`);
    expect(cost_updates.every((u) => u.origin === "api")).toBe(true);
  });

  it("exposes the new tools over MCP", async () => {
    const res = await SELF.fetch("http://localhost/api/tokens", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ name: "test" }),
    });
    const { token } = await res.json<{ token: string }>();
    const call = async (name: string, args: Record<string, unknown>) => {
      const reply = await SELF.fetch("http://localhost/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
      });
      return (await reply.json<{ result: { isError?: boolean; structuredContent?: Record<string, unknown> } }>()).result;
    };
    const templates = await call("list_source_templates", {});
    expect(templates.isError).toBeFalsy();
    const created = await call("create_traffic_source_from_template", { template_id: "zeropark" });
    expect(created.isError).toBeFalsy();
  });
});
