import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { BROWSER_HEADERS, registerTestUser } from "./helpers";
import { initSql } from "./schema";

let authHeaders: Record<string, string>;

async function json<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

describe("campaign stats loading", () => {
  beforeAll(async () => {
    const statements = initSql
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean);
    for (const statement of statements) {
      await env.DB.prepare(statement).run();
    }
    await env.DB.exec(`
      DELETE FROM visitor_assignments;
      DELETE FROM paths;
      DELETE FROM rotations;
      DELETE FROM conversions;
      DELETE FROM clicks;
      DELETE FROM affiliates;
      DELETE FROM offers;
      DELETE FROM landers;
      DELETE FROM traffic_sources;
      DELETE FROM groups;
      DELETE FROM programs;
      DELETE FROM auth_tokens;
      DELETE FROM users;
    `);
    ({ authHeaders } = await registerTestUser());
  });

  it("loads campaign reports for 'This month' (longer ranges)", async () => {
    const headers = authHeaders;

    const sourceRes = await SELF.fetch("http://localhost/api/entities/traffic-sources", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Adcash", cost_type: "cpc", default_cost_cents: 25 }),
    });
    const { traffic_source } = await json<{ traffic_source: { id: string } }>(sourceRes);

    const programRes = await SELF.fetch("http://localhost/api/programs", {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "YesPlay AND",
        destination_url: "https://yesplay.example/landing",
      }),
    });
    const { program, convert_secret } = await json<{
      program: { id: string; campaign_key: string };
      convert_secret: string;
    }>(programRes);

    await env.DB.prepare("UPDATE programs SET traffic_source_id = ? WHERE id = ?")
      .bind(traffic_source.id, program.id)
      .run();

    const affiliateRes = await SELF.fetch(`http://localhost/api/programs/${program.id}/affiliates`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Partner1" }),
    });
    const { affiliate } = await json<{ affiliate: { code: string; id: string } }>(affiliateRes);

    const now = Date.now();
    const monthStart = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), 1).getTime();
    
    // Create clicks across the month using the redirect endpoint
    for (let i = 0; i < 100; i++) {
      await SELF.fetch(`http://localhost/r/${affiliate.code}`, { 
        redirect: "manual", 
        headers: BROWSER_HEADERS 
      });
    }

    // Create some conversions (they're created at "now" because that's when the postback arrives)
    // Conversion-date bucketing: conversions are counted on the day the postback arrived, not click time
    for (let i = 0; i < 10; i++) {
      await SELF.fetch("http://localhost/api/v1/convert", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Program-Secret": convert_secret,
        },
        body: JSON.stringify({
          order_id: `ord_month_${i}`,
          amount: 100,
          affiliate_code: affiliate.code,
        }),
      });
    }

    // Test "This month" range (Nov 1 - Nov 23, 2026 based on the test timestamp)
    const fromDate = new Date(monthStart).toISOString().slice(0, 10);
    const toDate = new Date(now).toISOString().slice(0, 10);

    const reportRes = await SELF.fetch(
      `http://localhost/api/reports/campaigns?from=${fromDate}&to=${toDate}`,
      { headers }
    );
    expect(reportRes.status).toBe(200);
    
    const { campaigns } = await json<{
      campaigns: Array<{
        id: string;
        metrics: {
          clicks: number;
          leads: number;
          cost_cents: number;
          revenue_cents: number;
        };
      }>;
    }>(reportRes);

    const row = campaigns.find((c) => c.id === program.id);
    expect(row).toBeTruthy();
    expect(row!.metrics.clicks).toBe(100);
    expect(row!.metrics.leads).toBe(10);
    expect(row!.metrics.cost_cents).toBeGreaterThan(0);
  });

  it("loads campaign reports for 'Last 7 days'", async () => {
    const headers = authHeaders;

    const sourceRes = await SELF.fetch("http://localhost/api/entities/traffic-sources", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "PropellerAds", cost_type: "cpm", default_cost_cents: 100 }),
    });
    const { traffic_source } = await json<{ traffic_source: { id: string } }>(sourceRes);

    const programRes = await SELF.fetch("http://localhost/api/programs", {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "YesPlay iOS",
        destination_url: "https://yesplay.example/ios",
      }),
    });
    const { program, convert_secret } = await json<{
      program: { id: string; campaign_key: string };
      convert_secret: string;
    }>(programRes);

    await env.DB.prepare("UPDATE programs SET traffic_source_id = ? WHERE id = ?")
      .bind(traffic_source.id, program.id)
      .run();

    const affiliateRes = await SELF.fetch(`http://localhost/api/programs/${program.id}/affiliates`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Partner2" }),
    });
    const { affiliate } = await json<{ affiliate: { code: string } }>(affiliateRes);

    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    
    // Create clicks in the last 7 days using the redirect endpoint
    for (let i = 0; i < 50; i++) {
      await SELF.fetch(`http://localhost/r/${affiliate.code}`, { 
        redirect: "manual", 
        headers: BROWSER_HEADERS 
      });
    }

    // Test "Last 7 days" range
    const fromDate = new Date(sevenDaysAgo).toISOString().slice(0, 10);
    const toDate = new Date(now).toISOString().slice(0, 10);

    const reportRes = await SELF.fetch(
      `http://localhost/api/reports/campaigns?from=${fromDate}&to=${toDate}`,
      { headers }
    );
    expect(reportRes.status).toBe(200);
    
    const { campaigns } = await json<{
      campaigns: Array<{
        id: string;
        metrics: {
          clicks: number;
          cost_cents: number;
        };
      }>;
    }>(reportRes);

    const row = campaigns.find((c) => c.id === program.id);
    expect(row).toBeTruthy();
    expect(row!.metrics.clicks).toBe(50);
  });

  it("handles reports with no clicks gracefully", async () => {
    const headers = authHeaders;

    const programRes = await SELF.fetch("http://localhost/api/programs", {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "Empty Campaign",
        destination_url: "https://example.com",
      }),
    });
    const { program } = await json<{ program: { id: string } }>(programRes);

    const reportRes = await SELF.fetch("http://localhost/api/reports/campaigns", { headers });
    expect(reportRes.status).toBe(200);
    
    const { campaigns } = await json<{
      campaigns: Array<{
        id: string;
        metrics: {
          clicks: number;
          leads: number;
        };
      }>;
    }>(reportRes);

    const row = campaigns.find((c) => c.id === program.id);
    expect(row).toBeTruthy();
    expect(row!.metrics.clicks).toBe(0);
    expect(row!.metrics.leads).toBe(0);
  });
});
