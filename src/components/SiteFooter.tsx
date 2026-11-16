import { Link } from "react-router-dom";
import { COMPETITORS } from "../marketing/content/competitors";
import { FEATURES } from "../marketing/content/features";
import { SOLUTIONS } from "../marketing/content/solutions";
import { BRAND_NAME, GITHUB_REPO_URL } from "../lib/constants";

const SUPPORT_EMAIL = "support@capgo.app";

export function SiteFooter() {
  const columns: Array<{ title: string; links: Array<{ label: string; href: string }> }> = [
    {
      title: "Product",
      links: [
        ...FEATURES.map((f) => ({ label: f.name, href: `/features/${f.slug}` })),
        { label: "Pricing", href: "/pricing" },
      ],
    },
    {
      title: "Solutions",
      links: SOLUTIONS.map((s) => ({ label: s.name, href: `/solutions/${s.slug}` })),
    },
    {
      title: "Compare",
      links: [
        ...COMPETITORS.map((c) => ({ label: `Capve vs ${c.name}`, href: `/compare/${c.slug}` })),
        { label: "All comparisons", href: "/compare" },
      ],
    },
    {
      title: "Switch",
      links: [
        ...COMPETITORS.map((c) => ({ label: `From ${c.name}`, href: `/migrate/${c.slug}` })),
        { label: "All migration guides", href: "/migrate" },
      ],
    },
    {
      title: "Resources",
      links: [
        { label: "Documentation", href: "/docs" },
        { label: "Postback URL", href: "/docs/postback" },
        { label: "MCP server", href: "/docs/mcp" },
        { label: "Glossary", href: "/docs/glossary" },
        { label: "Security", href: "/security" },
      ],
    },
  ];

  return (
    <footer className="mk-footer mt-auto border-t border-[var(--velo-border)] bg-white text-sm">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.2fr_repeat(5,1fr)]">
        <div className="max-w-xs">
          <Link to="/" className="flex items-center gap-2.5 text-[17px] font-semibold tracking-tight">
            <img src="/logo.svg" alt="" className="h-7 w-7" width={28} height={28} />
            {BRAND_NAME}
          </Link>
          <p className="mt-3 text-[var(--velo-muted)]">
            Tracking and optimization for casino affiliates. Bring the offers you promote, traffic costs and reported commissions into one dashboard.
          </p>
          <p className="mt-4 text-[var(--velo-muted)]">
            <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
            <br />
            <a href={GITHUB_REPO_URL} rel="noreferrer" target="_blank">
              Source on GitHub
            </a>
          </p>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:col-span-5 lg:grid-cols-5">
          {columns.map((column) => (
            <nav aria-label={column.title} key={column.title}>
              <p className="font-semibold">{column.title}</p>
              <ul className="mt-3 space-y-2 text-[var(--velo-muted)]">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link to={link.href}>{link.label}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>
      <div className="border-t border-[var(--velo-border)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-5 text-[var(--velo-muted)] sm:px-6">
          <p>© 2026 CodepushGo, LLC. Binom, Voluum and other names belong to their owners.</p>
          <nav aria-label="Legal" className="flex flex-wrap gap-4">
            <Link to="/terms">Terms</Link>
            <Link to="/privacy">Privacy</Link>
            <Link to="/imprint">Imprint</Link>
            <Link to="/security">Security</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
