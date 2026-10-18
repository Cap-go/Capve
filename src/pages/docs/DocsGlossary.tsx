import { Link } from "react-router-dom";

const TERMS: { term: string; definition: string; link?: { to: string; label: string } }[] = [
  {
    term: "Affiliate network",
    definition:
      "The platform that hosts offers and pays for conversions. It receives Capve's click ID and calls the postback URL when a conversion happens.",
    link: { to: "/docs/postback", label: "Postback URL" },
  },
  {
    term: "Bot click",
    definition:
      "A click flagged by anti-fraud rules. Bot clicks are reported separately, carry no cost, and stay out of CR, EPC, and CPC.",
    link: { to: "/docs/routing", label: "Routing rules & anti-fraud" },
  },
  {
    term: "Campaign",
    definition:
      "One tracking link with its traffic source, routing paths, postbacks, and stats. Several offers and networks can sit behind one campaign.",
    link: { to: "/docs/campaigns", label: "Multi-provider campaigns" },
  },
  {
    term: "Click ID (click_id)",
    definition:
      "The unique ID Capve creates for each tracked visit. Pass it to the offer, then send it back as cnv_id to attribute the conversion.",
    link: { to: "/docs/click-ids", label: "Click IDs & SubIDs" },
  },
  {
    term: "cnv_id",
    definition: "The postback parameter that carries Capve's click ID back from the network.",
  },
  {
    term: "Conversion event",
    definition:
      "A named step such as lead, registration, ftd, or sale. Each event is counted on its own and can trigger its own outgoing postback.",
  },
  {
    term: "CPC",
    definition: "Cost per click: cost divided by human (non-bot) clicks.",
  },
  {
    term: "CR",
    definition: "Conversion rate: conversions divided by human clicks, as a percentage.",
  },
  {
    term: "EPC",
    definition: "Earnings per click: revenue divided by human clicks.",
  },
  {
    term: "External ID (external_id)",
    definition:
      "The traffic source's own click ID, captured from clickid or a mapped token. Capve returns it in outgoing postbacks so the source can credit its ad click.",
  },
  {
    term: "FTD",
    definition: "First-time deposit. Common in casino and betting offers, tracked as the ftd event.",
  },
  {
    term: "Lander",
    definition: "A pre-sell page shown before the offer. LP CTR measures how many visitors click through it.",
  },
  {
    term: "Offer",
    definition: "The destination that pays when a click converts. Offers can be weighted inside a path.",
  },
  {
    term: "Path",
    definition:
      "A route inside a campaign: which landers and offers a visitor sees. Rules pick a path by geo, device, time, and more.",
    link: { to: "/docs/routing", label: "Routing rules" },
  },
  {
    term: "Postback (S2S)",
    definition:
      "A server-to-server call that reports a conversion. Incoming postbacks go from a network to Capve; outgoing postbacks go from Capve to a traffic source.",
    link: { to: "/docs/postback", label: "Postback URL" },
  },
  {
    term: "ROI",
    definition: "Return on investment: profit divided by cost, as a percentage. Empty when there is no cost.",
  },
  {
    term: "SubID (sub1–sub10)",
    definition:
      "Labels for analysis, such as placement, creative, or audience. Many clicks share a SubID; it never identifies a single click.",
    link: { to: "/docs/click-ids", label: "SubID taxonomy" },
  },
  {
    term: "Token",
    definition:
      "A placeholder such as {click_id} or {payout} that Capve or a platform replaces with a real value in a URL.",
    link: { to: "/docs/traffic-sources", label: "Traffic source tokens" },
  },
  {
    term: "Traffic source",
    definition: "Where clicks come from: an ad network, a publisher, or a newsletter. It sets cost and token mapping.",
    link: { to: "/docs/traffic-sources", label: "Traffic sources & cost" },
  },
  {
    term: "velo_ref",
    definition:
      "The query parameter added to merchant URLs for browser attribution. The snippet reads it so your checkout can report the affiliate.",
    link: { to: "/docs/browser-attribution", label: "Browser attribution" },
  },
];

export function DocsGlossary() {
  return (
    <>
      <h1>Glossary</h1>
      <p className="docs-lead">
        Short definitions of the tracking terms used across Capve, from click IDs to ROI.
      </p>
      <h2>Terms A–Z</h2>
      <dl className="docs-glossary">
        {TERMS.map((item) => (
          <div key={item.term}>
            <dt>{item.term}</dt>
            <dd>
              {item.definition}
              {item.link && (
                <>
                  {" "}
                  <Link to={item.link.to}>{item.link.label} →</Link>
                </>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}
