import { useEffect, useState } from "react";
import type { StripeSetupCheck, StripeSetupStatus } from "../../shared/stripe-setup";
import { api } from "../lib/api";
import { ErrorBox } from "./ui";

const STATUS_LABELS: Record<StripeSetupCheck["status"], string> = {
  ready: "Ready", attention: "Needs attention", disabled: "Disabled", unknown: "Not verified",
};

export function StripeSetupPanel() {
  const [status, setStatus] = useState<StripeSetupStatus | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setError("");
    api.adminStripeSetup().then((value) => { if (!cancelled) setStatus(value); })
      .catch(() => { if (!cancelled) setError("Could not load Stripe setup status. Refresh to try again."); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [refresh]);

  return (
    <section className="card overflow-hidden p-0" aria-labelledby="stripe-setup-heading" aria-busy={busy}>
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--velo-border)] p-5">
        <div>
          <h3 id="stripe-setup-heading" className="text-lg font-semibold">Stripe setup</h3>
          <p className="mt-1 text-sm text-[var(--velo-muted)]">Deployed configuration and live checks from Stripe. Only platform admins can see this.</p>
          {status && <p className="mt-2 text-sm text-[var(--velo-muted)]">
            {status.mode === "unknown" ? "Mode not verified" : `${status.mode === "live" ? "Live" : "Test"} mode`}
            {status.accountId ? ` · ${status.accountId}` : ""}
            {` · Checked ${new Date(status.checkedAt).toLocaleString()}`}
          </p>}
        </div>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setRefresh((value) => value + 1)}>{busy ? "Checking…" : "Refresh status"}</button>
      </div>
      <div className="px-5"><ErrorBox message={error} /></div>
      {busy && !status && <p className="p-5 text-sm text-[var(--velo-muted)]" role="status">Checking Stripe connection and setup…</p>}
      {status && <>
        <div className="border-b border-[var(--velo-border)] p-5 text-sm">
          <p className="font-medium">{status.billingEnabled ? "Hosted billing is enabled." : "Hosted billing is disabled."}</p>
          <p className="mt-1 text-[var(--velo-muted)]">{status.billingEnabled
            ? "Checkout and reporting limits use the deployed billing settings."
            : "Having Stripe secrets deployed does not enable subscriptions or reporting limits."}</p>
          {error && <p className="mt-2 text-[var(--velo-muted)]">Showing the previous check. Current status could not be verified.</p>}
        </div>
        <ul className="divide-y divide-[var(--velo-border)]">
          {status.checks.map((check) => <li key={check.id} className="flex flex-wrap items-start justify-between gap-3 p-5">
            <div className="min-w-0 flex-1 basis-64">
              <h4 className="font-medium">{check.label}</h4>
              <p className="mt-1 break-words text-sm text-[var(--velo-muted)]">{check.detail}</p>
              {check.href && <a className="mt-2 inline-block text-sm underline underline-offset-4" href={check.href} target="_blank" rel="noopener noreferrer">Review in Stripe ↗</a>}
            </div>
            <span className={`stripe-setup-status stripe-setup-status--${check.status}`}>{STATUS_LABELS[check.status]}</span>
          </li>)}
        </ul>
      </>}
    </section>
  );
}
