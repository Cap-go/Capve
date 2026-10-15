import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { registerTestUser } from "./helpers";
import { initSql } from "./schema";

let authHeaders: Record<string, string>;

async function json<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

describe("phase 2 entities", () => {
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
      DELETE FROM offers;
      DELETE FROM landers;
      DELETE FROM affiliate_networks;
      DELETE FROM traffic_sources;
      DELETE FROM groups;
      DELETE FROM conversions;
      DELETE FROM clicks;
      DELETE FROM affiliates;
      DELETE FROM programs;
      DELETE FROM auth_tokens;
      DELETE FROM users;
    `);
    ({ authHeaders } = await registerTestUser());
  });

  it("creates traffic source, network, lander, offer, group, and campaign with key", async () => {
    const sourceRes = await SELF.fetch("http://localhost/api/entities/traffic-sources", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ name: "Facebook Ads", cost_type: "cpc", default_cost_cents: 45 }),
    });
    expect(sourceRes.status).toBe(201);
    const { traffic_source } = await json<{ traffic_source: { id: string } }>(sourceRes);

    const networkRes = await SELF.fetch("http://localhost/api/entities/networks", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ name: "Test Network" }),
    });
    expect(networkRes.status).toBe(201);

    const landerRes = await SELF.fetch("http://localhost/api/entities/landers", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ name: "LP 1", url: "https://merchant.example/lp" }),
    });
    expect(landerRes.status).toBe(201);

    const offerRes = await SELF.fetch("http://localhost/api/entities/offers", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        name: "Main Offer",
        url: "https://network.example/offer?click={click_id}",
        payout_cents: 2500,
      }),
    });
    expect(offerRes.status).toBe(201);

    const groupRes = await SELF.fetch("http://localhost/api/entities/groups", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ name: "US Campaigns" }),
    });
    expect(groupRes.status).toBe(201);

    const campaignRes = await SELF.fetch("http://localhost/api/campaigns", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        name: "Summer Promo",
        destination_url: "https://merchant.example/pricing",
        traffic_source_id: traffic_source.id,
      }),
    });
    expect(campaignRes.status).toBe(201);
    const { program } = await json<{ program: { campaign_key: string; traffic_source_id: string } }>(
      campaignRes,
    );
    expect(program.campaign_key).toMatch(/^summer_promo_/);
    expect(program.traffic_source_id).toBe(traffic_source.id);
  });

  it("edits and deletes entities, blocking deletes that would break references", async () => {
    const call = (method: string, path: string, body?: unknown) =>
      SELF.fetch(`http://localhost${path}`, {
        method,
        headers: authHeaders,
        body: body === undefined ? undefined : JSON.stringify(body),
      });

    const { traffic_source: source } = await json<{ traffic_source: { id: string } }>(
      await call("POST", "/api/entities/traffic-sources", { name: "TS" }),
    );
    const patched = await call("PATCH", `/api/entities/traffic-sources/${source.id}`, {
      name: "TS 2",
      cost_type: "cpm",
      postback_percent: 50,
    });
    expect(patched.status).toBe(200);
    expect(
      (await json<{ traffic_source: { name: string; cost_type: string; postback_percent: number } }>(patched))
        .traffic_source,
    ).toMatchObject({ name: "TS 2", cost_type: "cpm", postback_percent: 50 });
    expect(
      (await call("PATCH", `/api/entities/traffic-sources/${source.id}`, { cost_type: "x" })).status,
    ).toBe(400);

    const { network } = await json<{ network: { id: string } }>(
      await call("POST", "/api/entities/networks", { name: "Net" }),
    );
    const { offer } = await json<{ offer: { id: string } }>(
      await call("POST", "/api/entities/offers", {
        name: "Offer",
        url: "https://network.example/o",
        network_id: network.id,
      }),
    );
    const offerPatch = await call("PATCH", `/api/entities/offers/${offer.id}`, {
      payout_cents: 700,
      url: "https://network.example/o2",
    });
    expect((await json<{ offer: { payout_cents: number; url: string } }>(offerPatch)).offer).toMatchObject({
      payout_cents: 700,
      url: "https://network.example/o2",
    });
    expect((await call("PATCH", `/api/entities/offers/${offer.id}`, { url: "ftp://x" })).status).toBe(400);

    // Network is used by the offer -> 409.
    expect((await call("DELETE", `/api/entities/networks/${network.id}`)).status).toBe(409);

    const { program } = await json<{ program: { id: string } }>(
      await call("POST", "/api/programs", { name: "Ref campaign", traffic_source_id: source.id }),
    );
    expect((await call("DELETE", `/api/entities/traffic-sources/${source.id}`)).status).toBe(409);

    const pathRes = await call("POST", `/api/programs/${program.id}/paths`, {
      name: "P",
      flow_type: "offer",
      offer_id: offer.id,
    });
    const { path } = await json<{ path: { id: string } }>(pathRes);
    const blocked = await call("DELETE", `/api/entities/offers/${offer.id}`);
    expect(blocked.status).toBe(409);
    expect((await json<{ error: string }>(blocked)).error).toContain("path");

    await call("DELETE", `/api/programs/${program.id}/paths/${path.id}`);
    expect((await call("DELETE", `/api/entities/offers/${offer.id}`)).status).toBe(200);
    expect((await call("DELETE", `/api/entities/networks/${network.id}`)).status).toBe(200);
    expect((await call("DELETE", `/api/entities/offers/${offer.id}`)).status).toBe(404);

    const { lander } = await json<{ lander: { id: string } }>(
      await call("POST", "/api/entities/landers", { name: "LP", url: "https://merchant.example/lp" }),
    );
    expect(
      (await call("PATCH", `/api/entities/landers/${lander.id}`, { name: "LP 2" })).status,
    ).toBe(200);
    expect((await call("DELETE", `/api/entities/landers/${lander.id}`)).status).toBe(200);

    // Another account cannot edit or delete.
    const other = await registerTestUser();
    const foreign = await SELF.fetch(`http://localhost/api/entities/traffic-sources/${source.id}`, {
      method: "DELETE",
      headers: other.authHeaders,
    });
    expect(foreign.status).toBe(404);
  });

  it("updates campaign source, group and status, and archives on delete", async () => {
    const call = (method: string, path: string, body?: unknown) =>
      SELF.fetch(`http://localhost${path}`, {
        method,
        headers: authHeaders,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    const { group } = await json<{ group: { id: string } }>(
      await call("POST", "/api/entities/groups", { name: "G" }),
    );
    const { traffic_source: source } = await json<{ traffic_source: { id: string } }>(
      await call("POST", "/api/entities/traffic-sources", { name: "Src" }),
    );
    const created = await call("POST", "/api/programs", {
      name: "Status campaign",
      destination_url: "https://merchant.example/",
      group_id: group.id,
    });
    const { program } = await json<{ program: { id: string; campaign_key: string; group_id: string } }>(
      created,
    );
    expect(program.group_id).toBe(group.id);

    const patched = await call("PATCH", `/api/programs/${program.id}`, {
      traffic_source_id: source.id,
      group_id: null,
      status: "paused",
    });
    expect((await json<{ program: Record<string, unknown> }>(patched)).program).toMatchObject({
      traffic_source_id: source.id,
      group_id: null,
      status: "paused",
    });
    expect((await call("PATCH", `/api/programs/${program.id}`, { status: "archived" })).status).toBe(400);
    expect(
      (await call("PATCH", `/api/programs/${program.id}`, { traffic_source_id: "src_nope" })).status,
    ).toBe(400);
    const paused = await SELF.fetch(`http://localhost/c/${program.campaign_key}`, { redirect: "manual" });
    expect(paused.status).toBe(404);

    await call("PATCH", `/api/programs/${program.id}`, { status: "active" });
    const active = await SELF.fetch(`http://localhost/c/${program.campaign_key}`, { redirect: "manual" });
    expect(active.status).toBe(302);

    // Click log date window + paging.
    const all = await json<{ clicks: unknown[] }>(await call("GET", `/api/programs/${program.id}/clicks`));
    expect(all.clicks).toHaveLength(1);
    const future = await json<{ clicks: unknown[] }>(
      await call("GET", `/api/programs/${program.id}/clicks?from=${Date.now() + 60_000}`),
    );
    expect(future.clicks).toHaveLength(0);
    const skipped = await json<{ clicks: unknown[] }>(
      await call("GET", `/api/programs/${program.id}/clicks?offset=1`),
    );
    expect(skipped.clicks).toHaveLength(0);

    // Deleting a group keeps its campaigns.
    await call("PATCH", `/api/programs/${program.id}`, { group_id: group.id });
    expect((await call("DELETE", `/api/entities/groups/${group.id}`)).status).toBe(200);
    const afterGroup = await json<{ program: { group_id: string | null } }>(
      await call("GET", `/api/programs/${program.id}`),
    );
    expect(afterGroup.program.group_id).toBeNull();

    expect((await call("DELETE", `/api/programs/${program.id}`)).status).toBe(200);
    const list = await json<{ programs: Array<{ id: string }> }>(await call("GET", "/api/programs"));
    expect(list.programs.map((p) => p.id)).not.toContain(program.id);
    const archived = await SELF.fetch(`http://localhost/c/${program.campaign_key}`, { redirect: "manual" });
    expect(archived.status).toBe(404);
    expect((await call("DELETE", `/api/programs/${program.id}`)).status).toBe(404);
  });
});
