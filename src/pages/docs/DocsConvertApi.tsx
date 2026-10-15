import { CodeBlock } from "../../components/CodeBlock";
import { appBaseUrl } from "../../lib/constants";
import { convertCurlExample, convertResponseExample } from "../../lib/integration-examples";

export function DocsConvertApi() {
  const base = appBaseUrl();
  return (
    <>
      <h1>POST /api/v1/convert</h1>
      <p>
        Server-side JSON endpoint. Use when your backend already handles checkout — never call from
        browser JavaScript (secret would leak).
      </p>
      <h2>Authentication</h2>
      <p>
        Header <code>X-Program-Secret</code> — program convert secret from the dashboard (shown once
        at creation).
      </p>
      <h2>Request body</h2>
      <table className="table">
        <thead>
          <tr>
            <th>Field</th>
            <th>Required</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="mono">order_id</td>
            <td>Yes</td>
            <td>Unique order / invoice ID per program (idempotency key)</td>
          </tr>
          <tr>
            <td className="mono">amount</td>
            <td>Yes</td>
            <td>Revenue number in major units (e.g. <code>49.99</code> = $49.99)</td>
          </tr>
          <tr>
            <td className="mono">click_id</td>
            <td>Preferred</td>
            <td>Click ID from redirect. Alias: <code>cnv_id</code></td>
          </tr>
          <tr>
            <td className="mono">affiliate_code</td>
            <td>Fallback</td>
            <td>Only if click_id unavailable</td>
          </tr>
          <tr>
            <td className="mono">status</td>
            <td>No</td>
            <td>Default <code>lead</code></td>
          </tr>
          <tr>
            <td className="mono">event</td>
            <td>No</td>
            <td>
              Conversion event, e.g. <code>registration</code> or <code>ftd</code>. Counted per
              event in reports; fires postbacks set for that event
            </td>
          </tr>
          <tr>
            <td className="mono">currency</td>
            <td>No</td>
            <td>Default <code>USD</code></td>
          </tr>
        </tbody>
      </table>
      <h2>Example</h2>
      <CodeBlock>{convertCurlExample(base)}</CodeBlock>
      <h2>Response</h2>
      <CodeBlock>{convertResponseExample()}</CodeBlock>
      <p>
        <code>status</code> is <code>created</code> or <code>duplicate</code> when the same{" "}
        <code>order_id</code> was already recorded for this program.
      </p>
    </>
  );
}
