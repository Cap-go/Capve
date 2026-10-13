/** Helpers for removing the legacy Cloudflare Access app (Capve now uses email/password sessions). */

/** @typedef {{ type: "public"; uri: string }} PublicDestination */

export const APP_NAME = "Capve";
/** Legacy Access app name on capve.app — still matched by findVeloAccessApp. */
export const LEGACY_APP_NAME = "Velo";

/**
 * Apex hosts (e.g. capve.app) also get www.{host}.
 * @param {string} appHost
 */
export function apexHostAliases(appHost) {
  const host = appHost.trim().toLowerCase();
  if (!host) return [];
  const parts = host.split(".");
  if (parts.length === 2) return [host, `www.${host}`];
  return [host];
}

/**
 * @param {Record<string, unknown>} app
 * @param {string} appHost
 */
export function appMatchesVeloInstall(app, appHost) {
  if (app.name === APP_NAME || app.name === LEGACY_APP_NAME) return true;

  const hosts = apexHostAliases(appHost);
  const destinations = /** @type {PublicDestination[] | undefined} */ (app.destinations);
  if (destinations?.some((d) => hosts.some((h) => d.uri === `${h}/app*` || d.uri === `${h}/app` || d.uri === `${h}/app/*`))) {
    return true;
  }

  const domain = typeof app.domain === "string" ? app.domain : "";
  return hosts.some(
    (h) => domain === `${h}/app` || domain === `${h}/app/*` || domain === `${h}/app*`,
  );
}

/**
 * @param {Record<string, unknown>[]} apps
 * @param {string} appHost
 */
export function findVeloAccessApp(apps, appHost) {
  return apps.find((app) => appMatchesVeloInstall(app, appHost));
}
