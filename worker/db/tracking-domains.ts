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
};

const COLUMNS = "id, user_id, hostname, created_at, cf_hostname_id, cf_status, cf_ssl_status, cf_errors, checked_at";

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

export async function getTrackingDomain(
  db: D1Database,
  domainId: string,
  userId: string,
): Promise<TrackingDomain | null> {
  return db
    .prepare(`SELECT ${COLUMNS} FROM tracking_domains WHERE id = ? AND user_id = ?`)
    .bind(domainId, userId)
    .first<TrackingDomain>();
}

export async function countTrackingDomains(db: D1Database, userId: string): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS total FROM tracking_domains WHERE user_id = ?")
    .bind(userId)
    .first<{ total: number }>();
  return row?.total ?? 0;
}

/** Stores the latest Cloudflare state of a domain (or only the check time and errors when it failed). */
export async function saveHostnameCheck(
  db: D1Database,
  domain: TrackingDomain,
  check: { hostname: CustomHostname } | { errors: string[] },
  now = Date.now(),
): Promise<TrackingDomain> {
  const next: TrackingDomain =
    "hostname" in check
      ? {
          ...domain,
          cf_hostname_id: check.hostname.id,
          cf_status: check.hostname.status ?? null,
          cf_ssl_status: check.hostname.ssl?.status ?? null,
          cf_errors: JSON.stringify(hostnameErrors(check.hostname)),
          checked_at: now,
        }
      : { ...domain, cf_errors: JSON.stringify(check.errors), checked_at: now };
  await db
    .prepare(
      `UPDATE tracking_domains SET cf_hostname_id = ?, cf_status = ?, cf_ssl_status = ?, cf_errors = ?, checked_at = ?
       WHERE id = ? AND user_id = ?`,
    )
    .bind(next.cf_hostname_id, next.cf_status, next.cf_ssl_status, next.cf_errors, next.checked_at, domain.id, domain.user_id)
    .run();
  return next;
}

/** Creates a domain; returns null when the hostname is already registered. */
export async function createTrackingDomain(
  db: D1Database,
  userId: string,
  hostname: string,
): Promise<TrackingDomain | null> {
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
  };
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
      `SELECT td.id, td.user_id, td.hostname, td.created_at, td.cf_hostname_id, td.cf_status, td.cf_ssl_status,
              td.cf_errors, td.checked_at
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
