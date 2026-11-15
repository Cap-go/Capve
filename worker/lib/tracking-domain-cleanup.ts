import {
  finishHostnameCleanup,
  isCustomHostnameInUse,
  listHostnameCleanup,
  queueHostnameCleanup,
} from "../db/tracking-domains";
import { deleteCustomHostname, hostnameSetup, type HostnameSetup } from "./custom-hostnames";
import type { Env } from "../types";

/** Cloudflare deletions per run, to stay well inside the Worker's subrequest budget. */
const BATCH = 50;

/**
 * Deletes a custom hostname that no domain uses (its domain was removed while it was being set
 * up). When Cloudflare fails, the hostname is queued and the hourly job retries it.
 */
export async function discardHostname(db: D1Database, setup: HostnameSetup, cfHostnameId: string, hostname: string) {
  if (await isCustomHostnameInUse(db, cfHostnameId)) return;
  const removed = await deleteCustomHostname(setup, cfHostnameId);
  if (!removed.ok) await queueHostnameCleanup(db, cfHostnameId, hostname, removed.message);
}

/** Hourly: retries queued hostname deletions until Cloudflare confirms them. */
export async function retryHostnameCleanup(env: Env): Promise<{ deleted: number; failed: number }> {
  const setup = hostnameSetup(env);
  if (!setup) return { deleted: 0, failed: 0 };
  let deleted = 0;
  let failed = 0;
  for (const item of await listHostnameCleanup(env.DB, BATCH)) {
    // A domain added again for the same hostname may have taken this hostname over.
    if (await isCustomHostnameInUse(env.DB, item.cf_hostname_id)) {
      await finishHostnameCleanup(env.DB, item.cf_hostname_id);
      continue;
    }
    const removed = await deleteCustomHostname(setup, item.cf_hostname_id);
    if (removed.ok) {
      await finishHostnameCleanup(env.DB, item.cf_hostname_id);
      deleted++;
    } else {
      await queueHostnameCleanup(env.DB, item.cf_hostname_id, item.hostname, removed.message);
      failed++;
    }
  }
  return { deleted, failed };
}
