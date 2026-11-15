import {
  claimHostnameCleanup,
  finishHostnameCleanup,
  isCustomHostnameInUse,
  listHostnameCleanup,
  releaseHostnameCleanup,
} from "../db/tracking-domains";
import { deleteCustomHostname, hostnameSetup, type HostnameSetup } from "./custom-hostnames";
import type { Env } from "../types";

/** Cloudflare deletions per hourly run, to stay well inside the Worker's subrequest budget. */
const BATCH = 50;

export type CleanupResult = "deleted" | "in_use" | "busy" | "failed";

/**
 * Deletes a custom hostname that no domain uses (its domain was removed while it was being set up).
 * The cleanup is claimed in the database first: while the claim is held no domain can save this
 * hostname, so the "unused" check below can't be overtaken by a domain adopting it. When Cloudflare
 * fails, the hostname stays queued and the hourly job retries it.
 */
export async function cleanupHostname(
  db: D1Database,
  setup: HostnameSetup,
  cfHostnameId: string,
  hostname: string,
): Promise<CleanupResult> {
  const claim = crypto.randomUUID();
  if (!(await claimHostnameCleanup(db, cfHostnameId, hostname, claim))) return "busy";
  if (await isCustomHostnameInUse(db, cfHostnameId)) {
    await finishHostnameCleanup(db, cfHostnameId, claim);
    return "in_use";
  }
  const removed = await deleteCustomHostname(setup, cfHostnameId);
  if (removed.ok) {
    await finishHostnameCleanup(db, cfHostnameId, claim);
    return "deleted";
  }
  await releaseHostnameCleanup(db, cfHostnameId, claim, removed.message);
  return "failed";
}

/** Hourly: retries queued hostname deletions until Cloudflare confirms them. */
export async function retryHostnameCleanup(env: Env): Promise<{ deleted: number; failed: number }> {
  const setup = hostnameSetup(env);
  if (!setup) return { deleted: 0, failed: 0 };
  let deleted = 0;
  let failed = 0;
  for (const item of await listHostnameCleanup(env.DB, BATCH)) {
    const result = await cleanupHostname(env.DB, setup, item.cf_hostname_id, item.hostname);
    if (result === "deleted") deleted++;
    if (result === "failed") failed++;
  }
  return { deleted, failed };
}
