import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { BRAND_NAME } from "../lib/constants";
import { AccountSwitcher, AccountAvatar, ImpersonationBanner } from "./AccountSwitcher";
import { Icon, type IconName } from "./Icon";

export type AppNavItem<K extends string> = { key: K; label: string; icon: IconName; group: string };

const NAV_KEY = "capve.nav.collapsed";

function readNavCollapsed(): boolean {
  try {
    return localStorage.getItem(NAV_KEY) === "1";
  } catch {
    return false;
  }
}

/** Dashboard frame: workspace switcher and grouped navigation on the left, content on the right. */
export function AppShell<K extends string>({
  items,
  active,
  onSelect,
  email,
  onSignOut,
  title,
  description,
  actions,
  notice,
  children,
}: {
  items: AppNavItem<K>[];
  active: K;
  onSelect: (key: K) => void;
  email: string;
  onSignOut: () => void;
  title?: string;
  description?: string;
  actions?: ReactNode;
  notice?: ReactNode;
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(readNavCollapsed);
  const groups = [...new Set(items.map((item) => item.group))];
  useEffect(() => setMenuOpen(false), [active]);

  function toggleNav() {
    setNavCollapsed((collapsed) => {
      const next = !collapsed;
      try {
        localStorage.setItem(NAV_KEY, next ? "1" : "0");
      } catch {
        // Private mode can reject storage; the button still toggles this visit.
      }
      return next;
    });
  }

  return (
    <div className="app-frame">
      <ImpersonationBanner />
      <div className={navCollapsed ? "app-shell is-nav-collapsed" : "app-shell"}>
        <aside className={["app-sidebar", menuOpen ? "is-open" : "", navCollapsed ? "is-collapsed" : ""].filter(Boolean).join(" ")}>
          <div className="app-sidebar-top">
            <Link to="/" className="app-brand" aria-label={`${BRAND_NAME} home`}>
              <img src="/logo.svg" alt="" width={24} height={24} />
              <span className="nav-label">{BRAND_NAME}</span>
            </Link>
            <button
              className="app-menu-toggle"
              type="button"
              aria-label={menuOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={menuOpen}
              aria-controls="app-navigation"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <Icon name={menuOpen ? "close" : "menu"} size={20} />
            </button>
          </div>
          <div id="app-navigation" className="app-sidebar-body">
            <AccountSwitcher />
            {notice}
            <nav aria-label="Dashboard sections" className="app-nav">
              {groups.map((group) => (
                <div key={group} className="app-nav-group">
                  <p>{group}</p>
                  {items
                    .filter((item) => item.group === group)
                    .map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        className={item.key === active ? "app-nav-link is-active" : "app-nav-link"}
                        aria-current={item.key === active ? "page" : undefined}
                        title={navCollapsed ? item.label : undefined}
                        onClick={() => onSelect(item.key)}
                      >
                        <Icon name={item.icon} />
                        <span className="nav-label">{item.label}</span>
                      </button>
                    ))}
                </div>
              ))}
            </nav>
            <div className="app-sidebar-footer">
              <Link className="app-nav-link" to="/docs" title={navCollapsed ? "Documentation" : undefined}>
                <Icon name="docs" />
                <span className="nav-label">Documentation</span>
              </Link>
              <div className="app-user">
                <AccountAvatar label={email} tone="light" />
                <span className="nav-label" title={email}>{email}</span>
                <button type="button" aria-label="Sign out" title="Sign out" onClick={onSignOut}>
                  <Icon name="logout" />
                </button>
              </div>
            </div>
          </div>
        </aside>
        <button
          className="app-nav-collapse"
          type="button"
          aria-label={navCollapsed ? "Show sidebar" : "Hide sidebar"}
          aria-expanded={!navCollapsed}
          aria-controls="app-navigation"
          onClick={toggleNav}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d="M14.5 6.5 9 12l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <main className="app-main">
          {(title || description || actions) && (
            <header className="app-page-header">
              {(title || description) && (
                <div className="min-w-0">
                  {title ? <h1>{title}</h1> : null}
                  {description ? <p>{description}</p> : null}
                </div>
              )}
              {actions}
            </header>
          )}
          <div className="app-content">{children}</div>
        </main>
      </div>
    </div>
  );
}
