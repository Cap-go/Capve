import { Link } from "react-router-dom";
import { Shell } from "../components/ui";
import { GITHUB_REPO_URL, PRODUCTION_APP_URL } from "../lib/constants";

const features = [
  {
    title: "Reports",
    body: "Clicks, conversions, cost, revenue, and ROI per campaign. Daily trends and CSV export.",
  },
  {
    title: "Routing",
    body: "Send traffic through paths, rotations, landers, and offers.",
  },
  {
    title: "API",
    body: "Every action in the dashboard has a documented HTTP endpoint.",
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
              shows what each one earns. Open source, runs on Cloudflare.
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
