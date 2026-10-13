import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { registerTestUser } from "./helpers";
import { initSql } from "./schema";

let authHeaders: Record<string, string>;

const MERCHANT = "https://merchant.example.com/pricing";
const LANDER = "https://merchant.example.com/lander?ref={click_id}";

async function json<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

describe("phase 4 reporting", () => {
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

  it("returns campaign metrics with cost, profit, and ROI", async () => {
    const headers = authHeaders;

    const sourceRes = await SELF.fetch("http://localhost/api/entities/traffic-sources", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Facebook", cost_type: "cpc", default_cost_cents: 50 }),
    });
    const { traffic_source } = await json<{ traffic_source: { id: string } }>(sourceRes);

    const programRes = await SELF.fetch("http://localhost/api/programs", {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "Report Campaign",
        destination_url: MERCHANT,
      }),
    });
    const { program, convert_secret } = await json<{
      program: { id: string; campaign_key: string };
      convert_secret: string;
    }>(programRes);

    await env.DB.prepare("UPDATE programs SET traffic_source_id = ? WHERE id = ?")
      .bind(traffic_source.id, program.id)
      .run();

    const landerRes = await SELF.fetch("http://localhost/api/entities/landers", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "LP", url: LANDER }),
    });
    const { lander } = await json<{ lander: { id: string } }>(landerRes);

    const offerRes = await SELF.fetch("http://localhost/api/entities/offers", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Offer", url: "https://offer.example.com/go?c={clickid}" }),
    });
    const { offer } = await json<{ offer: { id: string } }>(offerRes);

    await SELF.fetch(`http://localhost/api/programs/${program.id}/paths`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "Lander path",
        flow_type: "lander_offer",
        lander_id: lander.id,
        offer_id: offer.id,
      }),
    });

    const affiliateRes = await SELF.fetch(`http://localhost/api/programs/${program.id}/affiliates`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Partner" }),
    });
    const { affiliate } = await json<{ affiliate: { code: string } }>(affiliateRes);

    const firstClick = await SELF.fetch(`http://localhost/r/${affiliate.code}`, { redirect: "manual" });
    await SELF.fetch(`http://localhost/r/${affiliate.code}`, { redirect: "manual" });
    const clickId = new URL(firstClick.headers.get("Location")!).searchParams.get("click_id")!;
    const lpRes = await SELF.fetch(`http://localhost/lp/${clickId}`, { redirect: "manual" });
    expect(lpRes.status).toBe(302);

    const convertOk = await SELF.fetch("http://localhost/api/v1/convert", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Program-Secret": convert_secret,
      },
      body: JSON.stringify({
        order_id: `ord_report_${Date.now()}`,
        amount: 100,
        affiliate_code: affiliate.code,
      }),
    });
    expect(convertOk.status).toBe(200);

    const reportRes = await SELF.fetch("http://localhost/api/reports/campaigns", { headers });
    expect(reportRes.status).toBe(200);
    const { campaigns } = await json<{
      campaigns: Array<{
        id: string;
        metrics: {
          clicks: number;
          lp_clicks: number;
          leads: number;
          revenue_cents: number;
          cost_cents: number;
          profit_cents: number;
          cr: number;
          roi: number;
        };
      }>;
    }>(reportRes);

    const row = campaigns.find((c) => c.id === program.id);
    expect(row).toBeTruthy();
    expect(row!.metrics.clicks).toBe(2);
    expect(row!.metrics.lp_clicks).toBe(1);
    expect(row!.metrics.leads).toBe(1);
    expect(row!.metrics.revenue_cents).toBe(10000);
    expect(row!.metrics.cost_cents).toBe(100);
    expect(row!.metrics.profit_cents).toBe(9900);
    expect(row!.metrics.cr).toBe(50);
    expect(row!.metrics.roi).toBe(9900);
  });

  it("exports campaigns CSV", async () => {
    const res = await SELF.fetch("http://localhost/api/reports/campaigns.csv", {
      headers: authHeaders,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    const text = await res.text();
    expect(text).toContain("Campaign");
    expect(text).toContain("ROI %");
  });

  it("returns daily trends for a campaign", async () => {
    const headers = authHeaders;
    const programRes = await SELF.fetch("http://localhost/api/programs", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Trend Campaign", destination_url: MERCHANT }),
    });
    const { program } = await json<{ program: { id: string } }>(programRes);
    const affiliateRes = await SELF.fetch(`http://localhost/api/programs/${program.id}/affiliates`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Trend Partner" }),
    });
    const { affiliate } = await json<{ affiliate: { code: string } }>(affiliateRes);
    await SELF.fetch(`http://localhost/r/${affiliate.code}`, { redirect: "manual" });

    const trendsRes = await SELF.fetch(
      `http://localhost/api/reports/campaigns/${program.id}/trends`,
      { headers },
    );
    expect(trendsRes.status).toBe(200);
    const { trends } = await json<{ trends: Array<{ date: string; clicks: number }> }>(trendsRes);
    expect(trends.length).toBeGreaterThan(0);
    expect(trends[0]?.clicks).toBeGreaterThan(0);
  });
});
