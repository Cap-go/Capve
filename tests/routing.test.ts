import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { registerTestUser } from "./helpers";
import { initSql } from "./schema";

const MERCHANT_DESTINATION = "https://merchant.example.com/pricing";
const LANDER_URL = "https://merchant.example.com/lander?ref={click_id}";
const OFFER_URL = "https://network.example.com/offer?cid={click_id}";

async function json<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

let authHeaders: Record<string, string>;

async function setupProgram(suffix = "") {
  const programRes = await SELF.fetch("http://localhost/api/programs", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      name: `Routing Campaign ${suffix || Date.now()}`,
      destination_url: MERCHANT_DESTINATION,
    }),
  });
  expect(programRes.status).toBe(201);
  const { program } = await json<{ program: { id: string; campaign_key: string } }>(programRes);

  const landerRes = await SELF.fetch("http://localhost/api/entities/landers", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ name: "LP 1", url: LANDER_URL }),
  });
  const { lander } = await json<{ lander: { id: string } }>(landerRes);

  const offerRes = await SELF.fetch("http://localhost/api/entities/offers", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ name: "Offer 1", url: OFFER_URL }),
  });
  const { offer } = await json<{ offer: { id: string } }>(offerRes);

  const affiliateRes = await SELF.fetch(
    `http://localhost/api/programs/${program.id}/affiliates`,
    {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ name: "Partner" }),
    },
  );
  const { affiliate } = await json<{ affiliate: { code: string } }>(affiliateRes);

  return { authHeaders, program, lander, offer, affiliate };
}

describe("campaign routing", () => {
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
      DELETE FROM programs;
      DELETE FROM auth_tokens;
      DELETE FROM users;
    `);
    ({ authHeaders } = await registerTestUser());
  });

  it("redirects through lander path with click_id macro", async () => {
    const { authHeaders, program, lander, affiliate } = await setupProgram();

    const pathRes = await SELF.fetch(`http://localhost/api/programs/${program.id}/paths`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        name: "Lander path",
        flow_type: "lander",
        lander_id: lander.id,
      }),
    });
    expect(pathRes.status).toBe(201);

    const clickRes = await SELF.fetch(`http://localhost/r/${affiliate.code}`, {
      redirect: "manual",
    });
    expect(clickRes.status).toBe(302);
    const location = clickRes.headers.get("Location");
    expect(location).toBeTruthy();
    const url = new URL(location!);
    expect(url.origin + url.pathname).toBe("https://merchant.example.com/lander");
    expect(url.searchParams.get("click_id")).toMatch(/^clk_/);
    expect(url.searchParams.get("ref")).toMatch(/^clk_/);
    expect(url.searchParams.get("velo_ref")).toBe(affiliate.code);
  });

  it("campaign URL /c/:key records click and redirects", async () => {
    const { program } = await setupProgram();

    const clickRes = await SELF.fetch(`http://localhost/c/${program.campaign_key}`, {
      redirect: "manual",
    });
    expect(clickRes.status).toBe(302);
    const location = clickRes.headers.get("Location");
    expect(location).toContain("merchant.example.com");
    const url = new URL(location!);
    expect(url.searchParams.get("click_id")).toMatch(/^clk_/);
    expect(url.searchParams.get("velo_ref")).toMatch(/^c_/);
  });

  it("fix-on mode always uses pinned path", async () => {
    const { authHeaders, program, lander, offer, affiliate } = await setupProgram();

    const pathA = await json<{ path: { id: string } }>(
      await SELF.fetch(`http://localhost/api/programs/${program.id}/paths`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ name: "Lander", flow_type: "lander", lander_id: lander.id }),
      }),
    );
    await SELF.fetch(`http://localhost/api/programs/${program.id}/paths`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ name: "Offer", flow_type: "offer", offer_id: offer.id }),
    });

    await SELF.fetch(`http://localhost/api/programs/${program.id}/rotation`, {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({ mode: "fix_on", fixed_path_id: pathA.path.id }),
    });

    const clickRes = await SELF.fetch(`http://localhost/r/${affiliate.code}`, {
      redirect: "manual",
    });
    const location = clickRes.headers.get("Location")!;
    expect(location).toContain("merchant.example.com/lander");
  });

  it("fills a pasted [clickid] on the campaign destination with the Capve click id", async () => {
    const programRes = await SELF.fetch("http://localhost/api/programs", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        name: "YesPlay pasted macro",
        destination_url: "https://goyesplay.com/yavzamcgc?subid1=[clickid]",
      }),
    });
    expect(programRes.status).toBe(201);
    const { program } = await json<{ program: { campaign_key: string } }>(programRes);

    const clickRes = await SELF.fetch(
      `http://localhost/c/${program.campaign_key}?clickid=adcash123`,
      { redirect: "manual" },
    );
    expect(clickRes.status).toBe(302);
    const url = new URL(clickRes.headers.get("Location")!);
    const clickId = url.searchParams.get("click_id");
    expect(clickId).toMatch(/^clk_/);
    expect(url.searchParams.get("subid1")).toBe(clickId);
    expect(url.searchParams.get("subid1")).not.toBe("[clickid]");
  });

  it("falls back to destination when no paths configured", async () => {
    const { affiliate } = await setupProgram();

    const clickRes = await SELF.fetch(`http://localhost/r/${affiliate.code}`, {
      redirect: "manual",
    });
    const location = clickRes.headers.get("Location")!;
    const url = new URL(location);
    expect(url.origin + url.pathname).toBe(MERCHANT_DESTINATION);
  });
});
