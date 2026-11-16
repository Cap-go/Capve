import worker from "../worker";
import { billingRow } from "../worker/lib/billing";
import { cookieFrom } from "./helpers";
import { createExecutionContext, waitOnExecutionContext, env, SELF, fetchMock } from "cloudflare:test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerTestUser } from "./helpers";
import { initSql } from "./schema";

let headers: Record<string, string>;
let accountId: string;
const rpc = (name: string, args: Record<string, unknown> = {}, overrides: Record<string, string> = {}) => SELF.fetch("http://localhost/api/assistant/mcp", {
  method: "POST", headers: { ...headers, ...overrides },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
});

describe("console assistant transport", () => {
  beforeAll(async () => {
    for (const sql of initSql.split(";").map(s => s.trim()).filter(Boolean)) await env.DB.prepare(sql).run();
    const user = await registerTestUser();
    const me = await SELF.fetch("http://localhost/api/auth/me", { headers: user.authHeaders });
    accountId = (await me.json<{ user: { account_id: string } }>()).user.account_id;
    headers = { ...user.authHeaders, Origin: "http://localhost", Accept: "application/json, text/event-stream", "X-Capve-Account": accountId };
    fetchMock.activate(); fetchMock.disableNetConnect();
  });
  afterAll(() => { fetchMock.assertNoPendingInterceptors(); fetchMock.deactivate(); });

  it("requires a session, same-origin request and captured account", async () => {
    expect((await SELF.fetch("http://localhost/api/assistant/models")).status).toBe(401);
    expect((await rpc("whoami", {}, { Origin: "https://evil.example" })).status).toBe(403);
    expect((await rpc("whoami", {}, { Origin: "" })).status).toBe(403);
    expect((await rpc("whoami", {}, { "X-Capve-Account": "" })).status).toBe(400);
    expect((await rpc("whoami", {}, { "X-Capve-Account": "other" })).status).toBe(409);
    expect((await rpc("whoami", {}, { Authorization: "Bearer invalid" })).status).toBe(401);
  });

  it("dispatches tools with session permissions, scopes resources and audits writes", async () => {
    const create = await rpc("create_campaign", { name: "Assistant campaign", destination_url: "https://example.com/offer" });
    const created = await create.json<{ result: { isError: boolean; structuredContent: { program: { id: string } } } }>();
    expect(created.result.isError).toBe(false);
    const result = await (await rpc("list_campaigns")).json<{ result: { content: { text: string }[] } }>();
    expect(result.result.content[0].text).toContain("Assistant campaign");
    const stranger = await registerTestUser();
    const strangerMe = await (await SELF.fetch("http://localhost/api/auth/me", { headers: stranger.authHeaders })).json<{ user: { account_id: string } }>();
    const other = await rpc("list_campaigns", {}, { ...stranger.authHeaders, "X-Capve-Account": strangerMe.user.account_id });
    expect(await other.text()).not.toContain("Assistant campaign");
    const audit = await env.DB.prepare("SELECT action FROM audit_log WHERE account_id = ?").bind(accountId).all<{ action: string }>();
    expect(audit.results.some(row => row.action.includes("Created a campaign"))).toBe(true);
  });

  it("keeps viewer writes forbidden", async () => {
    const viewer = await registerTestUser();
    await env.DB.prepare("INSERT INTO team_members (id, owner_user_id, email, role, created_at, accepted_at) VALUES (?, ?, ?, 'viewer', ?, ?)")
      .bind("team_assistant", accountId, viewer.email, Date.now(), Date.now()).run();
    // API identity resolves accepted membership; explicit personal context is not set for this session.
    const result = await rpc("create_campaign", { name: "Forbidden", destination_url: "https://example.com" }, viewer.authHeaders);
    const body = await result.text();
    expect(body).toContain("Forbidden");
    expect((await env.DB.prepare("SELECT id FROM programs WHERE name = 'Forbidden'").all()).results).toHaveLength(0);
  });

  it("preserves reporting locks through the internal MCP dispatch", async () => {
    const bindings = { ...env, APP_URL: "http://localhost:5173", BILLING_ENABLED: "true" };
    await billingRow(bindings, accountId);
    await env.DB.prepare("UPDATE account_billing SET trial_ends_at = 1 WHERE account_id = ?").bind(accountId).run();
    const ctx = createExecutionContext();
    const response = await worker.fetch(new Request("http://localhost/api/assistant/mcp", {
      method: "POST", headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "report_campaigns", arguments: {} } }),
    }), bindings, ctx);
    await waitOnExecutionContext(ctx);
    const body = await response.json<{ result: { isError: boolean; content: { text: string }[] } }>();
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain("402");
  });

  it("disables the assistant during support impersonation", async () => {
    const admin = await registerTestUser("martindonadieu@gmail.com");
    await env.DB.prepare("UPDATE users SET is_platform_admin = 1 WHERE email = ?").bind(admin.email).run();
    const impersonation = await SELF.fetch("http://localhost/api/auth/impersonate", { method: "POST", headers: admin.authHeaders, body: JSON.stringify({ account_id: accountId }) });
    expect(impersonation.status).toBe(200);
    const cookie = cookieFrom(impersonation, "capve_account_context");
    expect(cookie).toBeTruthy();
    const response = await rpc("whoami", {}, { Cookie: `${admin.authHeaders.Cookie}; capve_account_context=${encodeURIComponent(cookie!)}` });
    expect(response.status).toBe(403);
  });

  it("rejects malformed, stored or oversized model requests", async () => {
    for (const body of ['{', '{}', '{"store":true,"stream":true}']) {
      const response = await SELF.fetch("http://localhost/api/assistant/responses", { method: "POST", headers: { ...headers, "x-chatgpt-token": "test-access" }, body });
      expect(response.status).toBe(400);
    }
    const tooLarge = await SELF.fetch("http://localhost/api/assistant/responses", { method: "POST", headers, body: "x".repeat(1024 * 1024 + 1) });
    expect(tooLarge.status).toBe(413);
  });

  it("relays streams without cookies or upstream response cookies", async () => {
    fetchMock.get("https://api.openai.com").intercept({ path: "/v1/responses", method: "POST", headers: incoming => {
      return incoming.authorization === "Bearer test-access" && !incoming.cookie;
    } }).reply(200, 'data: {"type":"response.completed","response":{"output":[]}}\n\n', { headers: { "Content-Type": "text/event-stream", "Set-Cookie": "not-for-capve=1" } });
    const response = await SELF.fetch("http://localhost/api/assistant/responses", { method: "POST", headers: { ...headers, "x-chatgpt-token": "test-access" }, body: JSON.stringify({ store: false, stream: true }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(await response.text()).toContain("response.completed");
  });

  it("relays token exchange only to the fixed endpoint and refuses redirects", async () => {
    const form = new URLSearchParams({ grant_type: "authorization_code", client_id: "oaiapp_test", code: "code", code_verifier: "verifier", redirect_uri: "http://127.0.0.1:1455/auth/callback", resource: "https://api.openai.com/v1" });
    fetchMock.get("https://auth.openai.com").intercept({ path: "/api/accounts/oauth/token", method: "POST", body: form.toString() }).reply(200, { access_token: "test" });
    const response = await SELF.fetch("http://localhost/api/assistant/token", { method: "POST", headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString() });
    expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("no-store");
    form.set("redirect_uri", "https://evil.example");
    expect((await SELF.fetch("http://localhost/api/assistant/token", { method: "POST", headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString() })).status).toBe(400);
    fetchMock.get("https://api.openai.com").intercept({ path: "/v1/models" }).reply(302, "", { headers: { location: "https://evil.example" } });
    const redirect = await SELF.fetch("http://localhost/api/assistant/models", { headers: { ...headers, "x-chatgpt-token": "test-access" } });
    expect(redirect.status).toBe(502);
  });
});
