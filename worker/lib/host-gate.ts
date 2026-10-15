import type { MiddlewareHandler } from "hono";
import { findTrackingDomainByHost } from "../db/tracking-domains";
import type { Env } from "../types";

/** Paths served on custom tracking domains. Everything else stays on the app host. */
export function isTrackingPath(pathname: string): boolean {
  return (
    pathname.startsWith("/r/") ||
    pathname.startsWith("/c/") ||
    pathname.startsWith("/lp/") ||
    pathname === "/click" ||
    pathname.startsWith("/click/")
  );
}

const ALWAYS_ALLOWED = new Set(["capve.app", "www.capve.app", "localhost", "127.0.0.1", "[::1]"]);

/** Hosts serving the full app: APP_URL, capve.app, localhost and the deploy-button *.workers.dev. */
export function isAppHost(hostname: string, env: Pick<Env, "APP_URL">): boolean {
  const host = hostname.toLowerCase();
  if (ALWAYS_ALLOWED.has(host) || host.endsWith(".workers.dev")) return true;
  try {
    return !!env.APP_URL && new URL(env.APP_URL).hostname.toLowerCase() === host;
  } catch {
    return false;
  }
}

/**
 * Custom tracking domains (tracking_domains table) only serve /r, /c, /lp and /click.
 * Unknown hosts get 404.
 */
export const hostGate: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const url = new URL(c.req.url);
  if (isAppHost(url.hostname, c.env)) return next();
  if (isTrackingPath(url.pathname) && (await findTrackingDomainByHost(c.env.DB, url.hostname))) {
    return next();
  }
  return c.text("Not found", 404);
};
