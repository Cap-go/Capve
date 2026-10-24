/** Campaign editor sections. The path segment is the section; the campaign id is `?id=`. */
export const CAMPAIGN_SECTIONS = [
  { key: "performance", label: "Performance" },
  { key: "general", label: "General information" },
  { key: "targeting", label: "Targeting" },
  { key: "paths", label: "Paths" },
  { key: "budget", label: "Budget" },
  { key: "optimization", label: "Optimization" },
  { key: "tracking", label: "Tracking" },
] as const;

export type CampaignStep = (typeof CAMPAIGN_SECTIONS)[number]["key"];
export type CampaignSection = CampaignStep | "clicklog" | "conversions";

const SECTIONS = new Set<string>([
  ...CAMPAIGN_SECTIONS.map((section) => section.key),
  "clicklog",
  "conversions",
]);

export function isCampaignSection(value: string | undefined): value is CampaignSection {
  return value != null && SECTIONS.has(value);
}

/** Campaign list. `/app` redirects here so the list has its own address. */
export const CAMPAIGNS_LIST_PATH = "/app/campaigns";

/** `/app/campaign/targeting?id=prg_…` — section in the path, campaign id in the query. */
export function campaignHref(id: string, section: CampaignSection = "performance"): string {
  return `/app/campaign/${section}?id=${encodeURIComponent(id)}`;
}
