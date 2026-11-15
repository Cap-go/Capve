import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Icon } from "../components/Icon";
import { SiteFooter } from "../components/SiteFooter";
import { useAuth } from "../lib/auth";
import { BRAND_NAME } from "../lib/constants";
import { COMPETITORS } from "./content/competitors";
import { FEATURES } from "./content/features";
import { SOLUTIONS } from "./content/solutions";

type MenuItem = { label: string; href: string; summary: string };

const MENUS: Array<{ label: string; href: string; items: MenuItem[] }> = [
  {
    label: "Product",
    href: "/features",
    items: FEATURES.map((f) => ({ label: f.name, href: `/features/${f.slug}`, summary: f.summary })),
  },
  {
    label: "Solutions",
    href: "/solutions",
    items: SOLUTIONS.map((s) => ({ label: s.name, href: `/solutions/${s.slug}`, summary: s.summary })),
  },
  {
    label: "Compare",
    href: "/compare",
    items: [
      ...COMPETITORS.map((c) => ({
        label: `Capve vs ${c.name}`,
        href: `/compare/${c.slug}`,
        summary: c.menuSummary,
      })),
      { label: "Migration guides", href: "/migrate", summary: "Switch trackers step by step" },
    ],
  },
];

/** Header, page body and footer for every public marketing and legal page. */
export function MarketingLayout({ children }: { children: ReactNode }) {
  const { pathname, hash } = useLocation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    setOpen(false);
    (document.activeElement as HTMLElement | null)?.blur?.();
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [pathname, hash]);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 8);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <a className="docs-skip" href="#main">
        Skip to content
      </a>
      <header className="mk-header" data-scrolled={scrolled || open}>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to="/" className="flex shrink-0 items-center gap-2.5 text-[17px] font-semibold tracking-tight">
            <img src="/logo.svg" alt="" className="h-7 w-7" width={28} height={28} />
            {BRAND_NAME}
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-0.5 lg:flex">
            {MENUS.map((menu) => (
              <div className="mk-menu" key={menu.label}>
                <NavLink className="mk-navlink" to={menu.href}>
                  {menu.label}
                  <svg aria-hidden="true" width="10" height="10" viewBox="0 0 12 12">
                    <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </NavLink>
                <div className="mk-menu-panel">
                  <div>
                    {menu.items.map((item) => (
                      <Link key={item.href} to={item.href}>
                        <strong>{item.label}</strong>
                        <span>{item.summary}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            ))}
            <NavLink className="mk-navlink" to="/pricing">
              Pricing
            </NavLink>
            <NavLink className="mk-navlink" to="/docs">
              Docs
            </NavLink>
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <Link className="btn btn-primary" to="/app">
                Dashboard
              </Link>
            ) : (
              <>
                <span className="max-sm:hidden">
                  <Link className="btn btn-ghost" to="/login">
                    Sign in
                  </Link>
                </span>
                <Link className="btn btn-primary" to="/register">
                  Start free trial
                </Link>
              </>
            )}
            <span className="lg:hidden">
              <button
                aria-controls="mk-mobile-nav"
                aria-expanded={open}
                aria-label={open ? "Close menu" : "Open menu"}
                className="btn btn-ghost px-2"
                onClick={() => setOpen((value) => !value)}
                type="button"
              >
                <Icon name={open ? "close" : "menu"} size={20} />
              </button>
            </span>
          </div>
        </div>
        {open && (
          <nav
            aria-label="Main"
            className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-[var(--velo-border)] bg-[var(--velo-bg)] px-4 pb-6 pt-2 sm:px-6 lg:hidden"
            id="mk-mobile-nav"
          >
            {MENUS.map((menu) => (
              <div className="border-b border-[var(--velo-border)] py-3" key={menu.label}>
                <Link className="text-sm font-semibold" to={menu.href}>
                  {menu.label}
                </Link>
                <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                  {menu.items.map((item) => (
                    <li key={item.href}>
                      <Link className="block py-1 text-[15px] text-[#3d3d3b]" to={item.href}>
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div className="flex flex-col gap-1 py-3 text-[15px] font-semibold">
              <Link className="py-1" to="/pricing">
                Pricing
              </Link>
              <Link className="py-1" to="/docs">
                Docs
              </Link>
              {!user && (
                <Link className="py-1" to="/login">
                  Sign in
                </Link>
              )}
            </div>
          </nav>
        )}
      </header>
      <main className="flex-1" id="main">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
