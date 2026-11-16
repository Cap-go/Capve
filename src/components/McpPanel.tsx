import { oauthRequest, type OAuthConnection } from "../lib/oauth";
import { FormEvent, useEffect, useState } from "react";
import { api, type ApiToken } from "../lib/api";
import { appBaseUrl } from "../lib/constants";
import {
  MCP_EXAMPLE_PROMPTS,
  claudeCodeCommand,
  mcpJsonConfig,
  mcpUrl,
} from "../lib/mcp";
import { CodeBlock } from "./CodeBlock";
import { ErrorBox, Field, SecretBox, confirmDelete } from "./ui";
import { Link } from "react-router-dom";

export function McpPanel() {
  const base = appBaseUrl();
  const [connections, setConnections] = useState<OAuthConnection[]>([]);
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [name, setName] = useState("Claude");
  const [created, setCreated] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    oauthRequest<{ connections: OAuthConnection[] }>("/connections").then(({ connections }) => setConnections(connections)).catch((err) => setError(err.message));
    api.apiTokens().then(({ tokens: items }) => setTokens(items)).catch(() => {});
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { token, api_token } = await api.createApiToken(name);
      setTokens((prev) => [api_token, ...prev]);
      setCreated(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create token");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(tokenId: string, tokenName: string) {
    if (!confirmDelete(`token "${tokenName}"`, "Assistants using it lose access immediately.")) return;
    setError("");
    try {
      await api.deleteApiToken(tokenId);
      setTokens((prev) => prev.filter((t) => t.id !== tokenId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not revoke token");
    }
  }

  async function disconnect(connection: OAuthConnection) {
    if (!confirmDelete(`connection "${connection.name}"`, "The app loses access immediately.")) return;
    try {
      await oauthRequest(`/connections/${encodeURIComponent(connection.id)}`, { method: "DELETE" });
      setConnections((items) => items.filter((item) => item.id !== connection.id));
    } catch (err) { setError(err instanceof Error ? err.message : "Could not disconnect app"); }
  }

  const token = created ?? undefined;

  return (
    <div className="space-y-6">
      <div className="card p-5">
        <h2 className="font-semibold">Chat with Capve in this console</h2>
        <p className="mt-2 max-w-2xl text-sm text-[var(--velo-muted)]">Connect your ChatGPT account to explore reports and manage campaigns here. Uses your eligible ChatGPT plan, with a confirmation before every change.</p>
        <button className="btn btn-primary mt-4" onClick={() => window.dispatchEvent(new Event("capve:open-assistant"))}>Open Capve assistant</button>
      </div>
      <div className="card p-5">
        <h2 className="font-semibold">Use Capve from your AI assistant</h2>
        <p className="mt-1 max-w-2xl text-sm text-[var(--velo-muted)]">
          Capve is an MCP server. Connect Claude Code, Cursor, VS Code or any MCP client and manage
          campaigns, paths, offers and reports by chat.{" "}
          <Link className="underline" to="/docs/mcp">
            Docs
          </Link>
        </p>
        <p className="mono mt-4 break-all text-sm">{mcpUrl(base)}</p>
      </div>

      <div className="card p-5">
        <h2 className="font-semibold">Connect with OAuth</h2>
        <p className="mt-2 max-w-2xl text-sm text-[var(--velo-muted)]">Add the server URL to your MCP client and choose OAuth. Sign in to Capve, review the app and allow access to your personal account. No API token to copy.</p>
        <h3 className="mt-5 text-sm font-medium">Connected apps</h3>
        {connections.length === 0 ? <p className="mt-2 text-sm text-[var(--velo-muted)]">No apps connected yet.</p> : (
          <ul className="mt-3 divide-y divide-[var(--velo-border)]">
            {connections.map((connection) => <li key={connection.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div><p className="break-words text-sm font-medium">{connection.name}</p><p className="mt-1 text-xs text-[var(--velo-muted)]">Expires {new Date(connection.expires_at).toLocaleDateString()}</p></div>
              <button className="btn btn-secondary text-xs" type="button" onClick={() => disconnect(connection)}>Disconnect</button>
            </li>)}
          </ul>
        )}
        <ErrorBox message={error} />
      </div>

      <div className="card p-5">
        <h2 className="font-semibold">API tokens (manual setup)</h2>
        <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={create}>
          <div className="w-full sm:w-64">
            <Field label="Token name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <button className="btn btn-primary" disabled={busy} type="submit">
            Create token
          </button>
        </form>
        {created ? (
          <SecretBox title="Copy this token now. It is not shown again." value={created} />
        ) : null}
        {tokens.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Token</th>
                <th>Last used</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tokens.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td className="mono">{t.prefix}…</td>
                  <td>{t.last_used_at ? new Date(t.last_used_at).toLocaleString() : "Never"}</td>
                  <td>
                    <button
                      className="btn btn-secondary text-xs"
                      onClick={() => revoke(t.id, t.name)}
                      type="button"
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        ) : null}
      </div>

      <div className="card space-y-4 p-5">
        <h2 className="font-semibold">Add a token to your client</h2>
        <div>
          <p className="text-sm font-medium">Claude Code</p>
          <div className="mt-2">
            <CodeBlock>{claudeCodeCommand(base, token)}</CodeBlock>
          </div>
        </div>
        <div>
          <p className="text-sm font-medium">Cursor, Windsurf, VS Code and others (mcp.json)</p>
          <div className="mt-2">
            <CodeBlock>{mcpJsonConfig(base, token)}</CodeBlock>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="font-semibold">Ask your assistant</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
          {MCP_EXAMPLE_PROMPTS.map((prompt) => (
            <li key={prompt}>{prompt}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
