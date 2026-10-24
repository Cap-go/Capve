export const PLANS = [
  { id: "starter", name: "Starter", monthlyCents: 7450, clicks: 1_000_000 },
  { id: "pro", name: "Pro", monthlyCents: 14950, clicks: 60_000_000 },
] as const;
export type PlanId = (typeof PLANS)[number]["id"];
export function isPlanId(value: unknown): value is PlanId {
  return PLANS.some((plan) => plan.id === value);
}
export type BillingStatus = {
  enabled: boolean;
  plan: PlanId;
  trialEndsAt: number;
  subscriptionStatus: string | null;
  clicks: number;
  clickLimit: number;
  period: string;
  reportsAllowed: boolean;
  reason: "trial_expired" | "traffic_limit" | null;
  checkoutReady: boolean;
  hasCustomer: boolean;
};
