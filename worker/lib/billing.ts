import type { MiddlewareHandler } from "hono";
import { PLANS, isPlanId, type BillingStatus } from "../../shared/billing";
import type { Env } from "../types";
import { requireUser } from "./access";

export type BillingRow = {
  account_id: string;
  plan: string;
  trial_started_at: number;
  trial_ends_at: number;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
  subscription_ends_at: number | null;
};

export async function billingRow(env: Env, accountId: string): Promise<BillingRow> {
  await env.DB.prepare(`INSERT OR IGNORE INTO account_billing
    (account_id, trial_started_at, trial_ends_at)
    SELECT id, created_at, created_at + ? FROM users WHERE id = ?`)
    .bind(14 * 86400_000, accountId).run();
  const row = await env.DB.prepare("SELECT * FROM account_billing WHERE account_id = ?")
    .bind(accountId).first<BillingRow>();
  if (!row) throw new Error("Billing account not found");
  return row;
}

export async function billingStatus(env: Env, accountId: string, now = Date.now()): Promise<BillingStatus> {
  const row = await billingRow(env, accountId);
  const plan = PLANS.find((p) => p.id === row.plan) ?? PLANS[0];
  const period = new Date(now).toISOString().slice(0, 7);
  const usage = await env.DB.prepare("SELECT clicks FROM billing_usage WHERE account_id = ? AND period = ?")
    .bind(accountId, period).first<{ clicks: number }>();
  const clicks = usage?.clicks ?? 0;
  const enabled = env.BILLING_ENABLED === "true";
  const subscribed = ["active", "trialing"].includes(row.subscription_status ?? "") &&
    row.subscription_ends_at !== null && row.subscription_ends_at > now;
  const reason = !enabled ? null : clicks > plan.clicks ? "traffic_limit" :
    !subscribed && row.trial_ends_at <= now ? "trial_expired" : null;
  return {
    enabled, plan: isPlanId(row.plan) ? row.plan : "starter", trialEndsAt: row.trial_ends_at,
    subscriptionStatus: row.subscription_status, clicks, clickLimit: plan.clicks, period,
    reportsAllowed: reason === null, reason,
    checkoutReady: !!(env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_STARTER && env.STRIPE_PRICE_PRO),
    hasCustomer: !!row.stripe_customer_id,
  };
}

/** Mounted only on reporting reads. Tracking writes never depend on Stripe or Bento. */
export const requireReports: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  if (c.env.BILLING_ENABLED === "true") {
    const billing = await billingStatus(c.env, session.account_id);
    if (!billing.reportsAllowed) return c.json({
      error: billing.reason === "traffic_limit"
        ? "Monthly click allowance exceeded. Upgrade to view reports. Traffic continues."
        : "Your trial or subscription has ended. Subscribe to view reports. Traffic continues.",
      code: "reports_locked", billing,
    }, 402);
    c.header("Cache-Control", "no-store");
  }
  await next();
};
