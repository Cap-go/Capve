import { CodeBlock } from "../../components/CodeBlock";
import { appBaseUrl } from "../../lib/constants";

const FIELDS: Array<[string, string]> = [
  ["country", "ISO code from Cloudflare: DE, AT"],
  ["continent", "AF, AN, AS, EU, NA, OC, SA"],
  ["region, city", "Cloudflare region / city"],
  ["device_type", "mobile, tablet, desktop, bot"],
  ["os, browser", "Android, iOS, Windows · Chrome, Safari"],
  ["isp", "ISP / AS organization, substring match"],
  ["asn", "AS number: 3320 or AS3320"],
  ["language", "Primary Accept-Language: de matches de-AT; en-us matches only en-US"],
  ["connection", "datacenter or residential (built-in cloud ASN list)"],
  ["bot", "yes or no (after blocklist / datacenter checks)"],
  ["referrer_domain", "adcash.com also matches subdomains"],
  ["ip", "IP or CIDR, IPv4 and IPv6: 203.0.113.0/24"],
  ["weekday", "mon … sun, in the rule timezone"],
  ["hour", "9, 9-17, 22-3 (wraps midnight), in the rule timezone"],
  ["sub1 … sub10", "Exact values passed on the tracking link"],
];

export function DocsRouting() {
  const base = appBaseUrl();
  return (
    <>
      <h1>Routing rules & anti-fraud</h1>
      <p>
        A campaign has a default pool of paths. Rules sit above it: they run top to bottom, every
        condition in a rule must match, and the first matching rule sends the click to its own
        paths (with the campaign&apos;s rotation mode). Clicks that match no rule, or match a rule
        without enabled paths, use the default pool.
      </p>

      <h2>Conditions</h2>
      <p>
        Each condition is a field, an operator (<code>in</code> or <code>not_in</code>) and a list
        of values (any match). Matching is case-insensitive. A missing value never matches{" "}
        <code>in</code> and always matches <code>not_in</code>.
      </p>
      <table className="table">
        <thead>
          <tr>
            <th>Field</th>
            <th>Values</th>
          </tr>
        </thead>
        <tbody>
          {FIELDS.map(([field, values]) => (
            <tr key={field}>
              <td className="mono">{field}</td>
              <td>{values}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Example: German mobile pops to a geo-locked casino offer</h2>
      <CodeBlock>{`curl -X POST ${base}/api/campaigns/CAMPAIGN_ID/rules \\
  -H "Authorization: Bearer capve_…" -H "Content-Type: application/json" \\
  -d '{"name":"DE mobile evenings","timezone":"Europe/Berlin","conditions":[
        {"field":"country","op":"in","values":["DE","AT"]},
        {"field":"device_type","op":"in","values":["mobile"]},
        {"field":"hour","op":"in","values":["18-23"]}]}'

curl -X POST ${base}/api/campaigns/CAMPAIGN_ID/paths \\
  -H "Authorization: Bearer capve_…" -H "Content-Type: application/json" \\
  -d '{"name":"DE casino","flow_type":"lander_offer","rule_id":"rul_…",
       "landers":[{"lander_id":"lnd_a","weight":70},{"lander_id":"lnd_b","weight":30}],
       "offers":[{"offer_id":"ofr_x","weight":50},{"offer_id":"ofr_y","weight":50}]}'`}</CodeBlock>
      <p>
        Endpoints: <code>GET/POST /api/campaigns/:id/rules</code>,{" "}
        <code>PATCH/DELETE /api/campaigns/:id/rules/:ruleId</code> (deleting a rule deletes its
        paths). <code>GET /api/campaigns/:id/rotation</code> returns the default{" "}
        <code>paths</code> and the ordered <code>rules</code> with their paths.
      </p>

      <h2>Weighted landers and offers</h2>
      <p>
        A path can hold several landers and offers, each with a weight. Every click picks one
        lander and one offer by weight; both are stored on the click, so lander and offer reports
        and the LP click (<code>/lp/:clickId</code>) use the ones the visitor actually saw. The
        single <code>lander_id</code> / <code>offer_id</code> fields still work and mean a list
        of one.
      </p>

      <h2>Bots, blocklist and safe page</h2>
      <p>A click is flagged as a bot when any of these is true:</p>
      <ul>
        <li>the user agent looks like a bot, or Cloudflare scores it as one;</li>
        <li>
          its IP / CIDR, ASN or user-agent substring is on the account blocklist (
          <code>/api/antifraud/blocklist</code>);
        </li>
        <li>
          the campaign has <code>block_datacenter</code> on and the ASN belongs to a cloud or
          hosting provider (AWS, Google Cloud, Azure, DigitalOcean, OVH, Hetzner, Linode, Vultr,
          Oracle, …).
        </li>
      </ul>
      <p>
        Flagged clicks are recorded with <code>is_bot = 1</code>. Per campaign (
        <code>PUT /api/campaigns/:id/traffic-filter</code>), <code>bot_action</code> is either{" "}
        <code>route</code> (count as bot, route normally) or <code>safe_page</code> (redirect to{" "}
        <code>safe_page_url</code>). The safe page is a URL you configure (http/https only); the
        request can never choose it, and the same-host <code>?url=</code> check still applies.
      </p>
      <CodeBlock>{`curl -X PUT ${base}/api/campaigns/CAMPAIGN_ID/traffic-filter \\
  -H "Authorization: Bearer capve_…" -H "Content-Type: application/json" \\
  -d '{"bot_action":"safe_page","safe_page_url":"https://example.com/blog","block_datacenter":true}'

curl -X POST ${base}/api/antifraud/blocklist \\
  -H "Authorization: Bearer capve_…" -H "Content-Type: application/json" \\
  -d '{"kind":"ip","values":["203.0.113.0/24"]}'`}</CodeBlock>
    </>
  );
}
