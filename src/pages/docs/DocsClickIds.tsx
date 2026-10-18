import { Link } from "react-router-dom";
import { CodeBlock } from "../../components/CodeBlock";
import { appBaseUrl } from "../../lib/constants";

export function DocsClickIds() {
  const base = appBaseUrl();
  return (
    <>
      <h1>Click IDs & SubIDs</h1>
      <p className="docs-lead">
        Follow one click from the ad to the offer and back. Keep the click's
        identity separate from the labels you use to analyze it.
      </p>
      <div className="docs-callout">
        <strong>The rule to remember</strong>
        <p>
          Send Capve's click ID to the offer. Send that same value back as{" "}
          <code>cnv_id</code>. Return the traffic source's original ID only when
          reporting a conversion back to that source.
        </p>
      </div>
      <h2>Three identifiers, three jobs</h2>
      <table className="table">
        <thead>
          <tr>
            <th>Identifier</th>
            <th>Who creates it</th>
            <th>What it answers</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>click_id</code>
            </td>
            <td>Capve, per tracked visit</td>
            <td>
              Which exact click converted? Example: <code>clk_…</code>
            </td>
          </tr>
          <tr>
            <td>
              <code>external_id</code>
            </td>
            <td>The traffic source</td>
            <td>
              Which ad click should the source credit? Captured from{" "}
              <code>clickid</code> or a mapped token.
            </td>
          </tr>
          <tr>
            <td>
              <code>sub1</code> to <code>sub10</code>
            </td>
            <td>You or the source's macros</td>
            <td>
              Which placement, creative, or experiment performed best? Many
              clicks can share a SubID.
            </td>
          </tr>
        </tbody>
      </table>
      <p>
        An affiliate code identifies a partner, and a campaign key identifies a
        campaign link. Neither identifies an individual click. A click ID is an
        attribution token, not a person's identity or an authentication secret.
      </p>
      <h2>A click's round trip</h2>
      <ol className="docs-steps" role="list">
        <li>
          <strong>The traffic source sends its ID</strong>
          <p>
            The source replaces its own macro before sending the visitor here.
            In this worked example, its click ID is <code>src_789</code>.
          </p>
          <CodeBlock>{`${base}/c/your_campaign_key?clickid=src_789&sub1=zone_42&sub2=creative_07`}</CodeBlock>
        </li>
        <li>
          <strong>Capve creates a different ID</strong>
          <p>
            Capve stores <code>src_789</code> as <code>external_id</code> and
            creates its own <code>click_id</code>. Configure the offer URL with
            the Capve macro below. The network's <code>aff_sub</code> parameter
            is an example; use the field your network supports.
          </p>
          <CodeBlock>
            {"https://merchant.example/offer?aff_sub={click_id}"}
          </CodeBlock>
          <p>
            After expansion, <code>aff_sub</code> contains the Capve ID, such as{" "}
            <code>clk_example</code>.
          </p>
        </li>
        <li>
          <strong>The network returns the stored Capve ID</strong>
          <p>
            The network must substitute its stored <code>aff_sub</code> value
            into <code>cnv_id</code>. Configure its postback with its own
            documented return macro. This is an example of the resulting
            request, with illustrative values:
          </p>
          <CodeBlock>{`${base}/click?cnv_id=clk_example&event=ftd&payout=80&cnv_status=approved&key=YOUR_POSTBACK_KEY`}</CodeBlock>
          <p>
            Use a real click from your test visit and the account key from the
            campaign's Tracking &amp; postback card. Keep the key on the
            network's server, away from visitor-facing URLs.
          </p>
        </li>
        <li>
          <strong>Capve reports back to the traffic source</strong>
          <p>
            If the source supports S2S postbacks, use{" "}
            <code>{"{external_id}"}</code> in its outgoing postback URL. Capve
            substitutes <code>src_789</code>, so the source can match its own ad
            click. A source with no postback API needs its own supported
            conversion integration.
          </p>
        </li>
      </ol>
      <h2>Why clickid can be confusing</h2>
      <p>
        On an <em>incoming tracking link</em>, <code>?clickid=src_789</code>{" "}
        stores the source's ID. In an <em>offer URL macro</em>,{" "}
        <code>{"{clickid}"}</code> and <code>{"{click_id}"}</code> both expand
        to Capve's ID. The direction matters. Prefer <code>{"{click_id}"}</code>{" "}
        for offers and <code>{"{external_id}"}</code> for source callbacks.
      </p>
      <h2>Choose a stable SubID taxonomy</h2>
      <p>
        Start with one meaning per slot. For example, use <code>sub1</code> for
        placement, <code>sub2</code> for creative, and <code>sub3</code> for
        experiment. Keep those meanings consistent across sources you compare.
        Built-in templates can use different mappings, so check their named
        tokens before combining reports.
      </p>
      <CodeBlock>
        {"sub1=zone_42\nsub2=creative_07\nsub3=welcome_test_b"}
      </CodeBlock>
      <p>
        Use stable IDs rather than changing labels. URL-encode values, avoid
        personal information, and group reports by the relevant sub field. A
        SubID is a reporting dimension; it does not replace the click ID in a
        postback.
      </p>
      <h2>Registration, FTD, and repeat deposits</h2>
      <p>
        Send <code>event=registration</code> and <code>event=ftd</code> against
        the same click to record separate funnel events. FTD means first-time
        deposit. Without a transaction ID, a repeat postback for the same click
        and event updates that conversion's status or payout.
      </p>
      <p>
        For multiple deposits, send <code>event=deposit</code> with a distinct{" "}
        <code>tx_id</code> for each transaction. Reuse that transaction ID when
        retrying or updating the same deposit. Use unique transaction IDs across
        your campaign. Capve records events and revenue; it does not calculate
        affiliate commissions or make payouts.
      </p>
      <h2>Check a missing conversion</h2>
      <ul role="list">
        <li>
          Inspect the actual offer redirect. The network's tracking field must
          contain a resolved Capve ID, not literal braces or the source's ID.
        </li>
        <li>
          Check that every lander and redirect preserves that ID. For a lander
          CTA, use <code>{"{lp_click_url}"}</code> so Capve keeps the selected
          offer.
        </li>
        <li>
          <code>400</code> means a required ID is missing or a value is invalid.{" "}
          <code>404</code> means Capve cannot find the click. <code>403</code>{" "}
          means the enforced postback key did not match.
        </li>
        <li>
          If revenue differs, verify the payout, currency, status, event, and
          key. Keyless payouts can be capped to the offer payout.
        </li>
      </ul>
      <p>
        Continue with <Link to="/docs/campaigns">multi-provider campaigns</Link>{" "}
        or the <Link to="/docs/postback">complete postback reference</Link>.
      </p>
    </>
  );
}
