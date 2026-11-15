import type { Card, Faq, Section } from "./types";

/** Comparison (/compare/:slug) and migration guide (/migrate/:slug) for one competing tracker. */
export type Competitor = {
  slug: string;
  name: string;
  menuSummary: string;
  title: string;
  description: string;
  h1: string;
  lead: string;
  /** Row values for the /compare overview table. */
  facts: { hosting: string; price: string; source: string; ai: string; trial: string };
  rows: Array<{ label: string; capve: string; them: string }>;
  switchReasons: Card[];
  /** Honest cases where the competitor fits better. */
  stayReasons: string[];
  faqs: Faq[];
  sources: Array<{ label: string; url: string }>;
  checked: string;
  migrate: {
    title: string;
    description: string;
    h1: string;
    lead: string;
    terms: Array<[theirs: string, capve: string]>;
    postback: { theirs: string; capve: string; note: string };
    macros: Array<[theirs: string, capve: string]>;
    steps: Section[];
    faqs: Faq[];
  };
};

const CHECKED = "November 15, 2026";
const CAPVE_POSTBACK_HOST = "https://capve.app/click";

/** Rows every comparison shares, so Capve's side reads the same on each page. */
const CAPVE = {
  price: "Starter $74.50/month (1M clicks). Pro $149.50/month (60M clicks).",
  metering: "Clicks only. LP clicks, postbacks and conversions are free.",
  overage: "None. Tracking keeps running; reports pause until the allowance resets or you upgrade.",
  hosting: "Managed on Cloudflare's edge network. Self-host on your own Cloudflare account if you prefer.",
  source: "Public on GitHub.",
  seats: "No per-seat price. Owner, admin and viewer roles.",
  retention: "Not limited by plan.",
  ai: "MCP server with 93 tools on every plan.",
  trial: "14 days, every feature, no card.",
  events: "Named events (`event=registration`, `event=ftd`), each its own conversion and report column.",
};

const STATUS_NOTE =
  "Capve keeps whatever status the network sends. `rejected`, `declined`, `chargeback`, `refunded` and similar are left out of revenue, and `pending` or `hold` conversions aren't forwarded to sources until they change.";

/** Externally hosted landers can't expand Capve macros, so the LP click URL reaches them as a parameter. */
const LP_CTA = "add `?next={lp_click_url}` to the lander URL in Capve and link the call to action to that `next` value";
const LP_MACRO = "`?next={lp_click_url}` on the lander URL, CTA links to `next`";

const PARALLEL_STEP = {
  title: "Run both trackers side by side",
  body: "Send a slice of traffic through the Capve campaign link and add Capve's postback to the network next to the old one. If the network allows only one postback URL per offer, run the Capve slice on a separate offer or tracking link.",
};

const COMPARE_STEP = (name: string) => ({
  title: "Compare, then switch",
  body: `After a few days, compare clicks, conversions and payouts per day in both trackers. When they line up, point the rest of your traffic at Capve links. Keep ${name} running with its postback URL live until conversions and status updates for its last clicks stop arriving, because networks keep sending those click ids to ${name}. After that, keep it read-only for as long as you need its history.`,
});

export const COMPETITORS: Competitor[] = [
  {
    slug: "binom",
    name: "Binom",
    menuSummary: "Same postbacks, no server, half the price",
    title: "Capve vs Binom: the Binom alternative with no server to run",
    description:
      "Compare Capve and Binom: price, hosting, click limits, postbacks, events and AI access. Capve uses Binom's postback parameters, runs on Cloudflare and costs half of Binom's monthly price.",
    h1: "The Binom alternative without the server.",
    lead: "Capve speaks Binom's language: the same `cnv_id`, `payout` and `cnv_status` postback, the same `{clickid}` macro, campaigns built from paths and rules. It runs on Cloudflare instead of your VPS, at half Binom's monthly price.",
    facts: {
      price: "$149/month license + your server; Cloud $299",
      hosting: "Your own server, or Binom Cloud",
      source: "Proprietary",
      ai: "Not advertised",
      trial: "14 days (Cloud: 7)",
    },
    rows: [
      {
        label: "Price",
        capve: CAPVE.price,
        them: "Self-hosted license $149 on monthly billing ($104 on yearly billing), plus the server you rent. Binom Cloud $299.",
      },
      {
        label: "Click limits",
        capve: "1M clicks/month (Starter) or 60M (Pro). No overage fees.",
        them: "Self-hosted: up to 260M clicks/day, no metering. Cloud: up to 2M clicks/day.",
      },
      {
        label: "Hosting",
        capve: CAPVE.hosting,
        them: "Self-hosted on a server you buy and maintain (PHP, MySQL, ionCube), or Binom Cloud.",
      },
      { label: "Source code", capve: CAPVE.source, them: "Proprietary license." },
      {
        label: "Postback",
        capve: "`/click?cnv_id=&payout=&cnv_status=`",
        them: "`/click.php?cnv_id=&payout=&cnv_status=`",
      },
      {
        label: "Conversion events",
        capve: CAPVE.events,
        them: "Numeric counters `event1`–`event10` on the click.",
      },
      {
        label: "Anti-fraud",
        capve: "Blocklists (IP, CIDR, ASN, user agent), datacenter flag, safe page.",
        them: "Rules-based filtering, plus the Binom Protect add-on ($99/month).",
      },
      { label: "AI assistant access", capve: CAPVE.ai, them: "No MCP server advertised." },
      { label: "Free trial", capve: CAPVE.trial, them: "14 days, extendable to 30 on request. Binom Cloud: 7 days." },
    ],
    switchReasons: [
      {
        icon: "settings",
        title: "No server to run",
        body: "No VPS to size, no PHP, MySQL or ionCube to update. Capve runs on Cloudflare and redirects close to each visitor.",
      },
      {
        icon: "swap",
        title: "Your postbacks already fit",
        body: "Networks keep sending `cnv_id`, `payout` and `cnv_status`. Change the host, add your postback key, done.",
      },
      {
        icon: "coin",
        title: "Cloud volume at half the price",
        body: "Capve Pro includes 60M clicks a month for $149.50. Binom Cloud lists up to 2M clicks a day for $299.",
      },
      {
        icon: "mcp",
        title: "Named events and AI access",
        body: "Registrations and FTDs as named events with their own columns, and an MCP server with 93 tools.",
      },
    ],
    stayReasons: [
      "You send far more than 60M clicks a month and run servers cheaply. Binom's self-hosted license doesn't meter clicks.",
      "You store and edit landing pages inside the tracker. Capve links to landers you host elsewhere.",
      "You depend on Binom Protect or cloaking integrations such as Magic Checker or Adspect.",
      "You need reports grouped five levels deep. Capve's drilldown goes four.",
    ],
    faqs: [
      {
        q: "Is Capve a fork of Binom?",
        a: "No. Capve is its own codebase. It follows Binom's postback conventions on purpose, so switching takes minutes per network.",
      },
      {
        q: "Is Capve really half the price?",
        a: "Against Binom's monthly prices, yes: Starter is $74.50 against the $149 self-hosted license, and Pro is $149.50 against Binom Cloud's $299. Binom's yearly billing is cheaper, and its self-hosted license has no click limit, but you also pay for and run the server.",
      },
      {
        q: "Can I import a Binom backup?",
        a: "Not directly. Binom's backup is its own format, and it excludes statistics. Recreate sources, offers and landers in Capve, or let your AI assistant create them through the MCP server from your list. See the [migration guide](/migrate/binom).",
      },
      {
        q: "Does `{clickid}` work the same way?",
        a: "Yes. Put `{clickid}` in the offer URL, and the network sends it back as `cnv_id` in the postback.",
      },
    ],
    sources: [
      { label: "Binom pricing", url: "https://binom.org/price" },
      { label: "Binom postback docs", url: "https://docs.binom.org/postback-v2.php" },
      { label: "Binom URL settings", url: "https://docs.binom.org/settings-urls.php" },
      { label: "Binom events", url: "https://docs.binom.org/events.php" },
      { label: "Binom tokens", url: "https://docs.binom.org/tokens-v2.php" },
      { label: "Binom backup", url: "https://docs.binom.org/settings-backup.php" },
    ],
    checked: CHECKED,
    migrate: {
      title: "Migrate from Binom to Capve: postbacks, tokens and campaigns",
      description:
        "Move from Binom to Capve step by step: the same cnv_id postback, token and macro mapping, rebuilding paths and rules, and a parallel run before you switch.",
      h1: "Migrate from Binom to Capve.",
      lead: "Binom users have the shortest move. Capve's postback uses the same parameter names, `{clickid}` works the same way, and campaigns are built from the same paths, rules and weights.",
      terms: [
        ["Campaign", "Campaign"],
        ["Traffic source + tokens `{t1}`–`{t30}`", "Traffic source + named tokens on `sub1`–`sub10`"],
        ["Affiliate network", "Affiliate network"],
        ["Offer", "Offer"],
        ["Landing", "Lander"],
        ["Path", "Path"],
        ["Rules", "Routing rules"],
        ["Normal rotation (weights)", "Weighted rotation"],
        ["Cost model Auto", "`cost` token on the campaign link"],
        ["`event1`–`event10`", "Named events (`event=ftd`)"],
        ["Groups", "Groups"],
      ],
      postback: {
        theirs: "https://YOUR-BINOM-DOMAIN/click.php?cnv_id={sub1}&payout={sum}&cnv_status={status}",
        capve: `${CAPVE_POSTBACK_HOST}?cnv_id={sub1}&payout={sum}&cnv_status={status}&key=YOUR_POSTBACK_KEY`,
        note: `Same parameters: change the host and path and add your postback key. \`{sub1}\`, \`{sum}\` and \`{status}\` stand for your network's own macros. ${STATUS_NOTE}`,
      },
      macros: [
        ["`{clickid}`", "`{clickid}`"],
        ["`{campaign_id}`", "`{campaign_id}`"],
        ["`{offer_id}`", "`{offer_id}`"],
        ["`{landing_id}`", "`{lander_id}`"],
        ["`{country_code}`", "`{country}`"],
        ["`{externalid}`", "`{external_id}`"],
        ["`{t1}`–`{t10}`", "`{sub1}`–`{sub10}`"],
        ["`click.php?lp=1` on the lander CTA", LP_MACRO],
      ],
      steps: [
        {
          title: "Start a trial and copy your postback key",
          body: "Create an account at capve.app. Your account's postback key is in any campaign's **Tracking & postback** card.",
        },
        {
          title: "Recreate traffic sources",
          body: "Start from a template if one exists. Otherwise, add each Binom token you use as a named token mapped to a sub ID, the external click id or cost.",
          bullets: [
            "Binom `{t1}` (zone) → named token `zoneid` on `sub1`.",
            "The source's cost macro → the `cost` slot.",
            "The source's click id → `external_id`, for postbacks back to the source.",
          ],
        },
        {
          title: "Recreate networks, offers and landers",
          body: `Offer URLs keep \`{clickid}\` where Binom had it. For landers, ${LP_CTA}, instead of \`click.php?lp=1\`. If Binom hosts any of your landers, move them to your own hosting first.`,
          code: { label: "Offer URL", text: "https://network.example/offer?aff_sub={clickid}&s2={sub1}" },
        },
        {
          title: "Rebuild one campaign",
          body: "Copy one live Binom campaign: its paths with landers, offers and weights, then its rules in the same order. Set the bot action and safe page if you use them. Then copy the campaign link into the traffic source.",
        },
        PARALLEL_STEP,
        COMPARE_STEP("Binom"),
      ],
      faqs: [
        {
          q: "Will my network's Binom postback work unchanged?",
          a: "Almost. Keep the query string, change the host and path from `/click.php` to Capve's `/click`, and add `&key=` with your postback key.",
        },
        {
          q: "What about Binom's `cnv_status2`?",
          a: "Capve stores `cnv_status2` too, next to the main status.",
        },
        {
          q: "Can I move my Binom statistics?",
          a: "No tracker imports another's history, and Binom's own backup excludes statistics. Keep Binom running read-only, or export the reports you need before you cancel.",
        },
      ],
    },
  },
  {
    slug: "voluum",
    name: "Voluum",
    menuSummary: "Clicks instead of events, no overage bills",
    title: "Capve vs Voluum: a Voluum alternative without event overages",
    description:
      "Compare Capve and Voluum on price, what counts toward your plan, overage fees, data retention, hosting and AI access. Capve counts clicks only and never charges overage.",
    h1: "A Voluum alternative that counts clicks, not events.",
    lead: "Voluum meters events: visits, clicks, conversions and impressions, and bills overage past your plan. Capve counts the clicks you send it, keeps LP clicks and conversions free, and never sends an overage bill.",
    facts: {
      price: "$149/month for 1M events",
      hosting: "SaaS",
      source: "Proprietary",
      ai: "Voluum MCP, daily request limits",
      trial: "14-day preview on request",
    },
    rows: [
      { label: "Entry price", capve: "$74.50/month for 1M clicks.", them: "Profit plan: $149/month, or $119/month billed annually, for 1M events." },
      {
        label: "What counts",
        capve: CAPVE.metering,
        them: "Events: visits, clicks, conversions and impressions (10 impressions = 1 event).",
      },
      { label: "Over the limit", capve: CAPVE.overage, them: "Overage billed per 1,000 events ($0.06 on Profit)." },
      { label: "Data retention", capve: CAPVE.retention, them: "6 months on Profit, 12 to 24 months on higher plans." },
      { label: "Hosting", capve: CAPVE.hosting, them: "Cloud (SaaS) only." },
      { label: "Source code", capve: CAPVE.source, them: "Proprietary." },
      { label: "Postback", capve: "`/click?cnv_id=&payout=&tx_id=&event=`", them: "`/postback?cid=&payout=&txid=&et=`" },
      { label: "AI assistant access", capve: CAPVE.ai, them: "Voluum MCP, with a daily request limit that depends on the plan." },
      { label: "Free trial", capve: CAPVE.trial, them: "A 14-day platform preview, requested through a form." },
    ],
    switchReasons: [
      {
        icon: "coin",
        title: "Half the entry price",
        body: "$74.50 a month against Voluum Profit's $149 on monthly billing, for a similar volume.",
      },
      {
        icon: "cursor",
        title: "Only clicks count",
        body: "A visit, its LP click and its conversion are three Voluum events. In Capve they're one click.",
      },
      {
        icon: "page",
        title: "No overage, longer history",
        body: "Go over and reports pause until the 1st, with no surprise invoice. History isn't capped at six months.",
      },
      {
        icon: "code",
        title: "Self-serve and open",
        body: "Start a trial without a sales form. Read the source on GitHub.",
      },
    ],
    stayReasons: [
      "You rely on Automizer and its API integrations with Facebook, Google and TikTok ads.",
      "You want Traffic Distribution AI to adjust weights for you.",
      "You use reusable flows across many campaigns. Capve keeps paths per campaign, and you clone campaigns instead.",
      "You send scheduled reports to Looker, Power BI or Tableau.",
      "You want the vendor to migrate your campaigns for you. Voluum advertises automatic migration.",
    ],
    faqs: [
      {
        q: "Is Capve cheaper than Voluum?",
        a: "At the entry level, Capve Starter is $74.50/month for 1M clicks, and Voluum Profit is $149/month (or $119/month billed annually) for 1M events. Because Voluum also counts LP clicks and conversions as events, the same traffic uses up more of a Voluum allowance.",
      },
      {
        q: "Does Capve have Voluum's flows?",
        a: "Capve has paths and ordered rules inside each campaign, with weighted landers and offers. There are no shared flows, so clone a campaign to reuse its setup.",
      },
      {
        q: "Does Capve support multi-offer landers?",
        a: "Not today. `{lp_click_url}` sends the visitor to the offer chosen for that click, so each click has one offer.",
      },
    ],
    sources: [
      { label: "Voluum pricing", url: "https://voluum.com/pricing/" },
      { label: "Voluum postback parameters", url: "https://doc.voluum.com/en/postback_parameters.html" },
      { label: "Voluum custom conversions", url: "https://doc.voluum.com/article/custom-conversions" },
      { label: "Voluum tracking tokens", url: "https://doc.voluum.com/en/voluum_tracking_tokens.html" },
      { label: "Voluum glossary", url: "https://doc.voluum.com/article/glossary" },
    ],
    checked: CHECKED,
    migrate: {
      title: "Migrate from Voluum to Capve: postbacks, tokens and flows",
      description:
        "Move from Voluum to Capve: map cid to cnv_id, custom conversions to events, var1–var10 to sub IDs, flows to paths and rules, then run both trackers in parallel.",
      h1: "Migrate from Voluum to Capve.",
      lead: "Voluum and Capve share the same building blocks: traffic sources, networks, offers, landers, paths and rules. The move is mostly renaming parameters.",
      terms: [
        ["Campaign", "Campaign"],
        ["Traffic source + custom variables `{var1}`–`{var10}`", "Traffic source + named tokens on `sub1`–`sub10`"],
        ["Affiliate network", "Affiliate network"],
        ["Offer", "Offer"],
        ["Lander", "Lander"],
        ["Flow", "Paths and rules in the campaign (clone to reuse)"],
        ["Path / Rule", "Path / Routing rule"],
        ["Custom conversion (`et`)", "Conversion event (`event`)"],
        ["Cost model Auto", "`cost` token on the campaign link"],
      ],
      postback: {
        theirs: "https://YOUR-VOLUUM-DOMAIN/postback?cid=#s2#&payout=#price#&txid=#tid#&et=registration",
        capve: `${CAPVE_POSTBACK_HOST}?cnv_id=#s2#&payout=#price#&tx_id=#tid#&event=registration&key=YOUR_POSTBACK_KEY`,
        note: `\`cid\` becomes \`cnv_id\`, \`txid\` becomes \`tx_id\`, and custom conversion \`et\` becomes \`event\`. The \`#…#\` values are CAKE network macros; use your network's own. ${STATUS_NOTE}`,
      },
      macros: [
        ["`{clickid}`", "`{clickid}`"],
        ["`{externalid}`", "`{external_id}`"],
        ["`{campaign.id}`", "`{campaign_id}`"],
        ["`{var1}`–`{var10}`", "`{sub1}`–`{sub10}`"],
        ["`{country}`", "`{country}`"],
        ["Click URL `/click` on the lander", LP_MACRO],
      ],
      steps: [
        {
          title: "Start a trial and copy your postback key",
          body: "Create an account at capve.app. The postback key is in any campaign's **Tracking & postback** card.",
        },
        {
          title: "Recreate traffic sources",
          body: "Use a template if there is one. For other sources, recreate each Voluum custom variable as a named token mapped to a sub ID, and map the source's cost and click id.",
        },
        {
          title: "Recreate networks, offers and landers",
          body: "Voluum can export all offers as CSV, which makes a good checklist, or input for your AI assistant. Keep `{clickid}` in offer URLs. For landers, " + LP_CTA + ", instead of Voluum's `/click` URL.",
        },
        {
          title: "Turn flows into paths and rules",
          body: "For each campaign, recreate the flow's default path and its rule-based paths in the same order. Weights carry over as they are.",
        },
        PARALLEL_STEP,
        COMPARE_STEP("Voluum"),
      ],
      faqs: [
        {
          q: "How do I map Voluum custom conversions?",
          a: "Each `et` value becomes an `event` value in the Capve postback, for example `event=install`. Capve shows each event as its own column, with no slot limit.",
        },
        {
          q: "Will my numbers match Voluum's exactly?",
          a: "Close, rarely exactly. Trackers differ in bot filtering, unique-visit rules and timezone. Compare daily totals in the same timezone during the parallel run.",
        },
      ],
    },
  },
  {
    slug: "redtrack",
    name: "RedTrack",
    menuSummary: "Flat price, no seats, no event overage",
    title: "Capve vs RedTrack: a RedTrack alternative for affiliates",
    description:
      "Compare Capve and RedTrack for affiliate and lead-gen tracking: price, event metering, seats, overage, data retention, ad-platform integrations and AI access.",
    h1: "A RedTrack alternative with no seats and no overage.",
    lead: "RedTrack prices by events and seats, and bills overage. Capve prices by clicks, includes every team member, and pauses reports instead of billing more.",
    facts: {
      price: "$169/month for 5M events, 1 user",
      hosting: "SaaS",
      source: "Proprietary",
      ai: "API and MCP on every plan",
      trial: "14 days",
    },
    rows: [
      {
        label: "Price",
        capve: CAPVE.price,
        them: "Solo $169/month (5M events, 1 user), Team $399 (20M, 5 users), Enterprise $999 (75M, 15 users) on monthly billing.",
      },
      { label: "What counts", capve: CAPVE.metering, them: "Events." },
      {
        label: "Over the limit",
        capve: CAPVE.overage,
        them: "Overage per 1,000 events ($0.04 on Solo). Stay above the allowance and you move to the next plan.",
      },
      { label: "Team members", capve: CAPVE.seats, them: "1 user on Solo. Extra seats $29/month on Team and up." },
      { label: "Data retention", capve: CAPVE.retention, them: "12 months on Solo, 24 on Team, 36 on Enterprise." },
      {
        label: "Ad platforms",
        capve: "Postbacks and webhooks. Cost sync from Adcash, a cost API for the rest.",
        them: "Conversion APIs for Meta, Google, TikTok and others, with ad-level spend sync.",
      },
      { label: "Hosting", capve: CAPVE.hosting, them: "Cloud (SaaS) only." },
      { label: "AI assistant access", capve: CAPVE.ai, them: "API and MCP on every affiliate plan." },
      { label: "Free trial", capve: CAPVE.trial, them: "14 days with every add-on." },
    ],
    switchReasons: [
      {
        icon: "coin",
        title: "60M clicks for $149.50",
        body: "Capve Pro costs less than RedTrack Solo on monthly billing and includes twelve times the volume.",
      },
      { icon: "users", title: "Everyone included", body: "No seat limits or seat fees. Give buyers and clients their own login and role." },
      {
        icon: "page",
        title: "Predictable bills",
        body: "No overage and no automatic plan moves. Over the limit, reports pause until the 1st.",
      },
      { icon: "code", title: "Open and portable", body: "Public source and a self-hosting option, so you're never locked in." },
    ],
    stayReasons: [
      "You send conversions to Meta, Google or TikTok through built-in conversion APIs. Capve doesn't do that natively today.",
      "You need ad-level spend sync from ad platforms every 30 to 60 minutes.",
      "You run an e-commerce store and want Shopify or WooCommerce order sync.",
      "You manage ads (pause, bids, budgets) from the tracker, or use its mobile app.",
    ],
    faqs: [
      {
        q: "Is Capve good for Facebook and Google ads?",
        a: "Capve tracks those clicks with templates for `fbclid`, `gclid` and the usual campaign, ad set and ad parameters. It doesn't send conversions to their APIs for you. Do that from your backend, or keep a tool that does.",
      },
      {
        q: "How does pricing compare at scale?",
        a: "RedTrack Enterprise is $999/month for 75M events on monthly billing. Capve Pro is $149.50/month for 60M clicks, and LP clicks and conversions don't count.",
      },
    ],
    sources: [
      { label: "RedTrack pricing", url: "https://www.redtrack.io/pricing/" },
      { label: "RedTrack postback", url: "https://help.redtrack.io/knowledgebase/kb/conversion-tracking/postback-offer-source/" },
      { label: "RedTrack event types", url: "https://help.redtrack.io/knowledgebase/kb/conversion-tracking/tracking-event-types" },
      { label: "RedTrack parameters", url: "https://help.redtrack.io/knowledgebase/kb/features/supported-dynamic-parameters/" },
    ],
    checked: CHECKED,
    migrate: {
      title: "Migrate from RedTrack to Capve: postbacks, funnels and events",
      description:
        "Move affiliate campaigns from RedTrack to Capve: map clickid and sum to cnv_id and payout, conversion types to events, funnels to paths, and run both in parallel.",
      h1: "Migrate from RedTrack to Capve.",
      lead: "RedTrack's traffic channels, offer sources and funnels map to Capve's traffic sources, affiliate networks and paths. The postback changes two parameter names.",
      terms: [
        ["Traffic channel", "Traffic source"],
        ["Offer source", "Affiliate network"],
        ["Offer", "Offer"],
        ["Landing page", "Lander"],
        ["Campaign", "Campaign"],
        ["Funnel (landers, offers, weights)", "Path"],
        ["Filters", "Routing rules"],
        ["Conversion type (`type`)", "Conversion event (`event`)"],
        ["`sub1`–`sub20`", "`sub1`–`sub10` via named tokens"],
      ],
      postback: {
        theirs: "https://YOUR-REDTRACK-DOMAIN/postback?clickid={aff_sub}&sum={payout}&type=Deposit",
        capve: `${CAPVE_POSTBACK_HOST}?cnv_id={aff_sub}&payout={payout}&event=deposit&key=YOUR_POSTBACK_KEY`,
        note: `\`clickid\` becomes \`cnv_id\`, \`sum\` becomes \`payout\`, and \`type\` becomes \`event\` (Capve lowercases event names, so \`Deposit\` and \`deposit\` are the same event). \`{aff_sub}\` and \`{payout}\` stand for your network's macros. ${STATUS_NOTE}`,
      },
      macros: [
        ["`{clickid}`", "`{clickid}`"],
        ["`{campaignid}`", "`{campaign_id}`"],
        ["`{offerid}`", "`{offer_id}`"],
        ["`{landerid}`", "`{lander_id}`"],
        ["`{country}`", "`{country}`"],
        ["`{sub1}`–`{sub10}`", "`{sub1}`–`{sub10}`"],
        ["LP click URL `/click/1`", LP_MACRO],
      ],
      steps: [
        {
          title: "Start a trial and copy your postback key",
          body: "Create an account at capve.app. The postback key is in any campaign's **Tracking & postback** card.",
        },
        {
          title: "Recreate traffic channels as sources",
          body: "Use a template where one exists. Map the channel's parameters you report on to named tokens on `sub1`–`sub10`, plus cost and the source's click id.",
        },
        {
          title: "Recreate offer sources, offers and landers",
          body: `Keep \`{clickid}\` in offer URLs. For landers, ${LP_CTA}, instead of the \`/click/1\` CTA URL.`,
        },
        {
          title: "Turn funnels into paths",
          body: "Each funnel becomes a path with the same landers, offers and weights. Filters become rules, in the same order.",
        },
        PARALLEL_STEP,
        COMPARE_STEP("RedTrack"),
      ],
      faqs: [
        {
          q: "Can Capve send postbacks back to my traffic channel?",
          a: "Yes. Traffic-source postbacks fire once per approved conversion, optionally limited to one event and to a percentage of conversions.",
        },
        {
          q: "What about RedTrack's `rdtk_event_id` deduplication?",
          a: "Send the transaction id as `tx_id`. Distinct ids become separate conversions, and repeats without one update the existing conversion.",
        },
      ],
    },
  },
  {
    slug: "keitaro",
    name: "Keitaro",
    menuSummary: "No VPS, and traffic never stops",
    title: "Capve vs Keitaro: a Keitaro alternative with no VPS",
    description:
      "Compare Capve and Keitaro: managed Cloudflare hosting versus a self-hosted VPS, license expiry, trial, team seats, postbacks and AI access.",
    h1: "A Keitaro alternative you don't have to host.",
    lead: "Keitaro runs only on a server you rent and maintain, and stops redirecting when its license expires. Capve runs on Cloudflare, and your traffic keeps flowing even if billing lapses.",
    facts: {
      price: "€49/month + your server",
      hosting: "Your own server only",
      source: "Proprietary, one key per server",
      ai: "MCP available",
      trial: "None (14-day refund)",
    },
    rows: [
      {
        label: "Price",
        capve: CAPVE.price,
        them: "€49/month (Starter, 1 user, 1 domain) to €499/month (Enterprise), plus your server. No click limits.",
      },
      {
        label: "Hosting",
        capve: CAPVE.hosting,
        them: "Self-hosted only, on a server you rent (CentOS Stream, 4 GB RAM minimum). No SaaS version.",
      },
      {
        label: "If billing lapses",
        capve: "Redirects, postbacks and conversions keep running. Only reports pause.",
        them: "When the license expires, redirects and traffic processing stop.",
      },
      { label: "Team members", capve: CAPVE.seats, them: "1 user on Starter and Advanced, up to 5 on Expert, up to 50 on Team." },
      { label: "Source code", capve: CAPVE.source, them: "Proprietary. One license key per server IP." },
      { label: "Postback", capve: "`/click?cnv_id=&payout=&cnv_status=`", them: "`/{postback-key}/postback?subid=&status=&payout=`" },
      { label: "AI assistant access", capve: CAPVE.ai, them: "MCP for Claude Code, Codex and Cursor." },
      { label: "Free trial", capve: CAPVE.trial, them: "No trial. Refund within 14 days of purchase." },
    ],
    switchReasons: [
      {
        icon: "settings",
        title: "No server work",
        body: "No VPS, no installer, no OS updates or backups. Cloudflare runs the infrastructure.",
      },
      {
        icon: "route",
        title: "Traffic never stops",
        body: "A failed payment doesn't take your campaigns offline. Capve keeps redirecting and recording.",
      },
      {
        icon: "users",
        title: "Everyone included",
        body: "No user caps per edition. Add buyers and clients with their own role.",
      },
      { icon: "check", title: "Try before you pay", body: "14 days with every feature and no card, instead of buy-then-refund." },
    ],
    stayReasons: [
      "Your volume is high and you're comfortable running servers. Keitaro starts at €49/month with no click limits.",
      "You build landing pages in the tracker's editor.",
      "You use Keitaro's bot lists, proxy detection or user scripts.",
      "You need Facebook or TikTok cost and conversion integrations.",
    ],
    faqs: [
      {
        q: "Why is Capve priced by clicks when Keitaro isn't?",
        a: "Keitaro's price covers the license, and you pay separately for the server that processes your clicks. Capve's price includes the infrastructure, so volume is part of the plan.",
      },
      {
        q: "Is a VPS faster than Cloudflare?",
        a: "A VPS answers from one location. Capve's Worker answers from Cloudflare data centers near each visitor, which usually means a shorter redirect for global traffic.",
      },
    ],
    sources: [
      { label: "Keitaro pricing", url: "https://keitaro.io/en/pricing" },
      { label: "Keitaro license", url: "https://docs.keitaro.io/en/site/license.html" },
      { label: "Keitaro FAQ", url: "https://docs.keitaro.io/en/faq.html" },
      { label: "Keitaro postback", url: "https://docs.keitaro.io/en/conversions-and-postback/postback.html" },
      { label: "Keitaro placeholders", url: "https://docs.keitaro.io/en/landing-pages-and-offers/placeholders.html" },
      { label: "Keitaro edition plans", url: "https://docs.keitaro.io/en/site/edition-plans.html" },
    ],
    checked: CHECKED,
    migrate: {
      title: "Migrate from Keitaro to Capve: subid, flows and conversion types",
      description:
        "Move from self-hosted Keitaro to Capve: map subid to cnv_id, flows and filters to paths and rules, conversion types to events, and retire your VPS.",
      h1: "Migrate from Keitaro to Capve.",
      lead: "Keitaro's flows and filters become Capve's paths and rules, and `{subid}` becomes `{clickid}`. When you're done, you can shut the server down.",
      terms: [
        ["Campaign", "Campaign"],
        ["Flow (forced, regular, default)", "Rule paths and the default pool"],
        ["Filter", "Rule condition"],
        ["Weight-based rotation", "Weighted rotation"],
        ["Bind visitors", "Sticky rotation"],
        ["Landing", "Lander"],
        ["Offer / Affiliate network / Traffic source", "Offer / Affiliate network / Traffic source"],
        ["Conversion types (status mapping)", "Statuses as sent, plus named events"],
      ],
      postback: {
        theirs: "http://YOUR-KEITARO-SERVER/POSTBACK_KEY/postback?subid={subid}&status={status}&payout={payout}&tid={txid}",
        capve: `${CAPVE_POSTBACK_HOST}?cnv_id={subid}&cnv_status={status}&payout={payout}&tx_id={txid}&key=YOUR_POSTBACK_KEY`,
        note: `\`subid\` becomes \`cnv_id\`, \`status\` becomes \`cnv_status\`, and \`tid\` becomes \`tx_id\`. The values in braces are your network's macros. For registrations and deposits, add \`&event=registration\` or \`&event=deposit\` instead of a status mapping. ${STATUS_NOTE}`,
      },
      macros: [
        ["`{subid}`", "`{clickid}`"],
        ["`{campaign_id}`", "`{campaign_id}`"],
        ["`{offer_id}`", "`{offer_id}`"],
        ["`{landing_id}`", "`{lander_id}`"],
        ["`{country}`", "`{country}`"],
        ["`{external_id}`", "`{external_id}`"],
        ["`{sub_id_1}`–`{sub_id_10}`", "`{sub1}`–`{sub10}`"],
        ["`{offer}` or `?_lp=1` on the lander CTA", LP_MACRO],
      ],
      steps: [
        {
          title: "Start a trial and copy your postback key",
          body: "Create an account at capve.app. The postback key is in any campaign's **Tracking & postback** card.",
        },
        {
          title: "Recreate sources, networks, offers and landers",
          body: `Swap \`{subid}\` for \`{clickid}\` in every offer URL. For landers, ${LP_CTA}. Landers stored on the Keitaro server (local landers) must be exported and hosted elsewhere first, because they disappear with the server.`,
        },
        {
          title: "Turn flows into rules and paths",
          body: "Forced and regular flows with filters become ordered rules with conditions, each with its own paths. The default flow becomes the default pool. Keep the flow order.",
          bullets: [
            "Filter on country, device, OS, browser, ISP, language or sub ID → rule condition.",
            "Bots → the bot condition, or the campaign's safe page.",
          ],
        },
        PARALLEL_STEP,
        {
          title: "Compare, switch, and retire the server",
          body: "When daily clicks and conversions line up, move the rest of the traffic. Keep the Keitaro server, its postback URL and the license running until conversions and status updates for its last clicks stop arriving, because networks keep sending those click ids to Keitaro. Then export the reports you want to keep as CSV, and cancel the license and the VPS.",
        },
      ],
      faqs: [
        {
          q: "Do I need Keitaro's status mapping?",
          a: "No. Capve stores the network's status as sent and knows which ones mean rejected or pending. Use events for registrations and deposits.",
        },
        {
          q: "Do my landers need to change?",
          a: `Landers hosted outside Keitaro only need a new call to action: ${LP_CTA}. Local landers stored on the Keitaro server must be exported, hosted elsewhere and added to Capve with their new URLs. Test the whole funnel before you shut the server down.`,
        },
      ],
    },
  },
  {
    slug: "bemob",
    name: "BeMob",
    menuSummary: "No entity caps, history kept",
    title: "Capve vs BeMob: a BeMob alternative with no entity limits",
    description:
      "Compare Capve and BeMob on price, event metering, data retention, campaign and lander limits, overage, postbacks and AI access.",
    h1: "A BeMob alternative without caps on campaigns or history.",
    lead: "BeMob's paid plans limit campaigns, landers, flows and custom conversions, and keep data for one to six months. Capve has no entity limits and doesn't cap history by plan.",
    facts: {
      price: "Free (100K events); $49/month for 1M events",
      hosting: "SaaS",
      source: "Proprietary",
      ai: "Not advertised",
      trial: "Free plan",
    },
    rows: [
      {
        label: "Price",
        capve: CAPVE.price,
        them: "Free (100K events), Professional $49/month (1M events), Business $249 (10M), Enterprise $499 (30M).",
      },
      { label: "What counts", capve: CAPVE.metering, them: "Events: impressions, visits, clicks and conversions." },
      { label: "Over the limit", capve: CAPVE.overage, them: "Overage per 1,000 events ($0.05 on Professional), paid monthly." },
      { label: "Data retention", capve: CAPVE.retention, them: "1 month on Free and Professional, 3 on Business, 6 on Enterprise." },
      {
        label: "Limits",
        capve: "Unlimited campaigns, offers, landers and conversion events.",
        them: "Professional: 50 campaigns, 10 landing pages, 10 flows, 10 traffic sources, 1 custom conversion.",
      },
      { label: "Postback", capve: "`/click?cnv_id=&payout=&tx_id=&event=`", them: "`/postback?cid=&payout=&txid=&status=&cet=`" },
      { label: "AI assistant access", capve: CAPVE.ai, them: "No MCP server advertised." },
      { label: "Free trial", capve: CAPVE.trial, them: "Free plan with 100K events per month." },
    ],
    switchReasons: [
      { icon: "page", title: "Keep your history", body: "Compare this month to last quarter. Capve doesn't delete data after 30 days." },
      { icon: "landers", title: "No entity caps", body: "Test as many landers, offers and events as you like on any plan." },
      { icon: "cursor", title: "Clicks, not events", body: "LP clicks and conversions don't count toward your plan." },
      { icon: "mcp", title: "AI access", body: "Connect Claude or Cursor and let it read reports and edit campaigns." },
    ],
    stayReasons: [
      "You run small tests and want a free plan. Capve has a 14-day trial, not a free tier.",
      "At low volume, BeMob Professional is cheaper: $49 against $74.50 for about 1M.",
      "You start and stop campaigns on MGID, ExoClick or PropellerAds through BeMob's API integrations.",
      "You use Ghost ID, double meta redirects or cloaking domains.",
    ],
    faqs: [
      {
        q: "BeMob is cheaper. Why pay more?",
        a: "At 1M per month, BeMob Professional costs $49 and Capve Starter $74.50. But BeMob counts LP clicks and conversions as events, keeps data for one month and caps landers at 10. If you need history or many tests, Capve fits better.",
      },
      {
        q: "How do I map BeMob custom conversions?",
        a: "Each `cet` value becomes an `event` value in the Capve postback, with no limit on how many events you track.",
      },
    ],
    sources: [
      { label: "BeMob pricing", url: "https://bemob.com/pricing" },
      { label: "BeMob postback", url: "https://docs.bemob.com/en/postback-settings-of-affiliate-network" },
      { label: "BeMob custom conversions", url: "https://docs.bemob.com/en/custom-conversions" },
      { label: "BeMob click URLs", url: "https://docs.bemob.com/en/bemob-click-urls" },
    ],
    checked: CHECKED,
    migrate: {
      title: "Migrate from BeMob to Capve: postbacks, flows and custom conversions",
      description:
        "Move from BeMob to Capve: map cid and cet to cnv_id and event, flows to paths and rules, {clickId} to {clickid}, then run both in parallel.",
      h1: "Migrate from BeMob to Capve.",
      lead: "BeMob's flows, paths and weights translate one to one. The postback renames `cid` and `cet`, and `{clickId}` becomes `{clickid}`.",
      terms: [
        ["Campaign", "Campaign"],
        ["Flow / Built-in flow", "Paths and rules in the campaign"],
        ["Default path", "Default pool"],
        ["Rule-based path", "Routing rule with its own paths"],
        ["Landing", "Lander"],
        ["Offer / Affiliate network / Traffic source", "Offer / Affiliate network / Traffic source"],
        ["Custom conversion (`cet`)", "Conversion event (`event`)"],
        ["Cost model Auto", "`cost` token on the campaign link"],
      ],
      postback: {
        theirs: "https://YOUR-BEMOB-DOMAIN/postback?cid={click_id}&payout={payout}&txid={transaction_id}&status={status}",
        capve: `${CAPVE_POSTBACK_HOST}?cnv_id={click_id}&payout={payout}&tx_id={transaction_id}&cnv_status={status}&key=YOUR_POSTBACK_KEY`,
        note: `\`cid\` becomes \`cnv_id\`, \`txid\` becomes \`tx_id\`, \`status\` becomes \`cnv_status\`, and \`cet\` becomes \`event\`. The values in braces are your network's macros. ${STATUS_NOTE}`,
      },
      macros: [
        ["`{clickId}`", "`{clickid}`"],
        ["`{campaignId}`", "`{campaign_id}`"],
        ["`{externalId}`", "`{external_id}`"],
        ["`{country}`", "`{country}`"],
        ["`{custom1}`–`{custom10}`", "`{sub1}`–`{sub10}`"],
        ["Click URL `/click` on the lander", LP_MACRO],
      ],
      steps: [
        {
          title: "Start a trial and copy your postback key",
          body: "Create an account at capve.app. The postback key is in any campaign's **Tracking & postback** card.",
        },
        {
          title: "Recreate sources, networks, offers and landers",
          body: "Map the source's custom parameters to named tokens on `sub1`–`sub10`. In offer URLs, replace `{clickId}` with `{clickid}`. For landers, " + LP_CTA + ".",
        },
        {
          title: "Rebuild flows as paths and rules",
          body: "The default path becomes the default pool. Each rule-based path becomes a rule with the same conditions and its own weighted paths.",
        },
        PARALLEL_STEP,
        COMPARE_STEP("BeMob"),
      ],
      faqs: [
        {
          q: "BeMob only keeps one month of data. Should I export first?",
          a: "Yes. Export the reports you want to keep from BeMob before you switch, since older data may already be gone on lower plans.",
        },
      ],
    },
  },
  {
    slug: "clickflare",
    name: "ClickFlare",
    menuSummary: "Lower entry price, clicks not events",
    title: "Capve vs ClickFlare: a ClickFlare alternative",
    description:
      "Compare Capve and ClickFlare on price, event metering, overage, hosting, ad-platform integrations and AI access, with a migration guide for postbacks and tokens.",
    h1: "A ClickFlare alternative with a lower entry price.",
    lead: "ClickFlare starts at $89/month for 1M events, counting visits, clicks, conversions and postbacks. Capve starts at $74.50 for 1M clicks, and nothing else counts.",
    facts: {
      price: "$89/month for 1M events",
      hosting: "SaaS",
      source: "Proprietary",
      ai: "AI Copilot",
      trial: "14 days, no card",
    },
    rows: [
      {
        label: "Price",
        capve: CAPVE.price,
        them: "Starter $89/month (1M events), Pro $219 (5M), Master $429 (20M) on monthly billing.",
      },
      { label: "What counts", capve: CAPVE.metering, them: "Events: visits, clicks, conversions and postbacks." },
      { label: "Over the limit", capve: CAPVE.overage, them: "Overage per 1,000 events ($0.04 on Starter), billed at the end of the cycle." },
      {
        label: "Ad platforms",
        capve: "Postbacks and webhooks. Cost sync from Adcash, a cost API for the rest.",
        them: "Conversion APIs for Facebook, Google, TikTok, Snapchat, Reddit and more, with automatic cost sync.",
      },
      { label: "Hosting", capve: CAPVE.hosting, them: "Cloud (SaaS) only." },
      { label: "Source code", capve: CAPVE.source, them: "Proprietary." },
      { label: "Postback", capve: "`/click?cnv_id=&payout=&tx_id=&event=`", them: "`/cf/cv?click_id=&payout=&txid=&ct=`" },
      {
        label: "AI assistant access",
        capve: CAPVE.ai,
        them: "AI Copilot and AI traffic routing. ClickFlare also markets MCP support.",
      },
      { label: "Free trial", capve: CAPVE.trial, them: "14 days, no card." },
    ],
    switchReasons: [
      { icon: "coin", title: "Lower entry price", body: "$74.50 against $89 per month on monthly billing, for a similar volume." },
      { icon: "cursor", title: "Clicks, not events", body: "A visit, its LP click, conversion and postback are four events in ClickFlare, one click in Capve." },
      { icon: "page", title: "No overage bills", body: "Go over and reports pause until the 1st. Nothing extra is charged." },
      { icon: "code", title: "Public source", body: "Audit the tracking code, or run it yourself on Cloudflare." },
    ],
    stayReasons: [
      "You send conversions to ad platforms through built-in conversion APIs.",
      "You want automatic cost sync from Facebook, Google or TikTok.",
      "You use a mobile app, or the Ads Manager to change bids and budgets.",
      "You run listicles with numbered CTAs to several offers.",
    ],
    faqs: [
      {
        q: "Is Capve's MCP the same as ClickFlare's AI Copilot?",
        a: "No. Copilot is an assistant inside ClickFlare. Capve's MCP server lets the assistant you already use, such as Claude or Cursor, call 93 Capve tools with your permissions.",
      },
      {
        q: "How do I map ClickFlare's `ct` conversion types?",
        a: "Each `ct` value becomes an `event` value in the Capve postback, such as `event=lead`.",
      },
    ],
    sources: [
      { label: "ClickFlare pricing", url: "https://www.clickflare.com/pricing" },
      {
        label: "ClickFlare postback parameters",
        url: "https://www.clickflare.com/docs/en/tracking/click-flare-parameters-in-postback-urls",
      },
      { label: "ClickFlare glossary", url: "https://www.clickflare.com/docs/en/getting-started-with-click-flare/glossary-of-terms" },
      { label: "ClickFlare API", url: "https://www.clickflare.com/docs/en/api/clickflare-api-overview" },
    ],
    checked: CHECKED,
    migrate: {
      title: "Migrate from ClickFlare to Capve: postbacks, tracking fields and flows",
      description:
        "Move from ClickFlare to Capve: map click_id and ct to cnv_id and event, tracking fields to sub IDs, flows and paths to Capve paths and rules.",
      h1: "Migrate from ClickFlare to Capve.",
      lead: "ClickFlare's traffic sources, flows, paths and rules carry over to Capve with new names. Swap `{cf_click_id}` for `{clickid}` and update one postback per network.",
      terms: [
        ["Campaign", "Campaign"],
        ["Flow", "Paths and rules in the campaign"],
        ["Default path / conditional path", "Default pool / routing rule"],
        ["Tracking fields 1–20", "Named tokens on `sub1`–`sub10`"],
        ["Lander / Offer / Affiliate network", "Lander / Offer / Affiliate network"],
        ["Conversion type (`ct`)", "Conversion event (`event`)"],
        ["Click (LP click)", "LP click"],
      ],
      postback: {
        theirs: "https://YOUR-CLICKFLARE-DOMAIN/cf/cv?click_id={aff_sub}&payout={payout}&txid={txid}&ct=lead",
        capve: `${CAPVE_POSTBACK_HOST}?cnv_id={aff_sub}&payout={payout}&tx_id={txid}&event=lead&key=YOUR_POSTBACK_KEY`,
        note: `\`click_id\` becomes \`cnv_id\` (Capve also accepts \`click_id\`), \`txid\` becomes \`tx_id\`, and \`ct\` becomes \`event\`. The values in braces are your network's macros. ${STATUS_NOTE}`,
      },
      macros: [
        ["`{cf_click_id}`", "`{clickid}`"],
        ["`{trackingField1}`–`{trackingField10}`", "`{sub1}`–`{sub10}`"],
        ["CTA URL `/cf/click`", LP_MACRO],
      ],
      steps: [
        {
          title: "Start a trial and copy your postback key",
          body: "Create an account at capve.app. The postback key is in any campaign's **Tracking & postback** card.",
        },
        {
          title: "Recreate sources, networks, offers and landers",
          body: "ClickFlare's public API lists every entity, which makes a good checklist or input for your AI assistant. Swap `{cf_click_id}` for `{clickid}` in offer URLs. For landers, " + LP_CTA + ", instead of `/cf/click`.",
        },
        {
          title: "Rebuild flows as paths and rules",
          body: "The default path becomes the default pool. Each conditional path becomes a routing rule with its own weighted landers and offers.",
        },
        PARALLEL_STEP,
        COMPARE_STEP("ClickFlare"),
      ],
      faqs: [
        {
          q: "Does Capve accept `click_id` in the postback?",
          a: "Yes. `click_id` is accepted as an alias of `cnv_id`, so you can keep that part of the URL.",
        },
      ],
    },
  },
];

export function findCompetitor(slug: string): Competitor | undefined {
  return COMPETITORS.find((competitor) => competitor.slug === slug);
}
