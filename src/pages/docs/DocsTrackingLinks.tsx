import { CodeBlock } from "../../components/CodeBlock";
import { appBaseUrl } from "../../lib/constants";
import { buildPostbackUrl, buildTrackingUrl } from "../../lib/tracking";

export function DocsTrackingLinks() {
  const base = appBaseUrl();
  return (
    <>
      <h1>Tracking links</h1>
      <p>
        Each affiliate gets a short link. When clicked, Capve records the visit, assigns a click
        ID, and redirects to your program destination URL.
      </p>
      <h2>Link format</h2>
      <CodeBlock>{buildTrackingUrl(base, "{affiliate_code}")}</CodeBlock>
      <h2>Redirect parameters</h2>
      <p>Capve appends these query parameters to your destination URL:</p>
      <ul>
        <li>
          <code>velo_ref</code> — affiliate code (legacy / readable)
        </li>
        <li>
          <code>click_id</code> — unique click token (use this for postbacks)
        </li>
      </ul>
      <h2>Same-host deep links</h2>
      <p>
        Optional <code>?url=</code> override is allowed only when the host matches your program
        destination (prevents open redirects).
      </p>
      <CodeBlock>{`${buildTrackingUrl(base, "abc123")}?url=${encodeURIComponent("https://yourapp.com/checkout?plan=pro")}`}</CodeBlock>
      <h2>Click parameters</h2>
      <p>
        Traffic sources can append <code>sub1</code>…<code>sub10</code>, their own click ID as{" "}
        <code>clickid</code> (or <code>external_id</code>) and the click cost as{" "}
        <code>cost</code> (currency units, e.g. <code>0.05</code>). Per-click cost overrides the
        source&apos;s fixed CPC/CPM in reports. Country, region, city, ISP, device, OS, browser and
        referrer are captured automatically; reports can be grouped by any of them.
      </p>
      <CodeBlock>{`${buildTrackingUrl(base, "abc123")}?sub1={zone}&clickid={click_id}&cost={cpc}`}</CodeBlock>
      <h2>Lander and offer URL macros</h2>
      <p>
        Lander, offer and destination URLs support <code>{"{clickid}"}</code> /{" "}
        <code>{"{click_id}"}</code>, <code>{"{campaign_id}"}</code>, <code>{"{offer_id}"}</code>,{" "}
        <code>{"{lander_id}"}</code>, <code>{"{country}"}</code>, <code>{"{external_id}"}</code>,{" "}
        <code>{"{sub1}"}</code>…<code>{"{sub10}"}</code> and <code>{"{lp_click_url}"}</code>.
      </p>
      <h2>Lander → offer (LP click)</h2>
      <p>
        On lander + offer paths, link the lander&apos;s CTA to the LP click URL. Capve counts the
        LP click and redirects to the offer chosen for that click&apos;s path. Pass it to your
        lander with <code>{"?next={lp_click_url}"}</code>, or build it from the{" "}
        <code>click_id</code> query parameter:
      </p>
      <CodeBlock>{`${base}/lp/{click_id}`}</CodeBlock>
      <h2>Offer URL macro</h2>
      <p>
        In your affiliate network, pass the click ID using the macro from the landing URL. Capve
        exposes <code>click_id</code> on redirect — configure your network postback to call:
      </p>
      <CodeBlock>{buildPostbackUrl(base)}</CodeBlock>
    </>
  );
}
