import { id } from "../lib/utils";

/** Where an outgoing postback is attached. Exactly one owner per postback. */
export type PostbackOwner =
  | { kind: "campaign"; id: string }
  | { kind: "traffic_source"; id: string }
  | { kind: "network"; id: string };

export type Postback = {
  id: string;
  user_id: string;
  program_id: string | null;
  traffic_source_id: string | null;
  network_id: string | null;
  /** Conversion event this postback fires for; null = every event. */
  event: string | null;
  url: string;
  created_at: number;
};

export const MAX_POSTBACKS_PER_OWNER = 20;

const COLUMNS = "id, user_id, program_id, traffic_source_id, network_id, event, url, created_at";

const OWNER_COLUMN = {
  campaign: "program_id",
  traffic_source: "traffic_source_id",
  network: "network_id",
} as const;

export async function listPostbacks(
  db: D1Database,
  userId: string,
  owner?: PostbackOwner,
): Promise<Postback[]> {
  const ownerSql = owner ? ` AND ${OWNER_COLUMN[owner.kind]} = ?` : "";
  const { results } = await db
    .prepare(`SELECT ${COLUMNS} FROM postbacks WHERE user_id = ?${ownerSql} ORDER BY created_at`)
    .bind(userId, ...(owner ? [owner.id] : []))
    .all<Postback>();
  return results ?? [];
}

export async function getPostback(db: D1Database, postbackId: string, userId: string) {
  return db
    .prepare(`SELECT ${COLUMNS} FROM postbacks WHERE id = ? AND user_id = ?`)
    .bind(postbackId, userId)
    .first<Postback>();
}

/** Returns null when the owner already has MAX_POSTBACKS_PER_OWNER postbacks. */
export async function createPostback(
  db: D1Database,
  userId: string,
  owner: PostbackOwner,
  input: { event: string | null; url: string },
): Promise<Postback | null> {
  const column = OWNER_COLUMN[owner.kind];
  const postback: Postback = {
    id: id("pb"),
    user_id: userId,
    program_id: owner.kind === "campaign" ? owner.id : null,
    traffic_source_id: owner.kind === "traffic_source" ? owner.id : null,
    network_id: owner.kind === "network" ? owner.id : null,
    event: input.event,
    url: input.url,
    created_at: Date.now(),
  };
  // Conditional insert keeps the per-owner limit atomic.
  const result = await db
    .prepare(
      `INSERT INTO postbacks (${COLUMNS})
       SELECT ?, ?, ?, ?, ?, ?, ?, ?
       WHERE (SELECT COUNT(*) FROM postbacks WHERE ${column} = ?) < ?`,
    )
    .bind(
      postback.id,
      postback.user_id,
      postback.program_id,
      postback.traffic_source_id,
      postback.network_id,
      postback.event,
      postback.url,
      postback.created_at,
      owner.id,
      MAX_POSTBACKS_PER_OWNER,
    )
    .run();
  return (result.meta.changes ?? 0) > 0 ? postback : null;
}

export async function updatePostback(
  db: D1Database,
  postbackId: string,
  userId: string,
  updates: { event?: string | null; url?: string },
): Promise<Postback | null> {
  const existing = await getPostback(db, postbackId, userId);
  if (!existing) return null;
  const next = {
    ...existing,
    event: updates.event === undefined ? existing.event : updates.event,
    url: updates.url ?? existing.url,
  };
  await db
    .prepare("UPDATE postbacks SET event = ?, url = ? WHERE id = ? AND user_id = ?")
    .bind(next.event, next.url, postbackId, userId)
    .run();
  return next;
}

export async function deletePostback(db: D1Database, postbackId: string, userId: string) {
  const result = await db
    .prepare("DELETE FROM postbacks WHERE id = ? AND user_id = ?")
    .bind(postbackId, userId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

/** Copies a campaign's postbacks onto another campaign (used by clone). */
export async function copyCampaignPostbacks(db: D1Database, fromProgramId: string, toProgramId: string) {
  const { results } = await db
    .prepare(`SELECT ${COLUMNS} FROM postbacks WHERE program_id = ? ORDER BY created_at`)
    .bind(fromProgramId)
    .all<Postback>();
  for (const postback of results ?? []) {
    await db
      .prepare(
        "INSERT INTO postbacks (id, user_id, program_id, event, url, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .bind(id("pb"), postback.user_id, toProgramId, postback.event, postback.url, Date.now())
      .run();
  }
}

/**
 * Postbacks to fire for one conversion: the campaign's, its traffic source's and
 * the clicked offer's network's, filtered to the conversion event (null-event postbacks
 * fire for every event).
 */
export async function postbacksForConversion(
  db: D1Database,
  owners: {
    user_id: string;
    program_id: string;
    traffic_source_id: string | null;
    network_id: string | null;
  },
  event: string | null,
): Promise<Postback[]> {
  const { results } = await db
    .prepare(
      `SELECT ${COLUMNS} FROM postbacks
       WHERE user_id = ?
         AND (program_id = ? OR traffic_source_id = ? OR network_id = ?)
         AND (event IS NULL OR event = ?)
       ORDER BY created_at`,
    )
    .bind(owners.user_id, owners.program_id, owners.traffic_source_id, owners.network_id, event)
    .all<Postback>();
  return results ?? [];
}
