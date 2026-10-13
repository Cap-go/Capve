export const APP_NAME: string;
export const LEGACY_APP_NAME: string;

export function apexHostAliases(appHost: string): string[];
export function appMatchesVeloInstall(
  app: Record<string, unknown>,
  appHost: string,
): boolean;
export function findVeloAccessApp(
  apps: Record<string, unknown>[],
  appHost: string,
): Record<string, unknown> | undefined;
