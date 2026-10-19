/** Report "group by" dimensions, in the order and sections shown in selects. */
export type DimensionOption = { value: string; label: string; group: string };

export const REPORT_DIMENSIONS: DimensionOption[] = [
  { value: "campaign", label: "Campaign", group: "Funnel" },
  { value: "traffic_source", label: "Traffic source", group: "Funnel" },
  { value: "path", label: "Path", group: "Funnel" },
  { value: "lander", label: "Lander", group: "Funnel" },
  { value: "offer", label: "Offer", group: "Funnel" },
  { value: "network", label: "Affiliate network", group: "Funnel" },
  { value: "affiliate", label: "Affiliate", group: "Funnel" },
  { value: "date", label: "Date", group: "Time" },
  { value: "hour", label: "Hour of day", group: "Time" },
  { value: "weekday", label: "Day of week", group: "Time" },
  { value: "week", label: "Week", group: "Time" },
  { value: "month", label: "Month", group: "Time" },
  { value: "country", label: "Country", group: "Geo" },
  { value: "region", label: "Region", group: "Geo" },
  { value: "city", label: "City", group: "Geo" },
  { value: "isp", label: "ISP", group: "Geo" },
  { value: "device_type", label: "Device type", group: "Device" },
  { value: "os", label: "OS", group: "Device" },
  { value: "browser", label: "Browser", group: "Device" },
  { value: "user_agent", label: "User agent", group: "Device" },
  { value: "ip", label: "IP", group: "Visitor" },
  { value: "ip_range", label: "IPv4 range (1.2.3.xxx)", group: "Visitor" },
  { value: "uniqueness", label: "Unique / repeat", group: "Visitor" },
  { value: "bot", label: "Bot / human", group: "Visitor" },
  { value: "referrer_domain", label: "Referrer", group: "Visitor" },
  { value: "external_id", label: "External ID", group: "Tokens" },
  ...Array.from({ length: 10 }, (_, i) => ({
    value: `sub${i + 1}`,
    label: `Sub ${i + 1}`,
    group: "Tokens",
  })),
];

export function dimensionLabel(value: string): string {
  return REPORT_DIMENSIONS.find((d) => d.value === value)?.label ?? value;
}

/** Options split into `<optgroup>` sections, keeping their order. */
export function groupOptions<T extends { group?: string }>(options: T[]): Array<[string, T[]]> {
  const sections = new Map<string, T[]>();
  for (const option of options) {
    const key = option.group ?? "";
    sections.set(key, [...(sections.get(key) ?? []), option]);
  }
  return [...sections.entries()];
}
