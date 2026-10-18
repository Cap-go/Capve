import { Link } from "react-router-dom";

export function DocsOverview() {
  return (
    <>
      <div className="docs-eyebrow">The Capve handbook</div>
      <h1>
        Know where every
        <br className="max-sm:hidden" /> conversion comes from.
      </h1>
      <p className="docs-lead">
        Track campaigns, connect affiliate networks, and follow each click
        through to revenue. Start with the basics, then build your first
        campaign.
      </p>
      <div className="docs-start">
        <div>
          <small>Start here · Tracking fundamentals</small>
          <h2>One click. One ID. A complete round trip.</h2>
          <p>
            Learn which ID to send, what a SubID means, and how a postback
            connects the conversion.
          </p>
          <Link to="/docs/click-ids">
            Understand Click IDs &amp; SubIDs <span aria-hidden="true">→</span>
          </Link>
        </div>
        <div className="docs-id-example" aria-hidden="true">
          <span>Traffic source</span>
          <code>src_789</code>
          <span>↓ Capve click ID</span>
          <code>clk_example</code>
          <span>↓ Offer → Postback</span>
          <code>cnv_id=clk_example</code>
        </div>
      </div>
      <h2>Build your tracking setup</h2>
      <div className="docs-guide-grid">
        <Link to="/docs/campaigns">
          <small>01 / Campaign setup</small>
          <h3>Several providers, one campaign</h3>
          <p>
            Route to offers from different networks. Keep sources, IDs, and
            callbacks in the right place.
          </p>
          <span aria-hidden="true">↗</span>
        </Link>
        <Link to="/docs/postback">
          <small>02 / Conversion tracking</small>
          <h3>Connect your postbacks</h3>
          <p>
            Receive registrations and sales, then send conversions back to the
            traffic source.
          </p>
          <span aria-hidden="true">↗</span>
        </Link>
        <Link to="/docs/traffic-sources">
          <small>03 / Traffic &amp; reporting</small>
          <h3>Make your data useful</h3>
          <p>
            Map source tokens, track costs, and compare placements with
            consistent SubIDs.
          </p>
          <span aria-hidden="true">↗</span>
        </Link>
        <Link to="/docs/mcp">
          <small>04 / Work with an assistant</small>
          <h3>Connect the MCP server</h3>
          <p>
            Create campaigns and explore reports from your AI assistant using a
            personal API token.
          </p>
          <span aria-hidden="true">↗</span>
        </Link>
      </div>
      <h2>How tracking fits together</h2>
      <div className="docs-flow">
        <div>
          <small>01 / Capture</small>
          <strong>Traffic source → Capve</strong>
          <span>Record the visit, source ID, and SubIDs.</span>
        </div>
        <div>
          <small>02 / Route</small>
          <strong>Capve → lander or offer</strong>
          <span>Pass Capve's unique click ID.</span>
        </div>
        <div>
          <small>03 / Attribute</small>
          <strong>Network → postback</strong>
          <span>Return the ID and record the conversion.</span>
        </div>
      </div>
      <p>
        Promoting your own product? Use{" "}
        <Link to="/docs/browser-attribution">browser attribution</Link> to
        capture the affiliate reference, then send verified sales through{" "}
        <Link to="/docs/server-conversions">your backend</Link>. For network
        offers, begin with the <Link to="/docs/postback">S2S postback</Link>.
      </p>
    </>
  );
}
