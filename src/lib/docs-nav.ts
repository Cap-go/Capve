export type DocPage = {
  slug: keyof typeof import("./docs-content").DOC_CONTENT;
  group: "Get started" | "Tracking & attribution" | "Reference";
  title: string;
  description: string;
};

export const DOC_PAGES: DocPage[] = [
  {
    group: "Get started",
    slug: "",
    title: "Overview",
    description: "How Capve tracks clicks and records conversions",
  },
  {
    group: "Get started",
    slug: "click-ids",
    title: "Click IDs & SubIDs",
    description:
      "Internal vs external click IDs, SubID taxonomy, events and troubleshooting",
  },
  {
    group: "Get started",
    slug: "networks",
    title: "Connect an affiliate network",
    description:
      "Offer URL + postback with real values, a cheat sheet per network, and how to test",
  },
  {
    group: "Get started",
    slug: "campaigns",
    title: "Multi-provider campaigns",
    description:
      "One traffic source, several networks and offers, and the right postbacks",
  },
  {
    group: "Tracking & attribution",
    slug: "postback",
    title: "Postback URL",
    description: "Binom-style S2S postback from affiliate networks",
  },
  {
    group: "Tracking & attribution",
    slug: "traffic-sources",
    title: "Traffic sources & cost",
    description:
      "Source templates, named tokens, cost updates and cost API sync",
  },
  {
    group: "Tracking & attribution",
    slug: "tracking-links",
    title: "Tracking links",
    description: "Affiliate links, redirects, and click counting",
  },
  {
    group: "Tracking & attribution",
    slug: "routing",
    title: "Routing rules & anti-fraud",
    description:
      "Rules by geo, device, time and more; weighted landers/offers; bots and safe page",
  },
  {
    group: "Tracking & attribution",
    slug: "browser-attribution",
    title: "Browser attribution",
    description: "Snippet, velo_ref parameter, and passing data to checkout",
  },
  {
    group: "Tracking & attribution",
    slug: "server-conversions",
    title: "Server-side conversions",
    description: "Post conversions from your backend or payment webhooks",
  },
  {
    group: "Reference",
    slug: "accounts",
    title: "Accounts & impersonation",
    description: "Switch teams and use platform admin support access",
  },
  {
    group: "Reference",
    slug: "mcp",
    title: "MCP server",
    description: "Run Capve from Claude, Cursor or any AI assistant",
  },
  {
    group: "Reference",
    slug: "api/convert",
    title: "POST /api/v1/convert",
    description: "Request fields, responses, and idempotency",
  },
  {
    group: "Reference",
    slug: "glossary",
    title: "Glossary",
    description: "Click ID, SubID, postback, EPC, ROI and other tracking terms",
  },
];

export function docHref(slug: string): string {
  return slug ? `/docs/${slug}` : "/docs";
}

export const DOC_GROUPS = [
  "Get started",
  "Tracking & attribution",
  "Reference",
] as const;

export function docHeadingId(text: string, index: number): string {
  return `${text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}-${index}`;
}
