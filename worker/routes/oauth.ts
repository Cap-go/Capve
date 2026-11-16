import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { jwtVerify, SignJWT } from "jose";
import { hashToken } from "../db/auth";
import { readBearerToken, requireUser, resolveIdentity } from "../lib/access";
import { authSecret } from "../lib/session";
import { isRateLimited } from "../lib/rate-limit";
import {
  activeGrant, GRANT_TTL, issueOAuthTokens, OAUTH_SCOPE, oauthIssuer,
  pkceChallenge, randomOAuthToken, revokeGrant, validRedirect, type OAuthClient,
} from "../lib/oauth";
import type { Env } from "../types";

type Ctx = Context<{ Bindings: Env }>;
type Authorization = {
  client_id: string; redirect_uri: string; resource: string; scope: string;
  code_challenge: string; state: string;
};
const oauth = new Hono<{ Bindings: Env }>();
const discovery = new Hono<{ Bindings: Env }>();
const error = (c: Ctx, code: string, description: string, status: 400 | 401 | 403 | 429 = 400) =>
  c.json({ error: code, error_description: description }, status);
const issuer = (c: Ctx) => oauthIssuer(c.env, c.req.url);

function metadata(c: Ctx) {
  const base = issuer(c);
  return {
    authorization_response_iss_parameter_supported: true,
    issuer: base, authorization_endpoint: `${base}/oauth/authorize`, token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`, revocation_endpoint: `${base}/oauth/revoke`,
    response_types_supported: ["code"], grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"], scopes_supported: [OAUTH_SCOPE],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    revocation_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
  };
}
discovery.use("*", async (c, next) => {
  c.header("Access-Control-Allow-Origin", "*");
  c.header("Access-Control-Allow-Methods", "GET, OPTIONS");
  c.header("Access-Control-Allow-Headers", "MCP-Protocol-Version");
  if (c.req.method === "OPTIONS") return c.body(null, 204);
  await next();
});
discovery.get("/oauth-authorization-server", (c) => c.json(metadata(c)));
for (const path of ["/oauth-protected-resource", "/oauth-protected-resource/mcp"]) {
  discovery.get(path, (c) => c.json({
    resource: `${issuer(c)}/mcp`, authorization_servers: [issuer(c)],
    scopes_supported: [OAUTH_SCOPE], bearer_methods_supported: ["header"], resource_name: "Capve MCP",
  }));
}

oauth.use("*", async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
  c.header("Pragma", "no-cache");
  c.header("Referrer-Policy", "no-referrer");
  c.header("X-Frame-Options", "DENY");
  c.header("Content-Security-Policy", "frame-ancestors 'none'");
  c.header("X-Robots-Tag", "noindex, nofollow");
});
oauth.use("*", bodyLimit({ maxSize: 16_384, onError: (c) => error(c, "invalid_request", "Request too large") }));
oauth.use("*", async (c, next) => {
  if (issuer(c).startsWith("https:") && new URL(c.req.url).protocol !== "https:") {
    return error(c, "invalid_request", "OAuth requires HTTPS");
  }
  const protocolEndpoint = ["/oauth/register", "/oauth/token", "/oauth/revoke"].includes(c.req.path);
  if (protocolEndpoint) {
    c.header("Access-Control-Allow-Origin", "*");
    c.header("Access-Control-Allow-Methods", "POST, OPTIONS");
    c.header("Access-Control-Allow-Headers", "Content-Type, Authorization, MCP-Protocol-Version");
    if (c.req.method === "OPTIONS") return c.body(null, 204);
    if (await isRateLimited(c.env, c.req.raw, `oauth:${c.req.path}`)) {
      return error(c, "temporarily_unavailable", "Too many requests. Try again in a minute.", 429);
    }
  }
  if (c.req.method === "POST" || c.req.method === "DELETE") {
    // Consent and dashboard management are session-only and must be same-origin.
    if (!protocolEndpoint && c.req.header("Origin") !== new URL(c.req.url).origin) {
      return error(c, "invalid_request", "A same-origin request is required", 403);
    }
  }
  await next();
});

async function clientById(c: Ctx, id: string) {
  return c.env.DB.prepare("SELECT * FROM oauth_clients WHERE id = ?").bind(id).first<OAuthClient>();
}

// RFC 7591 public and confidential clients; PKCE is mandatory for both.
oauth.post("/register", async (c) => {
  if (Number(c.req.header("Content-Length")) > 16_384) return error(c, "invalid_client_metadata", "Request too large");
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body || !Array.isArray(body.redirect_uris) || body.redirect_uris.length < 1 || body.redirect_uris.length > 10
    || !body.redirect_uris.every(validRedirect)) return error(c, "invalid_redirect_uri", "Register 1–10 HTTPS callbacks (HTTP loopback is allowed)");
  const method = body.token_endpoint_auth_method ?? "client_secret_basic";
  if (!["none", "client_secret_post", "client_secret_basic"].includes(method as string)) {
    return error(c, "invalid_client_metadata", "Unsupported client authentication method");
  }
  if (body.client_name !== undefined && (typeof body.client_name !== "string" || body.client_name.length > 120)) {
    return error(c, "invalid_client_metadata", "Client name must be at most 120 characters");
  }
  for (const [key, allowed] of [["grant_types", ["authorization_code", "refresh_token"]], ["response_types", ["code"]]] as const) {
    if (body[key] !== undefined && (!Array.isArray(body[key]) || !(body[key] as unknown[]).length
      || !(body[key] as unknown[]).every((value) => allowed.includes(value as never)))) {
      return error(c, "invalid_client_metadata", `Unsupported ${key}`);
    }
  }
  const id = randomOAuthToken("client_");
  const secret = method === "none" ? null : randomOAuthToken();
  const name = typeof body.client_name === "string" && body.client_name.trim() ? body.client_name.trim() : "MCP client";
  await c.env.DB.prepare("INSERT INTO oauth_clients (id, name, redirect_uris, auth_method, secret_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, name, JSON.stringify(body.redirect_uris), method, secret ? await hashToken(secret) : null, Date.now()).run();
  return c.json({ client_id: id, client_id_issued_at: Math.floor(Date.now() / 1000), client_name: name,
    redirect_uris: body.redirect_uris, token_endpoint_auth_method: method,
    grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], scope: OAUTH_SCOPE,
    ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
  }, 201);
});

async function authorizationRequest(c: Ctx): Promise<Authorization | Response> {
  const params = new URL(c.req.url).searchParams;
  if ([...params.keys()].some((key) => params.getAll(key).length !== 1)) return error(c, "invalid_request", "Duplicate parameters");
  const client = await clientById(c, params.get("client_id") ?? "");
  const redirect = params.get("redirect_uri") ?? "";
  if (!client || !(JSON.parse(client.redirect_uris) as string[]).includes(redirect)) {
    return error(c, "invalid_request", "Unknown client or unregistered redirect URI");
  }
  if (params.get("response_type") !== "code") return error(c, "unsupported_response_type", "Only authorization code is supported");
  if (params.get("code_challenge_method") !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(params.get("code_challenge") ?? "")) {
    return error(c, "invalid_request", "PKCE S256 is required");
  }
  const resource = params.get("resource");
  if (resource !== `${issuer(c)}/mcp`) return error(c, "invalid_target", "Use the resource advertised in MCP discovery");
  const scope = params.get("scope") || OAUTH_SCOPE;
  if (scope !== OAUTH_SCOPE) return error(c, "invalid_scope", `Supported scope: ${OAUTH_SCOPE}`);
  const state = params.get("state") ?? "";
  if (state.length > 2048) return error(c, "invalid_request", "State is too long");
  return { client_id: client.id, redirect_uri: redirect, resource, scope, state, code_challenge: params.get("code_challenge")! };
}

async function identity(c: Ctx) {
  if (readBearerToken(c.req.header("Authorization"))) return null;
  if ((await requireUser(c))?.impersonating) return null;
  return resolveIdentity(c);
}

oauth.get("/authorize", async (c) => {
  const request = await authorizationRequest(c);
  if (request instanceof Response) return request;
  const user = await identity(c);
  if (!user) {
    if ((await requireUser(c))?.impersonating) return error(c, "access_denied", "Exit impersonation before connecting an app", 403);
    const url = new URL(c.req.url);
    return c.redirect(`/login?returnTo=${encodeURIComponent(url.pathname + url.search)}`);
  }
  const signed = await new SignJWT({ ...request, sv: user.session_version })
    .setProtectedHeader({ alg: "HS256" }).setSubject(user.id).setAudience("capve:oauth:consent")
    .setIssuer(issuer(c)).setIssuedAt().setExpirationTime("10m").sign(authSecret(c.env));
  return c.redirect(`/oauth/consent?request=${encodeURIComponent(signed)}`);
});

async function consent(c: Ctx, signed: unknown) {
  const user = await identity(c);
  if (!user || typeof signed !== "string") return null;
  try {
    const { payload } = await jwtVerify(signed, authSecret(c.env), {
      algorithms: ["HS256"], audience: "capve:oauth:consent", issuer: issuer(c), subject: user.id,
    });
    if (payload.sv !== user.session_version) return null;
    const request = payload as unknown as Authorization;
    const client = await clientById(c, request.client_id);
    if (!client || !(JSON.parse(client.redirect_uris) as string[]).includes(request.redirect_uri)) return null;
    return { user, request, client };
  } catch { return null; }
}

oauth.get("/request", async (c) => {
  const result = await consent(c, c.req.query("request"));
  if (!result) return error(c, "access_denied", "This authorization request expired or belongs to another session. Reconnect from your client.", 403);
  return c.json({ client_name: result.client.name, redirect_uri: result.request.redirect_uri,
    email: result.user.email, scope: result.request.scope });
});

oauth.post("/authorize", async (c) => {
  const body = await c.req.json<{ request?: string; approve?: boolean }>().catch(() => null);
  const result = await consent(c, body?.request);
  if (!result || typeof body?.approve !== "boolean") return error(c, "access_denied", "Invalid or expired authorization request", 403);
  const { request, user } = result;
  const redirect = new URL(request.redirect_uri);
  if (request.state) redirect.searchParams.set("state", request.state);
  redirect.searchParams.set("iss", issuer(c));
  if (!body.approve) {
    redirect.searchParams.set("error", "access_denied");
    return c.json({ redirect: redirect.href });
  }
  const grant = randomOAuthToken("grant_");
  const code = randomOAuthToken();
  const now = Date.now();
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO oauth_grants
      (id, client_id, user_id, session_version, resource, scope, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(grant, request.client_id, user.id, user.session_version, request.resource, request.scope, now, now + GRANT_TTL),
    c.env.DB.prepare("INSERT INTO oauth_codes (hash, grant_id, redirect_uri, challenge, expires_at) VALUES (?, ?, ?, ?, ?)")
      .bind(await hashToken(code), grant, request.redirect_uri, request.code_challenge, now + 5 * 60_000),
  ]);
  redirect.searchParams.set("code", code);
  return c.json({ redirect: redirect.href });
});

async function tokenRequest(c: Ctx): Promise<{ client: OAuthClient; params: URLSearchParams } | Response> {
  if (!c.req.header("Content-Type")?.startsWith("application/x-www-form-urlencoded")) {
    return error(c, "invalid_request", "Use application/x-www-form-urlencoded");
  }
  const text = await c.req.text();
  if (text.length > 16_384) return error(c, "invalid_request", "Request too large");
  const params = new URLSearchParams(text);
  if ([...params.keys()].some((key) => params.getAll(key).length !== 1)) return error(c, "invalid_request", "Duplicate parameters");
  let id = params.get("client_id") ?? "";
  let secret = params.get("client_secret");
  const auth = c.req.header("Authorization");
  if (auth) {
    if (!auth.startsWith("Basic ") || secret !== null) return error(c, "invalid_client", "Invalid client credentials", 401);
    try {
      const decoded = atob(auth.slice(6));
      const colon = decoded.indexOf(":");
      if (colon < 0) throw new Error();
      const basicId = decodeURIComponent(decoded.slice(0, colon).replaceAll("+", " "));
      if (id && id !== basicId) throw new Error();
      id = basicId;
      secret = decodeURIComponent(decoded.slice(colon + 1).replaceAll("+", " "));
    } catch { return error(c, "invalid_client", "Invalid client credentials", 401); }
  }
  const client = await clientById(c, id);
  if (!client || (client.auth_method === "none" ? auth || secret !== null
    : !secret || await hashToken(secret) !== client.secret_hash
      || (client.auth_method === "client_secret_basic") !== Boolean(auth))) {
    if (auth) c.header("WWW-Authenticate", 'Basic realm="capve-oauth"');
    return error(c, "invalid_client", "Invalid client credentials", 401);
  }
  return { client, params };
}

oauth.post("/token", async (c) => {
  const parsed = await tokenRequest(c);
  if (parsed instanceof Response) return parsed;
  const { params, client } = parsed;
  const type = params.get("grant_type");
  if (type !== "authorization_code" && type !== "refresh_token") return error(c, "unsupported_grant_type", "Use authorization_code or refresh_token");
  if (params.get("resource") !== `${issuer(c)}/mcp`) return error(c, "invalid_target", "Use the MCP resource from discovery");
  if (params.has("scope") && params.get("scope") !== OAUTH_SCOPE) return error(c, "invalid_scope", "Scope cannot change during token exchange");
  const hash = await hashToken(params.get(type === "authorization_code" ? "code" : "refresh_token") ?? "");
  const row = type === "authorization_code"
    ? await c.env.DB.prepare("SELECT * FROM oauth_codes WHERE hash = ?").bind(hash)
      .first<{ grant_id: string; expires_at: number; used_at: number | null; redirect_uri: string; challenge: string }>()
    : await c.env.DB.prepare("SELECT * FROM oauth_tokens WHERE hash = ? AND kind = 'refresh'").bind(hash)
      .first<{ grant_id: string; expires_at: number; used_at: number | null; redirect_uri?: string; challenge?: string }>();
  const grant = row && await activeGrant(c.env.DB, row.grant_id);
  if (!row || !grant || grant.client_id !== client.id || grant.resource !== params.get("resource") || row.expires_at <= Date.now()) {
    return error(c, "invalid_grant", "Invalid or expired grant");
  }
  if (type === "authorization_code") {
    const verifier = params.get("code_verifier") ?? "";
    if (row.redirect_uri !== params.get("redirect_uri") || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)
      || await pkceChallenge(verifier) !== row.challenge) return error(c, "invalid_grant", "Invalid code verifier or redirect URI");
  }
  const table = type === "authorization_code" ? "oauth_codes" : "oauth_tokens";
  const consumed = await c.env.DB.prepare(`UPDATE ${table} SET used_at = ? WHERE hash = ? AND used_at IS NULL RETURNING hash`)
    .bind(Date.now(), hash).first();
  if (!consumed) {
    // Reusing a code or rotated refresh token revokes the entire token family.
    await revokeGrant(c.env.DB, grant.id);
    return error(c, "invalid_grant", "Grant already used; reconnect your client");
  }
  return c.json(await issueOAuthTokens(c.env.DB, grant));
});

oauth.post("/revoke", async (c) => {
  const parsed = await tokenRequest(c);
  if (parsed instanceof Response) return parsed;
  const row = await c.env.DB.prepare(`SELECT g.id FROM oauth_tokens t JOIN oauth_grants g ON g.id = t.grant_id
    WHERE t.hash = ? AND g.client_id = ?`).bind(await hashToken(parsed.params.get("token") ?? ""), parsed.client.id).first<{ id: string }>();
  if (row) await revokeGrant(c.env.DB, row.id);
  return c.body(null, 200);
});

oauth.get("/connections", async (c) => {
  const user = await identity(c);
  if (!user) return error(c, "access_denied", "Manage connections from your own dashboard session", 403);
  const { results } = await c.env.DB.prepare(`SELECT g.id, c.name, g.created_at, g.expires_at
    FROM oauth_grants g JOIN oauth_clients c ON c.id = g.client_id
    WHERE g.user_id = ? AND g.revoked_at IS NULL AND g.expires_at > ? AND g.session_version = ?
    ORDER BY g.created_at DESC`).bind(user.id, Date.now(), user.session_version).all();
  return c.json({ connections: results });
});
oauth.delete("/connections/:id", async (c) => {
  const user = await identity(c);
  if (!user) return error(c, "access_denied", "Manage connections from your own dashboard session", 403);
  await c.env.DB.prepare("UPDATE oauth_grants SET revoked_at = ? WHERE id = ? AND user_id = ?")
    .bind(Date.now(), c.req.param("id"), user.id).run();
  return c.json({ ok: true });
});

export { discovery, oauth };
