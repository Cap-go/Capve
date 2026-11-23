import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { adcashProvider } from "../worker/cron/cost-providers";
import { syncSourceCost } from "../worker/cron/cost-sync";
import { getSourceSettingsRow } from "../worker/db/sources";
import { parseCostCents } from "../worker/lib/click-context";
import {
  applySourceTokens,
  normalizePropellerTokens,
  parseTokens,
  SOURCE_TEMPLATES,
  trackingUrlWithMacros,
  type SourceToken,
} from "../worker/lib/source-templates";
import { registerTestUser } from "./helpers";
import { initSql } from "./schema";
import propellerMigration from "../migrations/0035_fix_propellerads_macros.sql?raw";
import propellerLiveMigration from "../migrations/0037_fix_propellerads_live_macros.sql?raw";

const MERCHANT = "https://merchant.example.com/casino";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

let authHeaders: Record<string, string>;

async function api<T>(method: string, path: string, body?: unknown, status = 200): Promise<T> {
  const res = await SELF.fetch(`http://localhost${path}`, {
    method,
    headers: authHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  expect(res.status, JSON.stringify(data)).toBe(status);
  return data as T;
}

async function adcashCampaign() {
  const { traffic_source, settings, postback } = await api<{
    traffic_source: { id: string; cost_type: string };
    settings: { tokens: Array<{ param: string; slot: string; macro?: string }>; api_provider: string | null };
    postback: { url: string } | null;
  }>("POST", "/api/sources/from-template", { template_id: "adcash", name: "Adcash pops" }, 201);
  const { program } = await api<{ program: { id: string; campaign_key: string } }>(
    "POST",
    "/api/programs",
    {
      name: `Casino ${crypto.randomUUID().slice(0, 6)}`,
      destination_url: MERCHANT,
      traffic_source_id: traffic_source.id,
    },
    201,
  );
  return { source: traffic_source, settings, postback, program };
}

async function click(campaignKey: string, query: string) {
  const res = await SELF.fetch(`http://localhost/c/${campaignKey}?${query}`, {
    redirect: "manual",
    headers: { "User-Agent": UA },
  });
  expect(res.status).toBe(302);
  return new URL(res.headers.get("Location")!).searchParams.get("click_id")!;
}

function clickRow(clickId: string) {
  return env.DB.prepare("SELECT sub1, sub2, sub3, external_id, cost_cents FROM clicks WHERE id = ?")
    .bind(clickId)
    .first<{ sub1: string | null; sub2: string | null; sub3: string | null; external_id: string | null; cost_cents: number | null }>();
}

const today = () => new Date().toISOString().slice(0, 10);

const PROPELLER_QUERY =
  "zoneid={zone_id}&campaignid={campaign_id}&country={country}&cost={cost}&clickid=${SUBID}";

function propellerPairs(tokens: Array<{ param: string; macro?: string }>) {
  return tokens.map((token) => `${token.param}=${token.macro}`);
}

async function runSql(sql: string) {
  for (const statement of sql.split(";").map((part) => part.trim()).filter(Boolean)) {
    await env.DB.prepare(statement).run();
  }
}

async function settingsRow(sourceId: string) {
  return env.DB.prepare("SELECT * FROM traffic_source_settings WHERE traffic_source_id = ?")
    .bind(sourceId)
    .first<{
      traffic_source_id: string;
      user_id: string;
      template: string | null;
      tokens: string;
      api_provider: string | null;
      api_key_sealed: string | null;
      last_sync_at: number | null;
      last_sync_error: string | null;
      updated_at: number;
    }>();
}

describe("traffic source templates, tokens and cost", () => {
  beforeAll(async () => {
    for (const statement of initSql.split(";").map((s) => s.trim()).filter(Boolean)) {
      await env.DB.prepare(statement).run();
    }
    ({ authHeaders } = await registerTestUser());
  });

  it("lists built-in source and network templates", async () => {
    const data = await api<{
      traffic_sources: Array<{ id: string }>;
      networks: Array<{ id: string; incoming_postback_urls: { default: string; ftd: string } }>;
    }>("GET", "/api/sources/templates");
    const ids = data.traffic_sources.map((t) => t.id);
    for (const id of ["adcash", "propellerads", "richads", "zeropark", "trafficstars", "facebook", "google-ads", "tiktok"]) {
      expect(ids).toContain(id);
    }
    const everflow = data.networks.find((n) => n.id === "everflow")!;
    expect(everflow.incoming_postback_urls.ftd).toBe(
      "http://localhost:5173/click?cnv_id={sub1}&payout={payout_amount}&event=ftd",
    );
    const yesplay = data.networks.find((n) => n.id === "yesplay")!;
    expect(yesplay.incoming_postback_urls.default).toBe("http://localhost:5173/click?cnv_id=${subid1}");
    expect(yesplay.incoming_postback_urls.ftd).toBe(
      "http://localhost:5173/click?cnv_id=${subid1}&event=ftd",
    );
  });

  it("every built-in template has valid tokens", () => {
    for (const template of SOURCE_TEMPLATES) {
      expect(parseTokens(template.tokens), template.id).toEqual(template.tokens);
    }
  });

  it("creates a traffic source from a template with tokens and postback", async () => {
    const { source, settings, postback } = await adcashCampaign();
    expect(source.cost_type).toBe("cpm");
    expect(settings.api_provider).toBeNull();
    expect(settings.tokens.find((t) => t.slot === "cost")?.macro).toBe("[redirection_cost]");
    expect(settings.tokens.find((t) => t.param === "zoneid")?.slot).toBe("sub1");
    expect(postback?.url).toContain("{external_id}");
  });

  it("builds ad link with traffic source macros for Adcash", async () => {
    const { program } = await adcashCampaign();
    const data = await api<{
      traffic_source_id: string | null;
      campaign_url: string | null;
      tracking_url: string | null;
      tokens: Array<{ param: string; macro?: string }>;
    }>("GET", `/api/campaigns/${program.id}/source-link`);
    expect(data.campaign_url).toBe(`http://localhost:5173/c/${program.campaign_key}`);
    expect(data.tracking_url).toContain("?zoneid=[zone]");
    expect(data.tracking_url).toContain("campaignid=[campaign]");
    expect(data.tracking_url).toContain("country=[country]");
    expect(data.tracking_url).toContain("cost=[redirection_cost]");
    expect(data.tracking_url).toContain("clickid=[clickid]");
    expect(data.tokens.length).toBeGreaterThan(0);
  });

  it("PropellerAds template defaults are the live campaign macros", () => {
    const template = SOURCE_TEMPLATES.find((item) => item.id === "propellerads");
    expect(template).toBeTruthy();
    expect(propellerPairs(template!.tokens)).toEqual([
      "zoneid={zone_id}",
      "campaignid={campaign_id}",
      "country={country}",
      "cost={cost}",
      "clickid=${SUBID}",
    ]);
    expect(trackingUrlWithMacros("https://capve.app/c/key", template!.tokens)).toBe(
      `https://capve.app/c/key?${PROPELLER_QUERY}`,
    );
  });

  it("normalizes broken PropellerAds tokens and leaves custom ones", () => {
    const uppercase: SourceToken[] = [
      { param: "zoneid", name: "Zone", slot: "sub1", macro: "${ZONEID}", kind: "zone" },
      { param: "campaignid", name: "Campaign", slot: "sub2", macro: "${CAMPAIGNID}", kind: "campaign" },
      { param: "bannerid", name: "Creative", slot: "sub3", macro: "${BANNERID}" },
      { param: "geo", name: "Country", slot: "sub4", macro: "${GEO}" },
      { param: "cost", name: "Cost", slot: "cost", macro: "${COST}" },
      { param: "clickid", name: "Click ID", slot: "external_id", macro: "${SUBID}" },
      { param: "os", name: "OS", slot: "sub5", macro: "{os}" },
    ];
    expect(propellerPairs(normalizePropellerTokens(uppercase))).toEqual([
      "zoneid={zone_id}",
      "campaignid={campaign_id}",
      "country={country}",
      "cost={cost}",
      "clickid=${SUBID}",
      "os={os}",
    ]);

    const lowercase: SourceToken[] = [
      { param: "zoneid", name: "Zone", slot: "sub1", macro: "${zoneid}", kind: "zone" },
      { param: "campaignid", name: "Campaign", slot: "sub2", macro: "${campaignid}", kind: "campaign" },
      { param: "geo", name: "Country", slot: "sub4", macro: "${geo}" },
      { param: "cost", name: "Cost", slot: "cost", macro: "${cost}" },
      { param: "clickid", name: "Click ID", slot: "external_id", macro: "${SUBID}" },
    ];
    expect(propellerPairs(normalizePropellerTokens(lowercase))).toEqual([
      "zoneid={zone_id}",
      "campaignid={campaign_id}",
      "country={country}",
      "cost={cost}",
      "clickid=${SUBID}",
    ]);

    const already: SourceToken[] = [
      { param: "zoneid", name: "Zone", slot: "sub1", macro: "{zone_id}", kind: "zone" },
      { param: "clickid", name: "Click ID", slot: "external_id", macro: "${SUBID}" },
      { param: "note", name: "Note", slot: "sub6", macro: "${custom}" },
    ];
    expect(normalizePropellerTokens(already)).toEqual(already);

    const mixedCase: SourceToken[] = [
      { param: "zoneid", name: "Zone", slot: "sub1", macro: "${ZoneId}", kind: "zone" },
      { param: "campaignid", name: "Campaign", slot: "sub2", macro: "${CampaignId}", kind: "campaign" },
      { param: "GEO", name: "Geo code", slot: "sub4", macro: "${Geo}" },
      { param: "cost", name: "Cost", slot: "cost", macro: "${Cost}" },
      { param: "clickid", name: "Click ID", slot: "external_id", macro: "${SUBID}" },
    ];
    expect(propellerPairs(normalizePropellerTokens(mixedCase))).toEqual([
      "zoneid={zone_id}",
      "campaignid={campaign_id}",
      "country={country}",
      "cost={cost}",
      "clickid=${SUBID}",
    ]);
    expect(normalizePropellerTokens(mixedCase).find((token) => token.param === "country")?.name).toBe("Geo code");

    const collision: SourceToken[] = [
      { param: "geo", name: "Geo code", slot: "sub4", macro: "${geo}" },
      { param: "country", name: "Country", slot: "sub9", macro: "{country}" },
    ];
    expect(normalizePropellerTokens(collision)).toEqual([
      { param: "country", name: "Country", slot: "sub9", macro: "{country}" },
    ]);
  });

  it("builds ad link with traffic source macros for PropellerAds", async () => {
    const { traffic_source } = await api<{
      traffic_source: { id: string };
    }>("POST", "/api/sources/from-template", { template_id: "propellerads", name: "PropellerAds" }, 201);
    const { program } = await api<{ program: { id: string; campaign_key: string } }>(
      "POST",
      "/api/programs",
      {
        name: `PropellerAds ${crypto.randomUUID().slice(0, 6)}`,
        destination_url: MERCHANT,
        traffic_source_id: traffic_source.id,
      },
      201,
    );
    const data = await api<{
      tracking_url: string | null;
      tokens: Array<{ param: string; macro?: string }>;
    }>("GET", `/api/campaigns/${program.id}/source-link`);
    expect(data.tracking_url?.split("?")[1]).toBe(PROPELLER_QUERY);
    expect(propellerPairs(data.tokens)).toEqual([
      "zoneid={zone_id}",
      "campaignid={campaign_id}",
      "country={country}",
      "cost={cost}",
      "clickid=${SUBID}",
    ]);
  });

  it("rewrites a stored broken PropellerAds link before and after the migration", async () => {
    const { traffic_source } = await api<{ traffic_source: { id: string } }>(
      "POST",
      "/api/sources/from-template",
      { template_id: "propellerads", name: "PropellerAds legacy" },
      201,
    );
    await api("PUT", `/api/sources/${traffic_source.id}/settings`, { api_provider: null, api_key: "keep-me" });
    const beforeSave = (await settingsRow(traffic_source.id))!;
    const legacy = JSON.stringify([
      { param: "zoneid", name: "Zone", slot: "sub1", macro: "${ZONEID}", kind: "zone" },
      { param: "campaignid", name: "Campaign", slot: "sub2", macro: "${CAMPAIGNID}", kind: "campaign" },
      { param: "bannerid", name: "Creative", slot: "sub3", macro: "${BANNERID}" },
      { param: "geo", name: "Country", slot: "sub4", macro: "${GEO}" },
      { param: "cost", name: "Cost", slot: "cost", macro: "${COST}" },
      { param: "clickid", name: "Click ID", slot: "external_id", macro: "${SUBID}" },
      { param: "os", name: "OS", slot: "sub5", macro: "{os}" },
    ]);
    await env.DB.prepare(
      "UPDATE traffic_source_settings SET tokens = ?, updated_at = ? WHERE traffic_source_id = ?",
    )
      .bind(legacy, beforeSave.updated_at, traffic_source.id)
      .run();

    const { traffic_source: lowerSource } = await api<{ traffic_source: { id: string } }>(
      "POST",
      "/api/sources/from-template",
      { template_id: "propellerads", name: "PropellerAds lower" },
      201,
    );
    const lower = JSON.stringify([
      { param: "zoneid", name: "Zone", slot: "sub1", macro: "${zoneid}", kind: "zone" },
      { param: "campaignid", name: "Campaign", slot: "sub2", macro: "${campaignid}", kind: "campaign" },
      { param: "country", name: "Country", slot: "sub4", macro: "${geo}" },
      { param: "cost", name: "Cost", slot: "cost", macro: "${cost}" },
      { param: "clickid", name: "Click ID", slot: "external_id", macro: "${SUBID}" },
    ]);
    const lowerBefore = (await settingsRow(lowerSource.id))!;
    await env.DB.prepare("UPDATE traffic_source_settings SET tokens = ? WHERE traffic_source_id = ?")
      .bind(lower, lowerSource.id)
      .run();

    const { program } = await api<{ program: { id: string } }>(
      "POST",
      "/api/programs",
      {
        name: `Legacy Propeller ${crypto.randomUUID().slice(0, 6)}`,
        destination_url: MERCHANT,
        traffic_source_id: traffic_source.id,
      },
      201,
    );
    const data = await api<{ tracking_url: string | null }>("GET", `/api/campaigns/${program.id}/source-link`);
    expect(data.tracking_url?.split("?")[1]).toBe(`${PROPELLER_QUERY}&os={os}`);

    const { traffic_source: bannerLast } = await api<{ traffic_source: { id: string } }>(
      "POST",
      "/api/sources/from-template",
      { template_id: "propellerads", name: "PropellerAds banner last" },
      201,
    );
    const bannerLastTokens = JSON.stringify([
      { param: "zoneid", name: "Zone", slot: "sub1", macro: "${zoneid}", kind: "zone" },
      { param: "campaignid", name: "Campaign", slot: "sub2", macro: "${campaignid}", kind: "campaign" },
      { param: "bannerid", name: "Creative", slot: "sub3", macro: "${bannerid}" },
    ]);
    await env.DB.prepare("UPDATE traffic_source_settings SET tokens = ? WHERE traffic_source_id = ?")
      .bind(bannerLastTokens, bannerLast.id)
      .run();

    const { traffic_source: labeled } = await api<{ traffic_source: { id: string } }>(
      "POST",
      "/api/sources/from-template",
      { template_id: "propellerads", name: "PropellerAds labeled" },
      201,
    );
    const labeledTokens = JSON.stringify([
      { param: "zoneid", name: "Zone", slot: "sub1", macro: "${ZoneId}", kind: "zone" },
      { param: "campaignid", name: "Camp", slot: "sub2", macro: "${CampaignId}", kind: "campaign" },
      { param: "geo", name: "Geo code", slot: "sub4", macro: "${Geo}" },
      { param: "cost", name: "Spend", slot: "cost", macro: "${Cost}" },
      { param: "clickid", name: "Click ID", slot: "external_id", macro: "${SUBID}" },
    ]);
    const labeledBefore = (await settingsRow(labeled.id))!;
    await env.DB.prepare(
      "UPDATE traffic_source_settings SET tokens = ?, updated_at = ? WHERE traffic_source_id = ?",
    )
      .bind(labeledTokens, labeledBefore.updated_at, labeled.id)
      .run();

    const { traffic_source: both } = await api<{ traffic_source: { id: string } }>(
      "POST",
      "/api/sources/from-template",
      { template_id: "propellerads", name: "PropellerAds both countries" },
      201,
    );
    const bothTokens = JSON.stringify([
      { param: "geo", name: "Geo code", slot: "sub4", macro: "${geo}" },
      { param: "country", name: "Country", slot: "sub9", macro: "{country}" },
      { param: "clickid", name: "Click ID", slot: "external_id", macro: "${SUBID}" },
    ]);
    await env.DB.prepare("UPDATE traffic_source_settings SET tokens = ? WHERE traffic_source_id = ?")
      .bind(bothTokens, both.id)
      .run();

    const { source: adcash } = await adcashCampaign();
    const adcashTokens = JSON.stringify([
      { param: "zoneid", name: "Zone", slot: "sub1", macro: "${ZONEID}", kind: "zone" },
      { param: "geo", name: "Geo", slot: "sub4", macro: "${GEO}" },
      { param: "cost", name: "Cost", slot: "cost", macro: "${COST}" },
      { param: "clickid", name: "Click ID", slot: "external_id", macro: "${SUBID}" },
    ]);
    await env.DB.prepare(
      "UPDATE traffic_source_settings SET tokens = ?, updated_at = ? WHERE traffic_source_id = ?",
    )
      .bind(adcashTokens, 111, adcash.id)
      .run();

    await runSql(propellerMigration);
    await runSql(propellerLiveMigration);

    const stored = (await settingsRow(traffic_source.id))!;
    expect(propellerPairs(JSON.parse(stored.tokens))).toEqual([
      "zoneid={zone_id}",
      "campaignid={campaign_id}",
      "country={country}",
      "cost={cost}",
      "clickid=${SUBID}",
      "os={os}",
    ]);
    expect(stored.user_id).toBe(beforeSave.user_id);
    expect(stored.template).toBe("propellerads");
    expect(stored.api_provider).toBe(beforeSave.api_provider);
    expect(stored.api_key_sealed).toBe(beforeSave.api_key_sealed);
    expect(stored.last_sync_at).toBe(beforeSave.last_sync_at);
    expect(stored.last_sync_error).toBe(beforeSave.last_sync_error);
    expect(stored.updated_at).toBe(beforeSave.updated_at);
    expect(stored.api_key_sealed).toMatch(/^v1\./);

    const lowerStored = (await settingsRow(lowerSource.id))!;
    expect(propellerPairs(JSON.parse(lowerStored.tokens))).toEqual([
      "zoneid={zone_id}",
      "campaignid={campaign_id}",
      "country={country}",
      "cost={cost}",
      "clickid=${SUBID}",
    ]);
    expect(lowerStored.updated_at).toBe(lowerBefore.updated_at);
    expect(lowerStored.user_id).toBe(lowerBefore.user_id);

    const labeledStored = (await settingsRow(labeled.id))!;
    const labeledParsed = JSON.parse(labeledStored.tokens) as Array<{ param: string; name: string; macro?: string }>;
    expect(propellerPairs(labeledParsed)).toEqual([
      "zoneid={zone_id}",
      "campaignid={campaign_id}",
      "country={country}",
      "cost={cost}",
      "clickid=${SUBID}",
    ]);
    expect(labeledParsed.find((token) => token.param === "country")).toMatchObject({ name: "Geo code" });
    expect(labeledStored.updated_at).toBe(labeledBefore.updated_at);

    const bothStored = JSON.parse((await settingsRow(both.id))!.tokens) as Array<{
      param: string;
      name: string;
      slot: string;
    }>;
    expect(bothStored.map((token) => token.param)).toEqual(["country", "clickid"]);
    expect(bothStored[0]).toMatchObject({ name: "Country", slot: "sub9" });

    const adcashAfter = (await settingsRow(adcash.id))!;
    expect(adcashAfter.tokens).toBe(adcashTokens);
    expect(adcashAfter.updated_at).toBe(111);

    const cleanedLast = (await settingsRow(bannerLast.id))!;
    expect(JSON.parse(cleanedLast.tokens).map((token: { param: string }) => token.param)).toEqual([
      "zoneid",
      "campaignid",
    ]);
    expect(propellerPairs(JSON.parse(cleanedLast.tokens))).toEqual([
      "zoneid={zone_id}",
      "campaignid={campaign_id}",
    ]);

    const once = stored.tokens;
    await runSql(propellerLiveMigration);
    expect((await settingsRow(traffic_source.id))!.tokens).toBe(once);
    expect((await settingsRow(traffic_source.id))!.updated_at).toBe(beforeSave.updated_at);
  });

  it("persists corrected PropellerAds macros when settings are saved", async () => {
    const { traffic_source } = await api<{ traffic_source: { id: string } }>(
      "POST",
      "/api/sources/from-template",
      { template_id: "propellerads", name: "PropellerAds save" },
      201,
    );
    await api("PUT", `/api/sources/${traffic_source.id}/settings`, {
      tokens: [
        { param: "zoneid", name: "Zone", slot: "sub1", macro: "${zoneid}", kind: "zone" },
        { param: "campaignid", name: "Campaign", slot: "sub2", macro: "${campaignid}", kind: "campaign" },
        { param: "geo", name: "Country", slot: "sub4", macro: "${geo}" },
        { param: "cost", name: "Cost", slot: "cost", macro: "${cost}" },
        { param: "clickid", name: "Click ID", slot: "external_id", macro: "${SUBID}" },
        { param: "os", name: "OS", slot: "sub5", macro: "{os}" },
      ],
    });
    const stored = (await settingsRow(traffic_source.id))!;
    expect(propellerPairs(JSON.parse(stored.tokens))).toEqual([
      "zoneid={zone_id}",
      "campaignid={campaign_id}",
      "country={country}",
      "cost={cost}",
      "clickid=${SUBID}",
      "os={os}",
    ]);

    const beforeConflict = (await settingsRow(traffic_source.id))!;
    const conflict = await api<{ error: string }>(
      "PUT",
      `/api/sources/${traffic_source.id}/settings`,
      {
        tokens: [
          { param: "geo", name: "Geo code", slot: "sub4", macro: "${Geo}" },
          { param: "country", name: "Country", slot: "sub9", macro: "{country}" },
        ],
      },
      400,
    );
    expect(conflict.error).toBe("Duplicate token param: country");
    const afterConflict = (await settingsRow(traffic_source.id))!;
    expect(afterConflict.tokens).toBe(beforeConflict.tokens);
    expect(afterConflict.updated_at).toBe(beforeConflict.updated_at);
  });

  it("does not rewrite a non-PropellerAds source that uses the same macros", async () => {
    const { source, program } = await adcashCampaign();
    const custom = JSON.stringify([
      { param: "zoneid", name: "Zone", slot: "sub1", macro: "${ZONEID}", kind: "zone" },
      { param: "bannerid", name: "Creative", slot: "sub3", macro: "${BANNERID}" },
      { param: "clickid", name: "Click ID", slot: "external_id", macro: "${SUBID}" },
    ]);
    await env.DB.prepare("UPDATE traffic_source_settings SET tokens = ? WHERE traffic_source_id = ?")
      .bind(custom, source.id)
      .run();
    const data = await api<{ tracking_url: string | null }>("GET", `/api/campaigns/${program.id}/source-link`);
    expect(data.tracking_url).toContain("zoneid=${ZONEID}");
    expect(data.tracking_url).toContain("bannerid=${BANNERID}");
  });

  it("creates a network from a template with incoming postback URLs", async () => {
    const data = await api<{ network: { id: string }; offer_url_suffix: string; incoming_postback_urls: { default: string } }>(
      "POST",
      "/api/sources/networks/from-template",
      { template_id: "tune" },
      201,
    );
    expect(data.network.id).toBeTruthy();
    expect(data.offer_url_suffix).toBe("aff_sub={click_id}");
    expect(data.incoming_postback_urls.default).toContain("cnv_id={aff_sub}");
  });

  it("maps the source's named params to subs on click", async () => {
    const { program } = await adcashCampaign();
    const clickId = await click(program.campaign_key, "zoneid=9001&campaignid=77&clickid=adc-1&cost=0.05&sub3=keep");
    const row = await clickRow(clickId);
    expect(row).toMatchObject({ sub1: "9001", sub2: "77", external_id: "adc-1", cost_cents: 5 });

    const link = await api<{ tracking_url: string; labels: Record<string, string> }>(
      "GET",
      `/api/campaigns/${program.id}/source-link`,
    );
    expect(link.tracking_url).toContain(`/c/${program.campaign_key}?zoneid=[zone]&campaignid=[campaign]`);
    expect(link.labels.sub1).toBe("Zone");
    expect(link.labels.sub2).toBe("Campaign");
  });

  it("applySourceTokens lets mapped params win over raw subs", () => {
    const out = applySourceTokens(
      new URL("https://x.test/c/k?zoneid=1&sub1=raw"),
      [{ param: "zoneid", name: "Zone", slot: "sub1" }],
      { sub1: "raw", sub2: null, sub3: null, sub4: null, sub5: null, sub6: null, sub7: null, sub8: null, sub9: null, sub10: null, external_id: null, cost_cents: null },
    );
    expect(out.sub1).toBe("1");
  });

  it("stores a sub-cent visit price and sums it on the campaign", async () => {
    expect(parseCostCents("0.001")).toBeCloseTo(0.1, 6);
    expect(parseCostCents("0.05")).toBe(5);
    const { program } = await adcashCampaign();
    const ids: string[] = [];
    for (let i = 0; i < 10; i++) ids.push(await click(program.campaign_key, `clickid=pop${i}&cost=0.001`));
    expect((await clickRow(ids[0]))!.cost_cents).toBeCloseTo(0.1, 6);
    const { campaigns } = await api<{
      campaigns: Array<{ id: string; metrics: { cost_cents: number } }>;
    }>("GET", "/api/reports/campaigns");
    expect(campaigns.find((row) => row.id === program.id)!.metrics.cost_cents).toBe(1);
  });

  it("cost update spreads total over matching clicks and drives report cost/ROI", async () => {
    const { program } = await adcashCampaign();
    const a = await click(program.campaign_key, "zoneid=123&clickid=c1");
    const b = await click(program.campaign_key, "zoneid=123&clickid=c2");
    const other = await click(program.campaign_key, "zoneid=456&clickid=c3");

    const { cost_update } = await api<{ cost_update: { clicks_updated: number; filter_dim: string } }>(
      "POST",
      `/api/campaigns/${program.id}/costs`,
      { date: today(), total_cents: 1001, filter_dim: "zoneid", filter_value: "123" },
      201,
    );
    expect(cost_update.clicks_updated).toBe(2);
    expect(cost_update.filter_dim).toBe("sub1");
    const costs = [(await clickRow(a))!.cost_cents, (await clickRow(b))!.cost_cents].sort();
    expect(costs).toEqual([500, 501]);
    // Untouched: keeps the CPM snapshot taken at click time (template default 0).
    expect((await clickRow(other))!.cost_cents).toBe(0);

    // Re-running replaces (does not add to) the previous cost.
    await api("POST", `/api/campaigns/${program.id}/costs`, { date: today(), total: "10.01", filter_dim: "sub1", filter_value: "123" }, 201);

    const pb = await SELF.fetch(`http://localhost/click?cnv_id=${a}&payout=20`);
    expect(pb.status).toBe(200);

    const { campaigns } = await api<{
      campaigns: Array<{ id: string; metrics: { cost_cents: number; revenue_cents: number; roi: number } }>;
    }>("GET", "/api/reports/campaigns");
    const row = campaigns.find((r) => r.id === program.id)!;
    expect(row.metrics.cost_cents).toBe(1001);
    expect(row.metrics.revenue_cents).toBe(2000);
    expect(row.metrics.roi).toBeCloseTo(((2000 - 1001) / 1001) * 100, 1);

    const { cost_updates } = await api<{ cost_updates: unknown[] }>("GET", `/api/campaigns/${program.id}/costs`);
    expect(cost_updates).toHaveLength(2);
  });

  it("rejects invalid cost updates", async () => {
    const { program } = await adcashCampaign();
    await api("POST", `/api/campaigns/${program.id}/costs`, { total_cents: 100 }, 400);
    await api("POST", `/api/campaigns/${program.id}/costs`, { date: today(), total_cents: -1 }, 400);
    await api("POST", `/api/campaigns/${program.id}/costs`, { date: today(), total_cents: 1, filter_dim: "ip", filter_value: "x" }, 400);
  });

  it("stores the cost API key encrypted and never returns it", async () => {
    const { source } = await adcashCampaign();
    const { settings } = await api<{ settings: Record<string, unknown> }>(
      "PUT",
      `/api/sources/${source.id}/settings`,
      { api_provider: "adcash", api_key: "secret-adcash-key" },
    );
    expect(settings.has_api_key).toBe(true);
    expect(JSON.stringify(settings)).not.toContain("secret-adcash-key");
    const row = await getSourceSettingsRow(env.DB, source.id);
    expect(row?.api_key_sealed).toMatch(/^v1\./);
    expect(row?.api_key_sealed).not.toContain("secret-adcash-key");

    await api("PUT", `/api/sources/${source.id}/settings`, { tokens: [{ param: "bad param", slot: "sub1" }] }, 400);
    await api("PUT", `/api/sources/${source.id}/settings`, { api_provider: "nope" }, 400);
  });

  it("Adcash adapter parses spend rows with impressions from a mocked API", async () => {
    const calls: string[] = [];
    const rows = await adcashProvider.fetchSpend("k", { from: "2026-10-14", to: "2026-10-15" }, async (url, init) => {
      calls.push(url);
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer k");
      return Response.json({
        data: [
          { date: "2026-10-14", campaign_id: 77, zone_id: "123", spend: "1.5", impressions: 1000 },
          { day: "2026-10-15", campaign: "77", zone: "456", cost: 2, imps: 2500 },
          { date: "2026-10-15", spend: "oops" },
        ],
      });
    });
    expect(calls[0]).toContain("date_from=2026-10-14");
    expect(rows).toEqual([
      { date: "2026-10-14", campaign_id: "77", zone_id: "123", spend_cents: 150, impressions: 1000 },
      { date: "2026-10-15", campaign_id: "77", zone_id: "456", spend_cents: 200, impressions: 2500 },
    ]);

    await expect(
      adcashProvider.fetchSpend("k", { from: "2026-10-14", to: "2026-10-14" }, async () => new Response("nope", { status: 401 })),
    ).rejects.toThrow("Adcash API 401");
  });

  it("syncs Adcash spend onto clicks by campaign and zone token", async () => {
    const { source, program } = await adcashCampaign();
    const z1 = await click(program.campaign_key, "zoneid=123&campaignid=77&clickid=s1");
    const z2 = await click(program.campaign_key, "zoneid=456&campaignid=77&clickid=s2");
    await api("PUT", `/api/sources/${source.id}/settings`, { api_provider: "adcash", api_key: "k" });

    const day = today();
    const row = (await getSourceSettingsRow(env.DB, source.id))!;
    const result = await syncSourceCost(env, row, {
      days: [day],
      fetchFn: async () =>
        Response.json([
          { date: day, campaign_id: "77", zone_id: "123", spend: 3, impressions: 5000 },
          { date: day, campaign_id: "77", zone_id: "456", spend: 1.25, impressions: 2000 },
          { date: "2000-01-01", campaign_id: "77", zone_id: "123", spend: 99 },
        ]),
    });
    expect(result).toMatchObject({ updates: 2, clicks_updated: 2, total_cents: 425, total_impressions: 0 });
    expect((await clickRow(z1))!.cost_cents).toBe(300);
    expect((await clickRow(z2))!.cost_cents).toBe(125);

    const { cost_updates } = await api<{ cost_updates: Array<{ origin: string }> }>("GET", `/api/campaigns/${program.id}/costs`);
    expect(cost_updates.every((u) => u.origin === "api")).toBe(true);
  });

  it("exposes the new tools over MCP", async () => {
    const res = await SELF.fetch("http://localhost/api/tokens", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ name: "test" }),
    });
    const { token } = await res.json<{ token: string }>();
    const call = async (name: string, args: Record<string, unknown>) => {
      const reply = await SELF.fetch("http://localhost/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
      });
      return (await reply.json<{ result: { isError?: boolean; structuredContent?: Record<string, unknown> } }>()).result;
    };
    const templates = await call("list_source_templates", {});
    expect(templates.isError).toBeFalsy();
    const created = await call("create_traffic_source_from_template", { template_id: "zeropark" });
    expect(created.isError).toBeFalsy();
  });
});
