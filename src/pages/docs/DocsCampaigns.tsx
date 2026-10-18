import { Link } from "react-router-dom";
import { CodeBlock } from "../../components/CodeBlock";

export function DocsCampaigns() {
  return (
    <>
      <h1>Campaigns with multiple providers</h1>
      <p className="docs-lead">
        Buy traffic from one source, route it to offers from several networks,
        and keep each conversion tied to the offer that received the click.
      </p>
      <h2>What does provider mean?</h2>
      <p>
        A <strong>traffic source</strong> sends visitors, such as an ad
        platform. An <strong>affiliate network</strong> supplies offers and
        returns conversions. An <strong>offer</strong> is the destination you
        promote. A <strong>lander</strong> is an optional page before an offer.
        These are separate entities in Capve.
      </p>
      <div className="docs-callout">
        <strong>One source per campaign, several offers</strong>
        <p>
          A campaign has one traffic source. To buy traffic from multiple ad
          platforms, create one campaign per source and put them in the same
          group. Each campaign can route to multiple offers, including offers
          from different networks.
        </p>
      </div>
      <h2>Example: compare two networks</h2>
      <p>
        You buy traffic from Adcash and want to compare two welcome offers.
        Create Network A and Network B, then an offer for each network. The
        following is a sample setup, not a preconfigured integration.
      </p>
      <div className="docs-flow" aria-label="Example campaign routing">
        <div>
          <small>Traffic source</small>
          <strong>Adcash</strong>
          <span>Source click ID + cost</span>
        </div>
        <div>
          <small>Capve campaign</small>
          <strong>Welcome offers</strong>
          <span>Weighted rotation</span>
        </div>
        <div>
          <small>Offer destinations</small>
          <strong>Network A · 70 weight</strong>
          <span>Network B · 30 weight</span>
        </div>
      </div>
      <ol role="list">
        <li>
          Create a traffic source from its template. Check the external click
          ID, cost, and named-token mappings.
        </li>
        <li>
          Create both affiliate networks. Add an offer for each, select its
          network, set its URL and payout, and pass <code>{"{click_id}"}</code>{" "}
          in the network's supported tracking parameter.
        </li>
        <li>
          Create a campaign and select the traffic source. Add two offer paths,
          one for each offer. With weighted rotation, assign weights 70 and 30.
          These are relative weights, not an exact split for a small sample.
        </li>
        <li>
          Alternatively, use one path with multiple weighted offers when they
          share the same lander setup. See{" "}
          <Link to="/docs/routing">routing rules</Link> for geo-specific paths
          and rotation modes.
        </li>
        <li>
          Configure an incoming conversion postback in each network, using that
          network's macro for the stored Capve click ID. Include your account
          postback key.
        </li>
        <li>
          Copy the campaign's generated traffic source link into the ad
          platform. Test a click and conversion through each offer before buying
          traffic.
        </li>
      </ol>
      <h2>Map each network separately</h2>
      <p>
        Two networks can use different names for the same tracking field. The
        offer URL uses a Capve macro. The incoming postback uses the network's
        macro. Never assume the names are interchangeable.
      </p>
      <table className="table">
        <thead>
          <tr>
            <th>Example network</th>
            <th>Offer URL you configure</th>
            <th>Value returned as cnv_id</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Network A</td>
            <td>
              <code>{"https://a.example/offer?aff_sub={click_id}"}</code>
            </td>
            <td>
              The stored <code>aff_sub</code> value
            </td>
          </tr>
          <tr>
            <td>Network B</td>
            <td>
              <code>{"https://b.example/offer?subid={click_id}"}</code>
            </td>
            <td>
              The stored <code>subid</code> value
            </td>
          </tr>
        </tbody>
      </table>
      <p>
        These parameter names are illustrative. Use each provider's current
        integration settings or Capve's network template, and verify the
        resulting request. Both networks must return Capve's ID. The click
        already stores its selected offer and path, so you do not need to send
        an offer ID back to choose attribution.
      </p>
      <h2>Send conversions to the right recipients</h2>
      <p>
        Incoming postbacks report a conversion <em>to Capve</em>. Outgoing
        postbacks notify other systems <em>from Capve</em>. Configure outgoing
        callbacks at the scope you need:
      </p>
      <ul role="list">
        <li>
          <strong>Campaign:</strong> for callbacks on that campaign's conversion
          statuses.
        </li>
        <li>
          <strong>Traffic source:</strong> for an approved conversion, using the
          source's original <code>{"{external_id}"}</code>. Source postback
          percentage settings apply.
        </li>
        <li>
          <strong>Affiliate network:</strong> for an approved conversion on an
          offer belonging to that network. Capve uses the clicked offer's
          network, not every network in the campaign.
        </li>
      </ul>
      <p>
        Each callback can be limited to an event such as <code>ftd</code>. Avoid
        configuring the same recipient at several scopes unless it should
        receive multiple requests. Inspect delivery history when a recipient
        does not receive a callback.
      </p>
      <h2>Add a second traffic source</h2>
      <p>
        For example, create “Welcome offers / Adcash” and “Welcome offers /
        TrafficStars” in the same group. Reuse your offers and landers, but
        select the matching source and check its tokens and outgoing postback in
        each campaign. Use the source link generated for that campaign, rather
        than sending both sources to one campaign URL.
      </p>
      <p>
        Groups organize related campaigns; they do not merge source settings or
        turn a campaign into a multi-source router. Keep SubID meanings
        consistent if you want to compare placements or creatives across
        sources.
      </p>
      <h2>Verify before sending paid traffic</h2>
      <ul role="list">
        <li>
          Check the redirect for each offer and confirm it contains a fresh
          Capve click ID.
        </li>
        <li>
          Ask each network to send a test postback with the ID it received.
          Confirm the conversion appears against the correct campaign and offer.
        </li>
        <li>
          Compare reports by offer, path, country, and SubID. Check registration
          and FTD event counts separately.
        </li>
        <li>
          Confirm source cost and outgoing callback IDs. Do not count the same
          revenue once as an unnamed conversion and again as FTD.
        </li>
      </ul>
      <CodeBlock>
        {
          "Traffic source ID → Capve stores external_id\nCapve click_id → chosen offer → incoming cnv_id\nApproved conversion → source callback with external_id"
        }
      </CodeBlock>
      <p>
        Next:{" "}
        <Link to="/docs/click-ids">understand Click IDs &amp; SubIDs</Link>,{" "}
        <Link to="/docs/traffic-sources">configure source tokens</Link>, or{" "}
        <Link to="/docs/postback">set up postbacks</Link>.
      </p>
    </>
  );
}
