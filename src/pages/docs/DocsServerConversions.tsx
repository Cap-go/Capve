import { Link } from "react-router-dom";
import { CodeBlock } from "../../components/CodeBlock";
import { appBaseUrl } from "../../lib/constants";
import {
  convertCurlExample,
  stripeWebhookConvertExample,
} from "../../lib/integration-examples";
import { buildPostbackUrl } from "../../lib/tracking";

export function DocsServerConversions() {
  const base = appBaseUrl();
  return (
    <>
      <h1>Server-side conversions (postback)</h1>
      <p>
        This is the primary integration path — same model as Binom. When a conversion happens on your
        backend or affiliate network, call Capve with the <strong>click ID</strong> from the
        original visit.
      </p>
      <h2>Postback URL (GET)</h2>
      <p>Configure this URL in your affiliate network or fire it from your server:</p>
      <CodeBlock>{buildPostbackUrl(base)}</CodeBlock>
      <h3>Parameters</h3>
      <table className="table">
        <thead>
          <tr>
            <th>Parameter</th>
            <th>Required</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="mono">cnv_id</td>
            <td>Yes</td>
            <td>Click ID from redirect (<code>click_id</code> param). Alias: <code>click_id</code></td>
          </tr>
          <tr>
            <td className="mono">payout</td>
            <td>No</td>
            <td>Revenue in major currency units (e.g. <code>99.00</code>). Default <code>0</code></td>
          </tr>
          <tr>
            <td className="mono">cnv_status</td>
            <td>No</td>
            <td>Conversion status label (e.g. <code>lead</code>, <code>sale</code>). Default <code>lead</code></td>
          </tr>
          <tr>
            <td className="mono">cnv_status2</td>
            <td>No</td>
            <td>Secondary status (optional)</td>
          </tr>
          <tr>
            <td className="mono">cnv_currency</td>
            <td>No</td>
            <td>Currency code. Default <code>USD</code></td>
          </tr>
          <tr>
            <td className="mono">order_id</td>
            <td>No</td>
            <td>Idempotency key. Defaults to click ID (plus event). Reuse on retries.</td>
          </tr>
          <tr>
            <td className="mono">event</td>
            <td>No</td>
            <td>
              Conversion event, e.g. <code>registration</code> or <code>ftd</code>. Each event is
              its own conversion with its own count in reports
            </td>
          </tr>
          <tr>
            <td className="mono">disable_postback</td>
            <td>No</td>
            <td>Set <code>1</code> to skip outgoing S2S postback for this conversion</td>
          </tr>
        </tbody>
      </table>
      <h3>Example</h3>
      <CodeBlock>{`curl "${base}/click?cnv_id=clk_a1b2c3&payout=49.00&cnv_status=sale&order_id=inv_001"`}</CodeBlock>
      <h2>JSON API (POST)</h2>
      <p>
        For custom backends, use <Link to="/docs/api/convert">POST /api/v1/convert</Link> with{" "}
        <code>X-Program-Secret</code>. Prefer <code>click_id</code> over <code>affiliate_code</code>.
      </p>
      <CodeBlock>{convertCurlExample(base)}</CodeBlock>
      <h2>Stripe webhook example</h2>
      <CodeBlock>{stripeWebhookConvertExample(base)}</CodeBlock>
      <h2>S2S postback (outgoing)</h2>
      <p>
        In the dashboard, add <strong>outgoing postbacks</strong> to a campaign, traffic source or
        affiliate network, as many as you need, each optionally limited to one event. Capve fires
        them after each new or updated conversion with macros: <code>{"{click_id}"}</code>,{" "}
        <code>{"{payout}"}</code>, <code>{"{status}"}</code>, <code>{"{event}"}</code>,{" "}
        <code>{"{affiliate_code}"}</code>. See <Link to="/docs/postback">Postback URL</Link>.
      </p>
    </>
  );
}
