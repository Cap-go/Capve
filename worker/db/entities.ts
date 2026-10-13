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

export async function deleteGroup(db: D1Database, groupId: string, userId: string): Promise<boolean> {
  const result = await db
    .prepare("DELETE FROM groups WHERE id = ? AND user_id = ?")
    .bind(groupId, userId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function listTrafficSources(
  db: D1Database,
  userId: string,
): Promise<TrafficSource[]> {
  const { results } = await db
    .prepare(
      `SELECT id, user_id, name, cost_type, default_cost_cents, postback_percent,
              s2s_postback_url, created_at
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
    s2s_postback_url?: string | null;
  },
): Promise<TrafficSource> {
  const source: TrafficSource = {
    id: id("src"),
    user_id: userId,
    name: input.name,
    cost_type: input.cost_type ?? "cpc",
    default_cost_cents: input.default_cost_cents ?? 0,
    postback_percent: input.postback_percent ?? 100,
    s2s_postback_url: input.s2s_postback_url ?? null,
    created_at: Date.now(),
  };
  await db
    .prepare(
      `INSERT INTO traffic_sources
       (id, user_id, name, cost_type, default_cost_cents, postback_percent, s2s_postback_url, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      source.id,
      source.user_id,
      source.name,
      source.cost_type,
      source.default_cost_cents,
      source.postback_percent,
      source.s2s_postback_url,
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
      "SELECT id, user_id, name, postback_url_template, created_at FROM affiliate_networks WHERE user_id = ? ORDER BY name",
    )
    .bind(userId)
    .all<AffiliateNetwork>();
  return results ?? [];
}

export async function createAffiliateNetwork(
  db: D1Database,
  userId: string,
  input: { name: string; postback_url_template?: string | null },
): Promise<AffiliateNetwork> {
  const network: AffiliateNetwork = {
    id: id("net"),
    user_id: userId,
    name: input.name,
    postback_url_template: input.postback_url_template ?? null,
    created_at: Date.now(),
  };
  await db
    .prepare(
      "INSERT INTO affiliate_networks (id, user_id, name, postback_url_template, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(network.id, network.user_id, network.name, network.postback_url_template, network.created_at)
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
