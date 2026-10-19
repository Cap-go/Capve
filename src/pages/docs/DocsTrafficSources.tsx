import { Link } from "react-router-dom";
import { CodeBlock } from "../../components/CodeBlock";
import { appBaseUrl } from "../../lib/constants";

export function DocsTrafficSources() {
  const base = appBaseUrl();
  return (
    <>
      <h1>Traffic sources, tokens and cost</h1>
      <p>
        Create a traffic source from a template (Adcash, PropellerAds, RichAds, Zeropark,
        TrafficStars, Facebook, Google Ads, TikTok). The template sets the cost model, the outgoing
        postback and <strong>named tokens</strong>: each source URL parameter is stored in a sub
        slot and shown by name in reports.
      </p>

      <p>
        Read <Link to="/docs/campaigns">multi-provider campaigns</Link> for a complete example,
        and <Link to="/docs/click-ids">Click IDs &amp; SubIDs</Link> before mapping your source's ID.
      </p>
      <h2>Named tokens</h2>
      <p>The Adcash template maps:</p>
      <table className="table">
        <thead>
          <tr>
            <th>Param</th>
            <th>Name</th>
            <th>Stored in</th>
          </tr>
        </thead>
        <tbody>
          <tr><td className="mono">zoneid</td><td>Zone</td><td className="mono">sub1</td></tr>
          <tr><td className="mono">campaignid</td><td>Campaign</td><td className="mono">sub2</td></tr>
          <tr><td className="mono">country</td><td>Country</td><td className="mono">sub3</td></tr>
          <tr><td className="mono">cost</td><td>Cost</td><td className="mono">cost</td></tr>
          <tr><td className="mono">clickid</td><td>Click ID</td><td className="mono">external_id</td></tr>
        </tbody>
      </table>
      <p>
        Campaigns using the source get a tracking URL with the source's macros appended (campaign
        view → <em>Traffic source link & cost</em>):
      </p>
      <CodeBlock>{`${base}/c/casino_ab12cd34?zoneid=[zone]&campaignid=[campaign]&country=[country]&cost=[cpm]&clickid=[clickid]`}</CodeBlock>
      <p>
        On each click the mapped params are copied into their slot, so <code>Group by → Zone (sub1)</code>{" "}
        works in reports and <code>{"{external_id}"}</code> in the outgoing postback returns the
        source's click id. Templates marked <em>check macros</em> use names we could not verify:
        compare them with the source's tracking settings and edit the tokens in{" "}
        <strong>Traffic sources → Tokens & cost API</strong>.
      </p>

      <h2>Affiliate network templates</h2>
      <p>
        Network templates (generic, TUNE/HasOffers, Everflow, CAKE, Affise, Cellxpert, Affilka,
        MyAffiliates) give the offer URL parameter and the incoming postbacks with the network's
        macros, one per event:
      </p>
      <CodeBlock label="Offer URL (in Capve)">{"https://casino.example/?aff_sub={click_id}"}</CodeBlock>
      <CodeBlock label="Default postback (in the network)">{`${base}/click?cnv_id={aff_sub}&payout={payout}`}</CodeBlock>
      <CodeBlock label="Registration postback">{`${base}/click?cnv_id={aff_sub}&payout={payout}&event=registration`}</CodeBlock>
      <CodeBlock label="FTD postback">{`${base}/click?cnv_id={aff_sub}&payout={payout}&event=ftd`}</CodeBlock>

      <h2>Cost updates</h2>
      <p>
        Set the real spend for a campaign over a date range, optionally for one token value (e.g.
        one zone). The total is spread evenly over the matching clicks and{" "}
        <strong>replaces</strong> their cost, so cost, profit, ROI and CPC in every report follow.
        Clicks outside the range or filter keep their cost.
      </p>
      <CodeBlock>{`curl -X POST ${base}/api/campaigns/prg_…/costs \\
  -H "Authorization: Bearer capve_…" -H "Content-Type: application/json" \\
  -d '{"date":"2026-10-14","total_cents":4250,"filter_dim":"zoneid","filter_value":"9001"}'`}</CodeBlock>
      <p>
        <code>filter_dim</code> is a token param of the campaign's source (<code>zoneid</code>) or a
        click field (<code>sub1</code>…<code>sub10</code>, <code>country</code>,{" "}
        <code>external_id</code>). Use <code>from</code>/<code>to</code> (ISO or Unix ms) for a
        range. <code>GET /api/campaigns/:id/costs</code> lists past updates.
      </p>
      <h3>From a report row</h3>
      <p>
        In <strong>Reports → Breakdown</strong>, group by a token, country or external ID and use{" "}
        <strong>Set cost</strong> on a row. It sends the same update for that value over the
        report's date range. Rows grouped by a token also have <strong>Blacklist</strong>, which adds
        the zone to the campaign's blacklist export. Group by <strong>Path</strong> to pause or resume
        a path; a paused path gets no new traffic and keeps its stats.
      </p>

      <h2>Cost from the traffic source API</h2>
      <p>
        In <strong>Traffic sources → Tokens & cost API</strong> pick a cost API (Adcash) and paste
        its API key. The key is encrypted with <code>AUTH_SECRET</code> and never returned; after
        rotating <code>AUTH_SECRET</code>, enter it again. An hourly cron pulls yesterday's and
        today's spend and writes it onto the clicks of every campaign using that source, matched by
        the tokens marked <em>Source campaign id</em> and <em>Zone id</em>. Use{" "}
        <strong>Sync cost now</strong> (or <code>POST /api/sources/:id/sync-cost</code>) to run it
        on demand.
      </p>

      <h2>API and MCP</h2>
      <ul>
        <li><code>GET /api/sources/templates</code> — <code>list_source_templates</code></li>
        <li><code>POST /api/sources/from-template</code> — <code>create_traffic_source_from_template</code></li>
        <li><code>POST /api/sources/networks/from-template</code> — <code>create_network_from_template</code></li>
        <li><code>GET|PUT /api/sources/:id/settings</code> — <code>get_traffic_source_settings</code>, <code>update_traffic_source_settings</code></li>
        <li><code>POST /api/sources/:id/sync-cost</code> — <code>sync_traffic_source_cost</code></li>
        <li><code>GET /api/campaigns/:id/source-link</code> — <code>get_campaign_source_link</code></li>
        <li><code>GET|POST /api/campaigns/:id/costs</code> — <code>list_cost_updates</code>, <code>update_campaign_cost</code></li>
      </ul>
      <p>
        See <Link to="/docs/mcp">MCP server</Link> to connect an assistant.
      </p>
    </>
  );
}
