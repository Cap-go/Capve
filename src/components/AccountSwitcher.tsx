import { useEffect, useState } from "react";
import { api, type AccessibleAccount } from "../lib/api";
import { useAuth } from "../lib/auth";
import { ErrorBox } from "./ui";

export function AccountSwitcher() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<AccessibleAccount[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .accounts()
      .then(({ accounts }) => setAccounts(accounts))
      .catch((err) =>
        setError(
          err instanceof Error ? err.message : "Could not load accounts",
        ),
      );
  }, []);

  if (!user) return null;
  async function changeAccount(accountId: string) {
    if (accountId === user?.account_id) return;
    setBusy(true);
    setError("");
    try {
      await api.switchAccount(accountId);
      // Clear campaign selections, cached reports, and any unsaved forms together.
      window.location.assign("/app");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not switch accounts",
      );
      setBusy(false);
    }
  }

  return (
    <div className="account-switcher">
      {user.impersonating ? (
        <p className="account-label">Account</p>
      ) : (
        <label htmlFor="account-switcher">Account</label>
      )}
      {user.impersonating ? (
        <p>{user.account_email}</p>
      ) : (
        <select
          id="account-switcher"
          name="account"
          value={user.account_id}
          disabled={busy || !accounts.length}
          onChange={(event) => void changeAccount(event.target.value)}
        >
          {!accounts.length && (
            <option value={user.account_id}>
              {user.account_email ?? user.email}
            </option>
          )}
          {accounts.map((account) => (
            <option key={account.account_id} value={account.account_id}>
              {account.name ? `${account.name} · ` : ""}
              {account.email}
              {account.account_id === user.id
                ? " · Personal"
                : ` · ${account.role}`}
            </option>
          ))}
        </select>
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
      <div>
        <strong>Impersonating {user.account_email}</strong>
        <p>
          You are signed in as {user.email}. Changes apply to this account.
          Support access expires after one hour.
        </p>
        <ErrorBox message={error} />
      </div>
      <button
        className="btn btn-secondary"
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await api.stopImpersonation();
            window.location.assign("/app?entity=admin");
          } catch (err) {
            setError(
              err instanceof Error
                ? err.message
                : "Could not exit impersonation",
            );
            setBusy(false);
          }
        }}
      >
        {busy ? "Exiting…" : "Exit impersonation"}
      </button>
    </div>
  );
}
