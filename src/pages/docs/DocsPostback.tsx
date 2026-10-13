import { CodeBlock } from "../../components/CodeBlock";
import { appBaseUrl } from "../../lib/constants";

export function DocsPostback() {
  const base = appBaseUrl();
  const postbackUrl = `${base}/click?cnv_id={click_id}&payout={payout}&cnv_status={status}`;
  const networkPostback = `${base}/click?cnv_id={external_id}&payout={sum}&cnv_status=approved`;

  return (
    <article className="prose prose-invert max-w-none">
      <h1>Postback URL (S2S)</h1>
      <p>
        Capve uses a Binom-style server-to-server postback model. Every click gets a unique{" "}
        <code>click_id</code>. When a conversion happens on the affiliate network or merchant
        side, the network fires a postback to Capve with that click ID — not just an affiliate
        code.
      </p>

      <h2>Incoming postback (network → Capve)</h2>
      <p>Configure this URL in your affiliate network as the conversion postback:</p>
      <CodeBlock>{postbackUrl}</CodeBlock>

      <h3>Parameters</h3>
      <table className="table">
        <thead>
          <tr>
            <th>Param</th>
            <th>Required</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>cnv_id</code>
            </td>
            <td>Yes</td>
            <td>
              Click ID from the tracking link (<code>clk_…</code>). Also accepted as{" "}
              <code>click_id</code>.
            </td>
          </tr>
          <tr>
            <td>
              <code>payout</code>
            </td>
            <td>No</td>
            <td>
              Revenue amount in dollars (e.g. <code>49.99</code>). Defaults to the clicked offer
              payout.
            </td>
          </tr>
          <tr>
            <td>
              <code>cnv_status</code>
            </td>
            <td>No</td>
            <td>Lead status: <code>lead</code>, <code>sale</code>, <code>rejected</code></td>
          </tr>
          <tr>
            <td>
              <code>order_id</code>
            </td>
            <td>No</td>
            <td>
              Transaction ID (also <code>tx_id</code>). Distinct IDs create separate conversions.
              Without it, repeated postbacks for the same click update status and payout (e.g.{" "}
              <code>lead</code> → <code>sale</code>); identical repeats are ignored.
            </td>
          </tr>
        </tbody>
      </table>

      <h3>Example</h3>
      <CodeBlock>{`${base}/click?cnv_id=clk_a1b2c3d4&payout=99&cnv_status=sale&order_id=txn_123`}</CodeBlock>

      <h2>Outgoing S2S postback (Capve → traffic source)</h2>
      <p>
        Set an S2S postback URL on each campaign. When Capve records a conversion, it fires your
        traffic source postback with macros substituted:
      </p>
      <CodeBlock>
        {`https://your-source.com/postback?click={click_id}&payout={payout}&status={status}`}
      </CodeBlock>
      <p>
        A traffic source can also have its own postback URL. It fires on every new or updated
        non-rejected conversion (sampled by the source&apos;s postback %), with{" "}
        <code>{"{external_id}"}</code> = the source&apos;s click ID captured from{" "}
        <code>clickid</code> / <code>external_id</code> on the tracking link, plus{" "}
        <code>{"{clickid}"}</code>, <code>{"{payout}"}</code> and <code>{"{status}"}</code>.
      </p>
      <p>
        Reports count conversions whose status is not <code>rejected</code>,{" "}
        <code>declined</code>, <code>reversed</code>, <code>refunded</code>,{" "}
        <code>chargeback</code>, <code>canceled</code>, <code>trash</code> or <code>fraud</code>,
        attributed to the click&apos;s time.
      </p>

      <h2>Network-specific template</h2>
      <p>Example for networks that pass external click tokens:</p>
      <CodeBlock>{networkPostback}</CodeBlock>

      <h2>Attribution flow</h2>
      <ol>
        <li>Visitor clicks tracking link → Capve records click, appends <code>click_id</code></li>
        <li>Visitor converts on offer/merchant</li>
        <li>Network sends GET postback to Capve with <code>cnv_id=click_id</code></li>
        <li>Capve attributes conversion, updates stats, fires outgoing S2S if configured</li>
      </ol>

      <p>
        For merchant-hosted checkouts without a network, use{" "}
        <a href="/docs/server-conversions">server-side conversions</a> with{" "}
        <code>click_id</code> from the landing URL.
      </p>
    </article>
  );
}
