import { useEffect, useRef, useState } from "react";
import { api, type AccessibleAccount } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Icon } from "./Icon";
import { ErrorBox } from "./ui";

function initials(label: string): string {
  const words = label.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function AccountAvatar({ label, tone = "dark" }: { label: string; tone?: "dark" | "light" | "amber" }) {
  return (
    <span className={`account-avatar is-${tone}`} aria-hidden="true">
      {initials(label)}
    </span>
  );
}

export function AccountSwitcher() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<AccessibleAccount[]>([]);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (user?.impersonating) return;
    api
      .accounts()
      .then(({ accounts }) => setAccounts(accounts))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load accounts"));
  }, [user?.impersonating]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  if (!user) return null;
  const current = accounts.find((account) => account.account_id === user.account_id);
  const currentLabel = current?.name || user.account_email || user.email;
  const currentRole = user.impersonating
    ? "Support access"
    : user.account_id === user.id
      ? "Personal account"
      : `Team · ${user.role ?? "member"}`;
  const terms = filter.toLowerCase().trim();
  const visible = terms
    ? accounts.filter((account) => `${account.name ?? ""} ${account.email}`.toLowerCase().includes(terms))
    : accounts;

  async function changeAccount(accountId: string) {
    if (accountId === user?.account_id) {
      setOpen(false);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.switchAccount(accountId);
      // Clear campaign selections, cached reports, and any unsaved forms together.
      window.location.assign("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not switch accounts");
      setBusy(false);
    }
  }

  return (
    <div ref={root} className="account-switcher">
      <button
        ref={trigger}
        className="account-trigger"
        type="button"
        aria-label={`Account: ${currentLabel}. Switch account`}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls="account-menu"
        disabled={busy || user.impersonating}
        onClick={() => setOpen(!open)}
      >
        <AccountAvatar label={currentLabel} tone={user.impersonating ? "amber" : "dark"} />
        <span className="account-trigger-text">
          <strong>{currentLabel}</strong>
          <small>{busy ? "Switching…" : currentRole}</small>
        </span>
        {!user.impersonating && <Icon name="chevrons" size={14} />}
      </button>
      {open && (
        <div id="account-menu" className="account-menu">
          <p className="account-menu-title">Switch account</p>
          {accounts.length > 5 && (
            <input
              className="account-menu-filter"
              type="search"
              aria-label="Filter accounts"
              placeholder="Find account…"
              value={filter}
              autoFocus
              onChange={(event) => setFilter(event.target.value)}
            />
          )}
          <ul>
            {visible.map((account) => {
              const selected = account.account_id === user.account_id;
              const label = account.name || account.email;
              return (
                <li key={account.account_id}>
                  <button
                    type="button"
                    aria-current={selected ? "true" : undefined}
                    autoFocus={selected && accounts.length <= 5}
                    onClick={() => void changeAccount(account.account_id)}
                  >
                    <AccountAvatar label={label} tone={selected ? "dark" : "light"} />
                    <span className="account-option-text">
                      <strong>{label}</strong>
                      <small>{account.name ? account.email : " "}</small>
                    </span>
                    <span className="account-role">
                      {account.account_id === user.id ? "Personal" : account.role}
                    </span>
                    {selected && <Icon name="check" size={14} />}
                  </button>
                </li>
              );
            })}
            {!visible.length && <li className="account-menu-empty">No matching accounts.</li>}
          </ul>
          <p className="account-menu-hint">Owners invite teammates in Settings → Team.</p>
        </div>
      )}
      <ErrorBox message={error} />
    </div>
  );
}

export function ImpersonationBanner() {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!user?.impersonating) return null;
  return (
    <div className="impersonation-banner" role="status">
      <span className="impersonation-dot" aria-hidden="true" />
      <p>
        <strong>Viewing as {user.account_email}</strong>
        <span> · Signed in as {user.email}. Changes apply to this account. Access expires after one hour.</span>
      </p>
      <ErrorBox message={error} />
      <button
        className="impersonation-exit"
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await api.stopImpersonation();
            window.location.assign("/app?entity=admin");
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not exit impersonation");
            setBusy(false);
          }
        }}
      >
        {busy ? "Exiting…" : "Exit impersonation"}
      </button>
    </div>
  );
}
