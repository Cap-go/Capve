import claudeLogo from "../assets/ai-clients/claude.svg";
import claudeCodeLogo from "../assets/ai-clients/claude-code.svg";
import chatgptLogo from "../assets/ai-clients/chatgpt.svg";
import cursorLogo from "../assets/ai-clients/cursor.svg";
import vscodeLogo from "../assets/ai-clients/vscode.svg";
import windsurfLogo from "../assets/ai-clients/windsurf.svg";
import geminiCliLogo from "../assets/ai-clients/gemini-cli.svg";
import codexLogo from "../assets/ai-clients/codex.svg";
import zedLogo from "../assets/ai-clients/zed.svg";
import lmStudioLogo from "../assets/ai-clients/lm-studio.svg";
import grokLogo from "../assets/ai-clients/grok.svg";
import { mcpClients, type McpClient, type McpClientId } from "../lib/mcp-clients";
import { CodeBlock } from "./CodeBlock";

const LOGOS: Record<McpClientId, string> = {
  claude: claudeLogo,
  "claude-code": claudeCodeLogo,
  chatgpt: chatgptLogo,
  cursor: cursorLogo,
  vscode: vscodeLogo,
  windsurf: windsurfLogo,
  "gemini-cli": geminiCliLogo,
  codex: codexLogo,
  zed: zedLogo,
  "lm-studio": lmStudioLogo,
  grok: grokLogo,
};

function ClientCard({ client }: { client: McpClient }) {
  const oneClick = client.links.some((link) => link.install);
  const headingId = `mcp-client-${client.id}`;
  return (
    <section aria-labelledby={headingId} id={`${headingId}-card`} className="scroll-mt-4 flex min-w-0 flex-col rounded-lg border border-[var(--velo-border)] bg-white p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--velo-border)] bg-[var(--velo-bg)]">
          <img alt="" aria-hidden className="h-6 w-6" height={24} src={LOGOS[client.id]} width={24} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold" id={headingId}>{client.name}</h3>
            {oneClick ? (
              <span className="rounded-full bg-[var(--velo-accent-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--velo-ink)]">One click</span>
            ) : null}
          </div>
          <p className="text-xs text-[var(--velo-muted)]">{client.summary}</p>
        </div>
      </div>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
        {client.steps.map((step) => <li key={step}>{step}</li>)}
      </ol>
      {client.links.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {client.links.map((link, index) => {
            const web = link.href.startsWith("https://");
            return (
              <a
                className={`btn ${index === 0 ? "btn-primary" : "btn-secondary"} text-xs`}
                href={link.href}
                key={link.href}
                {...(web ? { target: "_blank", rel: "noreferrer" } : {})}
              >
                {link.label}
              </a>
            );
          })}
        </div>
      ) : null}
      <div className="mt-3 space-y-3">
        {client.snippets.map((snippet) => (
          <CodeBlock key={snippet.label} label={snippet.label}>{snippet.value}</CodeBlock>
        ))}
      </div>
    </section>
  );
}

/** One card per main AI client: logo, short steps, install link where the client has one, copyable config. */
export function McpClients({ base }: { base: string }) {
  const clients = mcpClients(base);
  return (
    <div className="space-y-4">
      <nav aria-label="Jump to an AI client">
        <ul className="flex flex-wrap gap-2">
          {clients.map((client) => (
            <li key={client.id}>
              <a
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--velo-border)] bg-white px-2.5 py-1 text-xs font-medium hover:bg-[var(--velo-accent-soft)]"
                href={`#mcp-client-${client.id}-card`}
              >
                <img alt="" aria-hidden className="h-4 w-4" height={16} src={LOGOS[client.id]} width={16} />
                {client.name}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="grid gap-4 lg:grid-cols-2">
        {clients.map((client) => <ClientCard client={client} key={client.id} />)}
      </div>
    </div>
  );
}
