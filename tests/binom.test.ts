import { env, fetchMock, SELF } from "cloudflare:test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerTestUser } from "./helpers";
import { initSql } from "./schema";

const MERCHANT = "https://merchant.example.com/pricing";
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

let authHeaders: Record<string, string>;
const tsPostbacks: string[] = [];

async function json<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await SELF.fetch(`http://localhost${path}`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify(body),
  });
  expect(res.status).toBe(201);
  return json<T>(res);
}

async function setupCampaign(opts: { offerUrl?: string; payoutCents?: number; landerUrl?: string } = {}) {
  const { program } = await post<{ program: { id: string; campaign_key: string } }>(
    "/api/programs",
    { name: `Binom ${crypto.randomUUID().slice(0, 6)}`, destination_url: MERCHANT },
  );
  let offerId: string | null = null;
  if (opts.offerUrl) {
    const { offer } = await post<{ offer: { id: string } }>("/api/entities/offers", {
      name: "Offer",
      url: opts.offerUrl,
      payout_cents: opts.payoutCents ?? 0,
    });
    offerId = offer.id;
    let landerId: string | null = null;
    if (opts.landerUrl) {
      const { lander } = await post<{ lander: { id: string } }>("/api/entities/landers", {
        name: "LP",
        url: opts.landerUrl,
      });
      landerId = lander.id;
    }
    await post(`/api/programs/${program.id}/paths`, {
      name: "Main",
      flow_type: landerId ? "lander_offer" : "offer",
      lander_id: landerId,
      offer_id: offerId,
    });
  }
  const { affiliate } = await post<{ affiliate: { code: string } }>(
    `/api/programs/${program.id}/affiliates`,
    { name: "Partner" },
  );
  return { program, affiliate, offerId };
}

async function click(code: string, query = "", init: RequestInit = {}) {
  const res = await SELF.fetch(`http://localhost/r/${code}${query}`, {
    redirect: "manual",
    ...init,
  });
  expect(res.status).toBe(302);
  const location = new URL(res.headers.get("Location")!);
  return { location, clickId: location.searchParams.get("click_id")! };
}

async function postback(query: string) {
  const res = await SELF.fetch(`http://localhost/click?${query}`);
  expect(res.status).toBe(200);
  return json<{ status: string; conversion: { amount_cents: number; status: string } }>(res);
}

describe("binom parity", () => {
  beforeAll(async () => {
    for (const statement of initSql.split(";").map((p) => p.trim()).filter(Boolean)) {
      await env.DB.prepare(statement).run();
    }
    ({ authHeaders } = await registerTestUser());

    fetchMock.activate();
    fetchMock
      .get("https://ts.example.com")
      .intercept({
        path: (path) => {
          tsPostbacks.push(path);
          return true;
        },
      })
      .reply(200, "ok")
      .persist();
  });

  afterAll(() => {
    fetchMock.deactivate();
  });

  it("upserts postback status for the same click (lead → sale)", async () => {
    const { affiliate } = await setupCampaign();
    const { clickId } = await click(affiliate.code);

    const lead = await postback(`cnv_id=${clickId}&payout=10&cnv_status=lead`);
    expect(lead.status).toBe("created");

    const sale = await postback(`cnv_id=${clickId}&payout=50&cnv_status=sale`);
    expect(sale.status).toBe("updated");
    expect(sale.conversion.status).toBe("sale");
    expect(sale.conversion.amount_cents).toBe(5000);

    const again = await postback(`cnv_id=${clickId}&payout=50&cnv_status=sale`);
    expect(again.status).toBe("duplicate");

    const rows = await env.DB.prepare(
      "SELECT status, amount_cents, updated_at FROM conversions WHERE click_id = ?",
    )
      .bind(clickId)
      .all<{ status: string; amount_cents: number; updated_at: number | null }>();
    expect(rows.results).toHaveLength(1);
    expect(rows.results[0]?.status).toBe("sale");
    expect(rows.results[0]?.amount_cents).toBe(5000);
    expect(rows.results[0]?.updated_at).toBeGreaterThan(0);

    // Distinct explicit tx ids create separate conversions.
    expect((await postback(`cnv_id=${clickId}&payout=5&tx_id=t1`)).status).toBe("created");
    expect((await postback(`cnv_id=${clickId}&payout=5&tx_id=t2`)).status).toBe("created");
  });

  it("falls back to the offer payout when postback has no payout", async () => {
    const { affiliate } = await setupCampaign({
      offerUrl: "https://offer.example.com/go",
      payoutCents: 1234,
    });
    const { clickId } = await click(affiliate.code);
    const result = await postback(`cnv_id=${clickId}&cnv_status=sale`);
    expect(result.status).toBe("created");
    expect(result.conversion.amount_cents).toBe(1234);
  });

  it("does not redirect paused campaigns on /r", async () => {
    const { program, affiliate } = await setupCampaign();
    await env.DB.prepare("UPDATE programs SET status = 'paused' WHERE id = ?").bind(program.id).run();
    const res = await SELF.fetch(`http://localhost/r/${affiliate.code}`, { redirect: "manual" });
    expect(res.status).toBe(404);
  });

  it("captures click context and substitutes Binom macros", async () => {
    const { program, affiliate, offerId } = await setupCampaign({
      offerUrl:
        "https://offer.example.com/go?cid={clickid}&s1={sub1}&geo={country}&camp={campaign_id}&o={offer_id}&ext={external_id}",
    });
    const headers = {
      "User-Agent": IPHONE_UA,
      "CF-Connecting-IP": "203.0.113.7",
      Referer: "https://news.example.org/article",
    };
    const { location, clickId } = await click(
      affiliate.code,
      "?sub1=zone42&sub10=x&clickid=ext-1&cost=0.05",
      { headers, cf: { country: "fr", city: "Paris", region: "IDF", asOrganization: "Orange" } } as RequestInit,
    );
    expect(location.searchParams.get("cid")).toBe(clickId);
    expect(location.searchParams.get("s1")).toBe("zone42");
    expect(location.searchParams.get("camp")).toBe(program.id);
    expect(location.searchParams.get("o")).toBe(offerId);
    expect(location.searchParams.get("ext")).toBe("ext-1");

    const row = await env.DB.prepare("SELECT * FROM clicks WHERE id = ?").bind(clickId).first<
      Record<string, string | number | null>
    >();
    expect(row?.device_type).toBe("mobile");
    expect(row?.os).toBe("iOS");
    expect(row?.browser).toBe("Safari");
    expect(row?.referrer_domain).toBe("news.example.org");
    expect(row?.sub1).toBe("zone42");
    expect(row?.sub10).toBe("x");
    expect(row?.external_id).toBe("ext-1");
    expect(row?.cost_cents).toBe(5);
    expect(row?.is_unique).toBe(1);
    expect(row?.is_bot).toBe(0);
    {
      expect(row?.country).toBe("FR");
      expect(location.searchParams.get("geo")).toBe("FR");
      expect(row?.isp).toBe("Orange");
    }

    const repeat = await click(affiliate.code, "", { headers });
    const repeatRow = await env.DB.prepare("SELECT is_unique FROM clicks WHERE id = ?")
      .bind(repeat.clickId)
      .first<{ is_unique: number }>();
    expect(repeatRow?.is_unique).toBe(0);

    const bot = await click(affiliate.code, "", { headers: { "User-Agent": "Googlebot/2.1" } });
    const botRow = await env.DB.prepare("SELECT is_bot FROM clicks WHERE id = ?")
      .bind(bot.clickId)
      .first<{ is_bot: number }>();
    expect(botRow?.is_bot).toBe(1);
  });

  it("groups reports by dimension with approved conversions and per-click cost", async () => {
    const { program, affiliate } = await setupCampaign();
    const { traffic_source } = await post<{ traffic_source: { id: string } }>(
      "/api/entities/traffic-sources",
      { name: "CPC source", cost_type: "cpc", default_cost_cents: 10 },
    );
    await env.DB.prepare("UPDATE programs SET traffic_source_id = ? WHERE id = ?")
      .bind(traffic_source.id, program.id)
      .run();

    const ios = { headers: { "User-Agent": IPHONE_UA, "CF-Connecting-IP": "198.51.100.1" } };
    const win = { headers: { "User-Agent": DESKTOP_UA, "CF-Connecting-IP": "198.51.100.2" } };
    const a = await click(affiliate.code, "?sub1=A&cost=0.30", ios);
    await click(affiliate.code, "?sub1=A", ios);
    const c = await click(affiliate.code, "?sub1=B", win);

    await postback(`cnv_id=${a.clickId}&payout=20&cnv_status=sale`);
    await postback(`cnv_id=${c.clickId}&payout=99&cnv_status=rejected`);

    const res = await SELF.fetch(
      `http://localhost/api/reports/grouped?campaign_id=${program.id}&by=os`,
      { headers: authHeaders },
    );
    expect(res.status).toBe(200);
    const { rows } = await json<{
      rows: Array<{
        key: string;
        unique_clicks: number;
        metrics: { clicks: number; leads: number; revenue_cents: number; cost_cents: number; profit_cents: number };
      }>;
    }>(res);
    const iosRow = rows.find((r) => r.key === "iOS")!;
    const winRow = rows.find((r) => r.key === "Windows")!;
    expect(iosRow.metrics.clicks).toBe(2);
    expect(iosRow.unique_clicks).toBe(1);
    expect(iosRow.metrics.leads).toBe(1);
    expect(iosRow.metrics.revenue_cents).toBe(2000);
    // 30¢ explicit click cost + 10¢ fixed CPC for the other click.
    expect(iosRow.metrics.cost_cents).toBe(40);
    expect(iosRow.metrics.profit_cents).toBe(1960);
    expect(winRow.metrics.clicks).toBe(1);
    expect(winRow.metrics.leads).toBe(0);
    expect(winRow.metrics.revenue_cents).toBe(0);

    const bySub = await json<{ rows: Array<{ key: string; metrics: { clicks: number } }> }>(
      await SELF.fetch(`http://localhost/api/reports/grouped?campaign_id=${program.id}&by=sub1`, {
        headers: authHeaders,
      }),
    );
    expect(bySub.rows.find((r) => r.key === "A")?.metrics.clicks).toBe(2);
    expect(bySub.rows.find((r) => r.key === "B")?.metrics.clicks).toBe(1);

    const bad = await SELF.fetch("http://localhost/api/reports/grouped?by=nope", {
      headers: authHeaders,
    });
    expect(bad.status).toBe(400);
    const anon = await SELF.fetch("http://localhost/api/reports/grouped?by=os");
    expect(anon.status).toBe(401);

    const csv = await SELF.fetch(
      `http://localhost/api/reports/grouped.csv?campaign_id=${program.id}&by=os`,
      { headers: authHeaders },
    );
    expect(await csv.text()).toContain("iOS");
  });

  it("LP click marks the click and redirects to the configured offer", async () => {
    const { affiliate } = await setupCampaign({
      landerUrl: "https://lander.example.com/?next={lp_click_url}",
      offerUrl: "https://offer.example.com/go?cid={clickid}&s2={sub2}",
    });
    const { location, clickId } = await click(affiliate.code, "?sub2=kw");
    expect(location.hostname).toBe("lander.example.com");
    expect(location.searchParams.get("next")).toMatch(new RegExp(`/lp/${clickId}$`));

    const lp = await SELF.fetch(`http://localhost/lp/${clickId}`, { redirect: "manual" });
    expect(lp.status).toBe(302);
    const offer = new URL(lp.headers.get("Location")!);
    expect(offer.hostname).toBe("offer.example.com");
    expect(offer.searchParams.get("cid")).toBe(clickId);
    expect(offer.searchParams.get("s2")).toBe("kw");

    const row = await env.DB.prepare("SELECT lp_clicked_at FROM clicks WHERE id = ?")
      .bind(clickId)
      .first<{ lp_clicked_at: number | null }>();
    expect(row?.lp_clicked_at).toBeGreaterThan(0);

    const missing = await SELF.fetch("http://localhost/lp/clk_missing", { redirect: "manual" });
    expect(missing.status).toBe(404);
  });

  it("fires the traffic source postback with external id on conversion", async () => {
    const { program, affiliate } = await setupCampaign();
    const { traffic_source } = await post<{ traffic_source: { id: string } }>(
      "/api/entities/traffic-sources",
      {
        name: "TS",
        cost_type: "cpc",
        default_cost_cents: 0,
        postback_percent: 100,
      },
    );
    await post("/api/postbacks", {
      traffic_source_id: traffic_source.id,
      url: "https://ts.example.com/pb?ext={external_id}&cid={clickid}&p={payout}&s={status}",
    });
    await env.DB.prepare("UPDATE programs SET traffic_source_id = ? WHERE id = ?")
      .bind(traffic_source.id, program.id)
      .run();

    const { clickId } = await click(affiliate.code, "?clickid=TS-123");
    tsPostbacks.length = 0;
    await postback(`cnv_id=${clickId}&payout=12.5&cnv_status=sale`);
    expect(tsPostbacks).toHaveLength(1);
    const url = new URL(`https://ts.example.com${tsPostbacks[0]}`);
    expect(url.searchParams.get("ext")).toBe("TS-123");
    expect(url.searchParams.get("cid")).toBe(clickId);
    expect(url.searchParams.get("p")).toBe("12.5");
    expect(url.searchParams.get("s")).toBe("sale");

    // Rejections are not reported to the traffic source.
    await postback(`cnv_id=${clickId}&cnv_status=rejected`);
    expect(tsPostbacks).toHaveLength(1);
  });
  it("tracks conversion events with several postbacks each", async () => {
    const { network } = await post<{ network: { id: string } }>("/api/entities/networks", {
      name: "Net",
    });
    const { offer } = await post<{ offer: { id: string } }>("/api/entities/offers", {
      name: "Casino",
      url: "https://offer.example.com/?cid={clickid}",
      network_id: network.id,
      payout_cents: 5000,
    });
    // No destination URL: the campaign routes only through its path.
    const { program } = await post<{ program: { id: string; destination_url: string | null } }>(
      "/api/programs",
      { name: "Events" },
    );
    expect(program.destination_url).toBeNull();
    await post(`/api/programs/${program.id}/paths`, {
      name: "Offer",
      flow_type: "offer",
      offer_id: offer.id,
    });
    const { affiliate } = await post<{ affiliate: { code: string } }>(
      `/api/programs/${program.id}/affiliates`,
      { name: "Buyer" },
    );

    await post("/api/postbacks", {
      network_id: network.id,
      event: "registration",
      url: "https://ts.example.com/net-reg?cid={click_id}&e={event}",
    });
    await post("/api/postbacks", {
      network_id: network.id,
      event: "FTD",
      url: "https://ts.example.com/net-ftd?p={payout}",
    });
    await post("/api/postbacks", {
      campaign_id: program.id,
      url: "https://ts.example.com/camp?e={event}&s={status}",
    });
    const listed = await SELF.fetch(`http://localhost/api/postbacks?network_id=${network.id}`, {
      headers: authHeaders,
    });
    const { postbacks } = await json<{ postbacks: Array<{ event: string }> }>(listed);
    expect(postbacks.map((pb) => pb.event)).toEqual(["registration", "ftd"]);

    const { location, clickId } = await click(affiliate.code);
    expect(location.hostname).toBe("offer.example.com");

    tsPostbacks.length = 0;
    const reg = await postback(`cnv_id=${clickId}&event=registration`);
    expect(reg.status).toBe("created");
    // Events only carry the payout they send (no offer payout fallback).
    expect(reg.conversion.amount_cents).toBe(0);
    expect(tsPostbacks.sort()).toEqual([
      "/camp?e=registration&s=lead",
      `/net-reg?cid=${clickId}&e=registration`,
    ]);

    tsPostbacks.length = 0;
    expect((await postback(`cnv_id=${clickId}&event=ftd&payout=100`)).status).toBe("created");
    expect(tsPostbacks.sort()).toEqual(["/camp?e=ftd&s=lead", "/net-ftd?p=100"]);

    tsPostbacks.length = 0;
    expect((await postback(`cnv_id=${clickId}&event=ftd&payout=100`)).status).toBe("duplicate");
    expect(tsPostbacks).toHaveLength(0);

    const bad = await SELF.fetch(`http://localhost/click?cnv_id=${clickId}&event=bad%20event`);
    expect(bad.status).toBe(400);

    const stats = await json<{
      totals: { conversions: number; revenue_cents: number; events: Record<string, number> };
    }>(await SELF.fetch(`http://localhost/api/programs/${program.id}/stats`, { headers: authHeaders }));
    // Registration + FTD on one click = one conversion; events are counted separately.
    expect(stats.totals.conversions).toBe(1);
    expect(stats.totals.revenue_cents).toBe(10000);
    expect(stats.totals.events).toEqual({ registration: 1, ftd: 1 });

    const report = await json<{ rows: Array<{ events: Record<string, number> }> }>(
      await SELF.fetch(
        `http://localhost/api/reports/grouped?by=campaign&campaign_id=${program.id}`,
        { headers: authHeaders },
      ),
    );
    expect(report.rows[0].events).toEqual({ registration: 1, ftd: 1 });

    const csv = await (
      await SELF.fetch(`http://localhost/api/reports/conversions.csv?program_id=${program.id}`, {
        headers: authHeaders,
      })
    ).text();
    expect(csv).toContain("event");
    expect(csv).toContain("registration");
  });
});
