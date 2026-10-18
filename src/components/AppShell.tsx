import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { BRAND_NAME } from "../lib/constants";
import { AccountSwitcher, AccountAvatar, ImpersonationBanner } from "./AccountSwitcher";
import { Icon, type IconName } from "./Icon";

export type AppNavItem<K extends string> = { key: K; label: string; icon: IconName; group: string };

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
  children,
}: {
  items: AppNavItem<K>[];
  active: K;
  onSelect: (key: K) => void;
  email: string;
  onSignOut: () => void;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const groups = [...new Set(items.map((item) => item.group))];
  useEffect(() => setMenuOpen(false), [active]);

  return (
    <div className="app-frame">
      <ImpersonationBanner />
      <div className="app-shell">
        <aside className={menuOpen ? "app-sidebar is-open" : "app-sidebar"}>
          <div className="app-sidebar-top">
            <Link to="/" className="app-brand" aria-label={`${BRAND_NAME} home`}>
              <img src="/logo.svg" alt="" width={24} height={24} />
              {BRAND_NAME}
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
                        onClick={() => onSelect(item.key)}
                      >
                        <Icon name={item.icon} />
                        {item.label}
                      </button>
                    ))}
                </div>
              ))}
            </nav>
            <div className="app-sidebar-footer">
              <Link className="app-nav-link" to="/docs">
                <Icon name="docs" />
                Documentation
              </Link>
              <div className="app-user">
                <AccountAvatar label={email} tone="light" />
                <span title={email}>{email}</span>
                <button type="button" aria-label="Sign out" title="Sign out" onClick={onSignOut}>
                  <Icon name="logout" />
                </button>
              </div>
            </div>
          </div>
        </aside>
        <main className="app-main">
          <header className="app-page-header">
            <div className="min-w-0">
              <h1>{title}</h1>
              {description && <p>{description}</p>}
            </div>
            {actions}
          </header>
          <div className="app-content">{children}</div>
        </main>
      </div>
    </div>
  );
}
