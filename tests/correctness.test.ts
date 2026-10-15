import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { parseRangeBoundary } from "../worker/lib/timezone";
import { TOOLS } from "../worker/mcp/tools";
import { BROWSER_HEADERS, registerTestUser } from "./helpers";
import { initSql } from "./schema";

const MERCHANT = "https://merchant.example.com/pricing";

let authHeaders: Record<string, string>;

async function json<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

async function api(method: string, path: string, body?: unknown) {
  return SELF.fetch(`http://localhost${path}`, {
    method,
    headers: authHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await api("POST", path, body);
  expect(res.status).toBe(201);
  return json<T>(res);
}

async function setup(source?: { cost_type: string; default_cost_cents: number }) {
  const { program, convert_secret } = await post<{
    program: { id: string; campaign_key: string };
    convert_secret: string;
  }>("/api/programs", { name: `Metrics ${crypto.randomUUID().slice(0, 6)}`, destination_url: MERCHANT });
  let sourceId: string | null = null;
  if (source) {
    const { traffic_source } = await post<{ traffic_source: { id: string } }>(
      "/api/entities/traffic-sources",
      { name: `Source ${crypto.randomUUID().slice(0, 6)}`, ...source },
    );
    sourceId = traffic_source.id;
    await env.DB.prepare("UPDATE programs SET traffic_source_id = ? WHERE id = ?")
      .bind(sourceId, program.id)
      .run();
  }
  const { affiliate } = await post<{ affiliate: { code: string } }>(
    `/api/programs/${program.id}/affiliates`,
    { name: "Partner" },
  );
  return { program, affiliate, sourceId, convert_secret };
}

async function click(code: string): Promise<string> {
  const res = await SELF.fetch(`http://localhost/r/${code}`, { redirect: "manual", headers: BROWSER_HEADERS });
  expect(res.status).toBe(302);
  return new URL(res.headers.get("Location")!).searchParams.get("click_id")!;
}

async function postback(query: string) {
  const res = await SELF.fetch(`http://localhost/click?${query}`);
  expect(res.status).toBe(200);
}

type EventMetrics = { count: number; revenue_cents: number; cr: number; cpa_cents: number | null };
type Row = {
  key: string | null;
  label: string;
  metrics: { clicks: number; leads: number; cr: number; revenue_cents: number; cost_cents: number; roi: number | null };
  events: Record<string, number>;
  event_metrics: Record<string, EventMetrics>;
  currency: string;
  revenue_by_currency: Record<string, number>;
};

async function campaignRow(programId: string): Promise<Row> {
  const res = await api("GET", `/api/reports/grouped?by=campaign&campaign_id=${programId}`);
  expect(res.status).toBe(200);
  const { rows } = await json<{ rows: Row[] }>(res);
  expect(rows).toHaveLength(1);
  return rows[0];
}

describe("metrics correctness", () => {
  beforeAll(async () => {
    for (const statement of initSql.split(";").map((s) => s.trim()).filter(Boolean)) {
      await env.DB.prepare(statement).run();
    }
    ({ authHeaders } = await registerTestUser());
  });

  it("counts registration + FTD on one click as one conversion (CR <= 100%)", async () => {
    const { program, affiliate } = await setup({ cost_type: "cpa", default_cost_cents: 500 });
    const clickId = await click(affiliate.code);
    await click(affiliate.code);
    await postback(`cnv_id=${clickId}&event=registration`);
    await postback(`cnv_id=${clickId}&event=ftd&payout=100`);

    const row = await campaignRow(program.id);
    expect(row.metrics.clicks).toBe(2);
    expect(row.metrics.leads).toBe(1);
    expect(row.metrics.cr).toBe(50);
    // CPA is charged once per converted click, not per event.
    expect(row.metrics.cost_cents).toBe(500);
    expect(row.events).toEqual({ registration: 1, ftd: 1 });
    expect(row.event_metrics.ftd).toEqual({ count: 1, revenue_cents: 10000, cr: 50, cpa_cents: 500 });
    expect(row.event_metrics.registration).toEqual({ count: 1, revenue_cents: 0, cr: 50, cpa_cents: 500 });

    const stats = await json<{
      totals: { conversions: number; conversion_rate: number; event_metrics: Record<string, EventMetrics> };
    }>(await api("GET", `/api/programs/${program.id}/stats`));
    expect(stats.totals.conversions).toBe(1);
    expect(stats.totals.conversion_rate).toBe(50);
    expect(stats.totals.event_metrics.ftd.cr).toBe(50);

    const csv = await (await api("GET", "/api/reports/campaigns.csv")).text();
    expect(csv).toContain("Conversions");
    expect(csv).not.toContain("Leads");
    expect(csv).toContain("ftd CPA");
  });

  it("keeps click cost when the traffic source CPC or campaign source changes", async () => {
    const { program, affiliate, sourceId } = await setup({ cost_type: "cpc", default_cost_cents: 50 });
    await click(affiliate.code);
    await click(affiliate.code);
    expect((await campaignRow(program.id)).metrics.cost_cents).toBe(100);

    await env.DB.prepare("UPDATE traffic_sources SET default_cost_cents = 999 WHERE id = ?")
      .bind(sourceId)
      .run();
    await env.DB.prepare("UPDATE programs SET traffic_source_id = NULL WHERE id = ?")
      .bind(program.id)
      .run();
    expect((await campaignRow(program.id)).metrics.cost_cents).toBe(100);

    const res = await api(
      "GET",
      `/api/reports/grouped?by=traffic_source&campaign_id=${program.id}`,
    );
    const { rows } = await json<{ rows: Row[] }>(res);
    expect(rows.map((r) => r.key)).toEqual([sourceId]);

    // New clicks use the new settings.
    await env.DB.prepare("UPDATE programs SET traffic_source_id = ? WHERE id = ?")
      .bind(sourceId, program.id)
      .run();
    await click(affiliate.code);
    expect((await campaignRow(program.id)).metrics.cost_cents).toBe(1099);
  });

  it("shows ROI as null without cost and keeps currencies apart", async () => {
    const { program, affiliate, convert_secret } = await setup();
    await click(affiliate.code);
    const convert = (order_id: string, amount: number, currency: string) =>
      SELF.fetch("http://localhost/api/v1/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Program-Secret": convert_secret },
        body: JSON.stringify({ order_id, amount, currency, affiliate_code: affiliate.code }),
      });
    expect((await convert("o1", 10, "USD")).status).toBe(200);
    expect((await convert("o2", 20, "USD")).status).toBe(200);
    expect((await convert("o3", 5, "EUR")).status).toBe(200);

    const row = await campaignRow(program.id);
    expect(row.metrics.roi).toBeNull();
    expect(row.metrics.cr).toBeLessThanOrEqual(100);
    expect(row.currency).toBe("USD");
    expect(row.metrics.revenue_cents).toBe(3000);
    expect(row.revenue_by_currency).toEqual({ USD: 3000, EUR: 500 });
  });

  it("never routes traffic to weight 0 paths and validates weights", async () => {
    const { program, affiliate } = await setup();
    const zero = await post<{ path: { id: string } }>(`/api/programs/${program.id}/paths`, {
      name: "Off",
      flow_type: "direct",
      direct_url: "https://merchant.example.com/off",
      weight: 0,
    });
    await post(`/api/programs/${program.id}/paths`, {
      name: "On",
      flow_type: "direct",
      direct_url: "https://merchant.example.com/on",
      weight: 1,
    });
    for (let i = 0; i < 15; i++) {
      const res = await SELF.fetch(`http://localhost/r/${affiliate.code}`, { redirect: "manual", headers: BROWSER_HEADERS });
      expect(new URL(res.headers.get("Location")!).pathname).toBe("/on");
    }

    for (const weight of [-1, 1.5, "10"]) {
      const created = await api("POST", `/api/programs/${program.id}/paths`, {
        name: "Bad",
        flow_type: "direct",
        direct_url: "https://merchant.example.com/bad",
        weight,
      });
      expect(created.status).toBe(400);
      const patched = await api("PATCH", `/api/programs/${program.id}/paths/${zero.path.id}`, {
        weight,
      });
      expect(patched.status).toBe(400);
    }
  });

  it("rejects invalid entity and bulk inputs with 400", async () => {
    const bad = [
      { cost_type: "cpx" },
      { postback_percent: 101 },
      { postback_percent: 50.5 },
      { default_cost_cents: -1 },
    ];
    for (const extra of bad) {
      const res = await api("POST", "/api/entities/traffic-sources", { name: "Bad", ...extra });
      expect(res.status).toBe(400);
    }
    const offer = await api("POST", "/api/entities/offers", {
      name: "Bad",
      url: "https://offer.example.com",
      payout_cents: -5,
    });
    expect(offer.status).toBe(400);

    const { program } = await setup();
    const bulk = await api("POST", "/api/ops/programs/bulk", {
      program_ids: [program.id],
      status: "deleted",
    });
    expect(bulk.status).toBe(400);
  });

  it("creates the campaign affiliate and rotation once under concurrent first clicks", async () => {
    const { program } = await setup();
    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        SELF.fetch(`http://localhost/c/${program.campaign_key}`, { redirect: "manual" }),
      ),
    );
    for (const res of responses) expect(res.status).toBe(302);
    const affiliates = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM affiliates WHERE program_id = ? AND code LIKE 'c_%'",
    )
      .bind(program.id)
      .first<{ n: number }>();
    expect(affiliates?.n).toBe(1);
    const rotations = await env.DB.prepare("SELECT COUNT(*) AS n FROM rotations WHERE program_id = ?")
      .bind(program.id)
      .first<{ n: number }>();
    expect(rotations?.n).toBe(1);
  });

  it("counts bot clicks separately: no cost, not in CR denominators", async () => {
    const { program, affiliate } = await setup({ cost_type: "cpc", default_cost_cents: 10 });
    const human = await click(affiliate.code);
    await click(affiliate.code);
    // No user agent and a crawler UA: both flagged is_bot.
    for (const headers of [{}, { "User-Agent": "Googlebot/2.1" }] as Array<Record<string, string>>) {
      const res = await SELF.fetch(`http://localhost/r/${affiliate.code}`, { redirect: "manual", headers });
      expect(res.status).toBe(302);
    }
    await postback(`cnv_id=${human}&cnv_status=sale`);

    const row = (await campaignRow(program.id)) as Row & {
      metrics: Row["metrics"] & { bot_clicks: number; cpc_cents: number };
    };
    expect(row.metrics.clicks).toBe(4);
    expect(row.metrics.bot_clicks).toBe(2);
    expect(row.metrics.cost_cents).toBe(20);
    expect(row.metrics.cpc_cents).toBe(10);
    expect(row.metrics.leads).toBe(1);
    expect(row.metrics.cr).toBe(50);

    const res = await api("GET", `/api/programs/${program.id}/stats`);
    expect(res.status).toBe(200);
    const stats = await json<{
      totals: { clicks: number; bots: number; conversions: number; conversion_rate: number };
      affiliates: Array<{ clicks: number; bots: number; conversion_rate: number }>;
    }>(res);
    expect(stats.totals).toMatchObject({ clicks: 4, bots: 2, conversions: 1, conversion_rate: 50 });
    expect(stats.affiliates[0]).toMatchObject({ clicks: 4, bots: 2, conversion_rate: 50 });
  });

  it("MCP: a date-only `to` covers the whole day", () => {
    // MCP passes calendar days through; the API resolves them in the account timezone.
    const report = TOOLS.find((t) => t.name === "report_campaigns")!;
    const call = report.call({ from: "2026-01-31", to: "2026-01-31" });
    expect(call.query?.from).toBe("2026-01-31");
    expect(call.query?.to).toBe("2026-01-31");
    expect(report.call({ to: "1700000000000" }).query?.to).toBe("1700000000000");
    expect(parseRangeBoundary("2026-01-31", "UTC", "from")).toBe(Date.UTC(2026, 0, 31));
    expect(parseRangeBoundary("2026-01-31", "UTC", "to")).toBe(Date.UTC(2026, 1, 1) - 1);

    const trends = TOOLS.find((t) => t.name === "report_trends")!;
    expect(trends.call({ campaign_id: "prg_1", to: "2026-01-31" }).query?.to).toBe("2026-01-31");
  });
});
