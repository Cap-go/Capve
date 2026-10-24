import { Link } from "react-router-dom";
import { CodeBlock } from "../../components/CodeBlock";
import { appBaseUrl } from "../../lib/constants";

export function DocsPostback() {
  const base = appBaseUrl();
  const postbackUrl = `${base}/click?cnv_id={click_id}&payout={payout}&cnv_status={status}&key=YOUR_POSTBACK_KEY`;
  const networkPostback = `${base}/click?cnv_id={external_id}&payout={sum}&cnv_status=approved&key=YOUR_POSTBACK_KEY`;

  return (
    <article className="prose prose-invert max-w-none">
      <h1>Postback URL (S2S)</h1>
      <p>
        Capve uses a Binom-style server-to-server postback model. Every click gets a unique{" "}
        <code>click_id</code>. When a conversion happens on the affiliate network or merchant
        side, the network fires a postback to Capve with that click ID — not just an affiliate
        code.
      </p>

      <p>
        Follow the <Link to="/docs/click-ids">Click ID round trip</Link> first. The offer and the
        postback saved in the affiliate network carry Capve's click id (<code>clk_…</code>). In
        the network, use the network's macro. YesPlay uses <code>{"${subid1}"}</code>.
      </p>
      <p>
        Some networks name their own return macro <code>{"{external_id}"}</code>. That name is
        theirs, and the value they send is still the <code>clk_…</code> from the offer. Capve's{" "}
        <code>{"{external_id}"}</code> macro is a different token: the click id the traffic source
        sent in. On the Adcash pixel, saved on the traffic source, the parameter is{" "}
        <code>cid={"{external_id}"}</code>.
      </p>
      <div className="docs-callout">
        <strong>Setting up a network for the first time?</strong>
        <p>
          <Link to="/docs/networks">Connect an affiliate network</Link> walks one click through
          the offer URL and postback with real values, with a cheat sheet per network and a
          5-minute test.
        </p>
      </div>
      <h2>Incoming postback (network → Capve)</h2>
      <p>Configure this URL in your affiliate network as the conversion postback:</p>
      <CodeBlock>{postbackUrl}</CodeBlock>
      <p>
        Replace <code>{"{click_id}"}</code>, <code>{"{payout}"}</code> and{" "}
        <code>{"{status}"}</code> with <strong>your network&apos;s</strong> macros, e.g.{" "}
        <code>{"cnv_id={aff_sub}"}</code> on TUNE. The network fills them, not Capve.
      </p>

      <h3>Postback key</h3>
      <p>
        Click IDs end up in visitors&apos; URLs, so anyone could call the postback with one. Each
        account has a postback key, shown in the campaign&apos;s <em>Tracking &amp; postback</em>{" "}
        card (owners and admins), where you can also rotate it. Pass it as <code>key</code>:
      </p>
      <ul>
        <li>
          Without a valid key, the payout is capped to the clicked offer&apos;s payout (when the
          offer has one).
        </li>
        <li>
          Turn on <em>Reject postbacks without the key</em> once every network URL includes it:
          postbacks with a missing or wrong key then get <code>403</code>.
        </li>
        <li>Rotating the key invalidates the old one immediately.</li>
      </ul>

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
              <code>key</code>
            </td>
            <td>Recommended</td>
            <td>
              Account postback key. Required when key enforcement is on; without it payouts are
              capped to the offer payout.
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
      <CodeBlock label="Registration postback">{`${postbackUrl}&event=registration`}</CodeBlock>
      <CodeBlock label="FTD postback">{`${postbackUrl}&event=ftd`}</CodeBlock>
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
      <CodeBlock label="Adcash pixel, saved on the traffic source">
        {`https://www.pixelhere.com/et/event.php?advertiser=YOUR_ADVERTISER&cid={external_id}&id=YOUR_GOAL&value={payout}`}
      </CodeBlock>
      <p>
        <code>cid={"{external_id}"}</code> is required on this pixel. Capve fills it with the click
        id Adcash sent on the campaign link. Keep <code>advertiser</code> and <code>id</code> as
        Adcash gave them, and add <code>value={"{payout}"}</code> for revenue.{" "}
        <code>cid={"{click_id}"}</code> sends Capve's <code>clk_…</code> id, and Adcash does not
        match it, so the conversion stays at zero there.
      </p>
      <p>
        The warning about pasting <code>{"{click_id}"}</code> is only for the postback saved in
        the affiliate network. On this pixel, <code>{"{external_id}"}</code> is the macro you write.
      </p>
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
              Once, when a conversion of a campaign using the source becomes approved, sampled by
              its postback %
            </td>
          </tr>
          <tr>
            <td>Affiliate network</td>
            <td>
              Once, when a conversion of a click sent to one of the network&apos;s offers becomes
              approved
            </td>
          </tr>
        </tbody>
      </table>
      <p>
        Approved means not rejected and not <code>pending</code> or <code>hold</code>. A
        conversion that arrives as <code>pending</code> fires source and network postbacks when a
        later postback moves it to an approved status (e.g. <code>sale</code>). Later payout or
        status updates of an already approved conversion do not fire them again.
      </p>
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

      <h2>When the network names its macro {"{external_id}"}</h2>
      <p>
        Paste this in the affiliate network only when their docs use that name for the value you
        sent them on the offer. The value that arrives is still Capve's <code>clk_…</code>. This
        URL is not the Adcash pixel. The Adcash pixel is saved in Capve, on the traffic source,
        and Capve fills <code>cid={"{external_id}"}</code> with Adcash's click id.
      </p>
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
