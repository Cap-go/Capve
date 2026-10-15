import type {
  AffiliateNetwork,
  CostType,
  Group,
  Lander,
  Offer,
  TrafficSource,
} from "../types-entities";
import { id } from "../lib/utils";

export async function listGroups(db: D1Database, userId: string): Promise<Group[]> {
  const { results } = await db
    .prepare("SELECT id, user_id, name, created_at FROM groups WHERE user_id = ? ORDER BY name")
    .bind(userId)
    .all<Group>();
  return results ?? [];
}

export async function createGroup(db: D1Database, userId: string, name: string): Promise<Group> {
  const group: Group = { id: id("grp"), user_id: userId, name, created_at: Date.now() };
  await db
    .prepare("INSERT INTO groups (id, user_id, name, created_at) VALUES (?, ?, ?, ?)")
    .bind(group.id, group.user_id, group.name, group.created_at)
    .run();
  return group;
}

/** Deletes a group; its campaigns are kept and moved out of the group. */
export async function deleteGroup(db: D1Database, groupId: string, userId: string): Promise<boolean> {
  if (!(await entityBelongsTo(db, "group", groupId, userId))) return false;
  await db.batch([
    db.prepare("UPDATE programs SET group_id = NULL WHERE group_id = ? AND user_id = ?").bind(groupId, userId),
    deleteNotesStatement(db, userId, "group", groupId),
    db.prepare("DELETE FROM groups WHERE id = ? AND user_id = ?").bind(groupId, userId),
  ]);
  return true;
}

export async function listTrafficSources(
  db: D1Database,
  userId: string,
): Promise<TrafficSource[]> {
  const { results } = await db
    .prepare(
      `SELECT id, user_id, name, cost_type, default_cost_cents, postback_percent, created_at
       FROM traffic_sources WHERE user_id = ? ORDER BY name`,
    )
    .bind(userId)
    .all<TrafficSource>();
  return results ?? [];
}

export async function createTrafficSource(
  db: D1Database,
  userId: string,
  input: {
    name: string;
    cost_type?: CostType;
    default_cost_cents?: number;
    postback_percent?: number;
  },
): Promise<TrafficSource> {
  const source: TrafficSource = {
    id: id("src"),
    user_id: userId,
    name: input.name,
    cost_type: input.cost_type ?? "cpc",
    default_cost_cents: input.default_cost_cents ?? 0,
    postback_percent: input.postback_percent ?? 100,
    created_at: Date.now(),
  };
  await db
    .prepare(
      `INSERT INTO traffic_sources
       (id, user_id, name, cost_type, default_cost_cents, postback_percent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      source.id,
      source.user_id,
      source.name,
      source.cost_type,
      source.default_cost_cents,
      source.postback_percent,
      source.created_at,
    )
    .run();
  return source;
}

export async function listAffiliateNetworks(
  db: D1Database,
  userId: string,
): Promise<AffiliateNetwork[]> {
  const { results } = await db
    .prepare(
      "SELECT id, user_id, name, created_at FROM affiliate_networks WHERE user_id = ? ORDER BY name",
    )
    .bind(userId)
    .all<AffiliateNetwork>();
  return results ?? [];
}

export async function createAffiliateNetwork(
  db: D1Database,
  userId: string,
  input: { name: string },
): Promise<AffiliateNetwork> {
  const network: AffiliateNetwork = {
    id: id("net"),
    user_id: userId,
    name: input.name,
    created_at: Date.now(),
  };
  await db
    .prepare(
      "INSERT INTO affiliate_networks (id, user_id, name, created_at) VALUES (?, ?, ?, ?)",
    )
    .bind(network.id, network.user_id, network.name, network.created_at)
    .run();
  return network;
}

export async function listLanders(db: D1Database, userId: string): Promise<Lander[]> {
  const { results } = await db
    .prepare("SELECT id, user_id, name, url, created_at FROM landers WHERE user_id = ? ORDER BY name")
    .bind(userId)
    .all<Lander>();
  return results ?? [];
}

export async function createLander(
  db: D1Database,
  userId: string,
  input: { name: string; url: string },
): Promise<Lander> {
  const lander: Lander = {
    id: id("lp"),
    user_id: userId,
    name: input.name,
    url: input.url,
    created_at: Date.now(),
  };
  await db
    .prepare("INSERT INTO landers (id, user_id, name, url, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(lander.id, lander.user_id, lander.name, lander.url, lander.created_at)
    .run();
  return lander;
}

export async function listOffers(db: D1Database, userId: string): Promise<Offer[]> {
  const { results } = await db
    .prepare(
      `SELECT id, user_id, network_id, name, url, payout_cents, created_at
       FROM offers WHERE user_id = ? ORDER BY name`,
    )
    .bind(userId)
    .all<Offer>();
  return results ?? [];
}

export async function createOffer(
  db: D1Database,
  userId: string,
  input: { name: string; url: string; network_id?: string | null; payout_cents?: number },
): Promise<Offer> {
  const offer: Offer = {
    id: id("off"),
    user_id: userId,
    network_id: input.network_id ?? null,
    name: input.name,
    url: input.url,
    payout_cents: input.payout_cents ?? 0,
    created_at: Date.now(),
  };
  await db
    .prepare(
      "INSERT INTO offers (id, user_id, network_id, name, url, payout_cents, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      offer.id,
      offer.user_id,
      offer.network_id,
      offer.name,
      offer.url,
      offer.payout_cents,
      offer.created_at,
    )
    .run();
  return offer;
}

export function campaignKeyFromName(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 32);
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const suffix = [...crypto.getRandomValues(new Uint8Array(8))]
    .map((b) => alphabet[b % alphabet.length])
    .join("");
  return `${base || "campaign"}_${suffix}`;
}

function isCampaignKeyConflict(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes("UNIQUE") && message.includes("campaign_key");
}

/** Runs `insert` with a fresh globally-unique campaign key, retrying on collisions. */
export async function withUniqueCampaignKey<T>(
  name: string,
  insert: (campaignKey: string) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await insert(campaignKeyFromName(name));
    } catch (err) {
      if (attempt >= 4 || !isCampaignKeyConflict(err)) throw err;
    }
  }
}

const OWNED_ENTITY_TABLES = {
  group: "groups",
  traffic_source: "traffic_sources",
  network: "affiliate_networks",
  lander: "landers",
  offer: "offers",
} as const;

export async function entityBelongsTo(
  db: D1Database,
  kind: keyof typeof OWNED_ENTITY_TABLES,
  entityId: string,
  userId: string,
): Promise<boolean> {
  const row = await db
    .prepare(`SELECT 1 AS ok FROM ${OWNED_ENTITY_TABLES[kind]} WHERE id = ? AND user_id = ?`)
    .bind(entityId, userId)
    .first<{ ok: number }>();
  return Boolean(row);
}

type EntityKind = keyof typeof OWNED_ENTITY_TABLES;

function deleteNotesStatement(db: D1Database, userId: string, kind: EntityKind, entityId: string) {
  return db
    .prepare("DELETE FROM entity_notes WHERE user_id = ? AND entity_type = ? AND entity_id = ?")
    .bind(userId, kind, entityId);
}

const UPDATABLE_COLUMNS: Record<Exclude<EntityKind, "group">, readonly string[]> = {
  traffic_source: ["name", "cost_type", "default_cost_cents", "postback_percent"],
  network: ["name"],
  lander: ["name", "url"],
  offer: ["name", "url", "network_id", "payout_cents"],
};

/** Applies a partial update (whitelisted columns only) to an owned entity row. False when not found. */
async function updateOwned(
  db: D1Database,
  kind: Exclude<EntityKind, "group">,
  entityId: string,
  userId: string,
  fields: Record<string, string | number | null | undefined>,
): Promise<boolean> {
  if (!(await entityBelongsTo(db, kind, entityId, userId))) return false;
  const entries = Object.entries(fields).filter(
    ([key, value]) => value !== undefined && UPDATABLE_COLUMNS[kind].includes(key),
  );
  if (entries.length === 0) return true;
  await db
    .prepare(
      `UPDATE ${OWNED_ENTITY_TABLES[kind]} SET ${entries.map(([key]) => `${key} = ?`).join(", ")}
       WHERE id = ? AND user_id = ?`,
    )
    .bind(...entries.map(([, value]) => value ?? null), entityId, userId)
    .run();
  return true;
}

async function count(db: D1Database, sql: string, ...params: string[]): Promise<number> {
  const row = await db.prepare(sql).bind(...params).first<{ n: number }>();
  return row?.n ?? 0;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export type DeleteResult = { ok: true } | { ok: false; status: 404 | 409; error: string };

/**
 * Deletes a traffic source, network, lander or offer. Refuses (409) while it is still
 * referenced by campaigns, offers, paths or recorded clicks so reports stay intact.
 */
export async function deleteEntity(
  db: D1Database,
  kind: Exclude<EntityKind, "group">,
  entityId: string,
  userId: string,
): Promise<DeleteResult> {
  if (!(await entityBelongsTo(db, kind, entityId, userId))) {
    return { ok: false, status: 404, error: "Not found" };
  }
  const blockers: string[] = [];
  if (kind === "traffic_source") {
    const n = await count(db, "SELECT COUNT(*) AS n FROM programs WHERE traffic_source_id = ?", entityId);
    if (n) blockers.push(`used by ${plural(n, "campaign")}`);
  }
  if (kind === "network") {
    const n = await count(db, "SELECT COUNT(*) AS n FROM offers WHERE network_id = ?", entityId);
    if (n) blockers.push(`used by ${plural(n, "offer")}`);
  }
  if (kind === "lander" || kind === "offer") {
    const column = kind === "lander" ? "lander_id" : "offer_id";
    const paths = await count(db, `SELECT COUNT(*) AS n FROM paths WHERE ${column} = ?`, entityId);
    if (paths) blockers.push(`used by ${plural(paths, "path")}`);
    const clicks = await count(db, `SELECT COUNT(*) AS n FROM clicks WHERE ${column} = ?`, entityId);
    if (clicks) blockers.push(`has ${plural(clicks, "tracked click")}`);
  }
  if (blockers.length > 0) {
    const label = { traffic_source: "Traffic source", network: "Network", lander: "Lander", offer: "Offer" }[kind];
    return {
      ok: false,
      status: 409,
      error: `${label} is ${blockers.join(" and ")}. Remove those references first.`,
    };
  }

  const statements: D1PreparedStatement[] = [deleteNotesStatement(db, userId, kind, entityId)];
  if (kind === "traffic_source" || kind === "network") {
    const column = kind === "traffic_source" ? "traffic_source_id" : "network_id";
    statements.push(
      db.prepare(`DELETE FROM postbacks WHERE ${column} = ? AND user_id = ?`).bind(entityId, userId),
    );
  }
  statements.push(
    db
      .prepare(`DELETE FROM ${OWNED_ENTITY_TABLES[kind]} WHERE id = ? AND user_id = ?`)
      .bind(entityId, userId),
  );
  await db.batch(statements);
  return { ok: true };
}

export async function updateTrafficSource(
  db: D1Database,
  userId: string,
  sourceId: string,
  input: Partial<Pick<TrafficSource, "name" | "cost_type" | "default_cost_cents" | "postback_percent">>,
): Promise<TrafficSource | null> {
  if (!(await updateOwned(db, "traffic_source", sourceId, userId, input))) return null;
  return (await listTrafficSources(db, userId)).find((row) => row.id === sourceId) ?? null;
}

export async function updateAffiliateNetwork(
  db: D1Database,
  userId: string,
  networkId: string,
  input: Partial<Pick<AffiliateNetwork, "name">>,
): Promise<AffiliateNetwork | null> {
  if (!(await updateOwned(db, "network", networkId, userId, input))) return null;
  return (await listAffiliateNetworks(db, userId)).find((row) => row.id === networkId) ?? null;
}

export async function updateLander(
  db: D1Database,
  userId: string,
  landerId: string,
  input: Partial<Pick<Lander, "name" | "url">>,
): Promise<Lander | null> {
  if (!(await updateOwned(db, "lander", landerId, userId, input))) return null;
  return (await listLanders(db, userId)).find((row) => row.id === landerId) ?? null;
}

export async function updateOffer(
  db: D1Database,
  userId: string,
  offerId: string,
  input: Partial<Pick<Offer, "name" | "url" | "network_id" | "payout_cents">>,
): Promise<Offer | null> {
  if (!(await updateOwned(db, "offer", offerId, userId, input))) return null;
  return (await listOffers(db, userId)).find((row) => row.id === offerId) ?? null;
}
