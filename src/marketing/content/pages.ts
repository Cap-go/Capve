import { MCP_TOOL_COUNT } from "./features";
import type { Faq } from "./types";

export const SUPPORT_EMAIL = "support@capgo.app";

export const HOME_FAQS: Faq[] = [
  {
    q: "What is Capve?",
    a: "An open-source tracker for casino affiliates. It connects paid traffic to registration, first-time deposit (FTD) and deposit events sent by your affiliate programs, with cost and reported revenue by campaign, source, zone and offer.",
  },
  {
    q: "How is Capve different from Binom?",
    a: "Same postback model, half the monthly price, and no server to run. Binom's self-hosted license runs on a server you rent and maintain. Capve runs on Cloudflare's network, managed by us. Capve also ships an MCP server so AI assistants can work with your campaigns. See [Capve vs Binom](/compare/binom).",
  },
  {
    q: "Is there a free trial?",
    a: "Yes. 14 days with every feature and no card. Pick Starter or Pro at signup, and the trial includes that plan's click allowance.",
  },
  {
    q: "What happens if I go over my clicks?",
    a: "There's no overage fee and no traffic is dropped. Redirects, postbacks and conversions keep working. Reports, logs and exports pause until the monthly allowance resets or you upgrade.",
  },
  {
    q: "Which traffic sources and casino affiliate platforms work?",
    a: "Tracking templates include Adcash, PropellerAds, RichAds, Zeropark and TrafficStars, plus affiliate platform presets for Cellxpert, Affilka and MyAffiliates. You can edit the macros to match your program. URL tracking and postback presets do not, by themselves, grant access to a provider’s management API.",
  },
  {
    q: "Can I compare registrations, FTDs and affiliate revenue?",
    a: "Yes, when your affiliate program sends those events and payouts to Capve. Report registrations and FTDs separately, compare cost per event, and review reported revenue by offer, source or zone. Deposit amounts are not automatically affiliate earnings: report the payout you want counted as revenue.",
  },
  {
    q: "Can I self-host Capve?",
    a: "Yes. The source is on GitHub and deploys to your own Cloudflare account. The hosted service is for teams who'd rather not run secrets, email, upgrades and support themselves.",
  },
  {
    q: "Do you use my tracking data?",
    a: "Only to run the service for you. We don't sell it, advertise with it, or combine it across customers. See the [Privacy Policy](/privacy).",
  },
];

export const PLAN_FEATURES = [
  "Unlimited campaigns, traffic sources, offers and landers",
  "Routing rules, weighted landers and offers, LP clicks",
  "Registration, FTD and deposit postbacks, outgoing postbacks, convert API",
  "Reports by any dimension, 4-level drilldown, CSV export",
  "Bot filtering, blocklists and safe pages",
  "Zone blacklist rules, ROI and spend alerts",
  "Team accounts with owner, admin and viewer roles",
  `HTTP API and MCP server (${MCP_TOOL_COUNT} tools)`,
  "Custom tracking domains",
];

export const PRICING_FAQS: Faq[] = [
  {
    q: "What counts as a click?",
    a: "Each visit to a campaign or affiliate link that Capve records, bots included, across every campaign in the account. LP clicks, postbacks and conversions are free.",
  },
  {
    q: "What happens when I reach my plan's clicks?",
    a: "Nothing breaks and nothing is billed. Redirects, LP clicks, postbacks and the convert API keep running. Reports, raw logs and CSV exports pause until the allowance resets on the 1st (UTC) or you upgrade.",
  },
  {
    q: "Do I need a card for the trial?",
    a: "No. The trial lasts 14 days and includes the click allowance of the plan you picked at signup.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes, from the billing portal. Cancellation takes effect at the end of the month you already paid for, and you keep access until then.",
  },
  {
    q: "Do you offer refunds?",
    a: "Fees are charged in advance and aren't refundable, except where the law requires it or in the cases listed in the [Terms of Service](/terms#payment). The trial is there so you can decide first.",
  },
  {
    q: "Are taxes included?",
    a: "Prices are in USD and exclude taxes. Where tax applies, it's added at checkout.",
  },
  {
    q: "How many team members can I add?",
    a: "As many as you need. Team members use the owner's plan and click allowance, with no per-seat price.",
  },
  {
    q: "I need more than 60 million clicks a month.",
    a: `Email [${SUPPORT_EMAIL}](mailto:${SUPPORT_EMAIL}) with your volume and we'll work it out.`,
  },
  {
    q: "Is self-hosting free?",
    a: "The source code is public on GitHub. A self-hosted install runs on your own Cloudflare account, so you pay Cloudflare for usage and run upgrades, email and support yourself.",
  },
];
