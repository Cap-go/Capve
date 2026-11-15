import type { Env } from "../types";

const API = "https://api.cloudflare.com/client/v4";

/**
 * Automatic tracking domain setup through Cloudflare for SaaS custom hostnames.
 * Null when the install isn't configured for it: domains are then set up by hand.
 */
export type HostnameSetup = { zoneId: string; token: string; target: string };

export function hostnameSetup(
  env: Pick<Env, "TRACKING_DOMAIN_ZONE_ID" | "TRACKING_DOMAIN_API_TOKEN" | "TRACKING_DOMAIN_CNAME_TARGET">,
): HostnameSetup | null {
  const zoneId = env.TRACKING_DOMAIN_ZONE_ID?.trim();
  const token = env.TRACKING_DOMAIN_API_TOKEN?.trim();
  const target = env.TRACKING_DOMAIN_CNAME_TARGET?.trim().toLowerCase().replace(/\.$/, "");
  return zoneId && token && target ? { zoneId, token, target } : null;
}

export type CustomHostname = {
  id: string;
  hostname: string;
  status?: string;
  ssl?: { status?: string; validation_errors?: Array<{ message?: string }> };
  verification_errors?: string[];
};

export type CloudflareResult<T> =
  | { ok: true; result: T }
  | { ok: false; status: number; code?: number; message: string };

/** HTTP validation: Cloudflare issues the certificate as soon as the customer's CNAME is live. */
const SSL = { method: "http", type: "dv", settings: { min_tls_version: "1.2" } };

/** Duplicate custom hostname (already registered on the zone). */
const DUPLICATE_CODE = 1406;

async function call<T>(
  setup: HostnameSetup,
  method: string,
  path: string,
  body?: unknown,
): Promise<CloudflareResult<T>> {
  let response: Response;
  try {
    response = await fetch(`${API}/zones/${encodeURIComponent(setup.zoneId)}/custom_hostnames${path}`, {
      method,
      headers: { Authorization: `Bearer ${setup.token}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return { ok: false, status: 0, message: "Cloudflare API unreachable" };
  }
  const data = await response
    .json<{ success?: boolean; result?: T; errors?: Array<{ code?: number; message?: string }> }>()
    .catch(() => null);
  if (response.ok && data?.success && data.result !== undefined) return { ok: true, result: data.result };
  const error = data?.errors?.[0];
  return {
    ok: false,
    status: response.status,
    code: error?.code,
    message: error?.message || `Cloudflare API error ${response.status}`,
  };
}

/** Registers the hostname, or returns the existing custom hostname when it's already on the zone. */
export async function createCustomHostname(
  setup: HostnameSetup,
  hostname: string,
): Promise<CloudflareResult<CustomHostname>> {
  const created = await call<CustomHostname>(setup, "POST", "", { hostname, ssl: SSL });
  if (created.ok || (created.code !== DUPLICATE_CODE && created.status !== 409)) return created;
  const found = await call<CustomHostname[]>(setup, "GET", `?hostname=${encodeURIComponent(hostname)}`);
  if (!found.ok) return found;
  const match = found.result.find((entry) => entry.hostname === hostname);
  return match ? { ok: true, result: match } : created;
}

export function getCustomHostname(setup: HostnameSetup, id: string): Promise<CloudflareResult<CustomHostname>> {
  return call<CustomHostname>(setup, "GET", `/${encodeURIComponent(id)}`);
}

/** Sending the SSL settings again restarts domain control validation (after a timeout). */
export function retryValidation(setup: HostnameSetup, id: string): Promise<CloudflareResult<CustomHostname>> {
  return call<CustomHostname>(setup, "PATCH", `/${encodeURIComponent(id)}`, { ssl: SSL });
}

/** Deletes the custom hostname; one that's already gone counts as deleted. */
export async function deleteCustomHostname(setup: HostnameSetup, id: string): Promise<CloudflareResult<null>> {
  const result = await call<unknown>(setup, "DELETE", `/${encodeURIComponent(id)}`);
  return result.ok || result.status === 404 ? { ok: true, result: null } : result;
}

export type DomainStatus = "manual" | "pending" | "active" | "failed";

const FAILED_HOSTNAME = new Set([
  "blocked",
  "pending_blocked",
  "moved",
  "deleted",
  "pending_deletion",
  "test_blocked",
  "test_failed",
]);
const FAILED_SSL = new Set(["expired", "deleted", "pending_deletion", "deactivating", "inactive"]);

export function isValidationTimeout(sslStatus: string | null | undefined): boolean {
  return !!sslStatus && sslStatus.endsWith("_timed_out");
}

/** manual: set up by hand. active: hostname and certificate live. failed: needs the user. */
export function domainStatus(domain: {
  cf_hostname_id: string | null;
  cf_status: string | null;
  cf_ssl_status: string | null;
}): DomainStatus {
  if (!domain.cf_hostname_id) return "manual";
  if (domain.cf_status === "active" && domain.cf_ssl_status === "active") return "active";
  const ssl = domain.cf_ssl_status ?? "";
  if (FAILED_HOSTNAME.has(domain.cf_status ?? "") || FAILED_SSL.has(ssl) || isValidationTimeout(ssl)) {
    return "failed";
  }
  return "pending";
}

/** Hostname and certificate errors Cloudflare reported, without duplicates. */
export function hostnameErrors(hostname: CustomHostname): string[] {
  const messages = [
    ...(hostname.verification_errors ?? []),
    ...(hostname.ssl?.validation_errors ?? []).map((error) => error.message ?? ""),
  ];
  return [...new Set(messages.map((message) => message.trim()).filter(Boolean))];
}
