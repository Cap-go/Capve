import { hashToken } from "./auth";
import { id } from "../lib/utils";

export const API_TOKEN_PREFIX = "capve_";
const MAX_TOKENS_PER_USER = 20;

export type ApiTokenRow = {
  id: string;
  name: string;
  prefix: string;
  last_used_at: number | null;
  created_at: number;
};

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return `${API_TOKEN_PREFIX}${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export async function listApiTokens(db: D1Database, userId: string): Promise<ApiTokenRow[]> {
  const { results } = await db
    .prepare(
      "SELECT id, name, prefix, last_used_at, created_at FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC",
    )
    .bind(userId)
    .all<ApiTokenRow>();
  return results;
}

/** Returns the raw token once; only its hash is stored. Null when the user hit the token limit. */
export async function createApiToken(
  db: D1Database,
  userId: string,
  name: string,
): Promise<{ token: string; api_token: ApiTokenRow } | null> {
  const count = await db
    .prepare("SELECT COUNT(*) AS n FROM api_tokens WHERE user_id = ?")
    .bind(userId)
    .first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_TOKENS_PER_USER) return null;

  const token = randomToken();
  const row: ApiTokenRow = {
    id: id("atk"),
    name,
    prefix: token.slice(0, API_TOKEN_PREFIX.length + 6),
    last_used_at: null,
    created_at: Date.now(),
  };
  await db
    .prepare(
      "INSERT INTO api_tokens (id, user_id, name, token_hash, prefix, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(row.id, userId, name, await hashToken(token), row.prefix, row.created_at)
    .run();
  return { token, api_token: row };
}

export async function deleteApiToken(db: D1Database, tokenId: string, userId: string) {
  const result = await db
    .prepare("DELETE FROM api_tokens WHERE id = ? AND user_id = ?")
    .bind(tokenId, userId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

/** Resolves a raw bearer token to its user id and records usage (at most once a minute). */
export async function findUserIdByApiToken(db: D1Database, token: string): Promise<string | null> {
  if (!token.startsWith(API_TOKEN_PREFIX)) return null;
  const row = await db
    .prepare("SELECT id, user_id, last_used_at FROM api_tokens WHERE token_hash = ? LIMIT 1")
    .bind(await hashToken(token))
    .first<{ id: string; user_id: string; last_used_at: number | null }>();
  if (!row) return null;
  const now = Date.now();
  if (!row.last_used_at || now - row.last_used_at > 60_000) {
    await db.prepare("UPDATE api_tokens SET last_used_at = ? WHERE id = ?").bind(now, row.id).run();
  }
  return row.user_id;
}
