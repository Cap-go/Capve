import Stripe from "stripe";
import { PLANS } from "../../shared/billing";
import type { StripeSetupCheck, StripeSetupStatus } from "../../shared/stripe-setup";
import type { Env } from "../types";

/** Live, read-only diagnostics. Never serialize Stripe responses or credential values. */
export async function stripeSetupStatus(env: Env): Promise<StripeSetupStatus> {
  const mode = /^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY ?? "") ? "live"
    : /^(sk|rk)_test_/.test(env.STRIPE_SECRET_KEY ?? "") ? "test" : "unknown";
  const result: StripeSetupStatus = {
    checkedAt: Date.now(), billingEnabled: env.BILLING_ENABLED === "true",
    automaticTaxEnabled: env.STRIPE_AUTOMATIC_TAX === "true", mode, accountId: null, checks: [],
  };
  const checks = result.checks;
  checks.push({ id: "billing", label: "Hosted billing", status: result.billingEnabled ? "ready" : "disabled",
    detail: result.billingEnabled ? "Subscriptions and reporting limits are enabled." : "Billing is disabled. Reports remain unrestricted and Checkout is unavailable." });
  checks.push({ id: "webhook-secret", label: "Webhook signing secret", status: env.STRIPE_WEBHOOK_SECRET ? "ready" : "attention",
    detail: env.STRIPE_WEBHOOK_SECRET ? "Present in the running Worker. No secret value is displayed." : "Missing from the running Worker." });
  checks.push({ id: "automatic-tax", label: "Automatic tax collection", status: result.automaticTaxEnabled ? "ready" : "disabled",
    detail: result.automaticTaxEnabled ? "Enabled in Checkout. Review registrations and product classification in Stripe." : "Disabled in Checkout." });
  checks.push({ id: "email", label: "Bento billing emails", status: env.BENTO_SITE_UUID && env.BENTO_PUBLISHABLE_KEY && env.BENTO_SECRET_KEY ? "ready" : "attention",
    detail: env.BENTO_SITE_UUID && env.BENTO_PUBLISHABLE_KEY && env.BENTO_SECRET_KEY ? "Credentials are present. Confirm trial and subscription flows in Bento." : "Bento credentials are incomplete. Trial and subscription notices cannot be delivered through Bento." });

  if (!env.STRIPE_SECRET_KEY) {
    checks.unshift({ id: "api-key", label: "Stripe API connection", status: "attention", detail: "API key is missing from the running Worker. Stripe settings have not been checked." });
    return result;
  }
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
    httpClient: Stripe.createFetchHttpClient(), timeout: 8_000, maxNetworkRetries: 0,
  });
  const dashboard = `https://dashboard.stripe.com/${mode === "test" ? "test/" : ""}`;
  const probe = async (id: string, label: string, href: string, run: () => Promise<StripeSetupCheck[]>): Promise<StripeSetupCheck[]> => {
    try { return await run(); }
    catch (error) {
      return [{ id, label, href, status: error instanceof Stripe.errors.StripeAuthenticationError ? "attention" : "unknown", detail: error instanceof Stripe.errors.StripeAuthenticationError
        ? "Stripe rejected the API key. Update the Worker secret."
        : "Could not verify this setting. Check API permissions and Stripe availability, then refresh." }];
    }
  };
  const remote = await Promise.all([
    probe("api-key", "Stripe API connection", dashboard, async () => {
      const account = await stripe.accounts.retrieveCurrent();
      result.accountId = account.id;
      const due = new Set([...(account.requirements?.currently_due ?? []), ...(account.requirements?.past_due ?? [])]);
      const descriptor = account.settings?.payments?.statement_descriptor;
      return [
        { id: "api-key", label: "Stripe API connection", status: "ready", href: dashboard,
          detail: `Connected to ${account.business_profile?.name || account.id} (${account.country ?? "unknown country"}, ${mode} mode).` },
        { id: "payments", label: "Payments and payouts", status: account.charges_enabled && account.payouts_enabled ? "ready" : "attention", href: `${dashboard}settings/account`,
          detail: `Charges ${account.charges_enabled ? "enabled" : "disabled"}; payouts ${account.payouts_enabled ? "enabled" : "disabled"}.` },
        { id: "requirements", label: "Account verification", status: due.size ? "attention" : "ready", href: `${dashboard}settings/account`,
          detail: due.size ? `${due.size} account requirement(s) need review in Stripe.` : "No currently due or past-due account requirements reported." },
        { id: "descriptor", label: "Statement descriptor", status: descriptor?.toUpperCase() === "CAPVE" ? "ready" : "attention", href: `${dashboard}settings/public`,
          detail: descriptor ? `Account descriptor: ${descriptor}. Subscription Product descriptors are configured separately.` : "No account statement descriptor is set." },
        { id: "support", label: "Customer support URL", status: account.business_profile?.support_url ? "ready" : "attention", href: `${dashboard}settings/public`,
          detail: account.business_profile?.support_url ? "A customer support URL is configured in Stripe." : "Set a customer support URL in Stripe’s public business details." },
      ];
    }),
    ...PLANS.map((plan) => {
      const priceId = plan.id === "starter" ? env.STRIPE_PRICE_STARTER : env.STRIPE_PRICE_PRO;
      return probe(`price-${plan.id}`, `${plan.name} price`, `${dashboard}products`, async () => {
        if (!priceId) return [{ id: `price-${plan.id}`, label: `${plan.name} price`, status: "attention", detail: "Price ID is missing from the running Worker." }];
        const price = await stripe.prices.retrieve(priceId, { expand: ["product"] });
        const product = price.product;
        const productActive = typeof product !== "string" && !product.deleted && product.active;
        const valid = price.active && productActive && price.currency === "usd" && price.unit_amount === plan.monthlyCents &&
          price.recurring?.interval === "month" && price.recurring.interval_count === 1 && price.recurring.usage_type === "licensed";
        return [{ id: `price-${plan.id}`, label: `${plan.name} price`, status: valid ? "ready" : "attention", href: `${dashboard}products`,
          detail: valid ? `${priceId} · USD ${(plan.monthlyCents / 100).toFixed(2)}/month; Product and Price are active.` : `${priceId} does not match the active USD ${(plan.monthlyCents / 100).toFixed(2)}/month plan. Review the Product and Price.` }];
      });
    }),
    probe("portal", "Customer portal", `${dashboard}settings/billing/portal`, async () => {
      if (!env.STRIPE_PORTAL_CONFIGURATION) return [{ id: "portal", label: "Customer portal", status: "attention", detail: "No dedicated portal configuration is selected in the Worker." }];
      const portal = await stripe.billingPortal.configurations.retrieve(env.STRIPE_PORTAL_CONFIGURATION);
      const products = portal.features.subscription_update.products ?? [];
      const allowed = products.flatMap((product) => product.prices);
      const plansMatch = [env.STRIPE_PRICE_STARTER, env.STRIPE_PRICE_PRO].every((price) => price && allowed.includes(price));
      const valid = portal.active && plansMatch && portal.features.subscription_update.enabled &&
        portal.features.subscription_cancel.enabled && portal.features.invoice_history.enabled && portal.features.payment_method_update.enabled;
      const policies = portal.business_profile.privacy_policy_url === `${env.APP_URL.replace(/\/$/, "")}/privacy` &&
        portal.business_profile.terms_of_service_url === `${env.APP_URL.replace(/\/$/, "")}/terms`;
      return [{ id: "portal", label: "Customer portal", status: valid && policies ? "ready" : "attention", href: `${dashboard}settings/billing/portal`,
        detail: valid && policies ? "Active with both plans, payment updates, invoices, cancellations, and website policy links." : "Review portal activation, both plan Prices, subscription management, and privacy/terms links." }];
    }),
    probe("webhook", "Webhook endpoint", `${dashboard}workbench/webhooks`, async () => {
      const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
      const url = `${env.APP_URL.replace(/\/$/, "")}/api/billing/webhook`;
      const matching = endpoints.data.filter((endpoint) => endpoint.url === url);
      const endpoint = matching.find((candidate) => candidate.status === "enabled") ?? matching[0];
      const required = ["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed", "invoice.paid", "invoice.payment_failed", "invoice.payment_action_required", "invoice.finalization_failed"];
      const eventsReady = endpoint && (endpoint.enabled_events.includes("*") || required.every((event) => endpoint.enabled_events.includes(event)));
      return [{ id: "webhook", label: "Webhook endpoint", status: endpoint?.status === "enabled" && eventsReady ? "ready" : !endpoint && endpoints.has_more ? "unknown" : "attention", href: `${dashboard}workbench/webhooks`,
        detail: endpoint ? `${endpoint.id} is ${endpoint.status}${eventsReady ? " with the required events" : "; required events are missing"}. Verify a signed delivery in Workbench; endpoint settings cannot confirm the signing secret matches.`
          : endpoints.has_more ? "No matching endpoint in the first 100 results. Check Stripe Workbench." : `No endpoint targets ${url}.` }];
    }),
    probe("tax", "Stripe Tax configuration", `${dashboard}tax/registrations`, async () => {
      const [settings, registrations] = await Promise.all([stripe.tax.settings.retrieve(), stripe.tax.registrations.list({ status: "active", limit: 1 })]);
      const configured = settings.status === "active" && registrations.data.length > 0;
      return [{ id: "tax", label: "Stripe Tax configuration", status: configured ? "ready" : "attention", href: `${dashboard}tax/registrations`,
        detail: `Tax settings ${settings.status}; ${registrations.data.length ? "an active registration found" : "no active registrations found"}. Confirm product classification and registration coverage before collecting tax.` }];
    }),
  ]);
  checks.unshift(...remote.flat());
  if (result.accountId) {
    const accountDashboard = `https://dashboard.stripe.com/${result.accountId}/${mode === "test" ? "test/" : ""}`;
    for (const check of checks) {
      if (check.href?.startsWith(dashboard)) check.href = accountDashboard + check.href.slice(dashboard.length);
    }
  }
  return result;
}
