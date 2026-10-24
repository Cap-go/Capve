import { useState } from "react";
import { Link } from "react-router-dom";
import type { BillingStatus, PlanId } from "../../shared/billing";
import { api } from "../lib/api";
import { ErrorBox } from "./ui";
import { Pricing } from "./Pricing";

export function ReportingLock({ showLink = true }: { showLink?: boolean }) {
  return <div className="card my-4 p-5" role="status">
    <h2 className="font-semibold">Reports are locked</h2>
    <p className="mt-2">Your traffic is still running. Clicks and conversions keep recording.</p>
    {showLink && <Link className="btn btn-primary mt-4" to="/app?entity=billing">View plan and reporting access</Link>}
  </div>;
}

export function BillingPanel({ billing, owner }: { billing: BillingStatus | null; owner: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function openStripe(plan?: PlanId) {
    setBusy(true); setError("");
    try {
      const result = plan ? await api.billingCheckout(plan) : await api.billingPortal();
      if (!result.url) throw new Error("Stripe did not return a checkout URL");
      window.location.assign(result.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open Stripe");
      setBusy(false);
    }
  }
  if (!billing) return <p role="status">Loading billing…</p>;
  if (!billing.enabled) return <p>Billing is disabled on this installation. Reports are available.</p>;
  return <div className="space-y-5">
    <div className="card p-5">
      <h2 className="text-xl font-semibold">Your {billing.plan} plan</h2>
      <p className="mt-3">{billing.clicks.toLocaleString()} / {billing.clickLimit.toLocaleString()} clicks in {billing.period}, UTC.</p>
      <p className="mt-2">Trial ends {new Date(billing.trialEndsAt).toLocaleDateString()}.</p>
      <p className="mt-2">Subscription: {billing.subscriptionStatus ?? "not subscribed"}.</p>
      {billing.reportsAllowed ? <p className="mt-2">Reports are available.</p> : <ReportingLock showLink={false} />}
      <p className="mt-3 text-sm text-[var(--velo-muted)]">Stripe confirms subscription changes by webhook. This screen refreshes automatically.</p>
      {owner && billing.hasCustomer && <button className="btn btn-secondary mt-4" disabled={busy} type="button" onClick={() => openStripe()}>Manage subscription</button>}
    </div>
    <ErrorBox message={error} />
    {!owner ? <p>Ask the account owner to manage the subscription.</p> : !billing.checkoutReady ? <p>Stripe setup is pending. Contact the installation administrator.</p> :
      billing.subscriptionStatus && !["canceled", "incomplete_expired"].includes(billing.subscriptionStatus) ?
        <p>Change plans, update your payment method, or cancel in Manage subscription.</p> :
        <Pricing busy={busy} onChoose={(plan) => openStripe(plan)} />}
  </div>;
}
