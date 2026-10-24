import { Link } from "react-router-dom";
import { CodeBlock } from "../../components/CodeBlock";
import { appBaseUrl } from "../../lib/constants";

/** Capve click ID value as it travels (blue in every illustration). */
function Id({ children = "clk_8f2a91" }: { children?: string }) {
  return <span className="docs-tok is-capve">{children}</span>;
}

/** The network's own field name or macro (amber in every illustration). */
function Net({ children }: { children: string }) {
  return <span className="docs-tok is-net">{children}</span>;
}

/** A traffic source macro such as Adcash's [clickid] (grey in every illustration). */
function Src({ children }: { children: string }) {
  return <span className="docs-tok is-src">{children}</span>;
}

/** A value Capve fills in before the URL leaves Capve. */
function Macro({ children }: { children: string }) {
  return <span className="docs-tok is-macro">{children}</span>;
}

/** Same rows as the built-in network templates (worker/lib/source-templates.ts). */
const NETWORKS = [
  { name: "Generic", field: "clickid", macro: "{clickid}", payout: "{payout}" },
  { name: "TUNE / HasOffers", field: "aff_sub", macro: "{aff_sub}", payout: "{payout}" },
  { name: "Everflow", field: "sub1", macro: "{sub1}", payout: "{payout_amount}" },
  { name: "CAKE", field: "s2", macro: "#s2#", payout: "#price#" },
  { name: "Affise", field: "sub1", macro: "{sub1}", payout: "{sum}" },
  { name: "Cellxpert", field: "subid", macro: "{subid}", payout: "{commission}" },
  { name: "Affilka / SOFTSWISS", field: "var", macro: "{var}", payout: "{commission}" },
  { name: "MyAffiliates", field: "payload", macro: "{payload}", payout: "{amount}" },
];

export function DocsNetworks() {
  const base = appBaseUrl();
  const host = base.replace(/^https?:\/\//, "");

  return (
    <>
      <h1>Connect an affiliate network</h1>
      <p className="docs-lead">
        You added an offer from a network and pasted a postback URL. How do you know a sale on the
        network will land on the right click in Capve? This page follows one click with real values
        and shows exactly what to check.
      </p>

      <div className="docs-callout">
        <strong>The whole idea in one sentence</strong>
        <p>
          Capve gives the network a click ID on the way out; the network must give that{" "}
          <em>same</em> ID back on the postback. Everything below is about which field carries it.
        </p>
      </div>

      <div className="docs-legend" aria-label="Colour legend">
        <span>
          <Id>clk_…</Id> Capve click ID
        </span>
        <span>
          <Net>aff_sub</Net> network's field / macro
        </span>
        <span>
          <Macro>{"{click_id}"}</Macro> Capve macro, filled by Capve
        </span>
        <span>
          <Src>[clickid]</Src> traffic source macro
        </span>
      </div>

      <h2>Already sending ads straight to the network?</h2>
      <p>
        Many people start like this: in the traffic source (here Adcash), the ad points directly at
        the network link, with the source's macro in the network's sub ID.
      </p>
      <p className="docs-journey-label">Before: ad URL in Adcash, no tracker</p>
      <div className="docs-url">
        https://goyesplay.com/ysrbgh8c2?<Net>subid1</Net>=<Src>[clickid]</Src>
      </div>
      <p>
        Capve sits in the middle, so that one URL becomes <strong>two</strong>. Copy the network
        link into Capve as an offer and keep the link code (<code>ysrbgh8c2</code> is your
        network's code). <code>[clickid]</code> can stay: Capve fills it with its own click id,
        the same value as <code>{"{click_id}"}</code>. Swapping to <code>{"{click_id}"}</code> is
        the same result, and reads more clearly.
      </p>
      <div className="docs-pair">
        <div>
          <small>A · Ad URL in Adcash</small>
          <div className="docs-url">
            {host}/c/YOUR_CAMPAIGN_KEY?zoneid=<Src>[zone]</Src>&amp;clickid=<Src>[clickid]</Src>
            &amp;…
          </div>
          <p>
            Copy it from the campaign&apos;s <strong>Traffic source link &amp; cost</strong> card. Adcash fills its{" "}
            <code>[…]</code> macros.
          </p>
        </div>
        <div>
          <small>B · Offer URL in Capve</small>
          <div className="docs-url">
            https://goyesplay.com/ysrbgh8c2?<Net>subid1</Net>=<Macro>{"{click_id}"}</Macro>
          </div>
          <p>
            <code>[clickid]</code> or <code>{"{click_id}"}</code>. Capve fills either one with its own ID.
          </p>
        </div>
      </div>
      <ul role="list">
        <li>
          <strong>Do not</strong> recreate the network's link code or campaign name in Capve. Your
          Capve campaign has its own key; the network link stays exactly the same inside the offer.
        </li>
        <li>
          The offer URL and the Adcash pixel take different macros.
          <ul>
            <li>
              <strong>Offer URL</strong> (Capve → YesPlay): <code>subid1={"{click_id}"}</code>. A pasted{" "}
              <code>[clickid]</code> is filled with that same Capve id.
            </li>
            <li>
              <strong>Adcash pixel</strong> (Capve → Adcash, on the traffic source):{" "}
              <code>cid={"{external_id}"}</code>. This is Adcash's own click id.{" "}
              <code>cid={"{click_id}"}</code> sends Capve's id, and Adcash cannot match it.
            </li>
          </ul>
        </li>
        <li>
          In the network's postback, use the macro that returns <code>subid1</code>:{" "}
          <code>{"/click?cnv_id={subid1}"}</code> (check the exact name in the network).
        </li>
      </ul>

      <h2>Follow one click</h2>
      <p>
        Example: a TUNE / HasOffers network whose tracking field is <code>aff_sub</code>. Your
        network may call it <code>sub1</code>, <code>subid</code>, <code>s2</code>… (see the
        cheat sheet below). The mechanics are identical.
      </p>

      <ol className="docs-journey" role="list">
        <li>
          <div className="docs-journey-head">
            <span className="docs-journey-actor">Visitor</span>
            <strong>Clicks your campaign link</strong>
          </div>
          <div className="docs-url">
            {host}/c/welcome?clickid=src_789&amp;sub1=zone_42
          </div>
          <p>
            Capve stores <code>src_789</code> as <code>external_id</code>. The offer leaves it off
            the network link. The Adcash pixel sends it back as <code>cid={"{external_id}"}</code>.
          </p>
        </li>

        <li>
          <div className="docs-journey-head">
            <span className="docs-journey-actor is-capve">Capve</span>
            <strong>Creates a click ID and fills the offer URL</strong>
          </div>
          <p className="docs-journey-label">Offer URL you saved in Capve</p>
          <div className="docs-url">
            https://network.example/aff_c?offer_id=12&amp;<Net>aff_sub</Net>=
            <Macro>{"{click_id}"}</Macro>
          </div>
          <p className="docs-journey-label">What the visitor is actually sent to</p>
          <div className="docs-url">
            https://network.example/aff_c?offer_id=12&amp;<Net>aff_sub</Net>=<Id />
            &amp;velo_ref=…&amp;click_id=<Id />
          </div>
          <p>
            Capve replaced <code>{"{click_id}"}</code> with <code>clk_8f2a91</code>. It also appends{" "}
            <code>click_id=</code> and <code>velo_ref=</code> on its own, but networks ignore
            parameters they don't know. Only <code>aff_sub</code> is saved by this network, so the
            macro must be there.
          </p>
        </li>

        <li>
          <div className="docs-journey-head">
            <span className="docs-journey-actor is-net">Network</span>
            <strong>Stores the ID with its own click</strong>
          </div>
          <div className="docs-store">
            <span>Network click #55120</span>
            <span>
              <Net>aff_sub</Net> = <Id />
            </span>
          </div>
          <p>The visitor reaches the merchant. Days later they sign up and deposit.</p>
        </li>

        <li>
          <div className="docs-journey-head">
            <span className="docs-journey-actor is-net">Network</span>
            <strong>Fires your postback, filling its macro</strong>
          </div>
          <p className="docs-journey-label">Postback URL you pasted in the network</p>
          <div className="docs-url">
            {host}/click?cnv_id=<Net>{"{aff_sub}"}</Net>&amp;payout=<Net>{"{payout}"}</Net>
            &amp;event=ftd&amp;key=YOUR_POSTBACK_KEY
          </div>
          <p className="docs-journey-label">Request Capve receives</p>
          <div className="docs-url">
            {host}/click?cnv_id=<Id />&amp;payout=80&amp;event=ftd&amp;key=YOUR_POSTBACK_KEY
          </div>
        </li>

        <li>
          <div className="docs-journey-head">
            <span className="docs-journey-actor is-capve">Capve</span>
            <strong>Finds clk_8f2a91 and records the conversion</strong>
          </div>
          <div className="docs-url">{`{"ok":true,"status":"created","conversion":{"click_id":"clk_8f2a91","event":"ftd","amount":80,…}}`}</div>
          <p>
            The click already knows its campaign, offer, lander, country and SubIDs, so the FTD
            shows up on all of them in reports. If the traffic source has a postback, Capve now
            reports back to it with <code>src_789</code>.
          </p>
        </li>
      </ol>

      <h2>Two URLs, one matching pair</h2>
      <p>
        You configure two URLs, in two different places. Each one contains a placeholder that the{" "}
        <em>other side</em> fills in:
      </p>
      <div className="docs-pair">
        <div>
          <small>1 · Offer URL — set in Capve (Offers)</small>
          <div className="docs-url">
            …?<Net>aff_sub</Net>=<Macro>{"{click_id}"}</Macro>
          </div>
          <p>
            Network's field name <strong>=</strong> Capve macro. <br />
            Capve fills <code>{"{click_id}"}</code>.
          </p>
        </div>
        <div>
          <small>2 · Postback URL — set in the network</small>
          <div className="docs-url">
            /click?cnv_id=<Net>{"{aff_sub}"}</Net>
          </div>
          <p>
            Capve's parameter <strong>=</strong> network macro. <br />
            The network fills <code>{"{aff_sub}"}</code>.
          </p>
        </div>
      </div>
      <p>
        <strong>Check:</strong> the field name in URL 1 and the macro in URL 2 must be the same
        network field (<code>aff_sub</code> ↔ <code>{"{aff_sub}"}</code>). If they match, the round
        trip works.
      </p>

      <div className="docs-callout is-warning">
        <strong>Most common mistake</strong>
        <p>
          Putting <code>cnv_id={"{click_id}"}</code> in the network's postback. The network does
          not know Capve's macro, so it sends the text <code>{"{click_id}"}</code> (or nothing) and
          Capve answers <code>404 click not found</code>. In the network, always use the{" "}
          <em>network's</em> macro, for example <code>{"${subid1}"}</code>. This warning is only
          about the URL saved in the affiliate network. The Adcash pixel is the opposite: there
          you do write a Capve macro, and it is <code>cid={"{external_id}"}</code>.
        </p>
      </div>

      <h2>Cheat sheet by network</h2>
      <p>
        These match the built-in templates in <strong>Affiliate networks → Create from template</strong>
        , which print both URLs for you. Macro names can change; check your network's postback
        settings. Always add <code>&amp;key=YOUR_POSTBACK_KEY</code> to the postback.
      </p>
      <table className="table">
        <thead>
          <tr>
            <th>Network</th>
            <th>Add to offer URL (in Capve)</th>
            <th>Postback (in the network)</th>
          </tr>
        </thead>
        <tbody>
          {NETWORKS.map((n) => (
            <tr key={n.name}>
              <td>{n.name}</td>
              <td>
                <code>
                  {n.field}={"{click_id}"}
                </code>
              </td>
              <td>
                <code>
                  /click?cnv_id={n.macro}&amp;payout={n.payout}
                </code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        Your network is not listed? Find in its docs the “sub ID”, “aff_sub”, “click ID” or
        “tracking parameter” you can pass on the offer link, and the macro that returns it in
        postbacks. Use the parameter in the offer URL and the macro after <code>cnv_id=</code>.
      </p>

      <h2>Set it up</h2>
      <ol className="docs-steps" role="list">
        <li>
          <strong>Create the network</strong>
          <p>
            <strong>Affiliate networks → Create from template</strong>, pick the platform. Copy the
            postback URLs it shows (one default, one per event).
          </p>
        </li>
        <li>
          <strong>Create the offer</strong>
          <p>
            Paste the offer link from the network and add the tracking field with Capve's macro.
            Keep the network's own parameters:
          </p>
          <CodeBlock>{"https://network.example/aff_c?offer_id=12&aff_id=345&aff_sub={click_id}"}</CodeBlock>
        </li>
        <li>
          <strong>Paste the postback in the network</strong>
          <p>
            Add your account key from the campaign's <em>Tracking &amp; postback</em> card. For
            several funnel steps, add one postback per event:
          </p>
          <CodeBlock label="Registration postback">{`${base}/click?cnv_id={aff_sub}&payout={payout}&event=registration&key=YOUR_POSTBACK_KEY`}</CodeBlock>
          <CodeBlock label="FTD postback">{`${base}/click?cnv_id={aff_sub}&payout={payout}&event=ftd&key=YOUR_POSTBACK_KEY`}</CodeBlock>
        </li>
      </ol>

      <h2>Prove it works (3 checks, 5 minutes)</h2>
      <ol className="docs-steps" role="list">
        <li>
          <strong>Check the outgoing click</strong>
          <p>
            Open your campaign link in a private window. In the network's click log (or the
            browser's address bar before the merchant redirect), look for{" "}
            <code>aff_sub=clk_…</code>.
          </p>
          <table className="table">
            <tbody>
              <tr>
                <td>
                  <code>aff_sub=clk_8f2a91</code>
                </td>
                <td>Good. Copy this ID for check 2.</td>
              </tr>
              <tr>
                <td>
                  <code>aff_sub={"{click_id}"}</code>
                </td>
                <td>Typo in the macro (Capve leaves unknown macros untouched).</td>
              </tr>
              <tr>
                <td>
                  <code>aff_sub=</code> missing or empty
                </td>
                <td>The field is not on the offer URL, or a lander dropped it.</td>
              </tr>
              <tr>
                <td>
                  <code>aff_sub=src_789</code>
                </td>
                <td>
                  The offer is sending Adcash's id to the network. The offer wants Capve's{" "}
                  <code>{"{click_id}"}</code>. <code>{"{external_id}"}</code> belongs on the Adcash
                  pixel: <code>cid={"{external_id}"}</code>.
                </td>
              </tr>
            </tbody>
          </table>
        </li>
        <li>
          <strong>Send a test postback yourself</strong>
          <p>Replace the ID with the one from check 1. Use event and payout you expect:</p>
          <CodeBlock>{`curl "${base}/click?cnv_id=clk_8f2a91&payout=1&event=test&key=YOUR_POSTBACK_KEY"`}</CodeBlock>
          <p>
            <code>{`{"ok":true,"status":"created",…}`}</code> means Capve accepts the URL. Then use
            the network's own “test postback” button: it should also return <code>ok</code>. If it
            fails there but your curl worked, the network's macro or URL is wrong.
          </p>
        </li>
        <li>
          <strong>See it in the dashboard</strong>
          <p>
            Open the campaign stats or <strong>Reports</strong> grouped by offer: the conversion
            (and its event column) appears on the offer you clicked. The <code>test</code>{" "}
            event gets its own column, so it never mixes with real registrations or FTDs.
          </p>
        </li>
      </ol>

      <h2>When a conversion is missing</h2>
      <table className="table">
        <thead>
          <tr>
            <th>What you see</th>
            <th>Cause</th>
            <th>Fix</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>400 cnv_id required</code>
            </td>
            <td>Network sent an empty macro</td>
            <td>Offer URL is missing the field, or the macro name in the postback is wrong.</td>
          </tr>
          <tr>
            <td>
              <code>404 click not found</code>
            </td>
            <td>
              Value is not a Capve click ID (literal <code>{"{click_id}"}</code>, source ID, or
              the network's own transaction ID)
            </td>
            <td>Use the network macro that returns the field you set on the offer URL.</td>
          </tr>
          <tr>
            <td>
              <code>403 invalid postback key</code>
            </td>
            <td>Key enforcement is on and the key is missing or old</td>
            <td>Copy the current key from Tracking &amp; postback; it changes when rotated.</td>
          </tr>
          <tr>
            <td>Conversion recorded, wrong amount</td>
            <td>No key (payout capped to offer payout) or wrong payout macro</td>
            <td>Add the key; check the payout macro in the cheat sheet.</td>
          </tr>
          <tr>
            <td>Network shows a sale, Capve received nothing</td>
            <td>Postback not set for that offer or event</td>
            <td>Check the postback is global or attached to this offer in the network.</td>
          </tr>
        </tbody>
      </table>

      <p>
        Next: <Link to="/docs/click-ids">Click IDs &amp; SubIDs</Link>,{" "}
        <Link to="/docs/campaigns">several networks in one campaign</Link>, or the full{" "}
        <Link to="/docs/postback">postback parameter reference</Link>.
      </p>
    </>
  );
}
