import { Link } from "react-router-dom";
import { PLANS, type PlanId } from "../../shared/billing";

const PLAN_NOTES: Record<PlanId, { audience: string; binom: string }> = {
  starter: { audience: "For solo buyers and new programs.", binom: "Half of Binom v2's $149 monthly license." },
  pro: { audience: "For teams and high-volume sources.", binom: "Half of Binom Cloud's $299 monthly price." },
};

const INCLUDED = [
  "Every feature, routing to MCP",
  "Unlimited campaigns and team members",
  "No overage fees, tracking never stops",
];

export function Pricing({
  onChoose,
  busy = false,
  heading = "h2",
}: {
  onChoose?: (plan: PlanId) => void;
  busy?: boolean;
  /** The pricing page renders this as its page title. */
  heading?: "h1" | "h2";
}) {
  const Heading = heading;
  return (
    <section id="pricing" className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6" aria-labelledby="pricing-heading">
      <Heading
        id="pricing-heading"
        className={heading === "h1" ? "mk-h1" : "text-3xl font-semibold tracking-tight sm:text-4xl"}
      >
        Tracking at half the price.
      </Heading>
      <p className="mt-3 max-w-2xl text-[var(--velo-muted)]">
        Start with a 14-day free trial. Every plan includes campaigns, routing, team access, API and MCP.
      </p>
      <div className="mt-8 grid gap-6 md:grid-cols-2">
        {PLANS.map((plan) => (
          <article
            key={plan.id}
            className={`card flex flex-col p-6 sm:p-8 ${plan.id === "pro" ? "border-[var(--velo-ink)] ring-1 ring-[var(--velo-ink)]" : ""}`}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xl font-semibold">{plan.name}</h3>
              {plan.id === "pro" && (
                <span className="rounded-full bg-[var(--velo-ink)] px-2.5 py-0.5 text-xs font-semibold text-[#b4f042]">
                  60× the clicks
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-[var(--velo-muted)]">{PLAN_NOTES[plan.id].audience}</p>
            <p className="mt-5">
              <span className="text-4xl font-semibold tracking-tight">${(plan.monthlyCents / 100).toFixed(2)}</span>
              <span className="text-[var(--velo-muted)]"> / month</span>
            </p>
            <p className="mt-3 font-medium">{plan.clicks.toLocaleString("en-US")} clicks per calendar month</p>
            <ul className="mb-6 mt-4 space-y-2 text-sm">
              {INCLUDED.map((item) => (
                <li className="mk-check" key={item}>
                  {item}
                </li>
              ))}
            </ul>
            <p className="mb-6 mt-auto text-sm text-[var(--velo-muted)]">{PLAN_NOTES[plan.id].binom}</p>
            {onChoose ? (
              <button className="btn btn-primary min-h-12" type="button" disabled={busy} onClick={() => onChoose(plan.id)}>
                {busy ? "Opening Stripe…" : `Choose ${plan.name}`}
              </button>
            ) : (
              <Link className="btn btn-primary min-h-12" to={`/register?plan=${plan.id}`}>Start {plan.name} trial</Link>
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
