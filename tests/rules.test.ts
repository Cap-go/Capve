import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { registerTestUser } from "./helpers";
import { initSql } from "./schema";
import { ipMatches } from "../worker/lib/ip";
import { localTime, parseConditions, ruleMatches, type RuleContext } from "../worker/lib/rules";
import { blocklistMatch } from "../worker/lib/antifraud";

const DEFAULT_URL = "https://casino.example.com/default";
const DE_MOBILE_URL = "https://casino.example.com/de-mobile";
const SAFE_PAGE = "https://safe.example.com/blog";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const DESKTOP =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

let authHeaders: Record<string, string>;

async function json<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

async function api<T>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
  const res = await SELF.fetch(`http://localhost${path}`, {
    method,
    headers: authHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: await json<T>(res) };
}

async function setupCampaign() {
  const { data } = await api<{ program: { id: string; campaign_key: string } }>("POST", "/api/programs", {
    name: `Rules ${crypto.randomUUID()}`,
    destination_url: DEFAULT_URL,
  });
  const programId = data.program.id;
  const { data: aff } = await api<{ affiliate: { code: string } }>(
    "POST",
    `/api/programs/${programId}/affiliates`,
    { name: "Adcash" },
  );
  await api("POST", `/api/programs/${programId}/paths`, {
    name: "Default",
    flow_type: "direct",
    direct_url: DEFAULT_URL,
  });
  return { programId, code: aff.affiliate.code };
}

function click(
  code: string,
  opts: { ua?: string; ip?: string; cf?: Record<string, unknown>; query?: string; lang?: string } = {},
) {
  const headers: Record<string, string> = { "user-agent": opts.ua ?? DESKTOP };
  if (opts.ip) headers["cf-connecting-ip"] = opts.ip;
  if (opts.lang) headers["accept-language"] = opts.lang;
  return SELF.fetch(`http://localhost/r/${code}${opts.query ?? ""}`, {
    redirect: "manual",
    headers,
    cf: opts.cf ?? {},
  } as RequestInit);
}

function target(res: Response): string {
  const location = res.headers.get("Location");
  if (!location) throw new Error(`no redirect (${res.status})`);
  const url = new URL(location);
  return url.origin + url.pathname;
}

async function lastClick(programId: string) {
  return env.DB.prepare(
    "SELECT id, is_bot, path_id, lander_id, offer_id FROM clicks WHERE program_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1",
  )
    .bind(programId)
    .first<{ id: string; is_bot: number; path_id: string | null; lander_id: string | null; offer_id: string | null }>();
}

function ctx(overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    ip: null,
    country: null,
    region: null,
    city: null,
    device_type: null,
    os: null,
    browser: null,
    isp: null,
    referrer_domain: null,
    is_bot: false,
    sub1: null,
    sub2: null,
    sub3: null,
    sub4: null,
    sub5: null,
    sub6: null,
    sub7: null,
    sub8: null,
    sub9: null,
    sub10: null,
    asn: null,
    language: null,
    is_datacenter: false,
    now: Date.now(),
    ...overrides,
  };
}

function conditions(raw: unknown) {
  const parsed = parseConditions(raw);
  if ("error" in parsed) throw new Error(parsed.error);
  return parsed.conditions;
}

describe("rule matching (unit)", () => {
  it("matches IPv4 / IPv6 CIDRs", () => {
    expect(ipMatches("10.1.2.3", "10.1.0.0/16")).toBe(true);
    expect(ipMatches("10.2.0.1", "10.1.0.0/16")).toBe(false);
    expect(ipMatches("::ffff:10.1.2.3", "10.1.0.0/16")).toBe(true);
    expect(ipMatches("2001:db8::1", "2001:db8::/32")).toBe(true);
    expect(ipMatches("2001:db9::1", "2001:db8::/32")).toBe(false);
    expect(ipMatches("1.2.3.4", "1.2.3.4")).toBe(true);
    expect(ipMatches("1.2.3.4", "not-an-ip")).toBeNull();
    expect(ipMatches("1.2.3.4", "1.2.3.0/33")).toBeNull();
  });

  it("evaluates hour and weekday in the rule timezone", () => {
    // 2026-01-05 (Monday) 23:30 UTC = Tuesday 08:30 in Tokyo.
    const now = Date.UTC(2026, 0, 5, 23, 30);
    expect(localTime(now, "Asia/Tokyo")).toEqual({ hour: 8, weekday: "tue" });
    const rule = (tz: string) => ({
      timezone: tz,
      conditions: conditions([
        { field: "hour", op: "in", values: ["8-17"] },
        { field: "weekday", op: "in", values: ["mon", "tue"] },
      ]),
    });
    expect(ruleMatches(rule("Asia/Tokyo"), ctx({ now }))).toBe(true);
    expect(ruleMatches(rule("UTC"), ctx({ now }))).toBe(false);
    // Wrapping range 22-3 covers 23:30 UTC.
    expect(
      ruleMatches({ timezone: "UTC", conditions: conditions([{ field: "hour", values: "22-3" }]) }, ctx({ now })),
    ).toBe(true);
  });

  it("supports not_in, language, referrer subdomains and asn", () => {
    const c = ctx({
      country: "FR",
      language: "de-at",
      referrer_domain: "m.adcash.com",
      asn: 3320,
    });
    expect(ruleMatches({ timezone: "UTC", conditions: conditions([{ field: "country", op: "not_in", values: ["DE"] }]) }, c)).toBe(true);
    expect(ruleMatches({ timezone: "UTC", conditions: conditions([{ field: "language", values: ["de"] }]) }, c)).toBe(true);
    expect(ruleMatches({ timezone: "UTC", conditions: conditions([{ field: "referrer_domain", values: ["adcash.com"] }]) }, c)).toBe(true);
    expect(ruleMatches({ timezone: "UTC", conditions: conditions([{ field: "asn", values: ["AS3320"] }]) }, c)).toBe(true);
    // Missing value: `in` never matches, `not_in` always does.
    expect(ruleMatches({ timezone: "UTC", conditions: conditions([{ field: "city", values: ["paris"] }]) }, c)).toBe(false);
    expect(ruleMatches({ timezone: "UTC", conditions: conditions([{ field: "city", op: "not_in", values: ["paris"] }]) }, c)).toBe(true);
  });

  it("rejects invalid conditions", () => {
    expect("error" in parseConditions([{ field: "nope", values: ["x"] }])).toBe(true);
    expect("error" in parseConditions([{ field: "country", op: "eq", values: ["DE"] }])).toBe(true);
    expect("error" in parseConditions([{ field: "country", values: ["Germany"] }])).toBe(true);
    expect("error" in parseConditions([{ field: "ip", values: ["10.0.0.0/99"] }])).toBe(true);
    expect("error" in parseConditions([{ field: "hour", values: ["25"] }])).toBe(true);
  });

  it("matches blocklist entries", () => {
    const entries = [
      { kind: "ip" as const, value: "203.0.113.0/24" },
      { kind: "asn" as const, value: "64500" },
      { kind: "ua" as const, value: "headlesschrome" },
    ];
    expect(blocklistMatch(entries, { ip: "203.0.113.9", asn: null, user_agent: DESKTOP })).toBeTruthy();
    expect(blocklistMatch(entries, { ip: "1.1.1.1", asn: 64500, user_agent: DESKTOP })).toBeTruthy();
    expect(blocklistMatch(entries, { ip: "1.1.1.1", asn: 1, user_agent: "Mozilla HeadlessChrome/1" })).toBeTruthy();
    expect(blocklistMatch(entries, { ip: "1.1.1.1", asn: 1, user_agent: DESKTOP })).toBeNull();
  });
});

describe("routing rules + anti-fraud (integration)", () => {
  beforeAll(async () => {
    for (const statement of initSql.split(";").map((s) => s.trim()).filter(Boolean)) {
      await env.DB.prepare(statement).run();
    }
    ({ authHeaders } = await registerTestUser());
  });

  it("first matching rule wins (country + device), else default paths", async () => {
    const { programId, code } = await setupCampaign();
    const { status, data } = await api<{ rule: { id: string } }>("POST", `/api/programs/${programId}/rules`, {
      name: "DE mobile",
      conditions: [
        { field: "country", op: "in", values: ["de", "AT"] },
        { field: "device_type", op: "in", values: "mobile" },
      ],
    });
    expect(status).toBe(201);
    const ruleId = data.rule.id;
    const pathRes = await api<{ path: { rule_id: string } }>("POST", `/api/programs/${programId}/paths`, {
      name: "DE mobile offer",
      flow_type: "direct",
      direct_url: DE_MOBILE_URL,
      rule_id: ruleId,
    });
    expect(pathRes.status).toBe(201);
    expect(pathRes.data.path.rule_id).toBe(ruleId);

    expect(target(await click(code, { ua: IPHONE, cf: { country: "DE" } }))).toBe(DE_MOBILE_URL);
    expect(target(await click(code, { ua: DESKTOP, cf: { country: "DE" } }))).toBe(DEFAULT_URL);
    expect(target(await click(code, { ua: IPHONE, cf: { country: "FR" } }))).toBe(DEFAULT_URL);

    // Rotation keeps the default pool separate from rule paths.
    const rotation = await api<{ paths: unknown[]; rules: { id: string; paths: unknown[] }[] }>(
      "GET",
      `/api/programs/${programId}/rotation`,
    );
    expect(rotation.data.paths).toHaveLength(1);
    expect(rotation.data.rules).toHaveLength(1);
    expect(rotation.data.rules[0].paths).toHaveLength(1);

    // Disabled rule → default.
    await api("PATCH", `/api/programs/${programId}/rules/${ruleId}`, { enabled: false });
    expect(target(await click(code, { ua: IPHONE, cf: { country: "DE" } }))).toBe(DEFAULT_URL);

    // Deleting the rule removes its paths.
    expect((await api("DELETE", `/api/programs/${programId}/rules/${ruleId}`)).status).toBe(200);
    const after = await api<{ rules: unknown[] }>("GET", `/api/programs/${programId}/rules`);
    expect(after.data.rules).toHaveLength(0);
  });

  it("matches IP CIDR and hour in the rule timezone", async () => {
    const { programId, code } = await setupCampaign();
    const { hour } = localTime(Date.now(), "America/New_York");
    const ipRule = await api<{ rule: { id: string } }>("POST", `/api/programs/${programId}/rules`, {
      name: "Office",
      conditions: [{ field: "ip", values: ["198.51.100.0/24"] }],
    });
    await api("POST", `/api/programs/${programId}/paths`, {
      name: "Office",
      flow_type: "direct",
      direct_url: "https://casino.example.com/office",
      rule_id: ipRule.data.rule.id,
    });
    const timeRule = await api<{ rule: { id: string } }>("POST", `/api/programs/${programId}/rules`, {
      name: "NY now",
      timezone: "America/New_York",
      conditions: [{ field: "hour", values: [`${hour}-${(hour + 1) % 24}`] }],
    });
    await api("POST", `/api/programs/${programId}/paths`, {
      name: "Now",
      flow_type: "direct",
      direct_url: "https://casino.example.com/now",
      rule_id: timeRule.data.rule.id,
    });

    expect(target(await click(code, { ip: "198.51.100.77" }))).toBe("https://casino.example.com/office");
    expect(target(await click(code, { ip: "192.0.2.1" }))).toBe("https://casino.example.com/now");

    // Shift the hour window away from now → fallback to default.
    await api("PATCH", `/api/programs/${programId}/rules/${timeRule.data.rule.id}`, {
      conditions: [{ field: "hour", values: [`${(hour + 12) % 24}`] }],
    });
    expect(target(await click(code, { ip: "192.0.2.1" }))).toBe(DEFAULT_URL);
  });

  it("validates rules and rule ownership", async () => {
    const { programId } = await setupCampaign();
    const other = await setupCampaign();
    expect(
      (await api("POST", `/api/programs/${programId}/rules`, {
        name: "bad",
        conditions: [{ field: "nope", values: ["x"] }],
      })).status,
    ).toBe(400);
    expect(
      (await api("POST", `/api/programs/${programId}/rules`, { name: "tz", timezone: "Mars/Base" })).status,
    ).toBe(400);
    const otherRule = await api<{ rule: { id: string } }>("POST", `/api/programs/${other.programId}/rules`, {
      name: "other",
    });
    expect(
      (await api("POST", `/api/programs/${programId}/paths`, {
        name: "x",
        flow_type: "direct",
        direct_url: DEFAULT_URL,
        rule_id: otherRule.data.rule.id,
      })).status,
    ).toBe(400);
  });

  it("picks weighted landers and offers and records them on the click", async () => {
    const { programId, code } = await setupCampaign();
    const lander = async (n: string) =>
      (await api<{ lander: { id: string } }>("POST", "/api/entities/landers", {
        name: n,
        url: `https://lp.example.com/${n}?next={lp_click_url}`,
      })).data.lander.id;
    const offer = async (n: string) =>
      (await api<{ offer: { id: string } }>("POST", "/api/entities/offers", {
        name: n,
        url: `https://offer.example.com/${n}?cid={clickid}`,
      })).data.offer.id;
    const [l1, l2, o1, o2] = [await lander("a"), await lander("b"), await offer("x"), await offer("y")];

    // Only rule path so we control the pool: send everything through one lander→offer path.
    const rule = await api<{ rule: { id: string } }>("POST", `/api/programs/${programId}/rules`, {
      name: "All",
      conditions: [{ field: "bot", values: ["no"] }],
    });
    const created = await api<{ path: { landers: { id: string; weight: number }[]; lander_id: string } }>(
      "POST",
      `/api/programs/${programId}/paths`,
      {
        name: "Split",
        flow_type: "lander_offer",
        rule_id: rule.data.rule.id,
        landers: [
          { lander_id: l1, weight: 50 },
          { lander_id: l2, weight: 50 },
        ],
        offers: [
          { offer_id: o1, weight: 50 },
          { offer_id: o2, weight: 50 },
        ],
      },
    );
    expect(created.status).toBe(201);
    expect(created.data.path.landers.map((l) => l.id)).toEqual([l1, l2]);
    expect(created.data.path.lander_id).toBe(l1);

    const landersSeen = new Set<string>();
    const offersSeen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const res = await click(code);
      const url = new URL(res.headers.get("Location")!);
      const row = await lastClick(programId);
      expect(url.pathname).toBe(row?.lander_id === l1 ? "/a" : "/b");
      landersSeen.add(row!.lander_id!);
      offersSeen.add(row!.offer_id!);
    }
    expect(landersSeen).toEqual(new Set([l1, l2]));
    expect(offersSeen).toEqual(new Set([o1, o2]));

    // LP click follows the offer recorded on the click.
    const row = await lastClick(programId);
    const lp = await SELF.fetch(`http://localhost/lp/${row!.id}`, { redirect: "manual" });
    expect(new URL(lp.headers.get("Location")!).pathname).toBe(row!.offer_id === o1 ? "/x" : "/y");

    // Another account's lander is rejected.
    const stranger = await registerTestUser();
    const foreign = await SELF.fetch("http://localhost/api/entities/landers", {
      method: "POST",
      headers: stranger.authHeaders,
      body: JSON.stringify({ name: "f", url: "https://f.example.com" }),
    });
    const foreignId = (await json<{ lander: { id: string } }>(foreign)).lander.id;
    expect(
      (await api("POST", `/api/programs/${programId}/paths`, {
        name: "bad",
        flow_type: "lander",
        landers: [{ lander_id: foreignId, weight: 1 }],
      })).status,
    ).toBe(400);
  });

  it("keeps the legacy single lander_id working", async () => {
    const { programId } = await setupCampaign();
    const l = (await api<{ lander: { id: string } }>("POST", "/api/entities/landers", {
      name: "legacy",
      url: "https://lp.example.com/legacy",
    })).data.lander.id;
    const { data } = await api<{ path: { id: string; landers: { id: string }[] } }>(
      "POST",
      `/api/programs/${programId}/paths`,
      { name: "Legacy", flow_type: "lander", lander_id: l },
    );
    expect(data.path.landers.map((x) => x.id)).toEqual([l]);
    const patched = await api<{ path: { landers: unknown[]; lander_id: string | null } }>(
      "PATCH",
      `/api/programs/${programId}/paths/${data.path.id}`,
      { lander_id: null },
    );
    expect(patched.data.path.landers).toHaveLength(0);
    expect(patched.data.path.lander_id).toBeNull();
  });

  it("sends blocklisted traffic to the safe page and flags it as bot", async () => {
    const { programId, code } = await setupCampaign();
    expect(
      (await api("POST", "/api/antifraud/blocklist", { kind: "ip", values: ["203.0.113.0/24"] })).status,
    ).toBe(201);
    expect((await api("POST", "/api/antifraud/blocklist", { kind: "ip", value: "nope" })).status).toBe(400);

    // Default: count as bot but route normally.
    expect(target(await click(code, { ip: "203.0.113.5" }))).toBe(DEFAULT_URL);
    expect((await lastClick(programId))?.is_bot).toBe(1);

    const set = await api<{ filter: { bot_action: string } }>("PUT", `/api/programs/${programId}/traffic-filter`, {
      bot_action: "safe_page",
      safe_page_url: SAFE_PAGE,
      block_datacenter: true,
    });
    expect(set.status).toBe(200);

    const blocked = await click(code, { ip: "203.0.113.5" });
    expect(blocked.headers.get("Location")).toBe(SAFE_PAGE);
    const row = await lastClick(programId);
    expect(row?.is_bot).toBe(1);
    expect(row?.path_id).toBeNull();

    // Datacenter ASN (AWS) and UA bots also go to the safe page.
    expect((await click(code, { ip: "192.0.2.10", cf: { asn: 16509 } })).headers.get("Location")).toBe(SAFE_PAGE);
    expect((await click(code, { ip: "192.0.2.10", ua: "curl/8.0" })).headers.get("Location")).toBe(SAFE_PAGE);

    // Clean traffic routes normally.
    expect(target(await click(code, { ip: "192.0.2.10", cf: { asn: 3320 } }))).toBe(DEFAULT_URL);
    expect((await lastClick(programId))?.is_bot).toBe(0);

    // Blocklist entries can be removed.
    const list = await api<{ entries: { id: string }[] }>("GET", "/api/antifraud/blocklist");
    expect((await api("DELETE", `/api/antifraud/blocklist/${list.data.entries[0].id}`)).status).toBe(200);
    await api("PUT", `/api/programs/${programId}/traffic-filter`, { block_datacenter: false });
    expect(target(await click(code, { ip: "203.0.113.5" }))).toBe(DEFAULT_URL);
  });

  it("still enforces redirect allowlist rules", async () => {
    const { programId, code } = await setupCampaign();
    for (const bad of ["javascript:alert(1)", "ftp://safe.example.com", "not a url"]) {
      expect(
        (await api("PUT", `/api/programs/${programId}/traffic-filter`, {
          bot_action: "safe_page",
          safe_page_url: bad,
        })).status,
      ).toBe(400);
    }
    expect(
      (await api("PUT", `/api/programs/${programId}/traffic-filter`, { bot_action: "safe_page" })).status,
    ).toBe(400);
    await api("PUT", `/api/programs/${programId}/traffic-filter`, {
      bot_action: "safe_page",
      safe_page_url: SAFE_PAGE,
    });

    // ?url= to a foreign host is still rejected, for humans and bots alike.
    const evil = `?url=${encodeURIComponent("https://evil.example.net/")}`;
    expect((await click(code, { query: evil })).status).toBe(400);
    expect((await click(code, { query: evil, ua: "curl/8.0" })).status).toBe(400);

    // Rule paths still require http(s) URLs.
    const rule = await api<{ rule: { id: string } }>("POST", `/api/programs/${programId}/rules`, { name: "r" });
    expect(
      (await api("POST", `/api/programs/${programId}/paths`, {
        name: "bad",
        flow_type: "direct",
        direct_url: "javascript:alert(1)",
        rule_id: rule.data.rule.id,
      })).status,
    ).toBe(400);
  });
});
