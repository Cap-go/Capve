import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { Validator, type Schema } from "@cfworker/json-schema";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import worker from "../worker";
import { TOOLS, TOOLS_BY_NAME } from "../worker/mcp/tools";
import { GROUP_DIMENSIONS } from "../worker/db/reports";
import { registerTestUser, BROWSER_HEADERS } from "./helpers";
import { initSql } from "./schema";

let headers: Record<string, string>;
let token: string;
const exercised = new Set<string>();

async function request(path: string, init: RequestInit = {}) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`http://localhost${path}`, { ...init, headers: { ...headers, ...init.headers } }), { ...env, AI: { run: async () => { throw new Error("Empty cohort must not invoke AI"); } } }, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

async function call(name: string, args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const tool = TOOLS_BY_NAME.get(name)!;
  const input = new Validator(tool.inputSchema as Schema).validate(args);
  expect(input.valid, `${name} input: ${JSON.stringify(input.errors)}`).toBe(true);
  const res = await request("/mcp", {
    method: "POST",
    headers: { Cookie: "", Authorization: `Bearer ${token}`, Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: name, method: "tools/call", params: { name, arguments: args } }),
  });
  const raw = await res.text();
  expect(res.ok, `${name}: ${res.status} ${raw}`).toBe(true);
  const reply = JSON.parse(raw) as { result?: { isError?: boolean; structuredContent?: Record<string, unknown>; content?: Array<{ type: string; text?: string }> } };
  expect(reply.result?.isError, `${name}: ${raw}`).toBe(false);
  const body = reply.result?.structuredContent;
  const text = reply.result?.content?.find((item) => item.type === "text")?.text;
  expect(JSON.parse(text!), `${name} text and structured content agree`).toEqual(body);
  const output = new Validator(tool.outputSchema).validate(body);
  expect(output.valid, `${name} output: ${JSON.stringify(output.errors)} ${raw}`).toBe(true);
  exercised.add(name);
  return body as Record<string, unknown>;
}

function item(body: Record<string, unknown>, key: string): Record<string, unknown> {
  return body[key] as Record<string, unknown>;
}
function row(body: Record<string, unknown>, key: string): Record<string, unknown> {
  return (body[key] as Record<string, unknown>[])[0];
}

describe("MCP tool contracts against authenticated Worker responses", () => {
  beforeAll(async () => {
    for (const statement of initSql.split(";").map((s) => s.trim()).filter(Boolean)) await env.DB.prepare(statement).run();
    const user = await registerTestUser("martindonadieu@gmail.com");
    headers = user.authHeaders;
    await env.DB.prepare("UPDATE users SET is_platform_admin = 1 WHERE email = ?").bind(user.email).run();
    const response = await request("/api/tokens", { method: "POST", body: JSON.stringify({ name: "Contract test" }) });
    expect(response.status).toBe(201);
    ({ token } = await response.json<{ token: string }>());
  });
  afterEach(() => vi.restoreAllMocks());

  it("covers every tool, nonempty reports, exports and CRUD results", async () => {
    await call("whoami");
    await call("get_billing_status");
    await call("get_stripe_setup_status");
    await call("get_settings");
    await call("update_settings", { timezone: "Europe/Paris" });
    const group = item(await call("create_group", { name: "Contract group" }), "group");
    const source = item(await call("create_traffic_source", { name: "Contract source", cost_type: "cpc", default_cost_cents: 3 }), "traffic_source");
    // The dashboard API permits fractional cents, which list/read tools must preserve.
    const fractional = await request("/api/entities/traffic-sources", { method: "POST", body: JSON.stringify({ name: "Fractional source", default_cost_cents: 0.1 }) });
    expect(fractional.status).toBe(201);
    await call("update_traffic_source", { traffic_source_id: source.id, name: "Updated source" });
    const network = item(await call("create_network", { name: "Contract network" }), "network");
    await call("update_network", { network_id: network.id, name: "Updated network" });
    const lander = item(await call("create_lander", { name: "Contract lander", url: "https://merchant.example.com/landing" }), "lander");
    await call("update_lander", { lander_id: lander.id, name: "Updated lander" });
    const offer = item(await call("create_offer", { name: "Contract offer", url: "https://merchant.example.com/offer", payout_cents: 100, network_id: network.id }), "offer");
    await call("update_offer", { offer_id: offer.id, name: "Updated offer" });
    for (const name of ["list_groups", "list_traffic_sources", "list_networks", "list_landers", "list_offers"]) await call(name);
    const campaign = item(await call("create_campaign", { name: "Contract campaign", destination_url: "https://merchant.example.com/", group_id: group.id, traffic_source_id: source.id }), "program");
    const campaign_id = campaign.id;
    expect((await call("get_bidding_settings", { campaign_id })).config).toMatchObject({ enabled: false });
    expect((await call("get_bid_recommendations", { campaign_id })).run).toBeNull();
    await call("set_bidding_settings", { campaign_id, enabled: true });
    expect(item(await call("analyze_bidding", { campaign_id }), "run").result).toMatchObject({ decisions: [] });
    expect((await call("get_bid_recommendations", { campaign_id })).run).not.toBeNull();
    await call("set_bidding_settings", { campaign_id, enabled: false });
    await call("update_campaign", { campaign_id, name: "Updated campaign" });
    await call("bulk_update_campaigns", { campaign_ids: [campaign_id], tags: "contract" });
    await call("get_campaign", { campaign_id });
    await call("list_campaigns");
    await call("clone_campaign", { campaign_id, name: "Clone" });
    const affiliate = item(await call("create_affiliate", { campaign_id, name: "Affiliate" }), "affiliate");
    await call("list_affiliates", { campaign_id });
    const path = item(await call("create_path", { campaign_id, name: "Direct", flow_type: "direct", direct_url: "https://merchant.example.com/" }), "path");
    await call("update_path", { campaign_id, path_id: path.id, weight: 80 });
    await call("get_rotation", { campaign_id });
    await call("set_rotation", { campaign_id, mode: "normal" });
    const rule = item(await call("create_rule", { campaign_id, name: "Country", conditions: [{ field: "country", op: "in", values: ["DE"] }] }), "rule");
    await call("update_rule", { campaign_id, rule_id: rule.id, name: "Updated rule" });
    await call("list_rules", { campaign_id });
    await call("get_traffic_filter", { campaign_id });
    await call("set_traffic_filter", { campaign_id, bot_action: "route", block_datacenter: true });
    const block = row(await call("add_to_blocklist", { kind: "ip", values: ["192.0.2.1"] }), "entries");
    await call("list_blocklist");
    await call("remove_from_blocklist", { entry_id: block.id });
    await call("get_campaign_tracking", { campaign_id });
    await call("get_postback_key");
    await call("set_postback_key_required", { required: false });
    const key = item(await call("rotate_postback_key"), "postback_key");
    const redirect = await request(`/r/${affiliate.code}?sub1=zone-1`, { headers: BROWSER_HEADERS, redirect: "manual" });
    expect(redirect.status).toBe(302);
    const clickId = new URL(redirect.headers.get("location")!).searchParams.get("click_id");
    await env.DB.prepare("UPDATE clicks SET asn = 64500 WHERE id = ?").bind(clickId).run();
    const conversion = await request(`/click?cnv_id=${clickId}&payout=1&event=registration&key=${key.key}`);
    expect(conversion.ok).toBe(true);
    for (const name of ["get_campaign_stats", "list_clicks", "list_conversions", "report_trends"]) await call(name, { campaign_id });
    await call("report_campaigns");
    await call("report_grouped", { by: "campaign" });
    await call("report_drilldown", { by: "campaign,sub1" });
    for (const by of GROUP_DIMENSIONS) await call("report_grouped", { by });
    const asnReport = await call("report_grouped", { by: "asn" });
    expect(row(asnReport, "rows").key).toBe("64500");
    const asnDrilldown = await call("report_drilldown", { by: "asn,campaign" });
    expect(row(asnDrilldown, "rows").key).toBe("64500");
    expect(row(asnDrilldown, "rows").children).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: campaign_id }),
    ]));
    const postback = item(await call("create_postback", { campaign_id, url: "https://merchant.example.com/postback?click={click_id}" }), "postback");
    await call("update_postback", { postback_id: postback.id, event: "registration" });
    await call("list_postbacks", { campaign_id });
    await call("list_postback_deliveries", { postback_id: postback.id });
    await call("delete_postback", { postback_id: postback.id });
    const trigger = item(await call("create_trigger", { campaign_id, name: "Trigger", event: "click", action_url: "https://merchant.example.com/hook", enabled: false }), "trigger");
    await call("list_triggers");
    await call("delete_trigger", { trigger_id: trigger.id });
    const automation = item(await call("create_automation_rule", { campaign_id, kind: "zone_blacklist", dimension: "sub1", min_clicks: 10 }), "rule");
    await call("set_automation_rule_enabled", { rule_id: automation.id, enabled: false });
    await call("list_automation_rules");
    await call("run_automation_rule", { rule_id: automation.id });
    await call("delete_automation_rule", { rule_id: automation.id });
    await call("add_zones_to_blacklist", { campaign_id, values: ["123"] });
    const zone = row(await call("list_zone_blacklist", { campaign_id }), "blacklist");
    const exported = await call("list_zone_blacklist", { campaign_id, format: "txt" });
    expect(exported.result).toBe("123\n");
    const csv = await call("list_zone_blacklist", { campaign_id, format: "csv" });
    expect(csv.result).toBe(`dimension,value,reason,rule_id,blacklisted_at\nsub1,123,manual,,${new Date(zone.created_at as number).toISOString()}\n`);
    await call("remove_blacklisted_zone", { entry_id: zone.id });
    const domain = item(await call("add_tracking_domain", { hostname: "track.contract.example" }), "tracking_domain");
    await call("list_tracking_domains");
    await call("set_campaign_tracking_domain", { campaign_id, tracking_domain_id: domain.id });
    await call("delete_tracking_domain", { domain_id: domain.id });
    await call("add_note", { entity_type: "program", entity_id: campaign_id, body: "Contract test" });
    await call("list_notes", { entity_type: "program", entity_id: campaign_id });
    const member = item(await call("invite_team_member", { email: "contract@example.com", role: "viewer" }), "member");
    await call("list_team");
    await call("remove_team_member", { member_id: member.id });
    await call("list_activity");
    await call("list_source_templates");
    await call("create_traffic_source_from_template", { template_id: "adcash" });
    await call("create_network_from_template", { template_id: "generic" });
    await call("get_traffic_source_settings", { traffic_source_id: source.id });
    await call("update_traffic_source_settings", { traffic_source_id: source.id, tokens: [], api_provider: "adcash", api_key: "test-only-cost-key" });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      expect(String(input)).toMatch(/^https:\/\/api\.adcash\.com\//);
      return Response.json({ data: [] });
    });
    await call("sync_traffic_source_cost", { traffic_source_id: source.id });
    vi.restoreAllMocks();
    await call("get_campaign_source_link", { campaign_id });
    await call("update_campaign_cost", { campaign_id, date: new Date().toISOString().slice(0, 10), total_cents: 25 });
    await call("list_cost_updates", { campaign_id });
    await call("delete_rule", { campaign_id, rule_id: rule.id });
    await call("delete_path", { campaign_id, path_id: path.id });
    await call("delete_campaign", { campaign_id });
    await call("delete_group", { group_id: group.id });
    // Use unused entities for deletions: historical campaigns retain their source references.
    const unused = item(await call("create_traffic_source", { name: "Unused" }), "traffic_source");
    await call("delete_traffic_source", { traffic_source_id: unused.id });
    await call("delete_lander", { lander_id: lander.id });
    await call("delete_offer", { offer_id: offer.id });
    await call("delete_network", { network_id: network.id });
    expect([...exercised].sort()).toEqual(TOOLS.map((tool) => tool.name).sort());
  }, 30_000);

  it("has useful output contracts and rejects omitted required arguments", () => {
    for (const tool of TOOLS) {
      expect(tool.outputSchema.type, tool.name).toBe("object");
      expect(Object.keys(tool.outputSchema.properties ?? {}).length, tool.name).toBeGreaterThan(0);
      for (const [name, property] of Object.entries(tool.inputSchema.properties)) {
        expect((property as { description?: string }).description, `${tool.name}.${name}`).toBeTruthy();
      }
      if (tool.inputSchema.required?.length) expect(new Validator(tool.inputSchema as Schema).validate({}).valid, tool.name).toBe(false);
    }
  });
});
