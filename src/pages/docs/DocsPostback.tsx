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
              payout, or <code>0</code> when an <code>event</code> is set.
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
              <code>event</code>
            </td>
            <td>No</td>
            <td>
              Conversion event: <code>registration</code>, <code>ftd</code>, <code>deposit</code>…
              (a-z, 0-9, <code>_ . -</code>). Each event is a separate conversion. See below.
            </td>
          </tr>
          <tr>
            <td>
              <code>order_id</code>
            </td>
            <td>No</td>
            <td>
              Transaction ID (also <code>tx_id</code>). Distinct IDs create separate conversions.
              Without it, repeated postbacks for the same click and event update status and
              payout (e.g. <code>lead</code> → <code>sale</code>); identical repeats are ignored.
            </td>
          </tr>
        </tbody>
      </table>

      <h3>Example</h3>
      <CodeBlock>{`${base}/click?cnv_id=clk_a1b2c3d4&payout=99&cnv_status=sale&order_id=txn_123`}</CodeBlock>

      <h2>Events: registration, FTD, …</h2>
      <p>
        One campaign can report several events. Give the network one postback URL per event,
        each with its own <code>event</code> value:
      </p>
      <CodeBlock>{`${postbackUrl}&event=registration
${postbackUrl}&event=ftd`}</CodeBlock>
      <p>
        A registration and an FTD for the same click are two conversions. Reports, campaign stats
        and CSV exports show one column per event (Registrations, FTD, …) next to the total.
      </p>

      <h2>Outgoing postbacks (Capve → traffic source)</h2>
      <p>
        Add as many outgoing postbacks as you need to a campaign, a traffic source or an affiliate
        network. Each postback can be limited to one event, so a source can get one pixel for
        registrations and another for FTDs. Leave the event empty to fire on every conversion.
      </p>
      <CodeBlock>
        {`https://your-source.com/postback?click={external_id}&payout={payout}&goal={event}`}
      </CodeBlock>
      <table className="table">
        <thead>
          <tr>
            <th>Attached to</th>
            <th>Fires for</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Campaign</td>
            <td>Every new or updated conversion of the campaign, including rejections</td>
          </tr>
          <tr>
            <td>Traffic source</td>
            <td>
              Approved conversions of campaigns using the source, sampled by its postback %
            </td>
          </tr>
          <tr>
            <td>Affiliate network</td>
            <td>Approved conversions of clicks sent to one of the network&apos;s offers</td>
          </tr>
        </tbody>
      </table>
      <p>
        Macros: <code>{"{click_id}"}</code> (also <code>{"{clickid}"}</code>),{" "}
        <code>{"{external_id}"}</code> = the source&apos;s click ID captured from{" "}
        <code>clickid</code> / <code>external_id</code> on the tracking link,{" "}
        <code>{"{payout}"}</code>, <code>{"{status}"}</code>, <code>{"{status2}"}</code>,{" "}
        <code>{"{event}"}</code>, <code>{"{currency}"}</code>, <code>{"{order_id}"}</code>,{" "}
        <code>{"{affiliate_code}"}</code>.
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
        <li>Capve attributes conversion, updates stats, fires matching outgoing postbacks</li>
      </ol>

      <p>
        For merchant-hosted checkouts without a network, use{" "}
        <a href="/docs/server-conversions">server-side conversions</a> with{" "}
        <code>click_id</code> from the landing URL.
      </p>
    </article>
  );
}
