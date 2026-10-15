import { id } from "../lib/utils";

export type TrackingDomain = {
  id: string;
  user_id: string;
  hostname: string;
  created_at: number;
};

const HOSTNAME = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** Lowercase hostname without scheme/port/path, or null when invalid. */
export function normalizeHostname(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let value = raw.trim().toLowerCase();
  if (!value) return null;
  if (value.includes("://")) {
    try {
      value = new URL(value).hostname;
    } catch {
      return null;
    }
  }
  value = value.replace(/\.$/, "");
  return HOSTNAME.test(value) ? value : null;
}

export async function listTrackingDomains(
  db: D1Database,
  userId: string,
): Promise<TrackingDomain[]> {
  const { results } = await db
    .prepare(
      "SELECT id, user_id, hostname, created_at FROM tracking_domains WHERE user_id = ? ORDER BY hostname",
    )
    .bind(userId)
    .all<TrackingDomain>();
  return results ?? [];
}

export async function findTrackingDomainByHost(
  db: D1Database,
  hostname: string,
): Promise<TrackingDomain | null> {
  return db
    .prepare("SELECT id, user_id, hostname, created_at FROM tracking_domains WHERE hostname = ?")
    .bind(hostname.toLowerCase())
    .first<TrackingDomain>();
}

/** Creates a domain; returns null when the hostname is already registered. */
export async function createTrackingDomain(
  db: D1Database,
  userId: string,
  hostname: string,
): Promise<TrackingDomain | null> {
  const domain: TrackingDomain = { id: id("dom"), user_id: userId, hostname, created_at: Date.now() };
  const result = await db
    .prepare(
      "INSERT OR IGNORE INTO tracking_domains (id, user_id, hostname, created_at) VALUES (?, ?, ?, ?)",
    )
    .bind(domain.id, domain.user_id, domain.hostname, domain.created_at)
    .run();
  return result.meta.changes ? domain : null;
}

export async function deleteTrackingDomain(
  db: D1Database,
  domainId: string,
  userId: string,
): Promise<boolean> {
  const [, result] = await db.batch([
    db
      .prepare("UPDATE programs SET tracking_domain_id = NULL WHERE tracking_domain_id = ? AND user_id = ?")
      .bind(domainId, userId),
    db.prepare("DELETE FROM tracking_domains WHERE id = ? AND user_id = ?").bind(domainId, userId),
  ]);
  return (result.meta.changes ?? 0) > 0;
}

/** Sets (or clears with null) the tracking domain of a campaign. */
export async function setCampaignTrackingDomain(
  db: D1Database,
  programId: string,
  userId: string,
  domainId: string | null,
): Promise<"ok" | "campaign_not_found" | "domain_not_found"> {
  if (domainId) {
    const domain = await db
      .prepare("SELECT id FROM tracking_domains WHERE id = ? AND user_id = ?")
      .bind(domainId, userId)
      .first();
    if (!domain) return "domain_not_found";
  }
  const result = await db
    .prepare("UPDATE programs SET tracking_domain_id = ? WHERE id = ? AND user_id = ?")
    .bind(domainId, programId, userId)
    .run();
  return result.meta.changes ? "ok" : "campaign_not_found";
}

export async function getCampaignTrackingDomain(
  db: D1Database,
  programId: string,
): Promise<TrackingDomain | null> {
  return db
    .prepare(
      `SELECT td.id, td.user_id, td.hostname, td.created_at
       FROM programs p JOIN tracking_domains td ON td.id = p.tracking_domain_id AND td.user_id = p.user_id
       WHERE p.id = ?`,
    )
    .bind(programId)
    .first<TrackingDomain>();
}

/** Base URL for a campaign's tracking links: its tracking domain, else APP_URL. */
export async function campaignTrackingBaseUrl(
  db: D1Database,
  appUrl: string,
  programId: string,
): Promise<string> {
  const domain = await getCampaignTrackingDomain(db, programId);
  return domain ? `https://${domain.hostname}` : appUrl;
}
