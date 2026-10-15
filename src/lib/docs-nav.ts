export type DocPage = {
  slug: string;
  title: string;
  description: string;
};

export const DOC_PAGES: DocPage[] = [
  {
    slug: "",
    title: "Overview",
    description: "How Capve tracks clicks and records conversions",
  },
  {
    slug: "mcp",
    title: "MCP server",
    description: "Run Capve from Claude, Cursor or any AI assistant",
  },
  {
    slug: "postback",
    title: "Postback URL",
    description: "Binom-style S2S postback from affiliate networks",
  },
  {
    slug: "tracking-links",
    title: "Tracking links",
    description: "Affiliate links, redirects, and click counting",
  },
  {
    slug: "routing",
    title: "Routing rules & anti-fraud",
    description: "Rules by geo, device, time and more; weighted landers/offers; bots and safe page",
  },
  {
    slug: "browser-attribution",
    title: "Browser attribution",
    description: "Snippet, velo_ref parameter, and passing data to checkout",
  },
  {
    slug: "server-conversions",
    title: "Server-side conversions",
    description: "Post conversions from your backend or payment webhooks",
  },
  {
    slug: "api/convert",
    title: "POST /api/v1/convert",
    description: "Request fields, responses, and idempotency",
  },
];

export function docHref(slug: string): string {
  return slug ? `/docs/${slug}` : "/docs";
}
