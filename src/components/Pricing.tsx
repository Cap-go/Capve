import { Link } from "react-router-dom";
import { PLANS, type PlanId } from "../../shared/billing";

export function Pricing({ onChoose, busy = false }: { onChoose?: (plan: PlanId) => void; busy?: boolean }) {
  return (
    <section id="pricing" className="mx-auto w-full max-w-6xl px-6 py-12" aria-labelledby="pricing-heading">
      <h2 id="pricing-heading" className="text-3xl font-semibold tracking-tight">Tracking at half the price.</h2>
      <p className="mt-3 max-w-2xl text-[var(--velo-muted)]">
        Start with a 14-day free trial. Every plan includes campaigns, routing, team access, API and MCP.
      </p>
      <div className="mt-8 grid gap-6 md:grid-cols-2">
        {PLANS.map((plan) => (
          <article key={plan.id} className="card flex flex-col p-6">
            <h3 className="text-xl font-semibold">{plan.name}</h3>
            <p className="mt-4"><span className="text-4xl font-semibold">${(plan.monthlyCents / 100).toFixed(2)}</span> / month</p>
            <p className="mt-3">{plan.clicks.toLocaleString("en-US")} clicks per calendar month</p>
            <p className="mb-6 mt-3 text-sm text-[var(--velo-muted)]">
              {plan.id === "starter" ? "Half of Binom v2's $149 monthly license." : "Half of Binom Cloud's $299 monthly price."}
            </p>
            {onChoose ? (
              <button className="btn btn-primary mt-auto min-h-12" type="button" disabled={busy} onClick={() => onChoose(plan.id)}>
                {busy ? "Opening Stripe…" : `Choose ${plan.name}`}
              </button>
            ) : (
              <Link className="btn btn-primary mt-auto min-h-12" to={`/register?plan=${plan.id}`}>Start {plan.name} trial</Link>
            )}
          </article>
        ))}
      </div>
      <p className="mt-5 text-sm text-[var(--velo-muted)]">
        No card needed to try Capve. After your trial, or if you exceed your plan's click allowance,
        reports are locked. Traffic keeps redirecting and clicks and conversions keep recording.
        Upgrade or wait for the monthly allowance to reset to restore reports with an active subscription.
      </p>
      <p className="mt-3 text-xs text-[var(--velo-muted)]">
        USD, billed monthly. Comparison with <a className="underline" href="https://binom.org/price" target="_blank" rel="noreferrer">Binom's published monthly prices</a>, checked October 24, 2026.
        Click allowances differ. Trial includes Starter's allowance, or Pro's if selected at signup.
      </p>
    </section>
  );
}
