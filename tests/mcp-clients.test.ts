import { describe, expect, it } from "vitest";
import {
  claudeConnectorLink,
  cursorDeeplink,
  cursorWebInstallLink,
  lmStudioDeeplink,
  mcpClients,
  vscodeInstallLink,
} from "../src/lib/mcp-clients";

const base = "https://capve.example";
const url = `${base}/mcp`;

function decodeBase64Config(link: string): unknown {
  return JSON.parse(atob(new URL(link).searchParams.get("config")!));
}

describe("AI client setup cards", () => {
  it("covers the main AI clients with short numbered steps and copyable config", () => {
    const clients = mcpClients(base);
    expect(clients.map((client) => client.name)).toEqual([
      "Claude", "Claude Code", "ChatGPT", "Cursor", "VS Code and GitHub Copilot", "Windsurf",
      "Gemini CLI", "Codex", "Zed", "LM Studio", "Grok",
    ]);
    for (const client of clients) {
      expect(client.steps.length, client.name).toBeGreaterThanOrEqual(2);
      expect(client.steps.length, client.name).toBeLessThanOrEqual(4);
      expect(client.snippets.length, client.name).toBeGreaterThan(0);
      expect(client.snippets.some((snippet) => snippet.value.includes(url)), client.name).toBe(true);
    }
  });

  it("never puts a credential or long dash in links, steps or snippets", () => {
    const text = JSON.stringify(mcpClients(base));
    expect(text).not.toMatch(/Bearer|capve_|Authorization/);
    expect(text).not.toMatch(/[\u2013\u2014]/);
  });

  it("builds Claude's documented custom connector install link", () => {
    const link = new URL(claudeConnectorLink(base));
    expect(link.origin + link.pathname).toBe("https://claude.ai/customize/connectors");
    expect(Object.fromEntries(link.searchParams)).toEqual({
      modal: "add-custom-connector", connectorName: "Capve", connectorUrl: url,
    });
    expect(claudeConnectorLink(base)).toContain(`connectorUrl=${encodeURIComponent(url)}`);
  });

  it("builds Cursor's deeplink and web install link with a base64 server entry", () => {
    expect(cursorDeeplink(base)).toMatch(/^cursor:\/\/anysphere\.cursor-deeplink\/mcp\/install\?name=capve&config=/);
    expect(cursorWebInstallLink(base)).toMatch(/^https:\/\/cursor\.com\/install-mcp\?name=capve&config=/);
    expect(decodeBase64Config(cursorDeeplink(base))).toEqual({ url });
    expect(decodeBase64Config(cursorWebInstallLink(base))).toEqual({ url });
  });

  it("builds VS Code's URL handler link with the name inside the JSON", () => {
    const stable = vscodeInstallLink(base);
    expect(stable.startsWith("vscode:mcp/install?")).toBe(true);
    expect(JSON.parse(decodeURIComponent(stable.slice("vscode:mcp/install?".length)))).toEqual({ name: "capve", type: "http", url });
    expect(vscodeInstallLink(base, true).startsWith("vscode-insiders:mcp/install?")).toBe(true);
  });

  it("builds LM Studio's add_mcp deeplink", () => {
    const link = lmStudioDeeplink(base);
    expect(link).toMatch(/^lmstudio:\/\/add_mcp\?name=capve&config=/);
    expect(decodeBase64Config(link)).toEqual({ url });
  });

  it("marks only real install links as one click", () => {
    const oneClick = mcpClients(base).filter((client) => client.links.some((link) => link.install)).map((client) => client.id);
    expect(oneClick).toEqual(["claude", "cursor", "vscode", "lm-studio"]);
  });
});
