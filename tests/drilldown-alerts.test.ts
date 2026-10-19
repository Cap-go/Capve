import { env, SELF } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { registerTestUser } from "./helpers";
import { initSql } from "./schema";
import { getAutomationRule } from "../worker/db/automation";
import { evaluateAutomationRule, runAutomationRules } from "../worker/cron/alerts";
import { parseRangeBoundary, timeZoneOffsetMinutes, zonedMidnightMs } from "../worker/lib/timezone";
import type { Env } from "../worker/types";

const MERCHANT = "https://merchant.example.com/casino";
let headers: Record<string, string>;
let accountId: string;

async function json<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

async function api<T>(path: string, init: RequestInit = {}): Promise<{ status: number; body: T }> {
  const res = await SELF.fetch(`http://localhost${path}`, { ...init, headers });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // text response
  }
  return { status: res.status, body: body as T };
}

async function createCampaign(name: string, costCents = 10) {
  const { body: source } = await api<{ traffic_source: { id: string } }>(
    "/api/entities/traffic-sources",
    {
      method: "POST",
      body: JSON.stringify({ name: `Adcash ${name}`, cost_type: "cpc", default_cost_cents: costCents }),
    },
  );
  const { body } = await api<{ program: { id: string; campaign_key: string; user_id: string } }>(
    "/api/programs",
    {
      method: "POST",
      body: JSON.stringify({
        name,
        destination_url: MERCHANT,
        traffic_source_id: source.traffic_source.id,
      }),
    },
  );
  const { body: aff } = await api<{ affiliate: { id: string } }>(
    `/api/programs/${body.program.id}/affiliates`,
    { method: "POST", body: JSON.stringify({ name: "Direct" }) },
  );
  accountId = body.program.user_id;
  return { program: body.program, affiliateId: aff.affiliate.id };
}

let seq = 0;
async function insertClick(
  programId: string,
  affiliateId: string,
  fields: { sub1?: string; country?: string; created_at: number },
) {
  const clickId = `clk_t${++seq}`;
  // Same source + CPC/CPM cost snapshot as recordClick (cost is stored on the click).
  await env.DB.prepare(
    `INSERT INTO clicks (id, program_id, affiliate_id, sub1, country, created_at, traffic_source_id, cost_cents)
     VALUES (?, ?, ?, ?, ?, ?, (SELECT traffic_source_id FROM programs WHERE id = ?),
       (SELECT CASE ts.cost_type WHEN 'cpc' THEN ts.default_cost_cents
          WHEN 'cpm' THEN ts.default_cost_cents / 1000.0 END
        FROM programs p JOIN traffic_sources ts ON ts.id = p.traffic_source_id WHERE p.id = ?))`,
  )
    .bind(
      clickId,
      programId,
      affiliateId,
      fields.sub1 ?? null,
      fields.country ?? null,
      fields.created_at,
      programId,
      programId,
    )
    .run();
  return clickId;
}

async function insertConversion(
  programId: string,
  affiliateId: string,
  clickId: string,
  event: string,
  amountCents: number,
  createdAt: number,
) {
  await env.DB.prepare(
    `INSERT INTO conversions (id, program_id, affiliate_id, click_id, order_id, amount_cents, status, event, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'approved', ?, ?)`,
  )
    .bind(`cv_t${++seq}`, programId, affiliateId, clickId, `ord_${seq}`, amountCents, event, createdAt)
    .run();
}

type Node = {
  key: string | null;
  label: string;
  dimension: string;
  metrics: { clicks: number; leads: number; revenue_cents: number; cost_cents: number; roi: number };
  events: Record<string, number>;
  children: Node[];
};

describe("drilldown, timezone, automation, tracking domains", () => {
  beforeAll(async () => {
    for (const statement of initSql
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)) {
      await env.DB.prepare(statement).run();
    }
    ({ authHeaders: headers } = await registerTestUser());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns nested drilldown rows with grouped-report metrics", async () => {
    const { program, affiliateId } = await createCampaign("Casino FR");
    const t = Date.now() - 60 * 60 * 1000;
    const a1 = await insertClick(program.id, affiliateId, { sub1: "zoneA", country: "FR", created_at: t });
    await insertClick(program.id, affiliateId, { sub1: "zoneA", country: "FR", created_at: t });
    await insertClick(program.id, affiliateId, { sub1: "zoneA", country: "FR", created_at: t });
    await insertClick(program.id, affiliateId, { sub1: "zoneA", country: "DE", created_at: t });
    await insertClick(program.id, affiliateId, { sub1: "zoneB", country: "FR", created_at: t });
    await insertClick(program.id, affiliateId, { sub1: "zoneB", country: "FR", created_at: t });
    await insertConversion(program.id, affiliateId, a1, "registration", 0, t);
    await insertConversion(program.id, affiliateId, a1, "ftd", 5000, t);

    const { status, body } = await api<{ by: string[]; rows: Node[] }>(
      `/api/reports/drilldown?by=campaign,sub1,country&campaign_id=${program.id}`,
    );
    expect(status).toBe(200);
    expect(body.by).toEqual(["campaign", "sub1", "country"]);
    expect(body.rows).toHaveLength(1);
    const [campaign] = body.rows;
    expect(campaign.label).toBe("Casino FR");
    expect(campaign.metrics.clicks).toBe(6);
    expect(campaign.metrics.revenue_cents).toBe(5000);
    expect(campaign.metrics.cost_cents).toBe(60);
    expect(campaign.events).toEqual({ registration: 1, ftd: 1 });

    const grouped = await api<{ rows: Array<{ metrics: Node["metrics"] }> }>(
      `/api/reports/grouped?by=campaign&campaign_id=${program.id}`,
    );
    expect(campaign.metrics).toEqual(grouped.body.rows[0].metrics);

    expect(campaign.children.map((n) => [n.key, n.metrics.clicks])).toEqual([
      ["zoneA", 4],
      ["zoneB", 2],
    ]);
    const zoneA = campaign.children[0];
    expect(zoneA.dimension).toBe("sub1");
    expect(zoneA.events.ftd).toBe(1);
    // Conversions = converted clicks: registration + ftd on one click count once.
    expect(zoneA.children.map((n) => [n.key, n.metrics.clicks, n.metrics.leads])).toEqual([
      ["FR", 3, 1],
      ["DE", 1, 0],
    ]);
    expect(zoneA.children[0].metrics.cost_cents).toBe(30);
    expect(zoneA.children[0].children).toEqual([]);

    expect((await api(`/api/reports/drilldown?by=sub1,nope`)).status).toBe(400);
    expect((await api(`/api/reports/drilldown?by=sub1,sub1`)).status).toBe(400);
    expect((await api(`/api/reports/drilldown?by=campaign,sub1,sub2,country,os`)).status).toBe(400);
  });

  it("computes timezone offsets and calendar-day boundaries", () => {
    expect(timeZoneOffsetMinutes("Europe/Paris", Date.UTC(2026, 6, 1))).toBe(120);
    expect(timeZoneOffsetMinutes("Europe/Paris", Date.UTC(2026, 0, 15))).toBe(60);
    expect(timeZoneOffsetMinutes("America/New_York", Date.UTC(2026, 0, 15))).toBe(-300);
    expect(zonedMidnightMs("2026-07-02", "Europe/Paris")).toBe(Date.UTC(2026, 6, 1, 22));
    expect(parseRangeBoundary("2026-07-02", "Europe/Paris", "to")).toBe(Date.UTC(2026, 6, 2, 22) - 1);
    expect(parseRangeBoundary("1700000000000", "Europe/Paris", "from")).toBe(1700000000000);
  });

  it("buckets dates and resolves date ranges in the account timezone", async () => {
    const { program, affiliateId } = await createCampaign("TZ campaign");
    // 00:30 on July 2 in Paris, still July 1 in UTC.
    await insertClick(program.id, affiliateId, { sub1: "z", created_at: Date.UTC(2026, 6, 1, 22, 30) });

    const byDate = () =>
      api<{ rows: Array<{ key: string }> }>(
        `/api/reports/grouped?by=date&campaign_id=${program.id}&from=2026-07-01&to=2026-07-03`,
      );
    expect((await byDate()).body.rows.map((r) => r.key)).toEqual(["2026-07-01"]);

    const onlyJuly2 = `/api/reports/grouped?by=campaign&campaign_id=${program.id}&from=2026-07-02&to=2026-07-02`;
    expect((await api<{ rows: unknown[] }>(onlyJuly2)).body.rows).toHaveLength(0);

    expect((await api("/api/settings", { method: "PUT", body: JSON.stringify({ timezone: "Mars/Base" }) })).status).toBe(400);
    const saved = await api<{ settings: { timezone: string } }>("/api/settings", {
      method: "PUT",
      body: JSON.stringify({ timezone: "Europe/Paris" }),
    });
    expect(saved.body.settings.timezone).toBe("Europe/Paris");
    expect((await api<{ settings: { timezone: string } }>("/api/settings")).body.settings.timezone).toBe(
      "Europe/Paris",
    );

    expect((await byDate()).body.rows.map((r) => r.key)).toEqual(["2026-07-02"]);
    expect((await api<{ rows: unknown[] }>(onlyJuly2)).body.rows).toHaveLength(1);

    const trends = await api<{ trends: Array<{ date: string }> }>(
      `/api/reports/campaigns/${program.id}/trends?from=2026-07-01`,
    );
    expect(trends.body.trends.map((p) => p.date)).toEqual(["2026-07-02"]);

    const drill = await api<{ rows: Node[] }>(
      `/api/reports/drilldown?by=date,sub1&campaign_id=${program.id}&from=2026-07-01`,
    );
    expect(drill.body.rows[0].key).toBe("2026-07-02");
    expect(drill.body.rows[0].children[0].key).toBe("z");

    await api("/api/settings", { method: "PUT", body: JSON.stringify({ timezone: "UTC" }) });
  });

  it("groups reports by time, network, IP range, uniqueness and bot", async () => {
    const { program, affiliateId } = await createCampaign("Groupings campaign");
    const { body: net } = await api<{ network: { id: string } }>("/api/entities/networks", {
      method: "POST",
      body: JSON.stringify({ name: "Net A" }),
    });
    const { body: off } = await api<{ offer: { id: string } }>("/api/entities/offers", {
      method: "POST",
      body: JSON.stringify({ name: "Offer A", url: MERCHANT, network_id: net.network.id }),
    });
    const insert = (id: string, fields: Record<string, string | number | null>) =>
      env.DB.prepare(
        `INSERT INTO clicks (id, program_id, affiliate_id, created_at, ip, user_agent, is_unique, is_bot, external_id, offer_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          id,
          program.id,
          affiliateId,
          fields.created_at,
          fields.ip,
          "UA",
          fields.is_unique ?? 1,
          fields.is_bot ?? 0,
          fields.external_id ?? null,
          fields.offer_id ?? null,
        )
        .run();
    // Europe/Paris is UTC+2 in July: hours and weekdays follow the account timezone.
    await api("/api/settings", { method: "PUT", body: JSON.stringify({ timezone: "Europe/Paris" }) });
    await insert("clk_g1", {
      created_at: Date.UTC(2026, 6, 6, 8, 15), // Monday 10:15 Paris
      ip: "1.2.3.4",
      external_id: "src_1",
      offer_id: off.offer.id,
    });
    await insert("clk_g2", { created_at: Date.UTC(2026, 6, 6, 8, 45), ip: "1.2.3.99", is_unique: 0, is_bot: 1 });
    await insert("clk_g3", { created_at: Date.UTC(2026, 6, 5, 20, 0), ip: "2001:db8::1" }); // Sunday 22:00
    await insertConversion(program.id, affiliateId, "clk_g1", "ftd", 5000, Date.UTC(2026, 6, 6, 9));

    const grouped = async (by: string) =>
      (
        await api<{ rows: Array<{ key: string | null; label: string; metrics: { clicks: number; leads: number } }> }>(
          `/api/reports/grouped?by=${by}&campaign_id=${program.id}&from=2026-07-01&to=2026-07-31`,
        )
      ).body.rows.map((r) => [r.key, r.label, r.metrics.clicks, r.metrics.leads]);

    expect(await grouped("hour")).toEqual([
      ["10", "10", 2, 1],
      ["22", "22", 1, 0],
    ]);
    expect(await grouped("weekday")).toEqual([
      ["1 Monday", "1 Monday", 2, 1],
      ["7 Sunday", "7 Sunday", 1, 0],
    ]);
    expect(await grouped("month")).toEqual([["2026-07", "2026-07", 3, 1]]);
    expect(await grouped("ip_range")).toEqual([
      ["1.2.3.xxx", "1.2.3.xxx", 2, 1],
      ["2001:db8::1", "2001:db8::1", 1, 0],
    ]);
    expect(await grouped("uniqueness")).toEqual([
      ["unique", "unique", 2, 1],
      ["repeat", "repeat", 1, 0],
    ]);
    expect(await grouped("bot")).toEqual([
      ["human", "human", 2, 1],
      ["bot", "bot", 1, 0],
    ]);
    const byNetwork = await grouped("network");
    expect(byNetwork).toContainEqual([net.network.id, "Net A", 1, 1]);
    expect(byNetwork).toContainEqual([null, expect.any(String), 2, 0]);

    // New dimensions also work as drilldown levels.
    const drill = await api<{ rows: Node[] }>(
      `/api/reports/drilldown?by=network,hour&campaign_id=${program.id}&from=2026-07-01&to=2026-07-31`,
    );
    expect(drill.status).toBe(200);
    const netA = drill.body.rows.find((n) => n.key === net.network.id);
    expect(netA?.children.map((n) => [n.key, n.metrics.clicks])).toEqual([["10", 1]]);
    // Hours read in order inside a level, not by clicks.
    const none = drill.body.rows.find((n) => n.key === null);
    expect(none?.children.map((n) => n.key)).toEqual(["10", "22"]);

    // Time and visitor-flag dimensions cannot hold a zone for automation.
    const rule = (dimension: string) =>
      api("/api/automation/rules", {
        method: "POST",
        body: JSON.stringify({ campaign_id: program.id, kind: "zone_blacklist", dimension, min_clicks: 1 }),
      });
    expect((await rule("hour")).status).toBe(400);
    expect((await rule("bot")).status).toBe(400);
    expect((await rule("ip_range")).status).toBe(201);
  });

  it("blacklists zones without FTDs and notifies by email and webhook", async () => {
    const { program, affiliateId } = await createCampaign("Zones");
    const t = Date.now() - 2 * 60 * 60 * 1000;
    const winner = await insertClick(program.id, affiliateId, { sub1: "1001", created_at: t });
    for (let i = 0; i < 3; i++) await insertClick(program.id, affiliateId, { sub1: "1001", created_at: t });
    for (let i = 0; i < 3; i++) await insertClick(program.id, affiliateId, { sub1: "2002", created_at: t });
    await insertClick(program.id, affiliateId, { sub1: "3003", created_at: t });
    // Registration only: still no FTD for zone 2002.
    const reg = await insertClick(program.id, affiliateId, { sub1: "2002", created_at: t });
    await insertConversion(program.id, affiliateId, reg, "registration", 0, t);
    await insertConversion(program.id, affiliateId, winner, "ftd", 4000, t);
    // Old clicks outside the window are ignored.
    for (let i = 0; i < 5; i++) {
      await insertClick(program.id, affiliateId, { sub1: "4004", created_at: Date.now() - 48 * 3600_000 });
    }

    const invalid = await api("/api/automation/rules", {
      method: "POST",
      body: JSON.stringify({ campaign_id: program.id, kind: "zone_blacklist", dimension: "date", min_clicks: 3 }),
    });
    expect(invalid.status).toBe(400);

    const created = await api<{ rule: { id: string; name: string } }>("/api/automation/rules", {
      method: "POST",
      body: JSON.stringify({
        campaign_id: program.id,
        kind: "zone_blacklist",
        dimension: "sub1",
        min_clicks: 3,
        event: "ftd",
        window_hours: 24,
        notify_email: "buyer@example.com",
        webhook_url: "https://hooks.example.com/capve",
      }),
    });
    expect(created.status).toBe(201);

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response("ok", { status: 200 }));
    const send = vi.fn(async (_message: { to: string }) => ({ messageId: "m1" }));
    const testEnv = { ...(env as unknown as Env), EMAIL: { send } };

    const rule = await getAutomationRule(env.DB, created.body.rule.id, accountId);
    const result = await evaluateAutomationRule(testEnv, rule!);
    expect(result.fired).toBe(true);
    expect(result.blacklisted).toEqual(["2002"]);
    expect(result.notified).toEqual({ email: true, webhook: true });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({ to: "buyer@example.com" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://hooks.example.com/capve");
    expect(JSON.parse(String(init?.body))).toMatchObject({ zones: ["2002"], dimension: "sub1" });

    // Second run: nothing new, no notification.
    const again = await evaluateAutomationRule(testEnv, (await getAutomationRule(env.DB, rule!.id, accountId))!);
    expect(again.fired).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);

    const txt = await SELF.fetch(
      `http://localhost/api/automation/blacklist?campaign_id=${program.id}&format=txt`,
      { headers },
    );
    expect(txt.headers.get("content-type")).toContain("text/plain");
    expect(await txt.text()).toBe("2002\n");
    const manual = await api<{ added: string[] }>("/api/automation/blacklist", {
      method: "POST",
      body: JSON.stringify({ campaign_id: program.id, dimension: "sub1", values: ["5005", "2002"] }),
    });
    expect(manual.body.added).toEqual(["5005"]);
    const list = await api<{ blacklist: Array<{ id: string; value: string }> }>(
      `/api/automation/blacklist?campaign_id=${program.id}`,
    );
    expect(list.body.blacklist.map((e) => e.value).sort()).toEqual(["2002", "5005"]);
    const csv = await api<string>(`/api/automation/blacklist?campaign_id=${program.id}&format=csv`);
    expect(csv.body.split("\n")[0]).toBe("dimension,value,reason,rule_id,blacklisted_at");

    const entry = list.body.blacklist.find((e) => e.value === "5005")!;
    expect((await api(`/api/automation/blacklist/${entry.id}`, { method: "DELETE" })).status).toBe(200);
  });

  it("fires ROI/spend alerts once per window", async () => {
    const { program, affiliateId } = await createCampaign("Alerting", 50);
    const t = Date.now() - 30 * 60 * 1000;
    for (let i = 0; i < 4; i++) await insertClick(program.id, affiliateId, { sub1: "z", created_at: t });

    expect(
      (
        await api("/api/automation/rules", {
          method: "POST",
          body: JSON.stringify({ campaign_id: program.id, kind: "alert", roi_below: 0 }),
        })
      ).status,
    ).toBe(400); // needs a channel

    const created = await api<{ rule: { id: string } }>("/api/automation/rules", {
      method: "POST",
      body: JSON.stringify({
        campaign_id: program.id,
        kind: "alert",
        roi_below: -50,
        spend_above_cents: 100,
        window_hours: 6,
        webhook_url: "https://hooks.example.com/alert",
      }),
    });
    expect(created.status).toBe(201);

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response("ok", { status: 200 }));
    const results = await runAutomationRules(env as unknown as Env);
    const mine = results.find((r) => r.rule_id === created.body.rule.id)!;
    expect(mine.fired).toBe(true);
    expect(mine.message).toContain("cost 2.00");
    expect(mine.notified.webhook).toBe(true);
    const alertCalls = fetchMock.mock.calls.filter(([u]) => u === "https://hooks.example.com/alert");
    expect(alertCalls).toHaveLength(1);
    expect(JSON.parse(String(alertCalls[0][1]?.body)).metrics.cost_cents).toBe(200);

    const rule = await getAutomationRule(env.DB, created.body.rule.id, accountId);
    const second = await evaluateAutomationRule(env as unknown as Env, rule!);
    expect(second.fired).toBe(false); // cooldown = window

    const run = await api<{ result: { fired: boolean } }>(
      `/api/automation/rules/${created.body.rule.id}/run`,
      { method: "POST" },
    );
    expect(run.body.result.fired).toBe(false);
    expect((await api(`/api/automation/rules/${created.body.rule.id}`, { method: "DELETE" })).status).toBe(200);
  });

  it("serves tracking paths on registered tracking domains only", async () => {
    const { program } = await createCampaign("Domains");

    expect(
      (await api("/api/tracking-domains", { method: "POST", body: JSON.stringify({ hostname: "not a host" }) }))
        .status,
    ).toBe(400);
    expect(
      (await api("/api/tracking-domains", { method: "POST", body: JSON.stringify({ hostname: "capve.app" }) }))
        .status,
    ).toBe(400);
    const created = await api<{ tracking_domain: { id: string; hostname: string } }>("/api/tracking-domains", {
      method: "POST",
      body: JSON.stringify({ hostname: "https://Track.Example.com/" }),
    });
    expect(created.status).toBe(201);
    expect(created.body.tracking_domain.hostname).toBe("track.example.com");
    expect(
      (await api("/api/tracking-domains", { method: "POST", body: JSON.stringify({ hostname: "track.example.com" }) }))
        .status,
    ).toBe(409);

    expect(
      (
        await api(`/api/tracking-domains/campaigns/${program.id}`, {
          method: "PUT",
          body: JSON.stringify({ tracking_domain_id: "dom_missing" }),
        })
      ).status,
    ).toBe(400);
    const assigned = await api(`/api/tracking-domains/campaigns/${program.id}`, {
      method: "PUT",
      body: JSON.stringify({ tracking_domain_id: created.body.tracking_domain.id }),
    });
    expect(assigned.status).toBe(200);

    const tracking = await api<{ tracking: { campaign_url: string; postback_url: string } }>(
      `/api/programs/${program.id}/tracking`,
    );
    expect(tracking.body.tracking.campaign_url).toBe(`https://track.example.com/c/${program.campaign_key}`);
    expect(tracking.body.tracking.postback_url.startsWith("https://track.example.com/click?")).toBe(true);
    const affiliate = await api<{ tracking_url: string }>(`/api/programs/${program.id}/affiliates`, {
      method: "POST",
      body: JSON.stringify({ name: "Partner" }),
    });
    expect(affiliate.body.tracking_url.startsWith("https://track.example.com/r/")).toBe(true);

    const click = await SELF.fetch(`http://track.example.com/c/${program.campaign_key}`, { redirect: "manual" });
    expect(click.status).toBe(302);
    expect(click.headers.get("location")).toContain("merchant.example.com");

    // {lp_click_url} points at the campaign's tracking domain, not APP_URL.
    expect(
      (
        await api(`/api/programs/${program.id}`, {
          method: "PATCH",
          body: JSON.stringify({ destination_url: `${MERCHANT}?lp={lp_click_url}` }),
        })
      ).status,
    ).toBe(200);
    const lpClick = await SELF.fetch(`http://track.example.com/c/${program.campaign_key}`, {
      redirect: "manual",
    });
    const lp = new URL(lpClick.headers.get("location")!).searchParams.get("lp");
    expect(lp).toMatch(/^https:\/\/track\.example\.com\/lp\/clk_/);

    expect((await SELF.fetch("http://track.example.com/api/health")).status).toBe(404);
    expect((await SELF.fetch("http://track.example.com/mcp", { method: "POST" })).status).toBe(404);
    expect(
      (await SELF.fetch(`http://unknown.example.org/c/${program.campaign_key}`, { redirect: "manual" })).status,
    ).toBe(404);
    expect((await SELF.fetch("http://localhost/api/health")).status).toBe(200);

    expect(
      (await api(`/api/tracking-domains/${created.body.tracking_domain.id}`, { method: "DELETE" })).status,
    ).toBe(200);
    const after = await api<{ tracking: { campaign_url: string } }>(`/api/programs/${program.id}/tracking`);
    expect(after.body.tracking.campaign_url.startsWith("http://localhost:5173/c/")).toBe(true);
    expect(
      (await SELF.fetch(`http://track.example.com/c/${program.campaign_key}`, { redirect: "manual" })).status,
    ).toBe(404);
  });
});
