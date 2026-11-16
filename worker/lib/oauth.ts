import { hashToken } from "../db/auth";
import type { Env } from "../types";

export const OAUTH_SCOPE = "mcp:tools";
export const OAUTH_PREFIX = "capve_oauth_";
export const ACCESS_TTL = 60 * 60;
export const GRANT_TTL = 30 * 24 * 60 * 60 * 1000;

export type OAuthClient = {
  id: string; name: string; redirect_uris: string; auth_method: string; secret_hash: string | null;
};
export type OAuthGrant = {
  id: string; client_id: string; user_id: string; session_version: number;
  resource: string; scope: string; expires_at: number; revoked_at: number | null;
};

const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);
export function oauthIssuer(env: Pick<Env, "APP_URL">, requestUrl?: string): string {
  const configured = new URL(env.APP_URL);
  const request = requestUrl ? new URL(requestUrl) : configured;
  // Local development and isolated interoperability tests use ephemeral ports.
  if (loopback.has(configured.hostname) && loopback.has(request.hostname)) return request.origin;
  return configured.origin;
}

export function validRedirect(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return !url.hash && !value.includes("#") && !url.username && !url.password
      && (url.protocol === "https:" || (url.protocol === "http:" && loopback.has(url.hostname)));
  } catch { return false; }
}

export function randomOAuthToken(prefix = ""): string {
  return prefix + btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export async function activeGrant(db: D1Database, grantId: string): Promise<OAuthGrant | null> {
  return db.prepare(`SELECT g.* FROM oauth_grants g JOIN users u ON u.id = g.user_id
    WHERE g.id = ? AND g.revoked_at IS NULL AND g.expires_at > ?
    AND g.session_version = u.session_version`).bind(grantId, Date.now()).first<OAuthGrant>();
}

export async function oauthTokenUser(env: Env, token: string, requestUrl?: string): Promise<string | null> {
  if (!token.startsWith(OAUTH_PREFIX)) return null;
  const row = await env.DB.prepare(`SELECT g.user_id FROM oauth_tokens t
    JOIN oauth_grants g ON g.id = t.grant_id JOIN users u ON u.id = g.user_id
    WHERE t.hash = ? AND t.kind = 'access' AND t.expires_at > ?
    AND g.revoked_at IS NULL AND g.expires_at > ? AND g.session_version = u.session_version
    AND g.resource = ? AND g.scope = ?`)
    .bind(await hashToken(token), Date.now(), Date.now(), `${oauthIssuer(env, requestUrl)}/mcp`, OAUTH_SCOPE)
    .first<{ user_id: string }>();
  return row?.user_id ?? null;
}

export async function revokeGrant(db: D1Database, id: string) {
  await db.prepare("UPDATE oauth_grants SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL")
    .bind(Date.now(), id).run();
}

export async function issueOAuthTokens(db: D1Database, grant: OAuthGrant) {
  const access = randomOAuthToken(OAUTH_PREFIX);
  const refresh = randomOAuthToken("capve_refresh_");
  const expiresIn = Math.min(ACCESS_TTL, Math.floor((grant.expires_at - Date.now()) / 1000));
  await db.batch([
    db.prepare("INSERT INTO oauth_tokens (hash, grant_id, kind, expires_at) VALUES (?, ?, 'access', ?)")
      .bind(await hashToken(access), grant.id, Date.now() + expiresIn * 1000),
    db.prepare("INSERT INTO oauth_tokens (hash, grant_id, kind, expires_at) VALUES (?, ?, 'refresh', ?)")
      .bind(await hashToken(refresh), grant.id, grant.expires_at),
  ]);
  return { access_token: access, token_type: "Bearer", expires_in: expiresIn, refresh_token: refresh, scope: grant.scope };
}

/** Browser MCP clients are allowed only from a registered callback origin. No cookies are used. */
export async function registeredOAuthOrigin(db: D1Database, origin: string): Promise<boolean> {
  if (!validRedirect(origin)) return false;
  const { results } = await db.prepare(`SELECT value FROM oauth_clients, json_each(redirect_uris)
    WHERE value = ? OR value LIKE ?`).bind(origin, `${origin}/%`).all<{ value: string }>();
  return results.some(({ value }) => new URL(value).origin === origin);
}

export async function purgeOAuth(db: D1Database) {
  const now = Date.now();
  await db.batch([
    db.prepare("DELETE FROM oauth_grants WHERE expires_at <= ? OR revoked_at <= ?")
      .bind(now, now - 24 * 60 * 60 * 1000),
    db.prepare("DELETE FROM oauth_tokens WHERE kind = 'access' AND expires_at <= ?").bind(now),
    // Keep spent codes until the grant ends so replay can revoke issued tokens.
    db.prepare("DELETE FROM oauth_grants WHERE id IN (SELECT grant_id FROM oauth_codes WHERE used_at IS NULL AND expires_at <= ?)").bind(now),
    db.prepare("DELETE FROM oauth_clients WHERE created_at < ? AND id NOT IN (SELECT client_id FROM oauth_grants)")
      .bind(now - GRANT_TTL),
  ]);
}
