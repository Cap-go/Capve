import { campaignHref, isCampaignSection } from "./campaign-route";

export const DASHBOARD_PATHS = {
  campaigns: "/app/campaigns",
  reports: "/app/reports",
  sources: "/app/traffic-sources",
  networks: "/app/affiliate-networks",
  offers: "/app/offers",
  landers: "/app/landers",
  groups: "/app/groups",
  billing: "/app/billing",
  settings: "/app/settings",
  mcp: "/app/mcp",
  admin: "/app/admin",
} as const;

export type DashboardView = keyof typeof DASHBOARD_PATHS;

export function legacyDashboardHref(search: string, section?: string): string {
  const params = new URLSearchParams(search);
  const entity = params.get("entity") ?? "campaigns";
  const page: DashboardView = Object.hasOwn(DASHBOARD_PATHS, entity) ? entity as DashboardView : "campaigns";
  const id = params.get("id");
  params.delete("entity");
  params.delete("id");
  const path = id && (section || page === "campaigns")
    ? campaignHref(id, isCampaignSection(section) ? section : "performance")
    : DASHBOARD_PATHS[page];
  const query = params.toString();
  return `${path}${query ? `?${query}` : ""}`;
}
