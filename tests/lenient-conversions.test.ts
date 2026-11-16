import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { BROWSER_HEADERS, registerTestUser } from "./helpers";
import { initSql } from "./schema";

async function json<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

let authHeaders: Record<string, string>;
let programId: string;
let convertSecret: string;
let affiliateCode: string;

async function createProgram(lenientPostbacks = 1) {
  const programRes = await SELF.fetch("http://localhost/api/programs", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      name: "Test Campaign",
      destination_url: "https://merchant.example.com",
    }),
  });
  expect(programRes.status).toBe(201);
  const data = await json<{
    program: { id: string; lenient_postbacks: number };
    convert_secret: string;
  }>(programRes);

  if (lenientPostbacks !== data.program.lenient_postbacks) {
    await env.DB.prepare("UPDATE programs SET lenient_postbacks = ? WHERE id = ?")
      .bind(lenientPostbacks, data.program.id)
      .run();
  }

  return data;
}

async function createAffiliate(programId: string) {
  const affiliateRes = await SELF.fetch(
    `http://localhost/api/programs/${programId}/affiliates`,
    {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ name: "Test Partner" }),
    },
  );
  expect(affiliateRes.status).toBe(201);
  const data = await json<{ affiliate: { code: string } }>(affiliateRes);
  return data.affiliate.code;
}

describe("lenient conversion postbacks", () => {
  beforeAll(async () => {
    const statements = initSql
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean);
    for (const statement of statements) {
      await env.DB.prepare(statement).run();
    }
    await env.DB.exec(`
      DELETE FROM conversions;
      DELETE FROM clicks;
      DELETE FROM affiliates;
      DELETE FROM programs;
      DELETE FROM auth_tokens;
      DELETE FROM users;
    `);
    ({ authHeaders } = await registerTestUser());
  });

  it("lenient mode (default) accepts unknown click id when affiliate_code provided", async () => {
    const { program, convert_secret } = await createProgram(1);
    const affiliateCode = await createAffiliate(program.id);

    const postbackRes = await SELF.fetch(
      `http://localhost/click?cnv_id=clk_unknown&affiliate_code=${affiliateCode}&payout=10&cnv_status=ftd&event=ftd`,
      { redirect: "manual" },
    );
    expect(postbackRes.status).toBe(200);
    const data = await json<{ ok: boolean; conversion: any }>(postbackRes);
    expect(data.ok).toBe(true);
    expect(data.conversion.warning_flags).toBe("unknown_click_id");
  });

  it("strict mode (lenient_postbacks=0) rejects unknown click id with 404", async () => {
    const { program, convert_secret } = await createProgram(0);
    const affiliateCode = await createAffiliate(program.id);

    const postbackRes = await SELF.fetch(
      `http://localhost/click?cnv_id=clk_unknown&affiliate_code=${affiliateCode}&payout=10&cnv_status=ftd&event=ftd`,
      { redirect: "manual" },
    );
    expect(postbackRes.status).toBe(404);
    expect(await postbackRes.text()).toBe("click not found");
  });

  it("unknown click without affiliate_code is rejected even in lenient mode", async () => {
    const { program } = await createProgram(1);
    await createAffiliate(program.id);

    const postbackRes = await SELF.fetch(
      "http://localhost/click?cnv_id=clk_unknown&payout=10&cnv_status=ftd&event=ftd",
      { redirect: "manual" },
    );
    expect(postbackRes.status).toBe(404);
    expect(await postbackRes.text()).toBe("click not found");
  });

  it("lenient mode accepts unknown click id, flags it, attributes to campaign", async () => {
    const { program, convert_secret } = await createProgram(1);
    const affiliateCode = await createAffiliate(program.id);

    const postbackRes = await SELF.fetch(
      `http://localhost/click?cnv_id=1791919925099900ZA29b1801c6470cb1dI&affiliate_code=${affiliateCode}&payout=50&cnv_status=ftd&event=ftd`,
      { redirect: "manual" },
    );
    expect(postbackRes.status).toBe(200);
    const data = await json<{ ok: boolean; status: string; conversion: any }>(postbackRes);
    expect(data.ok).toBe(true);
    expect(data.status).toBe("created");
    expect(data.conversion.warning_flags).toBe("unknown_click_id");
    expect(data.conversion.click_id).toBeNull();
    expect(data.conversion.amount).toBe(50);

    const conversions = await env.DB
      .prepare("SELECT click_id, warning_flags, order_id, event, amount_cents FROM conversions WHERE program_id = ?")
      .bind(program.id)
      .all();
    expect(conversions.results).toHaveLength(1);
    expect(conversions.results![0].click_id).toBeNull();
    expect(conversions.results![0].warning_flags).toBe("unknown_click_id");
    expect(conversions.results![0].event).toBe("ftd");
    expect(conversions.results![0].amount_cents).toBe(5000);
  });

  it("lenient mode ignores unfilled placeholder params, flags them", async () => {
    const { program } = await createProgram(1);
    const affiliateCode = await createAffiliate(program.id);

    const clickRes = await SELF.fetch(
      `http://localhost/r/${affiliateCode}`,
      { redirect: "manual", headers: BROWSER_HEADERS },
    );
    expect(clickRes.status).toBe(302);
    const location = clickRes.headers.get("Location");
    const clickId = new URL(location!).searchParams.get("click_id");
    expect(clickId).toMatch(/^clk_/);

    const postbackRes = await SELF.fetch(
      `http://localhost/click?cnv_id=${clickId}&payout={payout}&cnv_status={status}&event=registration`,
      { redirect: "manual" },
    );
    expect(postbackRes.status).toBe(200);
    const data = await json<{ ok: boolean; conversion: any }>(postbackRes);
    expect(data.ok).toBe(true);
    expect(data.conversion.warning_flags).toBe("unfilled_placeholders");
    expect(data.conversion.amount).toBe(0);
  });

  it("dedupe: same cnv_id + event only counts once", async () => {
    const { program } = await createProgram(1);
    const affiliateCode = await createAffiliate(program.id);

    const cnvId = "clk_dedupetest";
    const postback1 = await SELF.fetch(
      `http://localhost/click?cnv_id=${cnvId}&affiliate_code=${affiliateCode}&payout=20&cnv_status=ftd&event=ftd`,
    );
    expect(postback1.status).toBe(200);
    const data1 = await json<{ status: string }>(postback1);
    expect(data1.status).toBe("created");

    const postback2 = await SELF.fetch(
      `http://localhost/click?cnv_id=${cnvId}&affiliate_code=${affiliateCode}&payout=20&cnv_status=ftd&event=ftd`,
    );
    expect(postback2.status).toBe(200);
    const data2 = await json<{ status: string }>(postback2);
    expect(data2.status).toBe("duplicate");

    const conversions = await env.DB
      .prepare("SELECT COUNT(*) as count FROM conversions WHERE program_id = ? AND event = 'ftd'")
      .bind(program.id)
      .first<{ count: number }>();
    expect(conversions!.count).toBe(1);
  });

  it("different events on same cnv_id create separate conversions", async () => {
    const { program } = await createProgram(1);
    const affiliateCode = await createAffiliate(program.id);

    const cnvId = "clk_multitest";
    
    await SELF.fetch(
      `http://localhost/click?cnv_id=${cnvId}&affiliate_code=${affiliateCode}&payout=5&cnv_status=lead&event=registration`,
    );
    await SELF.fetch(
      `http://localhost/click?cnv_id=${cnvId}&affiliate_code=${affiliateCode}&payout=50&cnv_status=ftd&event=ftd`,
    );

    const conversions = await env.DB
      .prepare("SELECT event, amount_cents FROM conversions WHERE program_id = ? ORDER BY event")
      .bind(program.id)
      .all();
    expect(conversions.results).toHaveLength(2);
    expect(conversions.results![0].event).toBe("ftd");
    expect(conversions.results![0].amount_cents).toBe(5000);
    expect(conversions.results![1].event).toBe("registration");
    expect(conversions.results![1].amount_cents).toBe(500);
  });

  it("strict mode does not flag warnings even with valid click", async () => {
    const { program } = await createProgram(0);
    const affiliateCode = await createAffiliate(program.id);

    const clickRes = await SELF.fetch(
      `http://localhost/r/${affiliateCode}`,
      { redirect: "manual", headers: BROWSER_HEADERS },
    );
    expect(clickRes.status).toBe(302);
    const location = clickRes.headers.get("Location");
    const clickId = new URL(location!).searchParams.get("click_id");
    expect(clickId).toMatch(/^clk_/);

    const postbackRes = await SELF.fetch(
      `http://localhost/click?cnv_id=${clickId}&payout={payout}&cnv_status=lead&event=registration`,
    );
    expect(postbackRes.status).toBe(200);
    const data = await json<{ conversion: any }>(postbackRes);
    expect(data.conversion.warning_flags).toBeNull();
  });

  it("lenient mode with valid click but unfilled placeholders flags them", async () => {
    const { program } = await createProgram(1);
    const affiliateCode = await createAffiliate(program.id);

    const clickRes = await SELF.fetch(
      `http://localhost/r/${affiliateCode}`,
      { redirect: "manual", headers: BROWSER_HEADERS },
    );
    const location = clickRes.headers.get("Location");
    const clickId = new URL(location!).searchParams.get("click_id");
    expect(clickId).toMatch(/^clk_/);

    const postbackRes = await SELF.fetch(
      `http://localhost/click?cnv_id=${clickId}&payout=[payout]&cnv_status=[status]&event=test`,
    );
    expect(postbackRes.status).toBe(200);
    const data = await json<{ conversion: any }>(postbackRes);
    expect(data.conversion.warning_flags).toBe("unfilled_placeholders");
  });

  it("conversions list includes warning_flags", async () => {
    const { program } = await createProgram(1);
    const affiliateCode = await createAffiliate(program.id);

    await SELF.fetch(
      `http://localhost/click?cnv_id=clk_test999&affiliate_code=${affiliateCode}&payout=10&cnv_status=ftd&event=ftd`,
    );

    const listRes = await SELF.fetch(
      `http://localhost/api/programs/${program.id}/conversions`,
      { headers: authHeaders },
    );
    expect(listRes.status).toBe(200);
    const data = await json<{ conversions: any[] }>(listRes);
    expect(data.conversions.length).toBeGreaterThan(0);
    expect(data.conversions[0]).toHaveProperty("warning_flags");
    expect(data.conversions[0].warning_flags).toBe("unknown_click_id");
  });
});
