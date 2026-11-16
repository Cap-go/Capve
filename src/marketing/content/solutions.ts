import { MCP_TOOL_COUNT } from "./features";
import type { Solution } from "./types";

export const SOLUTIONS: Solution[] = [
  {
    slug: "media-buyers",
    icon: "campaigns",
    name: "Casino media buyers",
    summary: "Compare traffic zones by cost per FTD and reported ROI",
    title: "Casino affiliate tracker for paid traffic and zone-level ROI",
    description:
      "Track casino affiliate traffic from Adcash, PropellerAds, RichAds, Zeropark and TrafficStars. Compare registrations, FTDs, costs and reported revenue by zone and offer.",
    eyebrow: "For casino media buyers",
    h1: "See which traffic reaches the first deposit.",
    lead: "A cheap click or a registration is only part of the picture. Connect your traffic costs to the FTD events and payouts your affiliate program reports, then compare zones, creatives and offers.",
    pains: [
      { icon: "coin", title: "Cost per FTD", body: "Keep registration and FTD counts separate and compare cost per event alongside reported revenue and ROI." },
      { icon: "hash", title: "The zone behind the result", body: "Capture source campaign, zone and creative IDs as named tokens so you can trace performance back to the placement." },
      { icon: "admin", title: "Spend with no FTDs", body: "Set a minimum-click threshold and an FTD-specific blacklist rule. Review and export the recorded zones to your traffic source." },
      { icon: "route", title: "Offers worth testing", body: "Split traffic between landers and casino offers, then compare the outcomes by path, country or device." },
    ],
    workflow: [
      { title: "Map source tokens", body: "Start with the tracking template for Adcash, PropellerAds, RichAds, Zeropark or TrafficStars, and verify its macros against your account." },
      { title: "Build the offer test", body: "Add landers and offers to a path, choose weights, and set routing rules for the traffic you want each offer to receive." },
      { title: "Connect event postbacks", body: "Set up separate registration and FTD postbacks in the affiliate program, with the click id and reported payout." },
      { title: "Review mature results", body: "Compare cost per FTD and ROI by zone. Allow time for conversions to arrive before deciding which placements to change." },
    ],
    features: ["click-tracking", "traffic-routing", "reports", "automation"],
    docs: [
      { label: "Traffic sources and cost", href: "/docs/traffic-sources" },
      { label: "Connect an affiliate network", href: "/docs/networks" },
    ],
    faqs: [
      { q: "Which traffic sources work with Capve?", a: "Any source that can pass tracking URL parameters. The featured templates cover Adcash, PropellerAds, RichAds, Zeropark and TrafficStars. Check each template’s macros before sending traffic." },
      { q: "Can I send only FTDs back to my traffic source?", a: "Yes. Limit an outgoing traffic-source postback to the ftd event. It fires when the conversion is approved, subject to the source’s configured postback share." },
      { q: "How many clicks are included?", a: "Starter includes 1 million clicks per month and Pro includes 60 million. Tracking keeps running at the limit; reports pause until the allowance resets or you upgrade." },
    ],
  },
  {
    slug: "agencies",
    icon: "users",
    name: "Casino affiliate teams",
    summary: "Shared campaign reporting with owner, admin and viewer roles",
    title: "Campaign tracking for casino affiliate and media-buying teams",
    description:
      "Give casino media buyers and analysts shared access to campaigns, offer tests and FTD reports with account roles, an account switcher and activity history.",
    eyebrow: "For casino affiliate teams",
    h1: "Give the buying team the same campaign picture.",
    lead: "Buyers manage traffic tests. Analysts compare registrations, FTDs and reported revenue. Account roles keep editing access with the people responsible for changes.",
    pains: [
      { icon: "lock", title: "Individual logins", body: "Invite each teammate by email rather than sharing the owner’s password. Invitations require acceptance with a verified email." },
      { icon: "reports", title: "Shared event reports", body: "Review the same source, zone and offer breakdowns, with registrations and FTDs reported separately." },
      { icon: "page", title: "Change history", body: "Use the activity log to review recorded account actions and who made them." },
      { icon: "users", title: "Separate accounts", body: "Switch between your personal account and team accounts you have joined. Each account keeps its own campaigns and plan." },
    ],
    workflow: [
      { title: "Create the account", body: "The owner chooses a plan. Teammates share its click allowance, with no per-seat charge." },
      { title: "Invite the team", body: "Give buyers admin access and analysts viewer access. Invitations apply after acceptance." },
      { title: "Agree on event names", body: "Use consistent registration, ftd and deposit postbacks across the offers you compare." },
      { title: "Review campaign changes", body: "Use shared reports and recorded activity to discuss traffic tests and the next changes." },
    ],
    features: ["reports", "traffic-routing", "postback-tracking", "ai-mcp"],
    docs: [{ label: "Accounts and teams", href: "/docs/accounts" }],
    faqs: [
      { q: "Is there a per-seat price?", a: "No. Team members use the owner’s plan and click allowance." },
      { q: "What can a viewer do?", a: "Read campaigns and reports. Owners and admins can create or change campaigns, sources, offers and settings." },
      { q: "Can I work across several affiliate teams?", a: "Yes. Join their accounts and switch between them in the dashboard. Each account has its own plan and data." },
    ],
  },
  {
    slug: "igaming",
    icon: "coin",
    name: "Registration and FTD tracking",
    summary: "Separate event counts and the payouts your programs report",
    title: "Casino affiliate tracking for registrations, FTDs and deposits",
    description:
      "Connect casino affiliate postbacks to registration, first-time deposit and deposit events. Compare cost per FTD and reported revenue with editable affiliate platform presets.",
    eyebrow: "For casino affiliates",
    h1: "Keep registrations, FTDs and revenue distinct.",
    lead: "A registration, a first-time deposit and an affiliate payout answer different questions. Capve records the events and amounts your program sends, so you can compare acquisition costs with reported earnings.",
    pains: [
      { icon: "hash", title: "Separate event columns", body: "Registrations and FTDs appear separately in campaign stats, grouped reports and CSV exports." },
      { icon: "swap", title: "A precise source signal", body: "Limit a traffic-source postback to ftd when that is the event you want to report back." },
      { icon: "route", title: "Later status updates", body: "Repeat postbacks update status and payout. Distinct transaction IDs keep repeated deposit events separate." },
      { icon: "coin", title: "Revenue with context", body: "Capve sums reported payouts. A player’s deposit is not automatically your affiliate commission; choose the amounts your postbacks should report." },
    ],
    workflow: [
      { title: "Check the program macros", body: "Start with a Cellxpert, Affilka or MyAffiliates preset, then verify and edit the click-id and payout macros for your program." },
      { title: "Send each event", body: "Add event=registration and event=ftd to separate postback URLs. Use event=deposit with a distinct transaction id for repeat deposits." },
      { title: "Forward the right event", body: "Configure an outgoing postback for the approved event your traffic source should receive." },
      { title: "Compare cost and payout", body: "Group by source, zone, country or offer and review event counts, cost per FTD and reported revenue." },
    ],
    features: ["postback-tracking", "reports", "traffic-routing", "click-tracking"],
    docs: [
      { label: "Postback events", href: "/docs/postback" },
      { label: "Connect an affiliate network", href: "/docs/networks" },
    ],
    faqs: [
      { q: "Which casino affiliate platforms have presets?", a: "Capve includes editable presets for Cellxpert, Affilka (SOFTSWISS) and MyAffiliates, alongside TUNE, Everflow, CAKE and Affise. They provide tracking URL and postback templates, not access to a program’s player database." },
      { q: "Can I track deposits after the first one?", a: "Yes, if the program reports them. Send event=deposit with a distinct tx_id for each deposit. Each becomes a separate conversion event." },
      { q: "Does Capve calculate player lifetime value or commission deals?", a: "No. It records the events and payout amounts sent by the program. It does not infer player balances, calculate revenue-share agreements or replace the operator’s affiliate reporting." },
    ],
  },
  {
    // Keep the established URL while focusing the page on casino affiliate offer portfolios.
    slug: "affiliate-programs",
    icon: "offers",
    name: "Multiple affiliate programs",
    summary: "Centralize tracking across the casino affiliate programs you work with",
    title: "Track multiple casino affiliate programs in one dashboard",
    description:
      "Organize casino offers by affiliate network, test landers and offers with weighted paths, and compare registration, FTD, cost and reported revenue in Capve.",
    eyebrow: "For affiliates working with multiple programs",
    h1: "Your affiliate programs, together in one dashboard.",
    lead: "Promote casino offers from different programs without keeping your tracking scattered across them. Organize your offer links and bring the conversions and commissions each program reports through postbacks into Capve. Compare performance and decide where your next visitors should go.",
    pains: [
      { icon: "offers", title: "A reusable offer library", body: "Create offers once, group them by affiliate network, and reuse them across campaign paths." },
      { icon: "landers", title: "Lander and offer tests", body: "Assign weights to several landers and offers within a path. Each click records the selected combination." },
      { icon: "globe", title: "Geo-specific routing", body: "Use country, region, language or device rules to select the configured offer path for a click." },
      { icon: "reports", title: "Comparable outcomes", body: "Break reports down by network, offer and lander, with event counts and reported payouts alongside traffic cost." },
    ],
    workflow: [
      { title: "Add your programs", body: "Create a network record for each affiliate program or platform you want to group offers under." },
      { title: "Add the offer URLs", body: "Pass Capve’s click id through the affiliate program’s supported parameter so postbacks can attribute results." },
      { title: "Choose a traffic split", body: "Set path weights and routing rules in Capve while keeping the same campaign link at the traffic source." },
      { title: "Compare event results", body: "Review registrations, FTDs and reported revenue by offer after allowing for the conversion delay." },
    ],
    features: ["traffic-routing", "postback-tracking", "reports", "ai-mcp"],
    docs: [
      { label: "Campaigns and offer paths", href: "/docs/campaigns" },
      { label: "Network postbacks", href: "/docs/networks" },
    ],
    faqs: [
      { q: "Can I compare offers from different programs?", a: "Yes. Assign the offers to their network records and use offer or network report dimensions. Keep event names and payout currencies consistent when comparing results." },
      { q: "Does a default offer payout determine FTD revenue?", a: "Event postbacks default to zero unless the program sends a payout. Configure the FTD postback to report the affiliate amount you want counted as revenue." },
      { q: "Does Capve settle affiliate payments?", a: "No. Your affiliate programs remain responsible for their payouts. Capve provides tracking and reports from the conversion data they send." },
    ],
  },
  {
    slug: "developers",
    icon: "terminal",
    name: "Affiliate workflow automation",
    summary: "Use the API and MCP for casino campaign operations",
    title: "API and MCP automation for casino affiliate campaigns",
    description: `Connect scripts and AI assistants to Capve’s casino affiliate workflow: ${MCP_TOOL_COUNT} MCP tools for campaigns, offer routing, postbacks and performance reports.`,
    eyebrow: "For technical casino affiliate teams",
    h1: "Turn campaign questions into repeatable operations.",
    lead: "Read the same campaign data from the dashboard, HTTP API or MCP. Ask about FTD performance, prepare offer tests and manage Capve routing with your account’s permissions.",
    pains: [
      { icon: "reports", title: "Event-level questions", body: "Ask an assistant to compare registrations, FTDs and cost per event by source, zone or offer." },
      { icon: "code", title: "Inspectable tracking", body: "The source code is public. Review how click attribution, postbacks and report calculations work." },
      { icon: "mcp", title: "Tools that can act", body: `${MCP_TOOL_COUNT} MCP tools expose typed inputs and operation hints for reading reports and changing Capve configuration.` },
      { icon: "bolt", title: "Notifications and exports", body: "Use report exports, event webhooks and ROI/spend alerts in your team’s existing workflow." },
    ],
    workflow: [
      { title: "Connect an assistant", body: "Use OAuth in a compatible MCP client or a personal API token for scripts and other clients." },
      { title: "Start with the evidence", body: "Read campaign and grouped reports, including registration and FTD event metrics." },
      { title: "Make a specific change", body: "Update an offer path, a routing weight or an outgoing postback through the same API used by the console." },
      { title: "Check the result", body: "Read back the configuration and compare subsequent campaign data before the next change." },
    ],
    features: ["ai-mcp", "reports", "postback-tracking", "automation"],
    docs: [{ label: "MCP server", href: "/docs/mcp" }, { label: "Convert API", href: "/docs/api/convert" }],
    faqs: [
      { q: "Does MCP replace the dashboard?", a: "It gives an assistant another way to call Capve’s API. You can still inspect campaign configuration and reports in the dashboard." },
      { q: "Does the AI bidding beta change bids automatically?", a: "The bidding assistant produces review-only Adcash recommendations after a campaign explicitly opts in. It does not automatically apply those recommendations to a traffic source." },
    ],
  },
];

export function findSolution(slug: string): Solution | undefined {
  return SOLUTIONS.find((solution) => solution.slug === slug);
}
