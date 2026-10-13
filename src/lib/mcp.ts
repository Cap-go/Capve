/** Client setup snippets for the Capve MCP server (`/mcp`, bearer token). */

export const TOKEN_PLACEHOLDER = "capve_YOUR_TOKEN";

export function mcpUrl(base: string): string {
  return `${base}/mcp`;
}

export function claudeCodeCommand(base: string, token = TOKEN_PLACEHOLDER): string {
  return `claude mcp add --transport http capve \\
  ${mcpUrl(base)} \\
  --header "Authorization: Bearer ${token}"`;
}

/** Cursor (~/.cursor/mcp.json), Windsurf, VS Code and most clients accept this shape. */
export function mcpJsonConfig(base: string, token = TOKEN_PLACEHOLDER): string {
  return JSON.stringify(
    {
      mcpServers: {
        capve: {
          url: mcpUrl(base),
          headers: { Authorization: `Bearer ${token}` },
        },
      },
    },
    null,
    2,
  );
}

/** For clients that only speak stdio (e.g. Claude Desktop config file). */
export function mcpRemoteConfig(base: string, token = TOKEN_PLACEHOLDER): string {
  return JSON.stringify(
    {
      mcpServers: {
        capve: {
          command: "bunx",
          args: ["mcp-remote", mcpUrl(base), "--header", `Authorization: Bearer ${token}`],
        },
      },
    },
    null,
    2,
  );
}

export const MCP_EXAMPLE_PROMPTS = [
  "Which campaigns lost money last week, and on which countries?",
  "Create a campaign for my new offer, split 50/50 between my two landers.",
  "Pause every campaign with ROI below -30% over the last 7 days.",
  "Group yesterday's conversions by sub1 and tell me which placements to cut.",
];
