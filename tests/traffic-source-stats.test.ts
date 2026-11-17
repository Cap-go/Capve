import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { syncSourceCost } from "../worker/cron/cost-sync";
import { getSourceSettingsRow } from "../worker/db/sources";
import {
  getDailyStats,
  upsertCampaignMapping,
  listCampaignMappings,
  deleteCampaignMapping,
} from "../worker/db/traffic-source-stats";
import { registerTestUser, BROWSER_HEADERS } from "./helpers";
import { initSql } from "./schema";

const MERCHANT = "https://merchant.example.com/casino";
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
  const { traffic_source } = await api<{
    traffic_source: { id: string };
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
  return { source: traffic_source, program };
}

async function click(campaignKey: string, query: string) {
  const res = await SELF.fetch(`http://localhost/c/${campaignKey}?${query}`, {
    redirect: "manual",
    headers: BROWSER_HEADERS,
  });
  expect(res.status).toBe(302);
  return new URL(res.headers.get("Location")!).searchParams.get("click_id")!;
}

const today = () => new Date().toISOString().slice(0, 10);

describe("traffic source daily stats and campaign mappings", () => {
  beforeAll(async () => {
    for (const statement of initSql.split(";").map((s) => s.trim()).filter(Boolean)) {
      await env.DB.prepare(statement).run();
    }
    ({ authHeaders } = await registerTestUser());
  });

  it("creates and lists campaign mappings", async () => {
    const { source, program } = await adcashCampaign();

    const { mapping: created } = await api<{ mapping: { external_campaign_id: string; program_id: string } }>(
      "POST",
      `/api/sources/${source.id}/campaign-mappings`,
      { program_id: program.id, external_campaign_id: "459729072" },
      201,
    );
    expect(created.external_campaign_id).toBe("459729072");
    expect(created.program_id).toBe(program.id);

    const { mappings } = await api<{ mappings: Array<{ external_campaign_id: string; program_id: string }> }>(
      "GET",
      `/api/sources/${source.id}/campaign-mappings`,
    );
    expect(mappings).toHaveLength(1);
    expect(mappings[0].external_campaign_id).toBe("459729072");
  });

  it("prevents mapping external campaign ID to wrong traffic source", async () => {
    const { source: source1, program: program1 } = await adcashCampaign();
    const { source: source2, program: program2 } = await adcashCampaign();

    await api<{ mapping: unknown }>(
      "POST",
      `/api/sources/${source1.id}/campaign-mappings`,
      { program_id: program1.id, external_campaign_id: "123" },
      201,
    );

    // Try to map source2's campaign to source1
    await api(
      "POST",
      `/api/sources/${source1.id}/campaign-mappings`,
      { program_id: program2.id, external_campaign_id: "456" },
      400,
    );
  });

  it("imports daily stats with impressions and spend from Adcash API", async () => {
    const { source, program } = await adcashCampaign();

    // Create mapping
    await upsertCampaignMapping(env.DB, {
      userId: (await env.DB.prepare("SELECT user_id FROM traffic_sources WHERE id = ?").bind(source.id).first<{ user_id: string }>())!
        .user_id,
      trafficSourceId: source.id,
      programId: program.id,
      externalCampaignId: "459729072",
    });

    // Configure API key
    await api("PUT", `/api/sources/${source.id}/settings`, { api_provider: "adcash", api_key: "test-key" });

    const day = today();
    const row = (await getSourceSettingsRow(env.DB, source.id))!;
    const result = await syncSourceCost(env, row, {
      days: [day],
      fetchFn: async () =>
        Response.json([
          { date: day, campaign_id: "459729072", impressions: 84171, spend: 98.79 },
        ]),
    });

    expect(result.daily_stats_created).toBe(1);
    expect(result.total_impressions).toBe(84171);
    expect(result.total_cents).toBe(9879);

    const stats = await getDailyStats(env.DB, program.id, day, day);
    expect(stats).toHaveLength(1);
    expect(stats[0].impressions).toBe(84171);
    expect(stats[0].spend_cents).toBe(9879);
    expect(stats[0].external_campaign_id).toBe("459729072");
  });

  it("syncs impressions at zone level when available", async () => {
    const { source, program } = await adcashCampaign();

    await upsertCampaignMapping(env.DB, {
      userId: (await env.DB.prepare("SELECT user_id FROM traffic_sources WHERE id = ?").bind(source.id).first<{ user_id: string }>())!
        .user_id,
      trafficSourceId: source.id,
      programId: program.id,
      externalCampaignId: "459729072",
    });

    await api("PUT", `/api/sources/${source.id}/settings`, { api_provider: "adcash", api_key: "test-key" });

    const day = today();
    const row = (await getSourceSettingsRow(env.DB, source.id))!;
    await syncSourceCost(env, row, {
      days: [day],
      fetchFn: async () =>
        Response.json([
          { date: day, campaign_id: "459729072", zone_id: "z1", impressions: 50000, spend: 60.00 },
          { date: day, campaign_id: "459729072", zone_id: "z2", impressions: 34171, spend: 38.79 },
        ]),
    });

    const stats = await getDailyStats(env.DB, program.id, day, day);
    expect(stats).toHaveLength(2);
    const totalImpressions = stats.reduce((sum, s) => sum + s.impressions, 0);
    const totalCost = stats.reduce((sum, s) => sum + s.spend_cents, 0);
    expect(totalImpressions).toBe(84171);
    expect(totalCost).toBe(9879);
  });

  it("campaign report uses daily stats cost instead of click cost when available", async () => {
    const { source, program } = await adcashCampaign();

    await upsertCampaignMapping(env.DB, {
      userId: (await env.DB.prepare("SELECT user_id FROM traffic_sources WHERE id = ?").bind(source.id).first<{ user_id: string }>())!
        .user_id,
      trafficSourceId: source.id,
      programId: program.id,
      externalCampaignId: "459729072",
    });

    // Create clicks with click-based cost (from the cost param)
    await click(program.campaign_key, "campaignid=459729072&cost=0.001");
    await click(program.campaign_key, "campaignid=459729072&cost=0.001");
    await click(program.campaign_key, "campaignid=459729072&cost=0.001");

    // Before daily stats sync: cost is from clicks (3 * 0.1 cents = 0.3 cents rounded to 0)
    const from = Date.parse(`${today()}T00:00:00Z`);
    const to = Date.parse(`${today()}T23:59:59Z`);
    let { campaigns } = await api<{
      campaigns: Array<{ id: string; metrics: { clicks: number; cost_cents: number }; cost_source?: string; impressions?: number }>;
    }>("GET", `/api/reports/campaigns?from=${from}&to=${to}`);
    let row = campaigns.find((c) => c.id === program.id)!;
    expect(row.metrics.clicks).toBe(3);
    expect(row.metrics.cost_cents).toBeLessThan(10); // Less than 10 cents

    // Sync daily stats with actual Adcash spend
    await api("PUT", `/api/sources/${source.id}/settings`, { api_provider: "adcash", api_key: "test-key" });
    const day = today();
    const settingsRow = (await getSourceSettingsRow(env.DB, source.id))!;
    await syncSourceCost(env, settingsRow, {
      days: [day],
      fetchFn: async () =>
        Response.json([
          { date: day, campaign_id: "459729072", impressions: 9091, spend: 9.93 },
        ]),
    });

    // After sync: cost is from daily stats (993 cents)
    ({ campaigns } = await api<{
      campaigns: Array<{ id: string; metrics: { clicks: number; cost_cents: number }; cost_source?: string; impressions?: number }>;
    }>("GET", `/api/reports/campaigns?from=${from}&to=${to}`));
    row = campaigns.find((c) => c.id === program.id)!;
    expect(row.metrics.clicks).toBe(3);
    expect(row.metrics.cost_cents).toBe(993);
    expect(row.cost_source).toBe("daily_stats");
    expect(row.impressions).toBe(9091);
  });

  it("trend report includes impressions per day", async () => {
    const { source, program } = await adcashCampaign();

    await upsertCampaignMapping(env.DB, {
      userId: (await env.DB.prepare("SELECT user_id FROM traffic_sources WHERE id = ?").bind(source.id).first<{ user_id: string }>())!
        .user_id,
      trafficSourceId: source.id,
      programId: program.id,
      externalCampaignId: "459729072",
    });

    await click(program.campaign_key, "campaignid=459729072&cost=0.001");

    await api("PUT", `/api/sources/${source.id}/settings`, { api_provider: "adcash", api_key: "test-key" });
    const day = today();
    const row = (await getSourceSettingsRow(env.DB, source.id))!;
    await syncSourceCost(env, row, {
      days: [day],
      fetchFn: async () =>
        Response.json([
          { date: day, campaign_id: "459729072", impressions: 12842, spend: 14.15 },
        ]),
    });

    const from = Date.parse(`${day}T00:00:00Z`);
    const to = Date.parse(`${day}T23:59:59Z`);
    const { trends } = await api<{
      trends: Array<{ date: string; clicks: number; cost_cents: number; impressions?: number; cost_source?: string }>;
    }>("GET", `/api/reports/campaigns/${program.id}/trends?from=${from}&to=${to}`);

    expect(trends.length).toBeGreaterThan(0);
    const dayRow = trends.find((d) => d.date === day);
    expect(dayRow).toBeDefined();
    expect(dayRow!.clicks).toBe(1);
    expect(dayRow!.cost_cents).toBe(1415);
    expect(dayRow!.impressions).toBe(12842);
    expect(dayRow!.cost_source).toBe("daily_stats");
  });

  it("falls back to click cost when no daily stats exist for a day", async () => {
    const { source, program } = await adcashCampaign();

    await upsertCampaignMapping(env.DB, {
      userId: (await env.DB.prepare("SELECT user_id FROM traffic_sources WHERE id = ?").bind(source.id).first<{ user_id: string }>())!
        .user_id,
      trafficSourceId: source.id,
      programId: program.id,
      externalCampaignId: "459729072",
    });

    // Day 1: clicks with cost param
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    
    // Create an affiliate first
    const { results: affiliates } = await env.DB.prepare("SELECT id FROM affiliates WHERE program_id = ?").bind(program.id).all<{ id: string }>();
    let affiliateId: string;
    if (!affiliates || affiliates.length === 0) {
      affiliateId = `aff-${crypto.randomUUID()}`;
      await env.DB.prepare("INSERT INTO affiliates (id, program_id, name, code, created_at) VALUES (?, ?, 'Test Aff', 'test', ?)")
        .bind(affiliateId, program.id, Date.now())
        .run();
    } else {
      affiliateId = affiliates[0].id;
    }
    
    await env.DB.prepare(
      "INSERT INTO clicks (id, program_id, affiliate_id, created_at, cost_cents, is_bot, user_agent) VALUES (?, ?, ?, ?, 100, 0, ?)",
    )
      .bind("click-1", program.id, affiliateId, Date.parse(`${yesterday}T12:00:00Z`), BROWSER_HEADERS["User-Agent"])
      .run();

    // Day 2: clicks with cost param + daily stats
    await click(program.campaign_key, "campaignid=459729072&cost=0.50");

    await api("PUT", `/api/sources/${source.id}/settings`, { api_provider: "adcash", api_key: "test-key" });
    const day = today();
    const row = (await getSourceSettingsRow(env.DB, source.id))!;
    await syncSourceCost(env, row, {
      days: [day],
      fetchFn: async () =>
        Response.json([
          { date: day, campaign_id: "459729072", impressions: 5000, spend: 5.00 },
        ]),
    });

    const from = Date.parse(`${yesterday}T00:00:00Z`);
    const to = Date.parse(`${day}T23:59:59Z`);
    const { trends } = await api<{
      trends: Array<{ date: string; clicks: number; cost_cents: number; impressions?: number; cost_source?: string }>;
    }>("GET", `/api/reports/campaigns/${program.id}/trends?from=${from}&to=${to}`);

    const yesterdayRow = trends.find((d) => d.date === yesterday)!;
    expect(yesterdayRow.cost_cents).toBe(100); // From click cost
    // No daily stats exist for yesterday, so cost_source is undefined
    expect(yesterdayRow.cost_source).toBeUndefined();
    expect(yesterdayRow.impressions).toBeUndefined();

    const todayRow = trends.find((d) => d.date === day)!;
    expect(todayRow.cost_cents).toBe(500); // From daily stats
    expect(todayRow.cost_source).toBe("daily_stats");
    expect(todayRow.impressions).toBe(5000);
  });

  it("handles campaigns without mappings gracefully", async () => {
    const { source, program } = await adcashCampaign();

    await click(program.campaign_key, "cost=1.00");

    await api("PUT", `/api/sources/${source.id}/settings`, { api_provider: "adcash", api_key: "test-key" });
    const day = today();
    const row = (await getSourceSettingsRow(env.DB, source.id))!;
    
    // Sync returns data but doesn't create daily stats without mapping
    const result = await syncSourceCost(env, row, {
      days: [day],
      fetchFn: async () =>
        Response.json([
          { date: day, campaign_id: "unmapped-campaign", impressions: 1000, spend: 10.00 },
        ]),
    });

    expect(result.daily_stats_created).toBe(0);
    expect(result.total_impressions).toBe(0);

    // Click cost still works
    const { campaigns } = await api<{
      campaigns: Array<{ id: string; metrics: { cost_cents: number }; impressions?: number }>;
    }>("GET", "/api/reports/campaigns");
    const row2 = campaigns.find((c) => c.id === program.id)!;
    expect(row2.metrics.cost_cents).toBe(100); // From click
    expect(row2.impressions).toBeUndefined();
  });

  it("deletes campaign mapping", async () => {
    const { source, program } = await adcashCampaign();

    const { mapping } = await api<{ mapping: { id: string } }>(
      "POST",
      `/api/sources/${source.id}/campaign-mappings`,
      { program_id: program.id, external_campaign_id: "test-123" },
      201,
    );

    await api("DELETE", `/api/sources/${source.id}/campaign-mappings/${mapping.id}`);

    const { mappings } = await api<{ mappings: unknown[] }>("GET", `/api/sources/${source.id}/campaign-mappings`);
    expect(mappings).toHaveLength(0);
  });
});
