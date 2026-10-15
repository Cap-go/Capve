/** Per-account incoming postback key (`/click?...&key=`), stored on the owner's user row. */
export type PostbackKeySettings = { key: string; required: boolean };

function newKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Returns the account's key settings, generating the key on first use. */
export async function ensurePostbackKey(
  db: D1Database,
  accountId: string,
): Promise<PostbackKeySettings> {
  await db
    .prepare("UPDATE users SET postback_key = ? WHERE id = ? AND postback_key IS NULL")
    .bind(newKey(), accountId)
    .run();
  const row = await getPostbackKey(db, accountId);
  return { key: row?.postback_key ?? "", required: row?.postback_key_required === 1 };
}

export async function getPostbackKey(db: D1Database, accountId: string) {
  return db
    .prepare("SELECT postback_key, postback_key_required FROM users WHERE id = ?")
    .bind(accountId)
    .first<{ postback_key: string | null; postback_key_required: number }>();
}

export async function rotatePostbackKey(
  db: D1Database,
  accountId: string,
): Promise<PostbackKeySettings> {
  await db.prepare("UPDATE users SET postback_key = ? WHERE id = ?").bind(newKey(), accountId).run();
  return ensurePostbackKey(db, accountId);
}

export async function setPostbackKeyRequired(
  db: D1Database,
  accountId: string,
  required: boolean,
): Promise<PostbackKeySettings> {
  await ensurePostbackKey(db, accountId);
  await db
    .prepare("UPDATE users SET postback_key_required = ? WHERE id = ?")
    .bind(required ? 1 : 0, accountId)
    .run();
  return ensurePostbackKey(db, accountId);
}

/** Constant-time comparison of a supplied key against the stored one. */
export function postbackKeyMatches(stored: string | null | undefined, supplied: string | undefined) {
  if (!stored || !supplied || stored.length !== supplied.length) return false;
  let diff = 0;
  for (let i = 0; i < stored.length; i++) diff |= stored.charCodeAt(i) ^ supplied.charCodeAt(i);
  return diff === 0;
}
