import { Link } from "react-router-dom";
import { CodeBlock } from "../components/CodeBlock";
import { Shell } from "../components/ui";
import { GITHUB_REPO_URL, PRODUCTION_APP_URL, appBaseUrl } from "../lib/constants";
import { MCP_EXAMPLE_PROMPTS, claudeCodeCommand } from "../lib/mcp";

const features = [
  {
    title: "Reports",
    body: "Clicks, conversions, cost, revenue, and ROI per campaign. Registrations, FTDs and other events in their own columns. CSV export.",
  },
  {
    title: "Routing",
    body: "Send traffic through paths, rotations, landers, and offers. As many postbacks per campaign, source, or network as you need.",
  },
  {
    title: "AI and API",
    body: "Built-in MCP server and HTTP API. Anything you do in the dashboard, an agent can do too.",
  },
];

export function LandingPage() {
  return (
    <Shell
      cta={
        <>
          <Link className="btn btn-ghost" to="/docs">
            Docs
          </Link>
          <Link className="btn btn-ghost" to="/login">
            Sign in
          </Link>
          <Link className="btn btn-primary" to="/register">
            Sign up
          </Link>
        </>
      }
    >
      <section className="mx-auto max-w-6xl px-6 pb-16 pt-12">
        <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <h1 className="max-w-2xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              Affiliate and campaign tracking.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-[var(--velo-muted)]">
              Capve records clicks and conversions, attributes them to affiliates and campaigns, and
              shows what each one earns. Open source, runs on Cloudflare, and works with your AI
              assistant over MCP.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link className="btn btn-primary" to="/register">
                Create account
              </Link>
              <Link className="btn btn-secondary" to="/docs">
                Read the docs
              </Link>
            </div>
          </div>

          <div className="card self-start p-6">
            <p className="text-sm font-medium text-[var(--velo-muted)]">How it works</p>
            <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-relaxed">
              <li>Create an account.</li>
              <li>
                Add a campaign and traffic sources in <span className="mono">/app</span>.
              </li>
              <li>
                Affiliates share <span className="mono">your-domain/r/code</span>.
              </li>
              <li>A click records the visit. Your checkout posts the conversion. Stats update.</li>
            </ol>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6">
        <div className="grid gap-8 border-t border-[var(--velo-border)] py-12 md:grid-cols-3">
          {features.map((feature) => (
            <article key={feature.title}>
              <h2 className="font-semibold">{feature.title}</h2>
              <p className="mt-2 text-[var(--velo-muted)]">{feature.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6">
        <div className="grid gap-10 border-t border-[var(--velo-border)] py-12 lg:grid-cols-2">
          <div>
            <p className="text-sm font-medium text-[var(--velo-muted)]">MCP server</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
              Run your campaigns from Claude, Cursor or VS Code.
            </h2>
            <p className="mt-4 text-[var(--velo-muted)]">
              Capve ships an MCP server. Connect your assistant with one token and ask it to build
              campaigns, rotate landers, read reports and pause what loses money. Same permissions as
              your account.
            </p>
            <ul className="mt-6 space-y-2 text-sm">
              {MCP_EXAMPLE_PROMPTS.slice(0, 3).map((prompt) => (
                <li key={prompt} className="border-l-2 border-[var(--velo-ink)] pl-3">
                  {prompt}
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link className="btn btn-primary" to="/register">
                Get a token
              </Link>
              <Link className="btn btn-secondary" to="/docs/mcp">
                MCP docs
              </Link>
            </div>
          </div>
          <div className="self-start">
            <CodeBlock>{claudeCodeCommand(appBaseUrl())}</CodeBlock>
            <p className="mt-3 text-sm text-[var(--velo-muted)]">
              53 tools: campaigns, paths, routing rules, anti-fraud, offers, landers, postbacks, traffic sources, reports, triggers, team.
            </p>
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-6 text-sm text-[var(--velo-muted)]">
        <div className="border-t border-[var(--velo-border)] py-8">
          Capve at{" "}
          <a className="underline" href={PRODUCTION_APP_URL}>
            capve.app
          </a>
          . Source on{" "}
          <a className="underline" href={GITHUB_REPO_URL} target="_blank" rel="noreferrer">
            GitHub
          </a>
          .
        </div>
      </footer>
    </Shell>
  );
}
