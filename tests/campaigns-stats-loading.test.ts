import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { groupedClickQuery } from "../worker/db/reports";
import { registerTestUser } from "./helpers";
import { initSql } from "./schema";

let authHeaders: Record<string, string>;

const DAY = 24 * 60 * 60 * 1000;
// Fixed UTC instants so range checks do not depend on the clock.
const OCT_20 = Date.UTC(2026, 9, 20, 12, 0, 0);
const NOV_02 = Date.UTC(2026, 10, 2, 15, 0, 0);
const NOV_10 = Date.UTC(2026, 10, 10, 8, 0, 0);
const NOV_23 = Date.UTC(2026, 10, 23, 18, 0, 0);
const NOV_25 = Date.UTC(2026, 10, 25, 9, 0, 0);
const RANGE_FROM = "2026-11-01";
const RANGE_TO = "2026-11-23";

async function json<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

async function insertClicks(
  rows: Array<{ id: string; programId: string; affiliateId: string; createdAt: number; cost?: number }>,
) {
  // One row per statement. A single multi-row INSERT large enough for a month of
  // clicks crashes the local D1 runtime (workerd hash-index segfault).
  const batch = 40;
  for (let i = 0; i < rows.length; i += batch) {
    const slice = rows.slice(i, i + batch);
    await env.DB.batch(
      slice.map((row) =>
        env.DB.prepare(
          `INSERT INTO clicks (id, program_id, affiliate_id, created_at, is_unique, is_bot, cost_cents)
           VALUES (?, ?, ?, ?, 1, 0, ?)`,
        ).bind(row.id, row.programId, row.affiliateId, row.createdAt, row.cost ?? 25),
      ),
    );
  }
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

  it("filters clicks by the requested range and buckets conversions on the postback day", async () => {
    const headers = authHeaders;
    const programRes = await SELF.fetch("http://localhost/api/programs", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Range Campaign", destination_url: "https://example.com/range" }),
    });
    const { program } = await json<{ program: { id: string } }>(programRes);
    const affiliateRes = await SELF.fetch(`http://localhost/api/programs/${program.id}/affiliates`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Partner" }),
    });
    const { affiliate } = await json<{ affiliate: { id: string } }>(affiliateRes);

    await insertClicks([
      { id: "clk_out_before", programId: program.id, affiliateId: affiliate.id, createdAt: OCT_20 },
      { id: "clk_nov_02", programId: program.id, affiliateId: affiliate.id, createdAt: NOV_02 },
      { id: "clk_nov_10", programId: program.id, affiliateId: affiliate.id, createdAt: NOV_10 },
      { id: "clk_nov_23", programId: program.id, affiliateId: affiliate.id, createdAt: NOV_23 },
      { id: "clk_out_after", programId: program.id, affiliateId: affiliate.id, createdAt: NOV_25 },
    ]);

    // Click on Nov 2, postback arrives Nov 10. Counted on the postback day.
    // Click on Oct 20 (outside the range), postback arrives Nov 10. The click is
    // outside the campaign-list range; the trend still puts the lead on Nov 10.
    // Rejected postback must not count.
    await env.DB.prepare(
      `INSERT INTO conversions (id, program_id, affiliate_id, click_id, order_id, amount_cents, status, event, currency, created_at)
       VALUES
         ('cv_reg', ?, ?, 'clk_nov_02', 'ord_reg', 0, 'approved', 'registration', 'USD', ?),
         ('cv_ftd', ?, ?, 'clk_nov_02', 'ord_ftd', 5000, 'approved', 'ftd', 'USD', ?),
         ('cv_outside_click', ?, ?, 'clk_out_before', 'ord_out', 1000, 'approved', 'registration', 'USD', ?),
         ('cv_rejected', ?, ?, 'clk_nov_10', 'ord_rej', 9000, 'rejected', 'ftd', 'USD', ?)`,
    )
      .bind(
        program.id, affiliate.id, NOV_10,
        program.id, affiliate.id, NOV_23,
        program.id, affiliate.id, NOV_10,
        program.id, affiliate.id, NOV_10,
      )
      .run();

    const reportRes = await SELF.fetch(
      `http://localhost/api/reports/campaigns?from=${RANGE_FROM}&to=${RANGE_TO}`,
      { headers },
    );
    expect(reportRes.status).toBe(200);
    const { campaigns } = await json<{
      campaigns: Array<{
        id: string;
        metrics: { clicks: number; leads: number; cost_cents: number; revenue_cents: number };
        events: Record<string, number>;
      }>;
    }>(reportRes);
    const row = campaigns.find((item) => item.id === program.id);
    expect(row).toBeTruthy();
    // Oct 20 and Nov 25 clicks are outside Nov 1–23.
    expect(row!.metrics.clicks).toBe(3);
    expect(row!.metrics.cost_cents).toBe(75);
    // Nov 2 click converted (registration + ftd are one lead). Oct 20 click is outside
    // the range, so its in-range postback is not a campaign-list lead. Rejected is ignored.
    expect(row!.metrics.leads).toBe(1);
    // Event counts follow the postback timestamp, so the October click's November
    // registration is included even though that click is outside the click range.
    expect(row!.events.registration).toBe(2);
    expect(row!.events.ftd).toBe(1);
    expect(row!.metrics.revenue_cents).toBe(6000);

    const trendsRes = await SELF.fetch(
      `http://localhost/api/reports/campaigns/${program.id}/trends?from=${RANGE_FROM}&to=${RANGE_TO}`,
      { headers },
    );
    expect(trendsRes.status).toBe(200);
    const { trends } = await json<{
      trends: Array<{ date: string; clicks: number; leads: number; events: Record<string, number> }>;
    }>(trendsRes);
    const nov02 = trends.find((point) => point.date === "2026-11-02");
    const nov10 = trends.find((point) => point.date === "2026-11-10");
    const nov23 = trends.find((point) => point.date === "2026-11-23");
    expect(nov02?.clicks).toBe(1);
    expect(nov02?.leads).toBe(0);
    expect(nov10?.clicks).toBe(1);
    // Registrations posted on Nov 10: the in-range click and the October click.
    // The FTD for the Nov 2 click posted on Nov 23, so it is not on this day.
    expect(nov10?.leads).toBe(2);
    expect(nov10?.events.registration).toBe(2);
    expect(nov10?.events.ftd ?? 0).toBe(0);
    expect(nov23?.clicks).toBe(1);
    expect(nov23?.leads).toBe(1);
    expect(nov23?.events.ftd).toBe(1);
    expect(trends.some((point) => point.date === "2026-10-20" || point.date === "2026-11-25")).toBe(false);
  });

  it("aggregates a month of clicks from the stats index without a full scan", async () => {
    const headers = authHeaders;
    const programRes = await SELF.fetch("http://localhost/api/programs", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Volume Campaign", destination_url: "https://example.com/volume" }),
    });
    const { program } = await json<{ program: { id: string; user_id?: string } }>(programRes);
    const affiliateRes = await SELF.fetch(`http://localhost/api/programs/${program.id}/affiliates`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Volume Partner" }),
    });
    const { affiliate } = await json<{ affiliate: { id: string } }>(affiliateRes);
    const owner = await env.DB.prepare("SELECT user_id FROM programs WHERE id = ?")
      .bind(program.id)
      .first<{ user_id: string }>();

    const inRange = 250_000;
    const outOfRange = 20_000;
    const rows: Array<{ id: string; programId: string; affiliateId: string; createdAt: number }> = [];
    const span = NOV_23 - Date.UTC(2026, 10, 1, 0, 0, 0);
    for (let i = 0; i < inRange; i++) {
      rows.push({
        id: `vol_${i}`,
        programId: program.id,
        affiliateId: affiliate.id,
        createdAt: Date.UTC(2026, 10, 1, 0, 0, 0) + Math.floor((i * span) / inRange),
      });
    }
    for (let i = 0; i < outOfRange; i++) {
      rows.push({
        id: `vol_out_${i}`,
        programId: program.id,
        affiliateId: affiliate.id,
        createdAt: OCT_20 + i * 1000,
      });
    }
    await insertClicks(rows);

    // A handful of in-range clicks convert, with the postback on a later day.
    await env.DB.prepare(
      `INSERT INTO conversions (id, program_id, affiliate_id, click_id, order_id, amount_cents, status, currency, created_at)
       VALUES ('cv_vol_0', ?, ?, 'vol_0', 'ord_vol_0', 100, 'approved', 'USD', ?),
              ('cv_vol_1', ?, ?, 'vol_1', 'ord_vol_1', 100, 'approved', 'USD', ?)`,
    )
      .bind(program.id, affiliate.id, NOV_10, program.id, affiliate.id, NOV_23)
      .run();

    const fromMs = Date.UTC(2026, 10, 1, 0, 0, 0);
    const toMs = Date.UTC(2026, 10, 23, 23, 59, 59, 999);
    const scan = groupedClickQuery(owner!.user_id, "campaign", { from: fromMs, to: toMs });
    expect(scan.sql).toContain("JOIN clicks cf ON cf.id = cv.click_id");
    const plan = await env.DB.prepare(`EXPLAIN QUERY PLAN ${scan.sql}`).bind(...scan.binds).raw();
    const planText = JSON.stringify(plan);
    expect(planText).toContain("idx_clicks_program_created_stats");
    expect(planText).not.toContain("SCAN c");
    expect(planText).not.toContain("SCAN clicks");
    expect(planText.toLowerCase()).not.toContain("correlated");

    const started = Date.now();
    const reportRes = await SELF.fetch(
      `http://localhost/api/reports/campaigns?from=${RANGE_FROM}&to=${RANGE_TO}`,
      { headers },
    );
    const duration = Date.now() - started;
    expect(reportRes.status).toBe(200);
    expect(duration).toBeLessThan(5_000);

    const { campaigns } = await json<{
      campaigns: Array<{ id: string; metrics: { clicks: number; leads: number; cost_cents: number } }>;
    }>(reportRes);
    const row = campaigns.find((item) => item.id === program.id);
    expect(row!.metrics.clicks).toBe(inRange);
    expect(row!.metrics.cost_cents).toBe(inRange * 25);
    expect(row!.metrics.leads).toBe(2);
  }, 120_000);
});
