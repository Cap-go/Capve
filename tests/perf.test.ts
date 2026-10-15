import { env, fetchMock, SELF } from "cloudflare:test";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { exportClickLogCsv } from "../worker/db/reports";
import { fireS2SPostback } from "../worker/lib/postback";
import { purgePostbackDeliveries, purgeRawClicks } from "../worker/lib/retention";
import { registerTestUser } from "./helpers";
import { initSql } from "./schema";

const MERCHANT = "https://merchant.example.com/pricing";

let authHeaders: Record<string, string>;
const triggerHits: string[] = [];

async function json<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown, method = "POST"): Promise<T> {
  const res = await SELF.fetch(`http://localhost${path}`, {
    method,
    headers: authHeaders,
    body: JSON.stringify(body),
  });
  expect(res.status).toBeLessThan(300);
  return json<T>(res);
}

async function setupCampaign() {
  const { program } = await post<{ program: { id: string; campaign_key: string } }>(
    "/api/programs",
    { name: `Perf ${crypto.randomUUID().slice(0, 6)}`, destination_url: MERCHANT },
  );
  const { affiliate } = await post<{ affiliate: { code: string } }>(
    `/api/programs/${program.id}/affiliates`,
    { name: "Partner" },
  );
  return { program, affiliate };
}

async function click(code: string, init: RequestInit = {}) {
  const res = await SELF.fetch(`http://localhost/r/${code}`, { redirect: "manual", ...init });
  expect(res.status).toBe(302);
  const location = new URL(res.headers.get("Location")!);
  return { location, clickId: location.searchParams.get("click_id")! };
}

describe("tracking performance and reliability", () => {
  beforeAll(async () => {
    for (const statement of initSql.split(";").map((p) => p.trim()).filter(Boolean)) {
      await env.DB.prepare(statement).run();
    }
    ({ authHeaders } = await registerTestUser());

    fetchMock.activate();
    fetchMock.disableNetConnect();
    fetchMock
      .get("https://hooks.example.com")
      .intercept({
        path: (path) => {
          triggerHits.push(path);
          return true;
        },
      })
      .reply(500, "boom")
      .persist();
    fetchMock.get("https://down.example.com").intercept({ path: /.*/ }).replyWithError(new Error("connection refused")).persist();
    fetchMock.get("https://pb-fail.example.com").intercept({ path: /.*/ }).reply(503, "nope").persist();
    fetchMock.get("https://pb-ok.example.com").intercept({ path: /.*/ }).reply(204, "").persist();
    fetchMock
      .get("https://pb-slow.example.com")
      .intercept({ path: /.*/ })
      .reply(200, "late")
      .delay(500)
      .persist();
  });

  afterAll(() => {
    fetchMock.deactivate();
  });

  it("records the click (unique computed inline) and redirects", async () => {
    const { program, affiliate } = await setupCampaign();
    const headers = { "user-agent": "perf-test-ua", "cf-connecting-ip": "203.0.113.9" };

    const first = await click(affiliate.code, { headers });
    expect(first.location.origin + first.location.pathname).toBe(MERCHANT);
    const second = await click(affiliate.code, { headers });

    const rows = await env.DB.prepare(
      "SELECT id, is_unique FROM clicks WHERE program_id = ? ORDER BY created_at, is_unique DESC",
    )
      .bind(program.id)
      .all<{ id: string; is_unique: number }>();
    expect(rows.results).toHaveLength(2);
    const byId = new Map(rows.results.map((row) => [row.id, row.is_unique]));
    expect(byId.get(first.clickId)).toBe(1);
    expect(byId.get(second.clickId)).toBe(0);
  });

  it("a failing click trigger never breaks the redirect", async () => {
    const { program, affiliate } = await setupCampaign();
    await post("/api/ops/triggers", {
      name: "500 hook",
      event: "click",
      program_id: program.id,
      action_url: "https://hooks.example.com/click?cid={click_id}",
    });
    await post("/api/ops/triggers", {
      name: "Down hook",
      event: "click",
      program_id: program.id,
      action_url: "https://down.example.com/click",
    });

    triggerHits.length = 0;
    const { clickId } = await click(affiliate.code);
    const stored = await env.DB.prepare("SELECT id FROM clicks WHERE id = ?").bind(clickId).first();
    expect(stored).not.toBeNull();
    // The trigger still fires, after the response.
    await vi.waitFor(() => expect(triggerHits).toContain(`/click?cid=${clickId}`));
  });

  it("logs failed postback deliveries with one retry", async () => {
    const { program, affiliate } = await setupCampaign();
    const { postback: failing } = await post<{ postback: { id: string } }>("/api/postbacks", {
      campaign_id: program.id,
      url: "https://pb-fail.example.com/pb?cid={click_id}",
    });
    const { postback: working } = await post<{ postback: { id: string } }>("/api/postbacks", {
      campaign_id: program.id,
      url: "https://pb-ok.example.com/pb?cid={click_id}",
    });

    const { clickId } = await click(affiliate.code);
    const res = await SELF.fetch(`http://localhost/click?cnv_id=${clickId}&payout=3`);
    expect(res.status).toBe(200);

    type Deliveries = {
      deliveries: Array<{ attempt: number; status_code: number | null; error: string | null; ok: boolean; url: string }>;
    };
    const deliveriesOf = async (postbackId: string) =>
      json<Deliveries>(
        await SELF.fetch(`http://localhost/api/postbacks/${postbackId}/deliveries`, {
          headers: authHeaders,
        }),
      );

    await vi.waitFor(async () => {
      const { deliveries } = await deliveriesOf(failing.id);
      expect(deliveries.map((d) => d.attempt).sort()).toEqual([1, 2]);
      expect(deliveries.every((d) => d.status_code === 503 && !d.ok)).toBe(true);
      expect(deliveries[0]?.url).toBe(`https://pb-fail.example.com/pb?cid=${clickId}`);
    });
    await vi.waitFor(async () => {
      const { deliveries } = await deliveriesOf(working.id);
      expect(deliveries).toHaveLength(1);
      expect(deliveries[0]).toMatchObject({ attempt: 1, status_code: 204, ok: true });
    });

    const other = await registerTestUser();
    const forbidden = await SELF.fetch(`http://localhost/api/postbacks/${failing.id}/deliveries`, {
      headers: other.authHeaders,
    });
    expect(forbidden.status).toBe(404);
  });

  it("times out slow postbacks and logs both attempts", async () => {
    const { program } = await setupCampaign();
    const { postback } = await post<{ postback: { id: string } }>("/api/postbacks", {
      campaign_id: program.id,
      url: "https://pb-slow.example.com/pb",
    });
    const ok = await fireS2SPostback(
      "https://pb-slow.example.com/pb?cid={click_id}",
      { click_id: "clk_slow", payout: "1", status: "lead" },
      { db: env.DB, postbackId: postback.id, conversionId: "cnv_slow", timeoutMs: 20 },
    );
    expect(ok).toBe(false);
    const { results } = await env.DB.prepare(
      "SELECT attempt, status_code, error FROM postback_deliveries WHERE postback_id = ? ORDER BY attempt",
    )
      .bind(postback.id)
      .all<{ attempt: number; status_code: number | null; error: string | null }>();
    expect(results).toEqual([
      { attempt: 1, status_code: null, error: "timeout after 20ms" },
      { attempt: 2, status_code: null, error: "timeout after 20ms" },
    ]);

    expect(await purgePostbackDeliveries(env.DB, Date.now() + 31 * 24 * 60 * 60 * 1000)).toBeGreaterThan(0);
  });

  it("top_to_bottom rotates through paths with a counter (no click scan)", async () => {
    const { program, affiliate } = await setupCampaign();
    for (const name of ["a", "b", "c"]) {
      await post(`/api/programs/${program.id}/paths`, {
        name,
        flow_type: "direct",
        direct_url: `https://${name}.example.com/`,
      });
    }
    await post(`/api/programs/${program.id}/rotation`, { mode: "top_to_bottom" }, "PUT");

    const hosts: string[] = [];
    for (let i = 0; i < 4; i++) {
      hosts.push((await click(affiliate.code)).location.hostname);
    }
    expect(hosts).toEqual(["a.example.com", "b.example.com", "c.example.com", "a.example.com"]);
    const rotation = await env.DB.prepare("SELECT rr_counter FROM rotations WHERE program_id = ?")
      .bind(program.id)
      .first<{ rr_counter: number }>();
    expect(rotation?.rr_counter).toBe(4);
  });

  it("caps and pages the click log CSV", async () => {
    const { program, affiliate } = await setupCampaign();
    for (let i = 0; i < 5; i++) await click(affiliate.code);
    const owner = await env.DB.prepare("SELECT user_id FROM programs WHERE id = ?")
      .bind(program.id)
      .first<{ user_id: string }>();

    const pages: string[][] = [];
    for await (const rows of exportClickLogCsv(env.DB, program.id, owner!.user_id, {}, {
      maxRows: 3,
      pageSize: 2,
    })) {
      pages.push(rows.map((row) => String(row[0])));
    }
    expect(pages.map((p) => p.length)).toEqual([2, 1]);

    const all: string[] = [];
    for await (const rows of exportClickLogCsv(env.DB, program.id, owner!.user_id, {}, { pageSize: 2 })) {
      all.push(...rows.map((row) => String(row[0])));
    }
    expect(all).toHaveLength(5);
    expect(new Set(all).size).toBe(5);

    const res = await SELF.fetch(`http://localhost/api/reports/clicks.csv?program_id=${program.id}`, {
      headers: authHeaders,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Export-Row-Limit")).toBe("100000");
    const lines = (await res.text()).trim().split("\n");
    expect(lines[0]).toBe("click_id,time,affiliate_code,affiliate_name,ip,lander_id,offer_id,path_id,converted");
    expect(lines).toHaveLength(6);
  });

  it("purges old raw clicks without conversions only", async () => {
    const { program, affiliate } = await setupCampaign();
    const { clickId: converted } = await click(affiliate.code);
    const { clickId: raw } = await click(affiliate.code);
    const { clickId: recent } = await click(affiliate.code);
    const old = Date.now() - 40 * 24 * 60 * 60 * 1000;
    await env.DB.prepare("UPDATE clicks SET created_at = ? WHERE id IN (?, ?)")
      .bind(old, converted, raw)
      .run();
    await SELF.fetch(`http://localhost/click?cnv_id=${converted}&payout=1&disable_postback=1`);

    const deleted = await purgeRawClicks(env.DB, 30, { batchSize: 1 });
    expect(deleted).toBeGreaterThanOrEqual(1);
    const { results } = await env.DB.prepare("SELECT id FROM clicks WHERE program_id = ?")
      .bind(program.id)
      .all<{ id: string }>();
    expect(results.map((r) => r.id).sort()).toEqual([converted, recent].sort());
  });
});
