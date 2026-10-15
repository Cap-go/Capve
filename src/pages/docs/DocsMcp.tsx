import { Link } from "react-router-dom";
import { CodeBlock } from "../../components/CodeBlock";
import { appBaseUrl } from "../../lib/constants";
import {
  MCP_EXAMPLE_PROMPTS,
  claudeCodeCommand,
  mcpJsonConfig,
  mcpRemoteConfig,
  mcpUrl,
} from "../../lib/mcp";

const TOOL_GROUPS: Array<[string, string[]]> = [
  [
    "Campaigns",
    [
      "list_campaigns",
      "get_campaign",
      "create_campaign",
      "update_campaign",
      "bulk_update_campaigns",
      "clone_campaign",
      "get_campaign_tracking",
      "get_campaign_stats",
      "list_clicks",
      "list_conversions",
    ],
  ],
  ["Affiliates", ["list_affiliates", "create_affiliate"]],
  ["Routing", ["get_rotation", "set_rotation", "create_path", "update_path", "delete_path"]],
  [
    "Entities",
    [
      "list_groups",
      "create_group",
      "delete_group",
      "list_traffic_sources",
      "create_traffic_source",
      "list_networks",
      "create_network",
      "list_landers",
      "create_lander",
      "list_offers",
      "create_offer",
    ],
  ],
  ["Postbacks", ["list_postbacks", "create_postback", "update_postback", "delete_postback"]],
  [
    "Sources & cost",
    [
      "list_source_templates",
      "create_traffic_source_from_template",
      "create_network_from_template",
      "get_traffic_source_settings",
      "update_traffic_source_settings",
      "sync_traffic_source_cost",
      "get_campaign_source_link",
      "list_cost_updates",
      "update_campaign_cost",
    ],
  ],
  ["Reports", ["report_campaigns", "report_grouped", "report_trends"]],
  ["Automation", ["list_triggers", "create_trigger", "delete_trigger", "list_notes", "add_note"]],
  ["Team", ["whoami", "list_team", "invite_team_member", "remove_team_member"]],
];

export function DocsMcp() {
  const base = appBaseUrl();
  return (
    <>
      <h1>MCP server</h1>
      <p>
        Capve is a remote{" "}
        <a href="https://modelcontextprotocol.io" target="_blank" rel="noreferrer">
          Model Context Protocol
        </a>{" "}
        server. Connect an AI assistant and it can do everything the dashboard does: create
        campaigns, set up paths and rotations, add offers and landers, read reports and pause
        losers.
      </p>
      <CodeBlock>{mcpUrl(base)}</CodeBlock>

      <h2>1. Create a token</h2>
      <p>
        In the dashboard open <Link to="/app?entity=mcp">AI / MCP</Link> and create a token. It
        starts with <code>capve_</code> and is shown once. The token acts as you, with your team
        role: viewers can read, owners and admins can change things. Revoke it any time from the
        same page.
      </p>

      <h2>2. Connect your client</h2>
      <h3>Claude Code</h3>
      <CodeBlock>{claudeCodeCommand(base)}</CodeBlock>
      <h3>Cursor, Windsurf, VS Code and other HTTP clients</h3>
      <p>
        Add to <code>mcp.json</code> (Cursor: <code>~/.cursor/mcp.json</code>):
      </p>
      <CodeBlock>{mcpJsonConfig(base)}</CodeBlock>
      <h3>Clients that only support stdio</h3>
      <p>
        Use <code>mcp-remote</code> as a bridge, for example in the Claude Desktop config file:
      </p>
      <CodeBlock>{mcpRemoteConfig(base)}</CodeBlock>

      <h2>3. Ask</h2>
      <ul>
        {MCP_EXAMPLE_PROMPTS.map((prompt) => (
          <li key={prompt}>{prompt}</li>
        ))}
      </ul>

      <h2>Tools</h2>
      <p>
        Each tool calls the same API as the dashboard, with the same validation and permissions.
        Money is in cents. Report dates accept ISO dates or Unix milliseconds.
      </p>
      <table className="table">
        <thead>
          <tr>
            <th>Area</th>
            <th>Tools</th>
          </tr>
        </thead>
        <tbody>
          {TOOL_GROUPS.map(([area, tools]) => (
            <tr key={area}>
              <td>{area}</td>
              <td className="mono">{tools.join(", ")}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Protocol</h2>
      <p>
        Streamable HTTP transport, JSON responses, stateless. Send{" "}
        <code>Authorization: Bearer capve_…</code> on every request. Requests without a valid token
        get <code>401</code>. The same token works on the REST API (<code>/api/*</code>), except
        for managing tokens.
      </p>
      <CodeBlock>{`curl ${mcpUrl(base)} \\
  -H "Authorization: Bearer capve_YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`}</CodeBlock>
    </>
  );
}
