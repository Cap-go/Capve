import { hostnameErrors, type CustomHostname } from "../lib/custom-hostnames";
import { id } from "../lib/utils";

export type TrackingDomain = {
  id: string;
  user_id: string;
  hostname: string;
  created_at: number;
  /** Cloudflare custom hostname id; null when the domain was set up by hand. */
  cf_hostname_id: string | null;
  cf_status: string | null;
  cf_ssl_status: string | null;
  /** JSON array of Cloudflare verification errors. */
  cf_errors: string | null;
  checked_at: number | null;
  /** Set while the domain is being removed. */
  deleting_at: number | null;
};

const COLUMNS =
  "id, user_id, hostname, created_at, cf_hostname_id, cf_status, cf_ssl_status, cf_errors, checked_at, deleting_at";

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
      `SELECT ${COLUMNS} FROM tracking_domains WHERE user_id = ? ORDER BY hostname`,
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
    .prepare(`SELECT ${COLUMNS} FROM tracking_domains WHERE hostname = ?`)
    .bind(hostname.toLowerCase())
    .first<TrackingDomain>();
}

/**
 * Stores the latest Cloudflare state of a domain. A failed check only records its errors and time:
 * it never writes back hostname fields from its own snapshot, which a parallel check may have
 * replaced. Returns the row as stored, or null when the domain was removed, or is being removed.
 */
export async function saveHostnameCheck(
  db: D1Database,
  domain: TrackingDomain,
  check: { hostname: CustomHostname } | { errors: string[] },
  now = Date.now(),
): Promise<TrackingDomain | null> {
  if (!("hostname" in check)) {
    return db
      .prepare(
        `UPDATE tracking_domains SET cf_errors = ?, checked_at = ?
         WHERE id = ? AND user_id = ? AND deleting_at IS NULL RETURNING ${COLUMNS}`,
      )
      .bind(JSON.stringify(check.errors), now, domain.id, domain.user_id)
      .first<TrackingDomain>();
  }
  const { hostname } = check;
  return db
    .prepare(
      `UPDATE tracking_domains SET cf_hostname_id = ?, cf_status = ?, cf_ssl_status = ?, cf_errors = ?, checked_at = ?
       WHERE id = ? AND user_id = ? AND deleting_at IS NULL RETURNING ${COLUMNS}`,
    )
    .bind(
      hostname.id,
      hostname.status ?? null,
      hostname.ssl?.status ?? null,
      JSON.stringify(hostnameErrors(hostname)),
      now,
      domain.id,
      domain.user_id,
    )
    .first<TrackingDomain>();
}

/**
 * Marks the domain as being removed and returns its Cloudflare hostname id as of that moment.
 * From then on saveHostnameCheck no longer writes to it, so any hostname a concurrent status
 * check creates is either returned here or cleaned up by that check. Null when not found.
 */
export async function beginTrackingDomainRemoval(
  db: D1Database,
  domainId: string,
  userId: string,
): Promise<{ cf_hostname_id: string | null } | null> {
  return db
    .prepare(
      "UPDATE tracking_domains SET deleting_at = ? WHERE id = ? AND user_id = ? RETURNING cf_hostname_id",
    )
    .bind(Date.now(), domainId, userId)
    .first<{ cf_hostname_id: string | null }>();
}

/** Undoes beginTrackingDomainRemoval when the Cloudflare hostname couldn't be deleted. */
export async function cancelTrackingDomainRemoval(db: D1Database, domainId: string, userId: string) {
  await db
    .prepare("UPDATE tracking_domains SET deleting_at = NULL WHERE id = ? AND user_id = ?")
    .bind(domainId, userId)
    .run();
}

/** Whether any domain still uses this Cloudflare custom hostname. */
export async function isCustomHostnameInUse(db: D1Database, cfHostnameId: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS used FROM tracking_domains WHERE cf_hostname_id = ? LIMIT 1")
    .bind(cfHostnameId)
    .first();
  return !!row;
}

/**
 * Creates a domain. With `limit`, the insert only happens while the account has fewer domains,
 * checked in the same statement so concurrent requests can't go past it.
 */
export async function createTrackingDomain(
  db: D1Database,
  userId: string,
  hostname: string,
  limit: number | null = null,
): Promise<TrackingDomain | "duplicate" | "limit"> {
  const domain: TrackingDomain = {
    id: id("dom"),
    user_id: userId,
    hostname,
    created_at: Date.now(),
    cf_hostname_id: null,
    cf_status: null,
    cf_ssl_status: null,
    cf_errors: null,
    checked_at: null,
    deleting_at: null,
  };
  const insert =
    limit === null
      ? db
          .prepare("INSERT OR IGNORE INTO tracking_domains (id, user_id, hostname, created_at) VALUES (?, ?, ?, ?)")
          .bind(domain.id, domain.user_id, domain.hostname, domain.created_at)
      : db
          .prepare(
            `INSERT OR IGNORE INTO tracking_domains (id, user_id, hostname, created_at)
             SELECT ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM tracking_domains WHERE user_id = ?) < ?`,
          )
          .bind(domain.id, domain.user_id, domain.hostname, domain.created_at, userId, limit);
  const result = await insert.run();
  if (result.meta.changes) return domain;
  const existing = await findTrackingDomainByHost(db, hostname);
  return existing || limit === null ? "duplicate" : "limit";
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
      `SELECT td.id, td.user_id, td.hostname, td.created_at, td.cf_hostname_id, td.cf_status, td.cf_ssl_status,
              td.cf_errors, td.checked_at, td.deleting_at
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
