import type { Feature } from "./types";

/** Number of MCP tools in worker/mcp/tools.ts (tests/marketing.test.ts keeps it in sync). */
export const MCP_TOOL_COUNT = 93;

export const FEATURES: Feature[] = [
  {
    slug: "click-tracking",
    icon: "cursor",
    name: "Click tracking",
    summary: "Edge redirects with geo, device, ISP, 10 sub IDs and cost",
    title: "Click tracking software that runs on Cloudflare's edge",
    description:
      "Track every ad click with redirects served from Cloudflare's global network: geo, device, ISP, 10 sub IDs, unique and bot flags, external click IDs and per-click cost.",
    eyebrow: "Click tracking",
    h1: "Every click, recorded at the edge.",
    lead: "Capve campaign links redirect from Cloudflare's global network and keep the context you need to optimize: where the click came from, what it was shown and what it cost.",
    highlights: [
      {
        icon: "globe",
        title: "Edge redirects",
        body: "Links run as a Cloudflare Worker close to the visitor. There is no VPS to size, patch or scale before a traffic spike.",
      },
      {
        icon: "cursor",
        title: "Full click context",
        body: "Country, region, city and ISP from Cloudflare. Device, OS and browser from the user agent. Referrer and language too.",
      },
      {
        icon: "hash",
        title: "10 sub IDs and named tokens",
        body: "Map any traffic-source parameter to `sub1`–`sub10`, `external_id` or `cost`, and see your own labels in reports.",
      },
      {
        icon: "admin",
        title: "Unique and bot flags",
        body: "A first-party visitor id plus an IP and user-agent hash counts uniques. Blocklists and datacenter ASNs flag bots.",
      },
    ],
    sections: [
      {
        title: "Campaign links and affiliate links",
        body: "`/c/{key}` is the campaign link you paste into a traffic source. `/r/{code}` is a per-affiliate link for partner programs. Both add `click_id` to the destination, so the conversion can find its way back to the click.",
        code: {
          label: "Campaign link with traffic-source tokens",
          text: "https://capve.app/c/YOUR_KEY?zoneid={zoneid}&campaignid={campaignid}&cost={cost}&clickid={clickid}",
        },
      },
      {
        title: "URL macros on landers and offers",
        body: "Lander, offer and destination URLs are filled per click. Pass the click id to the network, forward a sub ID, or hand a lander its LP click link with `?next={lp_click_url}` and link the lander's call to action to that `next` value.",
        bullets: [
          "`{clickid}` / `{click_id}`, `{external_id}`",
          "`{campaign_id}`, `{offer_id}`, `{lander_id}`",
          "`{country}`, `{sub1}`–`{sub10}`, `{lp_click_url}`",
        ],
        code: { label: "Offer URL", text: "https://network.example/offer?aff_sub={clickid}&s2={sub1}&geo={country}" },
      },
      {
        title: "Cost on every click",
        body: "Send `cost` on the link for CPC and CPM sources, spread a daily total over matching clicks with the cost API, or let the hourly sync pull spend from Adcash with an encrypted API key.",
      },
      {
        title: "Your own tracking domain",
        body: "Serve `/r`, `/c`, `/lp` and `/click` from a hostname you own. Every other path on that host returns 404, so a tracking domain never exposes your dashboard.",
      },
    ],
    docs: [
      { label: "Tracking links", href: "/docs/tracking-links" },
      { label: "Click IDs and sub IDs", href: "/docs/click-ids" },
      { label: "Traffic sources and cost", href: "/docs/traffic-sources" },
    ],
    faqs: [
      {
        q: "Do I need a server like with Binom or Keitaro?",
        a: "No. Capve runs as a Cloudflare Worker with a D1 database. On capve.app we run it for you. If you self-host, it deploys to your own Cloudflare account. Either way there is no server to install, patch or scale.",
      },
      {
        q: "How are unique clicks counted?",
        a: "Per campaign, with a random first-party visitor id (`_capve_vid`) and a hash of the IP address and user agent.",
      },
      {
        q: "Which parameters can I capture?",
        a: "Up to ten sub IDs, an external click id and a cost per click. Named tokens on the traffic source map any query parameter to those slots and label them in reports.",
      },
      {
        q: "What happens to traffic when my plan's reports are locked?",
        a: "Nothing. Redirects, postbacks and conversion recording keep running. Only reports, logs and exports pause until the allowance resets or you upgrade.",
      },
    ],
  },
  {
    slug: "postback-tracking",
    icon: "swap",
    name: "S2S postbacks",
    summary: "Binom-style postbacks, events, status updates, outgoing postbacks",
    title: "S2S postback tracking with registration and FTD events",
    description:
      "Server-to-server conversion tracking: Binom-style postback URLs, registration and FTD events, status updates, a postback key, outgoing postbacks to traffic sources and a JSON convert API.",
    eyebrow: "Postback tracking",
    h1: "Conversions that arrive server to server.",
    lead: "Networks call Capve's postback URL with the click id. Capve records the conversion, updates it when the status changes and passes it on to your traffic source. No pixel, no third-party cookie.",
    highlights: [
      {
        icon: "swap",
        title: "Binom-style URL",
        body: "`cnv_id`, `payout`, `cnv_status` and `tx_id`: the same parameter names Binom users already saved in their networks.",
      },
      {
        icon: "hash",
        title: "Conversion events",
        body: "`event=registration`, `event=ftd`, `event=deposit`. Each event is its own conversion, with its own column in every report.",
      },
      {
        icon: "route",
        title: "Status updates",
        body: "A repeat postback for the same click moves `lead` to `sale` or `rejected`. Rejected revenue drops out of your totals.",
      },
      {
        icon: "lock",
        title: "Postback key",
        body: "Without your account key, payouts are capped to the offer payout. Turn on enforcement and keyless postbacks get a 403.",
      },
    ],
    sections: [
      {
        title: "Incoming postback",
        body: "Paste one URL into your affiliate network and replace the placeholders with the network's own macros. One URL per event if the network reports registrations and deposits separately.",
        code: {
          label: "Postback URL",
          text: "https://capve.app/click?cnv_id={clickid}&payout={payout}&cnv_status={status}&key=YOUR_POSTBACK_KEY",
        },
      },
      {
        title: "Outgoing postbacks",
        body: "Send conversions on to the places that need them, as many as you like per campaign.",
        bullets: [
          "**Campaign postbacks** fire on every status change.",
          "**Traffic-source postbacks** fire once when a conversion is approved, optionally for a share of conversions (`postback_percent`).",
          "**Network postbacks** fire once on approval for the offer's network.",
          "Any postback can be limited to a single event, such as `ftd`.",
        ],
      },
      {
        title: "Convert API for your own checkout",
        body: "Brands and SaaS teams can skip the network. Call `POST /api/v1/convert` with the campaign's `X-Program-Secret`. Calls are idempotent by order id, and CORS is enabled.",
        code: {
          label: "JSON convert API",
          text: `curl -X POST "https://capve.app/api/v1/convert" \\
  -H "Content-Type: application/json" \\
  -H "X-Program-Secret: sk_your_program_secret" \\
  -d '{"order_id":"in_2026_000145","amount":99.00,"click_id":"clk_from_redirect_url"}'`,
        },
      },
      {
        title: "Delivery log",
        body: "Every outgoing postback is logged with its response for 30 days, so you can prove a source was told about a sale.",
      },
    ],
    docs: [
      { label: "Postback URL", href: "/docs/postback" },
      { label: "Connect an affiliate network", href: "/docs/networks" },
      { label: "Server-side conversions", href: "/docs/server-conversions" },
    ],
    faqs: [
      {
        q: "What if a network sends the same postback twice?",
        a: "Without a transaction id, a repeat for the same click and event updates status and payout, and identical repeats are ignored. Distinct `tx_id` values create separate conversions, which suits rebills and repeat deposits.",
      },
      {
        q: "What if the postback has no payout?",
        a: "Capve uses the clicked offer's payout. Event postbacks such as registrations default to 0 unless you send a payout.",
      },
      {
        q: "Which networks have templates?",
        a: "TUNE (HasOffers), Everflow, CAKE, Affise, Cellxpert, Affilka (SOFTSWISS), MyAffiliates and a generic template. Any network that can call a URL works.",
      },
      {
        q: "Can I track sales without an affiliate network?",
        a: "Yes. Your backend calls the postback URL or the JSON convert API after a sale, for example from a Stripe webhook.",
      },
    ],
  },
  {
    slug: "traffic-routing",
    icon: "route",
    name: "Routing and rotation",
    summary: "Rules, paths, weighted landers and offers, LP clicks",
    title: "Traffic routing rules, lander and offer rotation (TDS)",
    description:
      "Route each click by geo, device, OS, browser, ISP, language, time or sub ID. Weighted, sticky, pinned or top-to-bottom rotation across landers and offers, with LP click tracking.",
    eyebrow: "Routing",
    h1: "Send every click where it converts best.",
    lead: "Rules decide which path a click takes. Paths split traffic across landers and offers by weight. Capve stores what each click was shown, so the split test reads itself.",
    highlights: [
      {
        icon: "route",
        title: "Ordered rules",
        body: "Match on geo, device, OS, browser, ISP or ASN, language, connection, bot flag, referrer, IP or CIDR, weekday, hour and sub IDs.",
      },
      {
        icon: "chevrons",
        title: "Four rotation modes",
        body: "Weighted, sticky (a returning visitor sees the same path), pinned, or top to bottom.",
      },
      {
        icon: "landers",
        title: "Weighted landers and offers",
        body: "One path holds several landers and offers with their own weights. The chosen pair is stored on the click.",
      },
      {
        icon: "cursor",
        title: "LP click tracking",
        body: "Add `?next={lp_click_url}` to the lander URL and link the lander's CTA to that `next` value. Capve marks the LP click and sends the visitor to the click's offer.",
      },
    ],
    sections: [
      {
        title: "Rules, then the default pool",
        body: "Each campaign has ordered rules. Conditions inside a rule are AND-ed, each an `in` or `not in` list. The first rule that matches uses its own paths, and everything else falls through to the default pool. Hour and weekday conditions use the rule's own timezone.",
        bullets: [
          "Mobile traffic from DE, AT and CH goes to the German lander.",
          "Bots and datacenter IPs go to a safe page.",
          "Weekend nights in the advertiser's timezone go to a different offer.",
        ],
      },
      {
        title: "Paths for every funnel",
        body: "A path is a direct URL, an offer, or a lander followed by an offer. Mix them in one campaign to compare a pre-lander against direct linking.",
      },
      {
        title: "Split tests you can read",
        body: "Because each click stores its path, lander and offer, the grouped report compares them directly: clicks, LP CTR, conversions, EPC and ROI per variant.",
      },
    ],
    docs: [
      { label: "Routing rules and anti-fraud", href: "/docs/routing" },
      { label: "Multi-provider campaigns", href: "/docs/campaigns" },
    ],
    faqs: [
      {
        q: "Is Capve a TDS?",
        a: "Yes, in the sense media buyers use the word: it distributes traffic by rules and weights before the visitor reaches a lander or offer. It only redirects to destinations you configured, never to an arbitrary URL.",
      },
      {
        q: "Can I change weights without touching the traffic source?",
        a: "Yes. The campaign link stays the same. Edit weights, rules or paths in the dashboard, over the API or from your AI assistant, and the next click uses them.",
      },
      {
        q: "Can I copy a campaign to a new geo?",
        a: "Yes. Clone a campaign with its paths and rules, then edit what differs.",
      },
    ],
  },
  {
    slug: "anti-fraud",
    icon: "admin",
    name: "Bot filtering",
    summary: "Blocklists, datacenter ASNs and safe pages",
    title: "Bot filtering and click fraud protection for paid traffic",
    description:
      "Flag bot clicks with account blocklists for IPs, CIDR ranges, ASNs and user agents, an optional datacenter-ASN filter and a per-campaign safe page. Bots stay out of your conversion rates.",
    eyebrow: "Anti-fraud",
    h1: "Keep bots out of your numbers.",
    lead: "Capve flags suspicious clicks before they reach an offer. Route them like everyone else, or send them to a safe page, and judge your sources on human traffic.",
    highlights: [
      {
        icon: "admin",
        title: "Account blocklist",
        body: "Block IP addresses, CIDR ranges, ASNs and user-agent substrings once, for every campaign.",
      },
      {
        icon: "globe",
        title: "Datacenter ASN flag",
        body: "Optionally treat clicks from hosting and cloud networks as bots.",
      },
      {
        icon: "page",
        title: "Safe page",
        body: "Per campaign, send flagged clicks to a safe page instead of your lander and offer.",
      },
      {
        icon: "reports",
        title: "Bot column in reports",
        body: "Bots are counted, not hidden. See which zones send them, then blacklist those zones.",
      },
    ],
    sections: [
      {
        title: "How a click gets flagged",
        body: "Each click is checked against your blocklist and, if enabled, the datacenter-ASN list. A match sets `is_bot` on the click. The campaign's bot action then decides what happens: keep routing, or redirect to the safe page.",
      },
      {
        title: "Rules can use the bot flag too",
        body: "Bot is one of the routing conditions, so you can build a separate path for flagged traffic and still measure it.",
      },
      {
        title: "Close the loop with zone blacklists",
        body: "Automation rules blacklist zones that send clicks but no conversions. Export the list as TXT or CSV and paste it into the traffic source.",
      },
    ],
    docs: [{ label: "Routing rules and anti-fraud", href: "/docs/routing" }],
    faqs: [
      {
        q: "Does Capve use a third-party bot database?",
        a: "No. Capve uses your own blocklist, an optional datacenter-ASN check and the signals in each request. There's no external lookup, so no added latency or per-check fee.",
      },
      {
        q: "Do bot clicks count against my plan?",
        a: "Yes. Every recorded click counts, bots included, because Capve still has to process and store it.",
      },
    ],
  },
  {
    slug: "reports",
    icon: "reports",
    name: "Reports and drilldown",
    summary: "ROI by any dimension, 4-level drilldown, CSV",
    title: "Affiliate reporting: ROI, EPC and CR by any dimension",
    description:
      "Campaign reports with clicks, uniques, bots, LP clicks, conversions per event, revenue, cost, profit, ROI, EPC and CR, grouped by country, device, sub ID, offer or lander, with a 4-level drilldown and CSV export.",
    eyebrow: "Reports",
    h1: "Find the sub ID that pays for the rest.",
    lead: "Group any campaign by any click dimension and drill four levels deep. Every report shows the metrics a media buyer decides with, per event, in your timezone.",
    highlights: [
      {
        icon: "reports",
        title: "Every metric that matters",
        body: "Clicks, uniques, bots, LP clicks, conversions, revenue, cost, profit, ROI, EPC and CR.",
      },
      {
        icon: "hash",
        title: "Group by anything",
        body: "Country, device, OS, browser, ISP, offer, lander, path, traffic source, date and `sub1`–`sub10`.",
      },
      {
        icon: "chevrons",
        title: "Four-level drilldown",
        body: "Campaign → sub1 → country → offer, or any other order, in one nested table.",
      },
      {
        icon: "page",
        title: "CSV export",
        body: "Download any report or raw click log. Large exports stream, so they don't time out.",
      },
    ],
    sections: [
      {
        title: "Events get their own columns",
        body: "Registrations, FTDs and other events appear next to the total in campaign stats, grouped reports and CSV exports. You see cost per registration and cost per FTD without spreadsheets.",
      },
      {
        title: "Your timezone, your days",
        body: "Set the account timezone and every date bucket follows it. `YYYY-MM-DD` ranges are calendar days where you work, not UTC.",
      },
      {
        title: "Revenue you can trust",
        body: "Rejected conversions are excluded from revenue. Conversions are dated by when the postback arrived, so yesterday's numbers don't change because a network was slow.",
      },
      {
        title: "Ask instead of clicking",
        body: "Every report is also an MCP tool. Ask your assistant which placements lost money this week and it reads the same data.",
      },
    ],
    docs: [{ label: "Overview", href: "/docs" }, { label: "Glossary", href: "/docs/glossary" }],
    faqs: [
      {
        q: "How long is data kept?",
        a: "Click and conversion records stay for the life of the account on capve.app. Self-hosted installs can set a raw-click retention window. Converted clicks are always kept.",
      },
      {
        q: "Can I get reports over an API?",
        a: "Yes. Reports are available over the HTTP API with a personal token, and through the MCP server.",
      },
    ],
  },
  {
    slug: "ai-mcp",
    icon: "mcp",
    name: "AI and MCP server",
    summary: `${MCP_TOOL_COUNT} MCP tools for Claude, Cursor and VS Code`,
    title: "The ad tracker with an MCP server for AI assistants",
    description: `Connect Claude, Cursor, VS Code or any MCP client to Capve. ${MCP_TOOL_COUNT} tools build campaigns, rotate landers, read reports, pause losers and manage postbacks with your account's permissions.`,
    eyebrow: "AI and MCP",
    h1: "Let your AI assistant run the boring parts.",
    lead: `Capve ships an MCP server with ${MCP_TOOL_COUNT} tools. Connect Claude, Cursor or any MCP client with one token, then ask it to build campaigns, read reports and act on them.`,
    highlights: [
      {
        icon: "mcp",
        title: `${MCP_TOOL_COUNT} tools`,
        body: "Campaigns, paths, rules, anti-fraud, offers, landers, postbacks, sources, costs, reports, drilldown, automation, domains and team.",
      },
      {
        icon: "lock",
        title: "Same permissions as you",
        body: "Each tool replays a normal API call with your personal token. Viewers can read; owners and admins can write.",
      },
      {
        icon: "terminal",
        title: "One line to connect",
        body: "Streamable HTTP at `/mcp` with a bearer token. Works with Claude Code, Claude Desktop, Cursor, VS Code and Windsurf.",
      },
      {
        icon: "users",
        title: "Audited",
        body: "Changes made through a token are recorded in the account's activity log, like any other change.",
      },
    ],
    sections: [
      {
        title: "Connect in one command",
        body: "Create a token under **API & MCP** in the dashboard, then add the server to your client.",
        code: {
          label: "Claude Code",
          text: `claude mcp add --transport http capve \\
  https://capve.app/mcp \\
  --header "Authorization: Bearer capve_YOUR_TOKEN"`,
        },
      },
      {
        title: "Things people ask it",
        body: "Plain requests turn into a few tool calls each.",
        bullets: [
          "Which campaigns lost money last week, and on which countries?",
          "Create a campaign for my new offer, split 50/50 between my two landers.",
          "Pause every campaign with ROI below -30% over the last 7 days.",
          "Group yesterday's conversions by sub1 and tell me which placements to cut.",
          "Here's my Binom offer export. Create these offers and landers in Capve.",
        ],
      },
      {
        title: "Built for agents, not bolted on",
        body: "Tools have typed inputs and read-only or destructive hints, so clients can ask before a change. Tokens can't mint new tokens, and token management needs a browser session.",
      },
    ],
    docs: [{ label: "MCP server", href: "/docs/mcp" }],
    faqs: [
      {
        q: "Which AI assistants work with Capve?",
        a: "Any client that speaks MCP over HTTP: Claude Code, Claude Desktop (through `mcp-remote`), Cursor, VS Code, Windsurf and others.",
      },
      {
        q: "Can the assistant break something?",
        a: "It can do what your account can do, so use a viewer account's token for read-only analysis. Destructive tools are marked, and most clients ask before running them.",
      },
      {
        q: "Does Capve send my data to an AI provider?",
        a: "No. Capve answers tool calls from the client you connect. What your assistant does with the answers is between you and that provider.",
      },
    ],
  },
  {
    slug: "automation",
    icon: "bolt",
    name: "Automation and costs",
    summary: "Zone blacklists, ROI alerts, cost sync",
    title: "Automated zone blacklists, ROI alerts and cost sync",
    description:
      "Capve blacklists zones that spend without converting, alerts you by email or webhook when ROI or spend crosses a line, and pulls traffic costs from your source every hour.",
    eyebrow: "Automation",
    h1: "Stop losses while you sleep.",
    lead: "Automation rules watch your campaigns every 15 minutes. They blacklist dead zones, warn you when ROI drops or spend runs away, and keep costs current without spreadsheets.",
    highlights: [
      {
        icon: "admin",
        title: "Zone blacklist rules",
        body: "Blacklist a zone after N clicks with no conversions, or with no conversions of a chosen event, in the last H hours.",
      },
      {
        icon: "bolt",
        title: "ROI and spend alerts",
        body: "Email and webhook alerts when a campaign crosses the ROI or spend threshold you set.",
      },
      {
        icon: "page",
        title: "TXT and CSV export",
        body: "Copy the blacklist straight into the traffic source's placement blocklist.",
      },
      {
        icon: "swap",
        title: "Cost sync",
        body: "Hourly spend import from Adcash, cost updates by API, and cost per click on the link.",
      },
    ],
    sections: [
      {
        title: "Rules that run every 15 minutes",
        body: "Each rule is scoped to a campaign, evaluated on a schedule and can also be run on demand. Results land in the zone blacklist with the reason.",
      },
      {
        title: "Costs that match your invoice",
        body: "Traffic sources rarely pass an exact cost per click. `POST /api/campaigns/:id/costs` spreads a total evenly over the matching clicks for a date range, optionally filtered by a token such as the zone, so ROI reflects what you were billed.",
      },
      {
        title: "Webhooks for everything else",
        body: "Triggers call your URL with conversion details, and alerts can post to a webhook, so Slack, Telegram or your own tooling hear about it first.",
      },
    ],
    docs: [{ label: "Traffic sources and cost", href: "/docs/traffic-sources" }],
    faqs: [
      {
        q: "Which traffic sources have automatic cost sync?",
        a: "Adcash today, using an API key encrypted at rest. For other sources, send cost on the link or post totals to the cost API.",
      },
      {
        q: "Does Capve pause campaigns at the traffic source?",
        a: "Not directly. It builds the blacklist and alerts you. Your AI assistant or your own script can act on them through the API.",
      },
    ],
  },
  {
    slug: "open-source",
    icon: "code",
    name: "Open source on Cloudflare",
    summary: "Source on GitHub, runs on Workers + D1",
    title: "Open-source ad tracker on Cloudflare Workers and D1",
    description:
      "Capve's source is public on GitHub. Use the hosted service at capve.app, or run your own copy on Cloudflare Workers and D1. No VPS, no license server, no lock-in.",
    eyebrow: "Open source",
    h1: "A tracker you can read, run and leave.",
    lead: "Capve's source is on GitHub. Use capve.app and we run it for you, or deploy your own copy to Cloudflare. Your data model, postback URLs and API are the same either way.",
    highlights: [
      {
        icon: "code",
        title: "Public source",
        body: "Read how attribution, routing and postbacks work before you trust them with your money.",
      },
      {
        icon: "globe",
        title: "Workers + D1",
        body: "A single Cloudflare Worker and a D1 database. Static assets, API, redirects and cron jobs in one deploy.",
      },
      {
        icon: "lock",
        title: "No license server",
        body: "Nothing phones home to decide whether your tracker may run.",
      },
      {
        icon: "swap",
        title: "No lock-in",
        body: "Move between hosted and self-hosted. Postback URLs, macros and the API keep the same shape.",
      },
    ],
    sections: [
      {
        title: "Hosted or self-hosted",
        body: "**capve.app** is the hosted service: we run the Worker, the database, upgrades and email. **Self-hosting** puts the same code on your Cloudflare account, where you handle secrets, email, upgrades and support yourself.",
      },
      {
        title: "Why Cloudflare",
        body: "Redirect speed is conversion rate. Cloudflare runs the Worker in data centers around the world, so a click is answered near the visitor instead of from one VPS. It also removes the server work that self-hosted trackers usually need.",
      },
      {
        title: "Built in the open",
        body: "Changes land as pull requests with tests for the tracking flow, redirect safety, auth and Binom parity. You can see what changed and why.",
      },
    ],
    docs: [{ label: "Overview", href: "/docs" }],
    faqs: [
      {
        q: "If it's open source, why pay for capve.app?",
        a: "Because running a tracker is work: secrets, email delivery, upgrades, migrations, monitoring and support. The hosted plans cost half of Binom's and you get none of the ops.",
      },
      {
        q: "Can I move from capve.app to my own install later?",
        a: "Yes. It is the same code with the same postback format, so networks only need the new host. Reports, click logs and conversions export as CSV, and everything else is available over the API.",
      },
    ],
  },
];

export function findFeature(slug: string): Feature | undefined {
  return FEATURES.find((feature) => feature.slug === slug);
}
