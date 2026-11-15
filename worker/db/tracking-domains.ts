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
  /** Token of the request removing the domain, and when it took the claim. */
  removal_claim: string | null;
  deleting_at: number | null;
};

const COLUMNS =
  "id, user_id, hostname, created_at, cf_hostname_id, cf_status, cf_ssl_status, cf_errors, checked_at, removal_claim, deleting_at";

/** A removal or cleanup claim older than this can be taken over (its request died). */
export const CLAIM_TTL_MS = 10 * 60_000;

export const HOSTNAME_BEING_DELETED =
  "Cloudflare is still deleting an earlier setup of this hostname. Capve tries again shortly.";

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
 * replaced. A hostname that a cleanup is deleting is not saved; the error says so and a later
 * check retries. Returns the row as stored, or null when the domain was removed or is being removed.
 */
export async function saveHostnameCheck(
  db: D1Database,
  domain: TrackingDomain,
  check: { hostname: CustomHostname } | { errors: string[] },
  now = Date.now(),
): Promise<TrackingDomain | null> {
  if ("hostname" in check) {
    const { hostname } = check;
    const saved = await db
      .prepare(
        `UPDATE tracking_domains SET cf_hostname_id = ?, cf_status = ?, cf_ssl_status = ?, cf_errors = ?, checked_at = ?
         WHERE id = ? AND user_id = ? AND removal_claim IS NULL
           AND NOT EXISTS (SELECT 1 FROM tracking_domain_cleanup WHERE cf_hostname_id = ? AND claim IS NOT NULL)
         RETURNING ${COLUMNS}`,
      )
      .bind(
        hostname.id,
        hostname.status ?? null,
        hostname.ssl?.status ?? null,
        JSON.stringify(hostnameErrors(hostname)),
        now,
        domain.id,
        domain.user_id,
        hostname.id,
      )
      .first<TrackingDomain>();
    if (saved) return saved;
    return saveHostnameCheck(db, domain, { errors: [HOSTNAME_BEING_DELETED] }, now);
  }
  return db
    .prepare(
      `UPDATE tracking_domains SET cf_errors = ?, checked_at = ?
       WHERE id = ? AND user_id = ? AND removal_claim IS NULL RETURNING ${COLUMNS}`,
    )
    .bind(JSON.stringify(check.errors), now, domain.id, domain.user_id)
    .first<TrackingDomain>();
}

/**
 * Claims the removal of a domain for one request and returns its Cloudflare hostname id as of that
 * moment. From then on saveHostnameCheck no longer writes to the row, so a hostname that a parallel
 * status check creates is either returned here or cleaned up by that check. "busy" when another
 * request is removing it; null when not found.
 */
export async function beginTrackingDomainRemoval(
  db: D1Database,
  domainId: string,
  userId: string,
  now = Date.now(),
): Promise<{ claim: string; cf_hostname_id: string | null } | "busy" | null> {
  const claim = crypto.randomUUID();
  const row = await db
    .prepare(
      `UPDATE tracking_domains SET removal_claim = ?, deleting_at = ?
       WHERE id = ? AND user_id = ? AND (removal_claim IS NULL OR deleting_at < ?) RETURNING cf_hostname_id`,
    )
    .bind(claim, now, domainId, userId, now - CLAIM_TTL_MS)
    .first<{ cf_hostname_id: string | null }>();
  if (row) return { claim, cf_hostname_id: row.cf_hostname_id };
  const exists = await db
    .prepare("SELECT 1 AS found FROM tracking_domains WHERE id = ? AND user_id = ?")
    .bind(domainId, userId)
    .first();
  return exists ? "busy" : null;
}

/** Gives the removal claim back (only its owner can) when the Cloudflare hostname couldn't be deleted. */
export async function cancelTrackingDomainRemoval(db: D1Database, domainId: string, claim: string) {
  await db
    .prepare("UPDATE tracking_domains SET removal_claim = NULL, deleting_at = NULL WHERE id = ? AND removal_claim = ?")
    .bind(domainId, claim)
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

export type HostnameCleanup = {
  cf_hostname_id: string;
  hostname: string;
  attempts: number;
  last_error: string | null;
  claim: string | null;
  created_at: number;
};

/**
 * Claims the cleanup of a custom hostname (adding it to the queue if needed). Returns false when
 * another cleanup holds it. While claimed, no domain can save this hostname (saveHostnameCheck).
 */
export async function claimHostnameCleanup(
  db: D1Database,
  cfHostnameId: string,
  hostname: string,
  claim: string,
  now = Date.now(),
): Promise<boolean> {
  const result = await db
    .prepare(
      `INSERT INTO tracking_domain_cleanup (cf_hostname_id, hostname, claim, claimed_at, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(cf_hostname_id) DO UPDATE SET claim = excluded.claim, claimed_at = excluded.claimed_at
       WHERE tracking_domain_cleanup.claim IS NULL OR tracking_domain_cleanup.claimed_at < ?`,
    )
    .bind(cfHostnameId, hostname, claim, now, now, now - CLAIM_TTL_MS)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

/** Leaves the hostname queued for the hourly retry, with the failure counted. */
export async function releaseHostnameCleanup(db: D1Database, cfHostnameId: string, claim: string, error: string) {
  await db
    .prepare(
      `UPDATE tracking_domain_cleanup SET claim = NULL, claimed_at = NULL, attempts = attempts + 1, last_error = ?
       WHERE cf_hostname_id = ? AND claim = ?`,
    )
    .bind(error, cfHostnameId, claim)
    .run();
}

export async function finishHostnameCleanup(db: D1Database, cfHostnameId: string, claim: string) {
  await db
    .prepare("DELETE FROM tracking_domain_cleanup WHERE cf_hostname_id = ? AND claim = ?")
    .bind(cfHostnameId, claim)
    .run();
}

export async function listHostnameCleanup(db: D1Database, limit: number): Promise<HostnameCleanup[]> {
  const { results } = await db
    .prepare(
      "SELECT cf_hostname_id, hostname, attempts, last_error, claim, created_at FROM tracking_domain_cleanup ORDER BY created_at LIMIT ?",
    )
    .bind(limit)
    .all<HostnameCleanup>();
  return results ?? [];
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
    removal_claim: null,
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

/** Deletes a domain whose removal `claim` this request holds; false when it lost the claim. */
export async function deleteTrackingDomain(
  db: D1Database,
  domainId: string,
  userId: string,
  claim: string,
): Promise<boolean> {
  const [, result] = await db.batch([
    db
      .prepare(
        `UPDATE programs SET tracking_domain_id = NULL WHERE tracking_domain_id = ? AND user_id = ?
           AND EXISTS (SELECT 1 FROM tracking_domains WHERE id = ? AND removal_claim = ?)`,
      )
      .bind(domainId, userId, domainId, claim),
    db
      .prepare("DELETE FROM tracking_domains WHERE id = ? AND user_id = ? AND removal_claim = ?")
      .bind(domainId, userId, claim),
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
              td.cf_errors, td.checked_at, td.removal_claim, td.deleting_at
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
