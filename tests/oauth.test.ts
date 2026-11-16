import { env, SELF, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import { registerTestUser } from "./helpers";
import { initSql } from "./schema";
import { createAuthToken, hashToken } from "../worker/db/auth";
import { authSecret } from "../worker/lib/session";
import { pkceChallenge, purgeOAuth, randomOAuthToken } from "../worker/lib/oauth";
import { oauthReturnTo } from "../src/lib/oauth";
import worker from "../worker";
import { accountContextCookie } from "../worker/lib/account-context";
import { getUserById } from "../worker/db/queries";

const base = "http://localhost";
const callback = "https://assistant.example/callback";
let headers: Record<string, string>;
let userId: string;
type Client = { client_id: string; client_secret?: string; token_endpoint_auth_method: string };
type Tokens = { access_token: string; refresh_token: string; expires_in: number; token_type: string; scope: string };

function json(path: string, body: unknown, extra = {}) {
  return SELF.fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", ...extra }, body: JSON.stringify(body), redirect: "manual" });
}
async function register(overrides = {}) {
  const res = await json("/oauth/register", { client_name: "Test assistant", redirect_uris: [callback], token_endpoint_auth_method: "none", ...overrides });
  expect(res.status).toBe(201);
  return res.json<Client>();
}
async function request(client: Client, overrides = {}, session = headers) {
  const verifier = randomOAuthToken();
  const params = new URLSearchParams({ client_id: client.client_id, redirect_uri: callback, response_type: "code", resource: base + "/mcp", scope: "mcp:tools", code_challenge_method: "S256", code_challenge: await pkceChallenge(verifier), state: "test-state", ...overrides });
  const res = await SELF.fetch(`${base}/oauth/authorize?${params}`, { headers: session, redirect: "manual" });
  return { res, verifier, params, signed: new URL(res.headers.get("Location") ?? "/", base).searchParams.get("request") ?? "" };
}
async function approve(signed: string, allow = true, session = headers) {
  return json("/oauth/authorize", { request: signed, approve: allow }, { ...session, Origin: base });
}
async function code(client?: Client) {
  client ??= await register();
  const pending = await request(client);
  expect(pending.res.status).toBe(302);
  const decision = await approve(pending.signed);
  expect(decision.status).toBe(200);
  const redirect = new URL((await decision.json<{ redirect: string }>()).redirect);
  expect(redirect.searchParams.get("state")).toBe("test-state");
  expect(redirect.searchParams.get("iss")).toBe(base);
  return { ...pending, client, code: redirect.searchParams.get("code")! };
}
function exchange(client: Client, values: Record<string, string>, path = "/oauth/token") {
  const params = new URLSearchParams({ client_id: client.client_id, resource: base + "/mcp", ...values });
  const auth: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  if (client.token_endpoint_auth_method === "client_secret_basic") auth.Authorization = `Basic ${btoa(`${client.client_id}:${client.client_secret}`)}`;
  if (client.token_endpoint_auth_method === "client_secret_post") params.set("client_secret", client.client_secret!);
  return SELF.fetch(base + path, { method: "POST", headers: auth, body: params.toString() });
}
function redeem(grant: Awaited<ReturnType<typeof code>>, values = {}) {
  return exchange(grant.client, { grant_type: "authorization_code", code: grant.code, code_verifier: grant.verifier, redirect_uri: callback, ...values });
}
async function connected() {
  const grant = await code();
  const res = await redeem(grant);
  expect(res.status).toBe(200);
  return { ...grant, tokens: await res.json<Tokens>() };
}
function mcp(token: string, origin?: string) {
  return json("/mcp", { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "whoami", arguments: {} } }, {
    Authorization: `Bearer ${token}`, Accept: "application/json, text/event-stream", ...(origin ? { Origin: origin } : {}),
  });
}

beforeAll(async () => {
  for (const statement of initSql.split(";").map((s) => s.trim()).filter(Boolean)) await env.DB.prepare(statement).run();
  const user = await registerTestUser();
  headers = user.authHeaders;
  userId = (await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(user.email).first<{ id: string }>())!.id;
});

describe("OAuth discovery and registration", () => {
  it("advertises public resource metadata and S256 authorization server discovery", async () => {
    const unauthorized = await SELF.fetch(base + "/mcp", { headers: { Accept: "application/json" } });
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get("WWW-Authenticate")).toContain(`resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"`);
    for (const path of ["/oauth-protected-resource", "/oauth-protected-resource/mcp"]) {
      const res = await SELF.fetch(base + "/.well-known" + path);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(await res.json()).toMatchObject({ resource: base + "/mcp", authorization_servers: [base], scopes_supported: ["mcp:tools"] });
    }
    const res = await SELF.fetch(base + "/.well-known/oauth-authorization-server");
    expect(await res.json()).toMatchObject({ issuer: base, code_challenge_methods_supported: ["S256"], registration_endpoint: base + "/oauth/register" });
  });

  it.each(["http://evil.example/cb", "javascript:alert(1)", "https://user:secret@example.com/cb", "https://example.com/cb#fragment", "https://example.com/cb#", "file:///tmp/cb"])("rejects unsafe redirect %s", async (uri) => {
    const res = await json("/oauth/register", { redirect_uris: [uri] });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_redirect_uri" });
  });

  it.each(["http://localhost:1234/cb", "http://127.0.0.1:1234/cb", "http://[::1]:1234/cb"])("accepts loopback callback %s", async (uri) => {
    await register({ redirect_uris: [uri] });
  });

  it("limits registration metadata and rejects unsupported grants", async () => {
    for (const overrides of [{ redirect_uris: [] }, { redirect_uris: Array(11).fill(callback) }, { grant_types: ["password"] }, { response_types: ["token"] }, { token_endpoint_auth_method: "bogus" }, { client_name: "x".repeat(121) }]) {
      expect((await json("/oauth/register", { redirect_uris: [callback], ...overrides })).status).toBe(400);
    }
    expect((await json("/oauth/register", { redirect_uris: [callback], client_name: "x".repeat(20_000) })).status).toBe(400);
  });

  it("rate limits public registration with the auth binding", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request(base + "/oauth/register", { method: "POST", body: "{}" }), {
      ...env, AUTH_IP_LIMITER: { limit: async () => ({ success: false }) },
    }, ctx);
    expect(res.status).toBe(429);
    await waitOnExecutionContext(ctx);
  });

  it("uses the configured production issuer and hides discovery on tracking hosts", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://www.capve.app/.well-known/oauth-authorization-server"), { ...env, APP_URL: "https://capve.app" }, ctx);
    expect(await res.json()).toMatchObject({ issuer: "https://capve.app" });
    expect((await SELF.fetch("https://unknown.example/.well-known/oauth-protected-resource")).status).toBe(404);
    await waitOnExecutionContext(ctx);
  });
});

describe("OAuth authorization and consent", () => {
  it("requires sign-in and preserves the authorization request through login", async () => {
    const pending = await request(await register(), {}, {});
    expect(pending.res.headers.get("Location")).toMatch(/^\/login\?returnTo=/);
    expect(oauthReturnTo(new URL(pending.res.headers.get("Location")!, base).search, base)).toBe(`/oauth/authorize?${pending.params}`);
    for (const value of ["https://evil.example/oauth/authorize", "//evil.example/oauth/authorize", "/app", "javascript:alert(1)"]) {
      expect(oauthReturnTo(`?returnTo=${encodeURIComponent(value)}`, base)).toBeNull();
    }
  });

  it.each([
    { redirect_uri: "https://evil.example/cb" }, { client_id: "missing" }, { code_challenge_method: "plain" },
    { code_challenge: "short" }, { response_type: "token" }, { resource: "https://evil.example/mcp" },
    { resource: "" }, { scope: "admin" },
  ])("rejects malformed authorization without redirecting: %j", async (overrides) => {
    const pending = await request(await register(), overrides);
    expect(pending.res.status).toBe(400);
    expect(pending.res.headers.get("Location")).toBeNull();
  });

  it("rejects duplicate authorization parameters", async () => {
    const { params } = await request(await register());
    params.append("client_id", "other");
    expect((await SELF.fetch(`${base}/oauth/authorize?${params}`, { headers, redirect: "manual" })).status).toBe(400);
  });

  it("shows real account and callback details and denies access without issuing credentials", async () => {
    const pending = await request(await register());
    const res = await SELF.fetch(`${base}/oauth/request?request=${pending.signed}`, { headers });
    expect(await res.json()).toMatchObject({ client_name: "Test assistant", redirect_uri: callback, scope: "mcp:tools" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    const denied = await approve(pending.signed, false);
    const redirect = new URL((await denied.json<{ redirect: string }>()).redirect);
    expect(redirect.searchParams.get("error")).toBe("access_denied");
    expect(redirect.searchParams.get("state")).toBe("test-state");
    expect(redirect.searchParams.has("code")).toBe(false);
    expect((await env.DB.prepare("SELECT COUNT(*) n FROM oauth_grants").first<{ n: number }>())!.n).toBe(0);
  });

  it("rejects CSRF, forged consent, another user, API tokens and expired consent", async () => {
    const pending = await request(await register());
    expect((await json("/oauth/authorize", { request: pending.signed, approve: true }, headers)).status).toBe(403);
    expect((await json("/oauth/authorize", { request: pending.signed, approve: true }, { ...headers, Origin: "https://evil.example" })).status).toBe(403);
    expect((await approve(pending.signed + "broken")).status).toBe(403);
    const other = await registerTestUser();
    expect((await approve(pending.signed, true, other.authHeaders)).status).toBe(403);
    const tokenRes = await json("/api/tokens", { name: "test" }, headers);
    const { token } = await tokenRes.json<{ token: string }>();
    expect((await approve(pending.signed, true, { ...headers, Authorization: `Bearer ${token}` })).status).toBe(403);
    const expired = await new SignJWT({ sv: 0 }).setProtectedHeader({ alg: "HS256" }).setSubject(userId)
      .setAudience("capve:oauth:consent").setIssuer(base).setExpirationTime(1).sign(authSecret(env));
    expect((await approve(expired)).status).toBe(403);
  });
});

describe("OAuth tokens and revocation", () => {
  it.each(["none", "client_secret_post", "client_secret_basic"])("connects and calls MCP with %s client authentication", async (method) => {
    const grant = await code(await register({ token_endpoint_auth_method: method }));
    const exchanged = await redeem(grant);
    expect(exchanged.status).toBe(200);
    expect(exchanged.headers.get("Cache-Control")).toBe("no-store");
    const tokens = await exchanged.json<Tokens>();
    expect(tokens).toMatchObject({ token_type: "Bearer", scope: "mcp:tools", expires_in: 3600 });
    const res = await mcp(tokens.access_token);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ result: { structuredContent: { user: { id: userId, account_id: userId } } } });
    const stored = await env.DB.prepare("SELECT hash FROM oauth_tokens").all<{ hash: string }>();
    expect(stored.results.every((r) => /^[a-f0-9]{64}$/.test(r.hash))).toBe(true);
    expect(stored.results.map((r) => r.hash)).toContain(await hashToken(tokens.access_token));
    expect((await mcp(tokens.refresh_token)).status).toBe(401);
  });

  it("validates client, secret, PKCE, redirect and resource before consuming a code", async () => {
    const grant = await code(await register({ token_endpoint_auth_method: "client_secret_post" }));
    for (const values of [{ code_verifier: "wrong" }, { code_verifier: randomOAuthToken() }, { redirect_uri: callback + "/other" }, { resource: "https://other.example/mcp" }]) {
      expect((await redeem(grant, values)).status).toBe(400);
    }
    const wrongSecret = { ...grant, client: { ...grant.client, client_secret: "wrong" } };
    expect((await redeem(wrongSecret)).status).toBe(401);
    expect((await redeem({ ...grant, client: await register() })).status).toBe(400);
    expect((await redeem(grant)).status).toBe(200);
  });

  it("rejects expired codes and duplicate token parameters", async () => {
    const grant = await code();
    await env.DB.prepare("UPDATE oauth_codes SET expires_at = 0").run();
    expect((await redeem(grant)).status).toBe(400);
    const res = await SELF.fetch(base + "/oauth/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `client_id=${grant.client.client_id}&client_id=other` });
    expect(res.status).toBe(400);
  });

  it("consumes authorization codes atomically and revokes tokens on code replay", async () => {
    const grant = await code();
    const responses = await Promise.all([redeem(grant), redeem(grant)]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 400]);
    const tokens = await responses.find((r) => r.ok)!.json<Tokens>();
    expect((await mcp(tokens.access_token)).status).toBe(401);
  });

  it("rotates refresh tokens and revokes the family on reuse", async () => {
    const grant = await connected();
    const renewed = await exchange(grant.client, { grant_type: "refresh_token", refresh_token: grant.tokens.refresh_token });
    expect(renewed.status).toBe(200);
    const tokens = await renewed.json<Tokens>();
    expect(tokens.refresh_token).not.toBe(grant.tokens.refresh_token);
    expect((await mcp(tokens.access_token)).status).toBe(200);
    expect((await exchange(grant.client, { grant_type: "refresh_token", refresh_token: grant.tokens.refresh_token })).status).toBe(400);
    expect((await mcp(tokens.access_token)).status).toBe(401);
    expect((await exchange(grant.client, { grant_type: "refresh_token", refresh_token: tokens.refresh_token })).status).toBe(400);
  });

  it("rejects expired access, refresh, and wrong-audience tokens", async () => {
    const grant = await connected();
    await env.DB.prepare("UPDATE oauth_tokens SET expires_at = 0 WHERE kind = 'access'").run();
    expect((await mcp(grant.tokens.access_token)).status).toBe(401);
    await env.DB.prepare("UPDATE oauth_tokens SET expires_at = ?").bind(Date.now() + 60000).run();
    await env.DB.prepare("UPDATE oauth_grants SET resource = 'https://other.example/mcp'").run();
    expect((await mcp(grant.tokens.access_token)).status).toBe(401);
    expect((await exchange(grant.client, { grant_type: "refresh_token", refresh_token: grant.tokens.refresh_token })).status).toBe(400);
    await env.DB.prepare("UPDATE oauth_grants SET resource = ?").bind(base + "/mcp").run();
    await env.DB.prepare("UPDATE oauth_tokens SET expires_at = 0 WHERE kind = 'refresh'").run();
    expect((await exchange(grant.client, { grant_type: "refresh_token", refresh_token: grant.tokens.refresh_token })).status).toBe(400);
  });

  it("supports RFC 7009 revocation, including unknown tokens", async () => {
    const grant = await connected();
    const otherClient = await register();
    expect((await exchange(otherClient, { token: grant.tokens.access_token }, "/oauth/revoke")).status).toBe(200);
    expect((await mcp(grant.tokens.access_token)).status).toBe(200);
    expect((await exchange(grant.client, { token: grant.tokens.refresh_token }, "/oauth/revoke")).status).toBe(200);
    expect((await mcp(grant.tokens.access_token)).status).toBe(401);
    expect((await exchange(grant.client, { token: "unknown" }, "/oauth/revoke")).status).toBe(200);
  });

  it("revokes access and refresh tokens when signing out everywhere", async () => {
    const grant = await connected();
    expect((await json("/api/auth/logout-all", {}, headers)).status).toBe(200);
    expect((await mcp(grant.tokens.access_token)).status).toBe(401);
    expect((await exchange(grant.client, { grant_type: "refresh_token", refresh_token: grant.tokens.refresh_token })).status).toBe(400);
  });

  it("restricts connection management to the owning session and supports disconnect", async () => {
    const grant = await connected();
    const result = await SELF.fetch(base + "/oauth/connections", { headers });
    const connections = (await result.json<{ connections: { id: string }[] }>()).connections;
    expect(connections).toHaveLength(1);
    const path = base + "/oauth/connections/" + connections[0].id;
    const other = await registerTestUser();
    await SELF.fetch(path, { method: "DELETE", headers: { ...other.authHeaders, Origin: base } });
    expect((await mcp(grant.tokens.access_token)).status).toBe(200);
    expect((await SELF.fetch(path, { method: "DELETE", headers })).status).toBe(403);
    expect((await SELF.fetch(base + "/oauth/connections", { headers: { Authorization: `Bearer ${grant.tokens.access_token}` } })).status).toBe(403);
    expect((await json("/api/tokens", {}, { Authorization: `Bearer ${grant.tokens.access_token}` })).status).toBe(403);
    await SELF.fetch(path, { method: "DELETE", headers: { ...headers, Origin: base } });
    expect((await mcp(grant.tokens.access_token)).status).toBe(401);
  });

  it("allows registered browser origins, keeps unknown Origins forbidden, and supports CORS preflight", async () => {
    const grant = await connected();
    const res = await mcp(grant.tokens.access_token, "https://assistant.example");
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://assistant.example");
    expect((await mcp(grant.tokens.access_token, "https://evil.example")).status).toBe(403);
    expect((await SELF.fetch(base + "/mcp", { method: "OPTIONS", headers: { Origin: "https://assistant.example", "Access-Control-Request-Headers": "authorization" } })).status).toBe(204);
    expect((await SELF.fetch(base + "/oauth/token", { method: "OPTIONS", headers: { Origin: "https://assistant.example" } })).headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("excludes platform administration from an OAuth grant", async () => {
    const grant = await connected();
    await env.DB.prepare("UPDATE users SET is_platform_admin = 1 WHERE id = ?").bind(userId).run();
    const res = await mcp(grant.tokens.access_token);
    expect(await res.json()).toMatchObject({ result: { structuredContent: { user: { is_platform_admin: false, account_id: userId } } } });
  });

  it("keeps OAuth on the consented personal account even when the user belongs to a team", async () => {
    const owner = await registerTestUser();
    const ownerId = (await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(owner.email).first<{ id: string }>())!.id;
    const user = (await getUserById(env.DB, userId))!;
    await env.DB.prepare("INSERT INTO team_members (id, owner_user_id, email, role, created_at, accepted_at) VALUES (?, ?, ?, 'admin', ?, ?)")
      .bind("oauth-team", ownerId, user.email, Date.now(), Date.now()).run();
    const context = await accountContextCookie(env, user, { kind: "account", account_id: ownerId }, false);
    const pending = await request(await register(), {}, { ...headers, Cookie: headers.Cookie + "; " + context.split(";")[0] });
    const decision = await approve(pending.signed);
    expect(decision.status).toBe(200);
    const grant = await connected();
    expect(await (await mcp(grant.tokens.access_token)).json()).toMatchObject({ result: { structuredContent: { user: { account_id: userId, role: "owner" } } } });
    expect((await SELF.fetch(base + "/api/campaigns", { headers: { Authorization: `Bearer ${grant.tokens.access_token}`, "X-Capve-Account": ownerId } })).status).toBe(409);
  });

  it("blocks authorization and consent during support impersonation", async () => {
    const pending = await request(await register());
    const target = await registerTestUser();
    const targetId = (await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(target.email).first<{ id: string }>())!.id;
    await env.DB.prepare("UPDATE users SET is_platform_admin = 1 WHERE id = ?").bind(userId).run();
    const user = (await getUserById(env.DB, userId))!;
    const context = await accountContextCookie(env, user, { kind: "impersonation", account_id: targetId, return_account_id: userId }, false);
    const impersonating = { ...headers, Cookie: headers.Cookie + "; " + context.split(";")[0] };
    expect((await request(await register(), {}, impersonating)).res.status).toBe(403);
    expect((await approve(pending.signed, true, impersonating)).status).toBe(403);
    expect((await SELF.fetch(base + "/oauth/connections", { headers: impersonating })).status).toBe(403);
  });

  it("invalidates OAuth grants after a password reset", async () => {
    const grant = await connected();
    const reset = randomOAuthToken();
    await createAuthToken(env.DB, userId, "reset", reset, Date.now() + 60_000);
    expect((await json("/api/auth/reset-password", { token: reset, password: "new-secure-password-123" })).status).toBe(200);
    expect((await mcp(grant.tokens.access_token)).status).toBe(401);
    expect((await exchange(grant.client, { grant_type: "refresh_token", refresh_token: grant.tokens.refresh_token })).status).toBe(400);
  });

  it("consumes a refresh token only once under concurrent requests", async () => {
    const grant = await connected();
    const values = { grant_type: "refresh_token", refresh_token: grant.tokens.refresh_token };
    const results = await Promise.all([exchange(grant.client, values), exchange(grant.client, values)]);
    expect(results.map((res) => res.status).sort()).toEqual([200, 400]);
    const tokens = await results.find((res) => res.ok)!.json<Tokens>();
    expect((await mcp(tokens.access_token)).status).toBe(401);
  });

  it("purges abandoned authorizations while preserving active grants and refresh replay evidence", async () => {
    const live = await connected();
    await exchange(live.client, { grant_type: "refresh_token", refresh_token: live.tokens.refresh_token });
    await code();
    await env.DB.prepare("UPDATE oauth_codes SET expires_at = 0 WHERE used_at IS NULL").run();
    await purgeOAuth(env.DB);
    expect((await env.DB.prepare("SELECT COUNT(*) n FROM oauth_grants").first<{ n: number }>())!.n).toBe(1);
    expect((await mcp(live.tokens.access_token)).status).toBe(200);
    expect((await exchange(live.client, { grant_type: "refresh_token", refresh_token: live.tokens.refresh_token })).status).toBe(400);
  });
});
