import { MCP_TOOL_COUNT } from "./features";
import type { Solution } from "./types";

export const SOLUTIONS: Solution[] = [
  {
    slug: "media-buyers",
    icon: "campaigns",
    name: "Media buyers",
    summary: "Push, pop, native and social traffic, optimized by zone",
    title: "Ad tracker for media buyers on push, pop, native and social",
    description:
      "Capve tracks paid traffic from push, pop, native, Meta, Google and TikTok: cost per click, zone-level ROI, bot filtering and automatic zone blacklists, at half the price of Binom.",
    eyebrow: "For media buyers",
    h1: "Built for buyers who live in the zone report.",
    lead: "Buy traffic, split-test landers, cut zones that don't convert. Capve does the tracking on Cloudflare's edge and costs half of what Binom charges.",
    pains: [
      {
        icon: "settings",
        title: "No VPS to babysit",
        body: "Self-hosted trackers need a server sized for your peak, plus updates, SSL and backups. Capve runs on Cloudflare, so there's nothing to maintain.",
      },
      {
        icon: "coin",
        title: "A flat monthly price",
        body: "Plans have a monthly click allowance and no overage charge. Testing a new source doesn't come with a surprise invoice.",
      },
      {
        icon: "admin",
        title: "Zones that eat budget",
        body: "Blacklist rules find zones with clicks and no conversions, then export them in a format the source accepts.",
      },
      {
        icon: "reports",
        title: "Every angle in one report",
        body: "Group by zone, creative, country or device, or drill four levels deep: campaign, zone, country, offer.",
      },
    ],
    workflow: [
      {
        title: "Pick a source template",
        body: "Adcash, PropellerAds, RichAds, Zeropark, TrafficStars, Meta, Google Ads and TikTok Ads come with their tokens mapped to sub IDs and cost.",
      },
      {
        title: "Build the campaign",
        body: "Add landers and offers to a path, set weights, and add rules for geo, device or time of day.",
      },
      {
        title: "Paste two URLs",
        body: "The campaign link goes into the traffic source. The postback URL goes into the affiliate network.",
      },
      {
        title: "Optimize daily",
        body: "Read ROI by zone and creative, let rules blacklist dead zones, and get an alert when a campaign's ROI drops.",
      },
    ],
    features: ["click-tracking", "traffic-routing", "anti-fraud", "automation", "reports"],
    docs: [
      { label: "Traffic sources and cost", href: "/docs/traffic-sources" },
      { label: "Connect an affiliate network", href: "/docs/networks" },
    ],
    faqs: [
      {
        q: "Which traffic sources work with Capve?",
        a: "Any source that can add parameters to a URL. Templates exist for Adcash, PropellerAds, RichAds, Zeropark, TrafficStars, Meta, Google Ads and TikTok Ads.",
      },
      {
        q: "Can I send conversions back to my traffic source?",
        a: "Yes. A traffic-source postback fires once per approved conversion, optionally for only a share of conversions and only for one event.",
      },
      {
        q: "How many clicks are included?",
        a: "Starter includes 1 million clicks per month and Pro includes 60 million. Tracking never stops at the limit. Only reports pause until the next month or an upgrade.",
      },
    ],
  },
  {
    slug: "agencies",
    icon: "users",
    name: "Teams and agencies",
    summary: "Roles, shared accounts and an activity log",
    title: "Affiliate tracking for media-buying teams and agencies",
    description:
      "Shared Capve accounts with owner, admin and viewer roles, an account switcher, an activity log and API tokens, so a media-buying team works from one source of truth.",
    eyebrow: "For teams and agencies",
    h1: "One tracker for the whole buying team.",
    lead: "Invite buyers, analysts and clients to the same account with the right role. Every change is logged, and every report reads the same numbers.",
    pains: [
      {
        icon: "lock",
        title: "No shared passwords",
        body: "Everyone signs in with their own login. An invite only applies after the invitee accepts it with a verified email.",
      },
      {
        icon: "page",
        title: "Who changed that?",
        body: "The activity log records changes made in the dashboard and through API tokens.",
      },
      {
        icon: "reports",
        title: "Clients who want results",
        body: "Give clients the viewer role: they read campaigns and reports, and can't edit anything.",
      },
      {
        icon: "users",
        title: "Several books of business",
        body: "The account selector switches between your personal account and every team account you've joined.",
      },
    ],
    workflow: [
      { title: "Create the account", body: "The owner picks a plan. Team members share its click allowance, with no per-seat price." },
      { title: "Invite by email", body: "Owners invite buyers and analysts. Invites apply when accepted." },
      { title: "Set roles", body: "Owners and admins edit campaigns. Viewers read reports." },
      {
        title: "Automate the routine",
        body: "Personal API tokens and the MCP server let each buyer script or delegate their own work, under their own role.",
      },
    ],
    features: ["reports", "ai-mcp", "traffic-routing", "postback-tracking"],
    docs: [{ label: "Accounts and teams", href: "/docs/accounts" }],
    faqs: [
      {
        q: "Is there a per-seat price?",
        a: "No. Team members use the owner's plan and click allowance.",
      },
      {
        q: "What can a viewer do?",
        a: "Read campaigns and reports. Only owners and admins can create or change campaigns, sources, offers and settings.",
      },
      {
        q: "Can I manage several client accounts?",
        a: "Yes. Each client can be its own account with its own plan, and you switch between them in the dashboard.",
      },
    ],
  },
  {
    slug: "igaming",
    icon: "coin",
    name: "iGaming affiliates",
    summary: "Registration, FTD and deposit events tracked separately",
    title: "iGaming affiliate tracking with registration and FTD events",
    description:
      "Track casino and sportsbook campaigns with separate registration, FTD and deposit events, per-event postbacks to traffic sources, and presets for Cellxpert, Affilka and MyAffiliates.",
    eyebrow: "For iGaming affiliates",
    h1: "Registrations, FTDs and deposits, tracked separately.",
    lead: "iGaming programs pay on events, not clicks. Capve records each event as its own conversion and shows cost per registration and cost per FTD next to ROI.",
    pains: [
      {
        icon: "hash",
        title: "One column isn't enough",
        body: "Registrations and FTDs get their own columns in campaign stats, grouped reports and CSV exports.",
      },
      {
        icon: "swap",
        title: "Sources need the right signal",
        body: "Limit a traffic-source postback to `ftd`, so the source optimizes for depositors instead of sign-ups.",
      },
      {
        icon: "route",
        title: "Statuses change later",
        body: "Repeat postbacks update status and payout. A distinct `tx_id` keeps each repeat deposit separate.",
      },
      {
        icon: "globe",
        title: "Strict geo targeting",
        body: "Route by country, region, language and device, and send everything else to a page that's allowed there.",
      },
    ],
    workflow: [
      {
        title: "Pick the platform preset",
        body: "Cellxpert, Affilka (SOFTSWISS) and MyAffiliates presets fill the offer parameter and postback macros.",
      },
      {
        title: "One postback per event",
        body: "Add `&event=registration` and `&event=ftd` to two copies of the postback URL in the program.",
      },
      {
        title: "Forward FTDs to the source",
        body: "Create a traffic-source postback limited to the `ftd` event.",
      },
      {
        title: "Read cost per FTD",
        body: "Group by sub ID, country or creative and compare cost per FTD and ROI side by side.",
      },
    ],
    features: ["postback-tracking", "reports", "traffic-routing", "anti-fraud"],
    docs: [
      { label: "Postback events", href: "/docs/postback" },
      { label: "Connect an affiliate network", href: "/docs/networks" },
    ],
    faqs: [
      {
        q: "Which affiliate platforms work with Capve?",
        a: "Any platform that can call a postback URL. Capve has presets for Cellxpert, Affilka (SOFTSWISS) and MyAffiliates, plus TUNE, Everflow, CAKE and Affise.",
      },
      {
        q: "Can I track deposits after the first one?",
        a: "Yes. Send `event=deposit` with a distinct `tx_id` for each deposit. Each one becomes its own conversion.",
      },
      {
        q: "Who is responsible for gambling compliance?",
        a: "You are. Capve's terms require campaigns, offers and landing pages to follow the laws of the places you target, including advertising and gambling rules.",
      },
    ],
  },
  {
    slug: "affiliate-programs",
    icon: "cart",
    name: "Brands and SaaS",
    summary: "Partner links and server-side sales for your own program",
    title: "Affiliate program tracking for SaaS and e-commerce brands",
    description:
      "Give each partner a tracking link, record sales server-side from your checkout or Stripe webhook, and see clicks, conversions and revenue per affiliate. No pixels, no payout lock-in.",
    eyebrow: "For brands and SaaS",
    h1: "Know which partners actually drive sales.",
    lead: "Give every affiliate a link, report sales from your backend, and see clicks, conversions and revenue per partner. Capve tracks, and you keep paying partners the way you already do.",
    pains: [
      {
        icon: "admin",
        title: "Pixels that miss sales",
        body: "Ad blockers and browser privacy rules drop pixels. Capve records the sale from your server.",
      },
      {
        icon: "cursor",
        title: "Links per partner",
        body: "Each affiliate gets an `/r/{code}` link that records the click and passes `click_id` and `velo_ref` to your site.",
      },
      {
        icon: "swap",
        title: "No payout lock-in",
        body: "Capve never holds your money or your partner list hostage. Export conversions and pay however you like.",
      },
      {
        icon: "code",
        title: "Two small integrations",
        body: "One script tag in your site's head, and one API call from your checkout webhook.",
      },
    ],
    workflow: [
      { title: "Create a campaign", body: "Set your site as the destination. Redirects only go to destinations you configure." },
      { title: "Add your partners", body: "Create an affiliate per partner and send them their `/r/{code}` link." },
      {
        title: "Install the snippet",
        body: "It stores `click_id` and `velo_ref` in `localStorage`, so they survive navigation until checkout.",
      },
      {
        title: "Report the sale",
        body: "Pass the click id into checkout metadata and call the convert API from your payment webhook.",
      },
    ],
    features: ["postback-tracking", "click-tracking", "reports", "ai-mcp"],
    docs: [
      { label: "Browser attribution", href: "/docs/browser-attribution" },
      { label: "Server-side conversions", href: "/docs/server-conversions" },
      { label: "Convert API", href: "/docs/api/convert" },
    ],
    faqs: [
      {
        q: "Does Capve pay affiliates?",
        a: "No. Capve tracks clicks and sales per affiliate. Pay partners with the tool you already use, based on Capve's conversion export.",
      },
      {
        q: "Does it work with Stripe?",
        a: "Yes. Store the click id in the Checkout Session metadata, then send it to the convert API from your Stripe webhook. The docs include the code.",
      },
      {
        q: "Which cookies does it use?",
        a: "The redirect sets a first-party cookie with the affiliate code (`_velo_ref`, 30 days) and a random visitor id for unique counts. The optional snippet keeps the ids in `localStorage` on your site.",
      },
    ],
  },
  {
    slug: "developers",
    icon: "terminal",
    name: "Developers and AI teams",
    summary: "HTTP API, MCP server and open source",
    title: "Developer-first campaign tracking with an API and MCP server",
    description: `An HTTP API, an MCP server with ${MCP_TOOL_COUNT} tools, public source code and Cloudflare Workers underneath. Automate campaigns from scripts, CI or AI agents.`,
    eyebrow: "For developers and AI teams",
    h1: "Tracking you can script, audit and hand to an agent.",
    lead: "Everything in the dashboard is an API call, and every API call is an MCP tool. The code is on GitHub, and the stack is plain Cloudflare.",
    pains: [
      {
        icon: "terminal",
        title: "One API, the real one",
        body: "The dashboard runs on the same HTTP API you call with a personal token.",
      },
      {
        icon: "code",
        title: "No black box",
        body: "Read how routing, click context and postback handling work, line by line.",
      },
      {
        icon: "mcp",
        title: "Agents that can act",
        body: `${MCP_TOOL_COUNT} MCP tools with typed inputs and read-only or destructive hints.`,
      },
      {
        icon: "bolt",
        title: "Webhooks out",
        body: "Triggers, alert webhooks and outgoing postbacks call your services when something happens.",
      },
    ],
    workflow: [
      { title: "Create a token", body: "Under API & MCP. Tokens act as you, so use a viewer account for read-only automation." },
      { title: "Call the API", body: "Campaigns, paths, rules, reports and costs, all JSON over HTTPS." },
      { title: "Connect your agent", body: "Point Claude Code, Cursor or VS Code at `/mcp` with the token." },
      { title: "Self-host if you need to", body: "Deploy the same code to your own Cloudflare account." },
    ],
    features: ["ai-mcp", "open-source", "postback-tracking", "automation"],
    docs: [
      { label: "MCP server", href: "/docs/mcp" },
      { label: "Convert API", href: "/docs/api/convert" },
    ],
    faqs: [
      {
        q: "What's the stack?",
        a: "TypeScript end to end: Hono on Cloudflare Workers, a D1 (SQLite) database and a React dashboard served from the same Worker.",
      },
      {
        q: "Can tokens be scoped?",
        a: "A token acts as the user who created it, with that user's role. For read-only automation, create the token from a viewer account.",
      },
    ],
  },
];

export function findSolution(slug: string): Solution | undefined {
  return SOLUTIONS.find((solution) => solution.slug === slug);
}
