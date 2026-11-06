/** Campaign editor sections, addressed by campaign id and section in the path. */
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

/** Each campaign and editor section has its own bookmarkable URL. */
export function campaignHref(id: string, section: CampaignSection = "performance"): string {
  return `/app/campaigns/${encodeURIComponent(id)}/${section}`;
}
