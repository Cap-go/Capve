/**
 * Setup cards for the main AI clients on /app/mcp and /docs/mcp.
 *
 * Every client connects with OAuth, so links and snippets carry only the server URL, never a token.
 * Link formats follow each vendor's published docs:
 * - Claude: https://claude.com/docs/connectors/building/directory-vs-custom (custom connector install link)
 * - Cursor: https://cursor.com/docs/context/mcp/install-links
 * - VS Code: https://code.visualstudio.com/api/extension-guides/ai/mcp (URL handler)
 * - LM Studio: https://lmstudio.ai/docs/app/mcp/deeplink
 * - Grok: https://docs.x.ai/grok/connectors
 */
import { mcpUrl } from "./mcp";

export const MCP_SERVER_NAME = "capve";
export const MCP_DISPLAY_NAME = "Capve";

export type McpClientId =
  | "claude" | "claude-code" | "chatgpt" | "cursor" | "vscode" | "windsurf"
  | "gemini-cli" | "codex" | "zed" | "lm-studio" | "grok";

export type McpClientLink = {
  label: string;
  href: string;
  /** true when the link opens a confirm-to-install dialog with Capve prefilled. */
  install: boolean;
};

export type McpClientSnippet = { label: string; value: string };

export type McpClient = {
  id: McpClientId;
  name: string;
  summary: string;
  steps: string[];
  links: McpClientLink[];
  snippets: McpClientSnippet[];
};

/** btoa is available in browsers and Workers; the config is ASCII because URLs are. */
function base64(value: string): string {
  return btoa(value);
}

/** Server entry shared by Cursor and LM Studio (mcp.json value without the wrapper). */
export function remoteServerConfig(base: string): { url: string } {
  return { url: mcpUrl(base) };
}

export function claudeConnectorLink(base: string): string {
  const params = new URLSearchParams({
    modal: "add-custom-connector",
    connectorName: MCP_DISPLAY_NAME,
    connectorUrl: mcpUrl(base),
  });
  return `https://claude.ai/customize/connectors?${params}`;
}

export function cursorDeeplink(base: string): string {
  const config = encodeURIComponent(base64(JSON.stringify(remoteServerConfig(base))));
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=${MCP_SERVER_NAME}&config=${config}`;
}

/** https wrapper that opens Cursor from any page, including GitHub READMEs. */
export function cursorWebInstallLink(base: string): string {
  const config = encodeURIComponent(base64(JSON.stringify(remoteServerConfig(base))));
  return `https://cursor.com/install-mcp?name=${MCP_SERVER_NAME}&config=${config}`;
}

export function vscodeInstallLink(base: string, insiders = false): string {
  const server = { name: MCP_SERVER_NAME, type: "http", url: mcpUrl(base) };
  return `${insiders ? "vscode-insiders" : "vscode"}:mcp/install?${encodeURIComponent(JSON.stringify(server))}`;
}

export function lmStudioDeeplink(base: string): string {
  const config = encodeURIComponent(base64(JSON.stringify(remoteServerConfig(base))));
  return `lmstudio://add_mcp?name=${MCP_SERVER_NAME}&config=${config}`;
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function mcpClients(base: string): McpClient[] {
  const url = mcpUrl(base);
  return [
    {
      id: "claude",
      name: "Claude",
      summary: "claude.ai, Claude Desktop and mobile",
      steps: [
        "Click Add to Claude. The custom connector dialog opens with Capve filled in.",
        "Click Add, then Connect and sign in to Capve.",
        "In a chat, open + then Connectors and turn Capve on.",
      ],
      links: [{ label: "Add to Claude", href: claudeConnectorLink(base), install: true }],
      snippets: [{ label: "Connector URL", value: url }],
    },
    {
      id: "claude-code",
      name: "Claude Code",
      summary: "Anthropic's coding agent in the terminal",
      steps: [
        "Copy the command and run it in your terminal.",
        "Start claude, type /mcp, pick capve and choose Authenticate.",
        "Sign in to Capve in the browser window that opens.",
      ],
      links: [],
      snippets: [{ label: "Terminal", value: `claude mcp add --transport http ${MCP_SERVER_NAME} ${url}` }],
    },
    {
      id: "chatgpt",
      name: "ChatGPT",
      summary: "Custom app in developer mode",
      steps: [
        "Open Settings, then Apps, then Advanced settings and turn on Developer mode.",
        "Click Create app, name it Capve and paste the MCP URL.",
        "Choose OAuth, click Create and sign in to Capve.",
        "In a chat, open + then More and select Capve.",
      ],
      links: [{ label: "Open ChatGPT", href: "https://chatgpt.com/", install: false }],
      snippets: [{ label: "MCP server URL", value: url }],
    },
    {
      id: "cursor",
      name: "Cursor",
      summary: "One-click install",
      steps: [
        "Click Add to Cursor and confirm Install.",
        "In Cursor Settings, then MCP, click Connect next to capve.",
        "Sign in to Capve and approve the app.",
      ],
      links: [
        { label: "Add to Cursor", href: cursorDeeplink(base), install: true },
        { label: "Install from cursor.com", href: cursorWebInstallLink(base), install: true },
      ],
      snippets: [{ label: "~/.cursor/mcp.json", value: json({ mcpServers: { [MCP_SERVER_NAME]: remoteServerConfig(base) } }) }],
    },
    {
      id: "vscode",
      name: "VS Code and GitHub Copilot",
      summary: "One-click install for Copilot agent mode",
      steps: [
        "Click Add to VS Code (or Insiders) and select Install.",
        "Start capve when VS Code asks, then sign in to Capve.",
        "In Copilot Chat, switch to Agent mode and ask away.",
      ],
      links: [
        { label: "Add to VS Code", href: vscodeInstallLink(base), install: true },
        { label: "VS Code Insiders", href: vscodeInstallLink(base, true), install: true },
      ],
      snippets: [{ label: "Terminal", value: `code --add-mcp '${JSON.stringify({ name: MCP_SERVER_NAME, type: "http", url })}'` }],
    },
    {
      id: "windsurf",
      name: "Windsurf",
      summary: "Cascade MCP config",
      steps: [
        "In Cascade, open the MCP menu and choose Open MCP config file.",
        "Paste the capve entry inside mcpServers and save.",
        "Press refresh, then sign in to Capve when Cascade asks.",
      ],
      links: [],
      snippets: [{ label: "mcp_config.json", value: json({ mcpServers: { [MCP_SERVER_NAME]: { serverUrl: url } } }) }],
    },
    {
      id: "gemini-cli",
      name: "Gemini CLI",
      summary: "Google's agent in the terminal",
      steps: [
        "Copy the command and run it in your terminal.",
        "Start gemini and run /mcp auth capve.",
        "Sign in to Capve in the browser window that opens.",
      ],
      links: [],
      snippets: [{ label: "Terminal", value: `gemini mcp add --transport http ${MCP_SERVER_NAME} ${url}` }],
    },
    {
      id: "codex",
      name: "Codex",
      summary: "OpenAI's coding agent (CLI and IDE extension)",
      steps: [
        "Copy the commands and run them in your terminal.",
        "Sign in to Capve in the browser window that opens.",
        "Start codex and the Capve tools are ready.",
      ],
      links: [],
      snippets: [{ label: "Terminal", value: `codex mcp add ${MCP_SERVER_NAME} --url ${url}\ncodex mcp login ${MCP_SERVER_NAME}` }],
    },
    {
      id: "zed",
      name: "Zed",
      summary: "Agent panel context server",
      steps: [
        "Open Settings, then AI, then MCP Servers and choose Add Remote Server, or edit settings.json.",
        "Add the capve entry under context_servers and save.",
        "Sign in to Capve when Zed asks.",
      ],
      links: [],
      snippets: [{ label: "settings.json", value: json({ context_servers: { [MCP_SERVER_NAME]: { url } } }) }],
    },
    {
      id: "lm-studio",
      name: "LM Studio",
      summary: "Local models with Capve tools (0.4.10 or later)",
      steps: [
        "Click Add to LM Studio and confirm the install.",
        "Sign in to Capve in the browser window that opens.",
        "Turn on capve in the chat's tools panel.",
      ],
      links: [{ label: "Add to LM Studio", href: lmStudioDeeplink(base), install: true }],
      snippets: [{ label: "mcp.json", value: json({ mcpServers: { [MCP_SERVER_NAME]: remoteServerConfig(base) } }) }],
    },
    {
      id: "grok",
      name: "Grok",
      summary: "Custom connector on grok.com",
      steps: [
        "Open Grok connectors and click New Connector, then Custom.",
        "Paste the MCP URL and sign in to Capve.",
        "Ask Grok about your campaigns in any chat.",
      ],
      links: [{ label: "Open Grok connectors", href: "https://grok.com/connectors", install: false }],
      snippets: [{ label: "MCP server URL", value: url }],
    },
  ];
}
