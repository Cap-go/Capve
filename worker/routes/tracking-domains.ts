import { Hono } from "hono";
import {
  beginTrackingDomainRemoval,
  cancelTrackingDomainRemoval,
  createTrackingDomain,
  deleteTrackingDomain,
  isCustomHostnameInUse,
  listTrackingDomains,
  normalizeHostname,
  saveHostnameCheck,
  setCampaignTrackingDomain,
  type TrackingDomain,
} from "../db/tracking-domains";
import { requireUser, requireWrite } from "../lib/access";
import {
  createCustomHostname,
  deleteCustomHostname,
  domainStatus,
  getCustomHostname,
  type DomainStatus,
  hostnameSetup,
  isValidationTimeout,
  retryValidation,
  type HostnameSetup,
} from "../lib/custom-hostnames";
import { isAppHost } from "../lib/host-gate";
import type { Env } from "../types";

const MANUAL_HINT =
  "Point the hostname at this Worker: Cloudflare dashboard → Workers & Pages → your Capve Worker → Settings → Domains & Routes → Add Custom Domain (or a route hostname/*). Only /r, /c, /lp and /click are served on it.";

/** Each automatic domain is a Cloudflare custom hostname, which Cloudflare bills past its free quota. */
export const MAX_AUTOMATIC_DOMAINS = 20;
/** How often listing re-checks a domain with Cloudflare: pending ones often, live ones hourly. */
const RECHECK_PENDING_MS = 15_000;
const RECHECK_ACTIVE_MS = 60 * 60_000;

function setupHint(setup: HostnameSetup | null): string {
  if (!setup) return MANUAL_HINT;
  return `Add a CNAME record from the hostname to ${setup.target}. Capve issues the HTTPS certificate once the record is live, usually within a few minutes. Use a subdomain such as track.example.com: most DNS providers don't allow a CNAME on the root domain.`;
}

function parseErrors(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Status shown to the user. With automatic setup on, a domain without a Cloudflare hostname yet
 * (registration failed, or it is over the cap) is pending or failed, never manual, so the
 * dashboard keeps polling it and the next check retries.
 */
function statusOf(domain: TrackingDomain, setup: HostnameSetup | null, errors: string[]): DomainStatus {
  if (setup && !domain.cf_hostname_id) return errors.length > 0 ? "failed" : "pending";
  return domainStatus(domain);
}

/** API shape: setup status plus the DNS record the customer must add. */
function view(domain: TrackingDomain, setup: HostnameSetup | null) {
  const errors = parseErrors(domain.cf_errors);
  const status = statusOf(domain, setup, errors);
  return {
    id: domain.id,
    user_id: domain.user_id,
    hostname: domain.hostname,
    created_at: domain.created_at,
    status,
    ssl_status: domain.cf_ssl_status,
    dns_records:
      setup && status !== "manual" ? [{ type: "CNAME", name: domain.hostname, value: setup.target }] : [],
    errors,
    checked_at: domain.checked_at,
  };
}

function due(domain: TrackingDomain, now: number): boolean {
  if (!domain.checked_at) return true;
  const wait = domainStatus(domain) === "active" ? RECHECK_ACTIVE_MS : RECHECK_PENDING_MS;
  return now - domain.checked_at >= wait;
}

/**
 * Deletes a custom hostname this request created for a domain that was removed meanwhile, so it
 * isn't left billing on the zone. Skipped if a domain uses it (the hostname was added again).
 */
async function discardHostname(db: D1Database, setup: HostnameSetup, cfHostnameId: string) {
  if (await isCustomHostnameInUse(db, cfHostnameId)) return;
  await deleteCustomHostname(setup, cfHostnameId);
}

/**
 * Pulls the domain's state from Cloudflare. Registers domains that have no custom hostname yet
 * (added by hand before automatic setup was on, or deleted in Cloudflare) and restarts validation
 * after a timeout, so the domain goes live once its CNAME is in place. Returns null when the
 * domain was removed during the check.
 */
async function sync(db: D1Database, setup: HostnameSetup, domain: TrackingDomain, now: number) {
  let created = !domain.cf_hostname_id;
  let result = domain.cf_hostname_id
    ? await getCustomHostname(setup, domain.cf_hostname_id)
    : await createCustomHostname(setup, domain.hostname);
  if (!result.ok && result.status === 404 && domain.cf_hostname_id) {
    created = true;
    result = await createCustomHostname(setup, domain.hostname);
  }
  if (!result.ok) return saveHostnameCheck(db, domain, { errors: [result.message] }, now);
  let hostname = result.result;
  if (isValidationTimeout(hostname.ssl?.status)) {
    const retried = await retryValidation(setup, hostname.id);
    if (retried.ok) hostname = retried.result;
  }
  const saved = await saveHostnameCheck(db, domain, { hostname }, now);
  if (!saved && created) await discardHostname(db, setup, hostname.id);
  return saved;
}

/**
 * Removes a domain: marks it (status checks then stop attaching hostnames to it), deletes the
 * Cloudflare hostname it has at that moment, then the row. When Cloudflare fails, the mark is
 * cleared and the domain stays, so its hostname is never left without a row.
 */
async function removeDomain(
  db: D1Database,
  setup: HostnameSetup | null,
  domainId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; status: 404 | 409 | 502; message: string }> {
  const removal = await beginTrackingDomainRemoval(db, domainId, userId);
  if (!removal) return { ok: false, status: 404, message: "Not found" };
  if (removal.cf_hostname_id) {
    // Without credentials the hostname can't be deleted: keep the row, the only record of it.
    if (!setup) {
      await cancelTrackingDomainRemoval(db, domainId, userId);
      return {
        ok: false,
        status: 409,
        message:
          "This domain was set up automatically, but automatic setup is now off, so its Cloudflare hostname can't be deleted. Turn automatic setup back on (TRACKING_DOMAIN_* settings) to remove it.",
      };
    }
    const removed = await deleteCustomHostname(setup, removal.cf_hostname_id);
    if (!removed.ok) {
      await cancelTrackingDomainRemoval(db, domainId, userId);
      return { ok: false, status: 502, message: `Couldn't remove the domain from Cloudflare: ${removed.message}` };
    }
  }
  await deleteTrackingDomain(db, domainId, userId);
  return { ok: true };
}

const OVER_LIMIT = `Over the limit of ${MAX_AUTOMATIC_DOMAINS} automatically set up domains. Remove another domain to set this one up.`;

/**
 * The account's oldest MAX_AUTOMATIC_DOMAINS domains: the only ones a status check may register.
 * A domain's rank only goes down (rows are removed, and new rows are only added under the cap),
 * so parallel checks can never provision more than the cap.
 */
function firstDomains(domains: TrackingDomain[]): Set<string> {
  const oldest = [...domains].sort((a, b) => a.created_at - b.created_at || a.id.localeCompare(b.id));
  return new Set(oldest.slice(0, MAX_AUTOMATIC_DOMAINS).map((domain) => domain.id));
}

/** Hostnames that belong to the install itself: the app host, its subdomains and the CNAME target. */
function reservedHostname(hostname: string, env: Env, setup: HostnameSetup | null): boolean {
  if (isAppHost(hostname, env)) return true;
  if (!setup) return false;
  if (hostname === setup.target) return true;
  try {
    const appHost = new URL(env.APP_URL).hostname.toLowerCase();
    return hostname.endsWith(`.${appHost}`);
  } catch {
    return false;
  }
}

const trackingDomains = new Hono<{ Bindings: Env }>();

trackingDomains.get("/", async (c) => {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  const setup = hostnameSetup(c.env);
  let domains = await listTrackingDomains(c.env.DB, session.account_id);
  if (setup) {
    const now = Date.now();
    const provisionable = firstDomains(domains);
    const checked = await Promise.all(
      domains.map((domain) => {
        if (domain.deleting_at || !due(domain, now)) return domain;
        // Domains added by hand are only registered within the cap, oldest first.
        if (!domain.cf_hostname_id && !provisionable.has(domain.id)) {
          return saveHostnameCheck(c.env.DB, domain, { errors: [OVER_LIMIT] }, now);
        }
        return sync(c.env.DB, setup, domain, now);
      }),
    );
    domains = checked.filter((domain): domain is TrackingDomain => domain !== null);
  }
  return c.json({
    tracking_domains: domains.map((domain) => view(domain, setup)),
    automatic: !!setup,
    cname_target: setup?.target ?? null,
    setup: setupHint(setup),
  });
});

trackingDomains.post("/", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;

  const body = await c.req.json<{ hostname?: unknown }>().catch(() => ({}) as { hostname?: unknown });
  const hostname = normalizeHostname(body.hostname);
  if (!hostname) return c.json({ error: "hostname must be a domain like track.example.com" }, 400);
  const setup = hostnameSetup(c.env);
  if (reservedHostname(hostname, c.env, setup)) {
    return c.json({ error: "This hostname already serves the app" }, 400);
  }

  const inserted = await createTrackingDomain(
    c.env.DB,
    session.account_id,
    hostname,
    setup ? MAX_AUTOMATIC_DOMAINS : null,
  );
  if (inserted === "duplicate") return c.json({ error: "Hostname already registered" }, 409);
  if (inserted === "limit") {
    return c.json({ error: `An account can have up to ${MAX_AUTOMATIC_DOMAINS} tracking domains` }, 400);
  }
  let domain = inserted;

  if (setup) {
    const created = await createCustomHostname(setup, hostname);
    if (!created.ok) {
      // A status check may have provisioned the new row meanwhile: remove it the same way as DELETE.
      await removeDomain(c.env.DB, setup, domain.id, session.account_id);
      const userError = created.status >= 400 && created.status < 500 && created.status !== 401 && created.status !== 403;
      return c.json(
        { error: `Cloudflare couldn't set up ${hostname}: ${created.message}` },
        userError ? 400 : 502,
      );
    }
    const saved = await saveHostnameCheck(c.env.DB, domain, { hostname: created.result });
    if (!saved) {
      await discardHostname(c.env.DB, setup, created.result.id);
      return c.json({ error: `${hostname} was removed while it was being set up` }, 409);
    }
    domain = saved;
  }
  return c.json({ tracking_domain: view(domain, setup), setup: setupHint(setup) }, 201);
});

trackingDomains.delete("/:id", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;
  const removed = await removeDomain(c.env.DB, hostnameSetup(c.env), c.req.param("id"), session.account_id);
  if (removed.ok) return c.json({ ok: true });
  return c.json({ error: removed.message }, removed.status);
});

/** Pick the tracking domain of a campaign (null = default app URL). */
trackingDomains.put("/campaigns/:campaignId", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;

  const body = await c.req
    .json<{ tracking_domain_id?: unknown }>()
    .catch(() => ({}) as { tracking_domain_id?: unknown });
  const raw = body.tracking_domain_id;
  if (raw !== null && raw !== undefined && typeof raw !== "string") {
    return c.json({ error: "tracking_domain_id must be a string or null" }, 400);
  }
  const domainId = typeof raw === "string" && raw.trim() ? raw.trim() : null;
  const result = await setCampaignTrackingDomain(
    c.env.DB,
    c.req.param("campaignId"),
    session.account_id,
    domainId,
  );
  if (result === "campaign_not_found") return c.json({ error: "Not found" }, 404);
  if (result === "domain_not_found") return c.json({ error: "Invalid tracking_domain_id" }, 400);
  return c.json({ ok: true, tracking_domain_id: domainId });
});

export { trackingDomains };
