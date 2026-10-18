import { Link } from "react-router-dom";
import { OPEN_DOCS_SEARCH } from "../../components/DocsSearch";
import { Icon } from "../../components/Icon";

export function DocsOverview() {
  return (
    <>
      <div className="docs-hero">
        <div className="docs-eyebrow">Capve documentation</div>
        <h1>
          Know where every
          <br className="max-sm:hidden" /> conversion comes from.
        </h1>
        <p className="docs-lead">
          Track campaigns, connect affiliate networks, and follow each click
          through to revenue. Start with the basics, then build your first
          campaign.
        </p>
        <button
          className="docs-hero-search"
          type="button"
          onClick={() => window.dispatchEvent(new Event(OPEN_DOCS_SEARCH))}
        >
          <Icon name="search" size={18} />
          <span>Search guides, tokens, and API fields…</span>
          <kbd aria-hidden="true">⌘K</kbd>
        </button>
        <p className="docs-hero-popular">
          Popular: <Link to="/docs/click-ids">click_id vs SubID</Link>
          <Link to="/docs/postback">Postback URL</Link>
          <Link to="/docs/campaigns">Several networks</Link>
          <Link to="/docs/glossary">Glossary</Link>
        </p>
      </div>
      <h2>Start with your role</h2>
      <div className="docs-audience">
        <Link to="/docs/campaigns">
          <Icon name="campaigns" size={20} />
          <strong>I buy traffic</strong>
          <span>
            Send ad traffic to offers from several networks and compare
            placements by SubID.
          </span>
          <small>Multi-provider campaigns →</small>
        </Link>
        <Link to="/docs/browser-attribution">
          <Icon name="networks" size={20} />
          <strong>I run an affiliate program</strong>
          <span>
            Give partners tracking links and credit them for sales on your
            own site.
          </span>
          <small>Browser attribution →</small>
        </Link>
        <Link to="/docs/api/convert">
          <Icon name="docs" size={20} />
          <strong>I'm a developer</strong>
          <span>
            Report conversions from your backend, or drive Capve from an AI
            assistant.
          </span>
          <small>Conversion API →</small>
        </Link>
      </div>
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
      <h2>Find your way around the dashboard</h2>
      <p>
        The sidebar groups every screen. The account switcher at the top
        changes which personal or team account you are working in.
      </p>
      <table className="table">
        <thead>
          <tr>
            <th>Section</th>
            <th>Screens</th>
            <th>Use it to</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Tracking</td>
            <td>Campaigns, Reports</td>
            <td>
              Create campaigns, copy tracking links, read live stats, and
              compare or export results.
            </td>
          </tr>
          <tr>
            <td>Inventory</td>
            <td>
              Traffic sources, Affiliate networks, Offers, Landers, Groups
            </td>
            <td>
              Set up the building blocks that campaigns route through and
              report on.
            </td>
          </tr>
          <tr>
            <td>Workspace</td>
            <td>Settings, AI / MCP, Admin</td>
            <td>
              Manage the account, team, tracking domains, and API tokens.
              Admin appears only for platform admins.
            </td>
          </tr>
        </tbody>
      </table>
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
