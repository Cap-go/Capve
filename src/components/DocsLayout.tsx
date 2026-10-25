import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { BRAND_NAME, GITHUB_REPO_URL } from "../lib/constants";
import { DOC_GROUPS, DOC_PAGES, docHeadingId, docHref } from "../lib/docs-nav";
import { DocsSearch } from "./DocsSearch";
import { Icon, type IconName } from "./Icon";

const GROUP_ICONS: Record<string, IconName> = {
  "Get started": "tip",
  "Tracking & attribution": "campaigns",
  Reference: "docs",
};

export function DocsLayout() {
  const { pathname, hash } = useLocation();
  const article = useRef<HTMLElement>(null);
  const [outline, setOutline] = useState<{ id: string; title: string }[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeHeading, setActiveHeading] = useState("");
  const currentIndex = DOC_PAGES.findIndex(
    (page) => docHref(page.slug) === pathname.replace(/\/$/, ""),
  );
  const current = DOC_PAGES[currentIndex];
  const previous = currentIndex > 0 ? DOC_PAGES[currentIndex - 1] : undefined;
  const next = DOC_PAGES[currentIndex + 1];

  useEffect(() => {
    setMenuOpen(false);
    const headings = Array.from(article.current?.querySelectorAll("h2") ?? []);
    setOutline(
      headings.map((heading, index) => {
        const title = heading.textContent ?? "";
        heading.id = docHeadingId(title, index);
        return { id: heading.id, title };
      }),
    );
    if (!hash) window.scrollTo(0, 0);
  }, [pathname]);

  useEffect(() => {
    const headings = outline
      .map((item) => document.getElementById(item.id))
      .filter((heading): heading is HTMLElement => heading !== null);
    if (!headings.length) return;
    const update = () => {
      const passed = headings.filter((heading) => heading.getBoundingClientRect().top < 140);
      setActiveHeading((passed.at(-1) ?? headings[0]).id);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [outline]);

  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [pathname, hash, outline]);

  return (
    <div className="docs-shell isolate min-h-dvh bg-white antialiased">
      <a className="docs-skip" href="#docs-content">
        Skip to content
      </a>
      <header className="docs-header">
        <div className="docs-header-inner">
          <Link to="/" className="docs-brand" aria-label="Homepage">
            <img src="/logo.svg" alt="" width={28} height={28} />
            {BRAND_NAME}
            <span>Docs</span>
          </Link>
          <DocsSearch />
          <nav
            aria-label="Main navigation"
            className="flex shrink-0 items-center gap-2 text-sm"
          >
            <a className="btn btn-ghost max-sm:hidden" href={GITHUB_REPO_URL}>
              GitHub
            </a>
            <Link className="btn btn-primary" to="/app">
              Dashboard
            </Link>
          </nav>
        </div>
      </header>
      <div className="docs-grid">
        <aside className="docs-sidebar">
          <button
            className="docs-menu-toggle"
            type="button"
            aria-expanded={menuOpen}
            aria-controls="docs-navigation"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            Browse documentation{" "}
            <span aria-hidden="true">{menuOpen ? "−" : "+"}</span>
          </button>
          <nav
            id="docs-navigation"
            aria-label="Documentation"
            className={menuOpen ? "docs-navigation is-open" : "docs-navigation"}
          >
            {DOC_GROUPS.map((group) => (
              <div key={group} className="docs-nav-group">
                <p>
                  <Icon name={GROUP_ICONS[group] ?? "docs"} size={14} />
                  {group}
                </p>
                {DOC_PAGES.filter((page) => page.group === group).map(
                  (page) => (
                    <NavLink
                      key={page.slug}
                      to={docHref(page.slug)}
                      end
                      className={({ isActive }) =>
                        `docs-nav-link${isActive ? " is-active" : ""}`
                      }
                    >
                      {page.title}
                    </NavLink>
                  ),
                )}
              </div>
            ))}
            <div className="docs-sidebar-note">
              Self-hosted on Cloudflare.
              <br />
              Your traffic. Your data.
            </div>
          </nav>
        </aside>
        <main id="docs-content" className="min-w-0" tabIndex={-1}>
          <div className="docs-breadcrumb">
            <Link to="/docs">Docs</Link>
            {current?.slug ? (
              <>
                <span aria-hidden="true">/</span>
                <span>{current.group}</span>
                <span aria-hidden="true">/</span>
                <span className="text-[var(--velo-ink)]">{current.title}</span>
              </>
            ) : null}
          </div>
          <article ref={article} className="docs-prose min-w-0">
            <Outlet />
          </article>
          {(previous || next) && (
            <nav className="docs-pager" aria-label="Previous and next pages">
              {previous ? (
                <Link to={docHref(previous.slug)}>
                  <small>← Previous</small>
                  <strong>{previous.title}</strong>
                </Link>
              ) : (
                <span />
              )}
              {next && (
                <Link className="is-next" to={docHref(next.slug)}>
                  <small>Next →</small>
                  <strong>{next.title}</strong>
                </Link>
              )}
            </nav>
          )}
          <footer className="docs-footer">
            <span>
              Capve documentation · Open-source campaign tracking ·{" "}
              <Link to="/privacy">Privacy</Link>
              {" · "}
              <Link to="/terms">Terms</Link>
            </span>
            <a href={`${GITHUB_REPO_URL}/tree/main/src/pages/docs`}>Suggest an edit on GitHub ↗</a>
          </footer>
        </main>
        <aside className="docs-outline">
          <nav aria-label="On this page">
            <p>On this page</p>
            {outline.map((heading) => (
              <a
                key={heading.id}
                href={`#${heading.id}`}
                className={heading.id === activeHeading ? "is-active" : undefined}
                aria-current={heading.id === activeHeading ? "location" : undefined}
              >
                {heading.title}
              </a>
            ))}
          </nav>
          <div className="docs-outline-help">
            <strong>New to tracking?</strong>
            <p>Start with the ID that connects a click to a conversion.</p>
            <Link to="/docs/click-ids">Understand click IDs →</Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
