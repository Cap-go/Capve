import { Hono } from "hono";
import Stripe from "stripe";
import { isPlanId } from "../../shared/billing";
import type { Env } from "../types";
import { requireUser, resolveIdentity } from "../lib/access";
import { billingRow, billingStatus } from "../lib/billing";

export function stripeClient(env: Env): Stripe {
  if (!env.STRIPE_SECRET_KEY) throw new Error("Stripe is not configured");
  return new Stripe(env.STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient(), maxNetworkRetries: 2 });
}

const billing = new Hono<{ Bindings: Env }>();
billing.get("/", async (c) => {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  c.header("Cache-Control", "no-store");
  return c.json(await billingStatus(c.env, session.account_id));
});

billing.use("/checkout", ownerOnly);
billing.use("/portal", ownerOnly);
async function ownerOnly(c: import("hono").Context<{ Bindings: Env }>, next: import("hono").Next) {
  const session = await requireUser(c);
  const identity = await resolveIdentity(c);
  if (!session || !identity) return c.json({ error: "Sign in to manage billing" }, 401);
  if (session.role !== "owner" || session.impersonating || identity.id !== session.account_id)
    return c.json({ error: "Only the account owner can manage billing" }, 403);
  if (!identity.email_verified) return c.json({ error: "Verify your email before subscribing" }, 403);
  const origin = c.req.header("origin");
  if (origin && origin !== new URL(c.env.APP_URL).origin) return c.json({ error: "Invalid origin" }, 403);
  if (c.env.BILLING_ENABLED !== "true" || !c.env.STRIPE_SECRET_KEY)
    return c.json({ error: "Billing is not enabled on this install" }, 503);
  await next();
}

billing.post("/checkout", async (c) => {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  const body: unknown = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object" || !("plan" in body) || !isPlanId(body.plan))
    return c.json({ error: "Choose a valid plan" }, 400);
  const priceId = body.plan === "starter" ? c.env.STRIPE_PRICE_STARTER : c.env.STRIPE_PRICE_PRO;
  if (!priceId) return c.json({ error: "This plan is not configured yet" }, 503);
  const row = await billingRow(c.env, session.account_id);
  if (row.stripe_subscription_id && !["canceled", "incomplete_expired"].includes(row.subscription_status ?? ""))
    return c.json({ error: "Use Manage subscription to change your existing plan" }, 409);
  const stripe = stripeClient(c.env);
  const customer = row.stripe_customer_id ?? (await stripe.customers.create({
    email: session.account_email, metadata: { capve_account_id: session.account_id },
  }, { idempotencyKey: `capve-customer-${session.account_id}` })).id;
  await c.env.DB.prepare("UPDATE account_billing SET stripe_customer_id = ? WHERE account_id = ?")
    .bind(customer, session.account_id).run();
  // Stripe can have a subscription before its webhook reaches D1.
  const subscriptions = await stripe.subscriptions.list({ customer, status: "all", limit: 100 });
  if (subscriptions.data.some((sub) => !["canceled", "incomplete_expired"].includes(sub.status)))
    return c.json({ error: "A subscription already exists. Use Manage subscription." }, 409);
  type CheckoutRow = { request_id: string; plan: string; trial_end: number | null; expires_at: number; session_id: string | null };
  let attempt = await c.env.DB.prepare("SELECT * FROM billing_checkouts WHERE account_id = ?")
    .bind(session.account_id).first<CheckoutRow>();
  if (attempt?.session_id) {
    const previous = await stripe.checkout.sessions.retrieve(attempt.session_id);
    const previousSubscription = typeof previous.subscription === "string" ? previous.subscription : previous.subscription?.id;
    const ended = previousSubscription === row.stripe_subscription_id &&
      ["canceled", "incomplete_expired"].includes(row.subscription_status ?? "");
    if (previous.status === "complete" && !ended)
      return c.json({ error: "Payment received. Waiting for Stripe confirmation." }, 409);
    if (previous.status === "open" && attempt.plan === body.plan) return c.json({ url: previous.url });
    if (previous.status === "open") await stripe.checkout.sessions.expire(previous.id);
    await c.env.DB.prepare("DELETE FROM billing_checkouts WHERE account_id = ? AND request_id = ?")
      .bind(session.account_id, attempt.request_id).run();
    attempt = null;
  }
  if (attempt && attempt.expires_at <= Date.now()) {
    await c.env.DB.prepare("DELETE FROM billing_checkouts WHERE account_id = ? AND request_id = ?")
      .bind(session.account_id, attempt.request_id).run();
  }
  const now = Date.now();
  await c.env.DB.prepare(`INSERT OR IGNORE INTO billing_checkouts
    (account_id, request_id, plan, trial_end, expires_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(session.account_id, crypto.randomUUID(), body.plan,
      row.trial_ends_at > now ? Math.max(Math.ceil(row.trial_ends_at / 1000), Math.ceil(now / 1000) + 48 * 3600 + 60) : null,
      now + 24 * 3600_000).run();
  attempt = await c.env.DB.prepare("SELECT * FROM billing_checkouts WHERE account_id = ?")
    .bind(session.account_id).first<CheckoutRow>();
  if (!attempt || attempt.plan !== body.plan) return c.json({ error: "Another checkout is opening. Try again shortly." }, 409);
  // Stripe limits subscription trials to 730 days. Longer courtesy trials stay in D1.
  if (attempt.trial_end && attempt.trial_end > Math.ceil(now / 1000) + 730 * 86400)
    return c.json({ error: "Your extended trial is already active. Subscribe closer to its end." }, 400);
  let checkout: Stripe.Checkout.Session;
  try {
    checkout = await stripe.checkout.sessions.create({
      customer, mode: "subscription", client_reference_id: session.account_id,
      line_items: [{ price: priceId, quantity: 1 }],
      billing_address_collection: "required",
      tax_id_collection: { enabled: true },
      customer_update: { address: "auto", name: "auto" },
      automatic_tax: { enabled: c.env.STRIPE_AUTOMATIC_TAX === "true" },
      integration_identifier: `capve_checkout_${Array.from(attempt.request_id.replaceAll("-", "").slice(0, 8),
        (digit) => String.fromCharCode(97 + parseInt(digit, 16))).join("")}`,
      success_url: `${c.env.APP_URL}/app?entity=billing&checkout=success`,
      cancel_url: `${c.env.APP_URL}/app?entity=billing`,
      subscription_data: {
        billing_mode: { type: "flexible" },
        metadata: { capve_account_id: session.account_id },
        ...(attempt.trial_end ? { trial_end: attempt.trial_end } : {}),
      },
    }, { idempotencyKey: `capve-checkout-${attempt.request_id}` });
  } catch (error) {
    // Only a definitive validation rejection is safe to abandon. A missing response
    // or server error may mean Stripe created the session; retain its retry key.
    if (error instanceof Stripe.errors.StripeInvalidRequestError && error.statusCode === 400) {
      await c.env.DB.prepare("DELETE FROM billing_checkouts WHERE account_id = ? AND request_id = ? AND session_id IS NULL")
        .bind(session.account_id, attempt.request_id).run();
      return c.json({ error: "Stripe rejected this checkout. Choose a plan and try again, or contact support." }, 400);
    }
    throw error;
  }
  await c.env.DB.prepare("UPDATE billing_checkouts SET session_id = ? WHERE account_id = ? AND request_id = ?")
    .bind(checkout.id, session.account_id, attempt.request_id).run();
  return c.json({ url: checkout.url });
});

billing.post("/portal", async (c) => {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  const row = await billingRow(c.env, session.account_id);
  if (!row.stripe_customer_id) return c.json({ error: "No billing account yet" }, 400);
  const portal = await stripeClient(c.env).billingPortal.sessions.create({
    ...(c.env.STRIPE_PORTAL_CONFIGURATION ? { configuration: c.env.STRIPE_PORTAL_CONFIGURATION } : {}),
    customer: row.stripe_customer_id, return_url: `${c.env.APP_URL}/app?entity=billing`,
  });
  return c.json({ url: portal.url });
});

billing.post("/webhook", async (c) => {
  if (!c.env.STRIPE_WEBHOOK_SECRET || !c.env.STRIPE_SECRET_KEY)
    return c.json({ error: "Webhook not configured" }, 503);
  const stripe = stripeClient(c.env);
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      await c.req.text(), c.req.header("stripe-signature") ?? "", c.env.STRIPE_WEBHOOK_SECRET,
      undefined, Stripe.createSubtleCryptoProvider(),
    );
  } catch {
    return c.json({ error: "Invalid Stripe signature" }, 400);
  }
  let subscriptionId: string | null = null;
  let eventCustomerId: string | null = null;
  const object = event.data.object;
  const idOf = (value: string | { id: string } | null): string | null =>
    typeof value === "string" ? value : value?.id ?? null;
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = object as Stripe.Subscription;
      subscriptionId = subscription.id;
      eventCustomerId = idOf(subscription.customer);
      break;
    }
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
    case "checkout.session.async_payment_failed": {
      const checkout = object as Stripe.Checkout.Session;
      if (checkout.mode !== "subscription") return c.json({ received: true });
      subscriptionId = idOf(checkout.subscription);
      eventCustomerId = idOf(checkout.customer);
      break;
    }
    case "invoice.paid":
    case "invoice.payment_failed":
    case "invoice.payment_action_required":
    case "invoice.finalization_failed": {
      const invoice = object as Stripe.Invoice;
      subscriptionId = idOf(invoice.parent?.subscription_details?.subscription ?? null);
      eventCustomerId = idOf(invoice.customer);
      break;
    }
    default:
      return c.json({ received: true });
  }
  if (!subscriptionId || !eventCustomerId) return c.json({ received: true });
  const known = await c.env.DB.prepare("SELECT account_id, stripe_subscription_id, subscription_status, stripe_event_created, reconciliation_revision FROM account_billing WHERE stripe_customer_id = ?")
    .bind(eventCustomerId).first<{ account_id: string; stripe_subscription_id: string | null; subscription_status: string | null; stripe_event_created: number; reconciliation_revision: number }>();
  if (!known) return c.json({ received: true });
  // Retrieve current state: a paid invoice or Checkout completion alone never grants access.
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  if (idOf(sub.customer) !== eventCustomerId) return c.json({ error: "Subscription customer mismatch" }, 400);
  const item = sub.items.data[0];
  const plan = item?.price.id === c.env.STRIPE_PRICE_STARTER ? "starter" :
    item?.price.id === c.env.STRIPE_PRICE_PRO ? "pro" : null;
  // Never let events for an old subscription replace its successor.
  if (known.stripe_subscription_id && known.stripe_subscription_id !== sub.id &&
      !["canceled", "incomplete_expired"].includes(known.subscription_status ?? ""))
    return c.json({ received: true });
  const endsAt = sub.status === "trialing" ? sub.trial_end : item?.current_period_end;
  const subscriptionEvent = event.type.startsWith("customer.subscription.");
  const updated = await c.env.DB.prepare(`UPDATE account_billing SET
    plan = COALESCE(?, plan), stripe_subscription_id = ?, subscription_status = ?,
    subscription_ends_at = ?, stripe_event_created = MAX(stripe_event_created, ?),
    reconciliation_revision = reconciliation_revision + 1,
    trial_ends_at = CASE WHEN ? IS NOT NULL AND ? > trial_ends_at THEN ? ELSE trial_ends_at END
    WHERE account_id = ? AND stripe_event_created <= ?
      AND (? = 1 OR stripe_event_created = ?)
      AND COALESCE(stripe_subscription_id, '') = COALESCE(?, '')
      AND reconciliation_revision = ?`)
    .bind(plan, sub.id, plan ? sub.status : "unrecognized_price", endsAt ? endsAt * 1000 : null,
      subscriptionEvent ? event.created : 0, sub.trial_end, (sub.trial_end ?? 0) * 1000, (sub.trial_end ?? 0) * 1000,
      known.account_id, subscriptionEvent ? event.created : known.stripe_event_created,
      subscriptionEvent ? 1 : 0, known.stripe_event_created, known.stripe_subscription_id, known.reconciliation_revision).run();
  // Retry a lost race, but acknowledge a genuinely stale subscription event.
  if (!updated.meta.changes && (!subscriptionEvent || known.stripe_event_created <= event.created))
    return c.json({ error: "Subscription changed; retry event" }, 503);
  if (["invoice.payment_failed", "invoice.payment_action_required", "invoice.finalization_failed"].includes(event.type)) {
    // Stripe owns payment recovery; log references only, never invoice details or payment URLs.
    console.warn("Capve billing invoice requires attention", { eventId: event.id, type: event.type,
      accountId: known.account_id, subscriptionId: sub.id });
  }
  return c.json({ received: true });
});

export { billing };
