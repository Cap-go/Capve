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
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [name, setName] = useState("Claude");
  const [created, setCreated] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
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

  const token = created ?? undefined;

  return (
    <div className="space-y-6">
      <div className="card p-5">
        <h2 className="font-semibold">Use Capve from your AI assistant</h2>
        <p className="mt-1 max-w-2xl text-sm text-[var(--velo-muted)]">
          Capve is an MCP server. Connect Claude Code, Cursor, VS Code or any MCP client and manage
          campaigns, paths, offers, reports and team by chat. The assistant has the same access as
          you.{" "}
          <Link className="underline" to="/docs/mcp">
            Docs
          </Link>
        </p>
        <p className="mono mt-4 break-all text-sm">{mcpUrl(base)}</p>
      </div>

      <div className="card p-5">
        <h2 className="font-semibold">1. Create a token</h2>
        <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={create}>
          <div className="w-full sm:w-64">
            <Field label="Token name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <button className="btn btn-primary" disabled={busy} type="submit">
            Create token
          </button>
        </form>
        <ErrorBox message={error} />
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
        <h2 className="font-semibold">2. Add it to your client</h2>
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
        <h2 className="font-semibold">3. Ask</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
          {MCP_EXAMPLE_PROMPTS.map((prompt) => (
            <li key={prompt}>{prompt}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
