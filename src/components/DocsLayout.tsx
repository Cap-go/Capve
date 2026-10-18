import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { BRAND_NAME } from "../lib/constants";
import { DOC_GROUPS, DOC_PAGES, docHeadingId, docHref } from "../lib/docs-nav";
import { DocsSearch } from "./DocsSearch";

export function DocsLayout() {
  const { pathname, hash } = useLocation();
  const article = useRef<HTMLElement>(null);
  const [outline, setOutline] = useState<{ id: string; title: string }[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const currentIndex = DOC_PAGES.findIndex(
    (page) => docHref(page.slug) === pathname,
  );
  const current = DOC_PAGES[currentIndex];
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
            <Link className="btn btn-ghost max-sm:hidden" to="/">
              Home
            </Link>
            <Link className="btn btn-secondary" to="/app">
              Dashboard <span aria-hidden="true">↗</span>
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
                <p>{group}</p>
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
            Documentation <span aria-hidden="true">/</span> {current?.title}
          </div>
          <article ref={article} className="docs-prose min-w-0">
            <Outlet />
          </article>
          {next && (
            <Link className="docs-next" to={docHref(next.slug)}>
              <div>
                <small>Continue reading</small>
                <strong>{next.title}</strong>
              </div>
              <span aria-hidden="true">→</span>
            </Link>
          )}
          <footer className="docs-footer">
            Capve documentation · Open-source campaign tracking
          </footer>
        </main>
        <aside className="docs-outline">
          <nav aria-label="On this page">
            <p>On this page</p>
            {outline.map((heading) => (
              <a key={heading.id} href={`#${heading.id}`}>
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
