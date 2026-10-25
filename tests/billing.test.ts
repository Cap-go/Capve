import { sendEmail, resetPasswordEmail, verifyEmailEmail } from "../worker/lib/email";
import Stripe from "stripe";
import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { beforeAll, describe, expect, it, vi, afterEach } from "vitest";
import worker from "../worker";
import type { Env } from "../worker/types";
import { billingRow, billingStatus } from "../worker/lib/billing";
import { billingEmails, BILLING_EMAIL_BATCH_SIZE, BILLING_EMAIL_QUERY_BUDGET } from "../worker/cron/billing-emails";
import type { BillingStatus } from "../shared/billing";
import { initSql } from "./schema";
import { registerTestUser } from "./helpers";
import migration from "../migrations/0024_billing.sql?raw";
import medialabMigration from "../migrations/0025_medialab_trial.sql?raw";
import resetRolloutTrials from "../scripts/reset-rollout-trials.sql?raw";

const billingEnv: Env = { ...env, APP_URL: "http://localhost:5173", BILLING_ENABLED: "true" };
let headers: Record<string, string>;
let accountId: string;
let programId: string;
let affiliateCode: string;
let secret: string;
async function call(path: string, init: RequestInit = {}, bindings = billingEnv) {
  const ctx = createExecutionContext();
  const response = await worker.fetch(new Request(`http://localhost${path}`, { ...init, headers: { ...headers, ...init.headers } }), bindings, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

beforeAll(async () => {
  for (const statement of initSql.split(";").map((s) => s.trim()).filter(Boolean)) await env.DB.prepare(statement).run();
  // Exercise the production trigger, not a mock of usage accounting.
  const trigger = migration.slice(migration.indexOf("CREATE TRIGGER"), migration.indexOf("END;") + 4);
  await env.DB.prepare(trigger).run();
  ({ authHeaders: headers } = await registerTestUser());
  const me = await call("/api/auth/me");
  const identity = await me.json<{ user: { id: string } }>();
  accountId = identity.user.id;
  const result = await call("/api/programs", { method: "POST", body: JSON.stringify({ name: "Billing", destination_url: "https://merchant.example.com" }) });
  const created = await result.json<{ program: { id: string }; convert_secret: string }>();
  programId = created.program.id; secret = created.convert_secret;
  const affiliate = await call(`/api/programs/${programId}/affiliates`, { method: "POST", body: JSON.stringify({ name: "Partner" }) });
  affiliateCode = (await affiliate.json<{ affiliate: { code: string } }>()).affiliate.code;
});
afterEach(() => vi.restoreAllMocks());

describe("hosted billing", () => {
  it("gives 14 days from signup and locks reporting reads when the trial ends, while traffic and conversions continue", async () => {
    const initial = await (await call("/api/billing")).json<BillingStatus>();
    expect(initial.trialEndsAt - Date.now()).toBeGreaterThan(13.99 * 86400_000);
    expect(initial.reportsAllowed).toBe(true);
    await env.DB.prepare("UPDATE account_billing SET trial_ends_at = 1 WHERE account_id = ?").bind(accountId).run();
    for (const path of ["/api/reports/campaigns", "/api/reports/grouped?by=country", "/api/reports/campaigns.csv", "/api/reports/drilldown", `/api/programs/${programId}/stats`, `/api/campaigns/${programId}/clicks`, `/api/programs/${programId}/conversions`]) {
      expect((await call(path)).status, path).toBe(402);
    }
    expect((await call("/api/programs")).status).toBe(200);
    expect((await call(`/api/programs/${programId}/tracking`)).status).toBe(200);
    const affiliates = await call(`/api/programs/${programId}/affiliates`);
    expect(affiliates.status).toBe(200);
    expect(await affiliates.json()).toMatchObject({ affiliates: [{ name: "Partner", code: affiliateCode }] });
    const click = await call(`/r/${affiliateCode}`, { redirect: "manual" });
    expect(click.status).toBe(302);
    const convert = await call("/api/v1/convert", { method: "POST", headers: { "X-Program-Secret": secret }, body: JSON.stringify({ affiliate_code: affiliateCode, order_id: "billing-test", amount: 1 }) });
    expect(convert.status).toBeLessThan(300);
    expect((await call(`/api/programs/${programId}/stats`, {}, { ...billingEnv, BILLING_ENABLED: "false" })).status).toBe(200);
  });

  it("counts clicks durably, locks only above the allowance, and unlocks on upgrade and next month", async () => {
    await call(`/r/${affiliateCode}`, { redirect: "manual" });
    const month = new Date().toISOString().slice(0, 7);
    const usage = await env.DB.prepare("SELECT clicks FROM billing_usage WHERE account_id = ? AND period = ?").bind(accountId, month).first<{ clicks: number }>();
    expect(usage?.clicks).toBe(1);
    await env.DB.prepare("UPDATE account_billing SET subscription_status = 'active', subscription_ends_at = ?, plan = 'starter' WHERE account_id = ?").bind(Date.now() + 31 * 86400_000, accountId).run();
    await env.DB.prepare("UPDATE billing_usage SET clicks = 1000000 WHERE account_id = ? AND period = ?").bind(accountId, month).run();
    expect((await billingStatus(billingEnv, accountId)).reportsAllowed).toBe(true);
    await call(`/r/${affiliateCode}`, { redirect: "manual" });
    expect((await billingStatus(billingEnv, accountId)).reason).toBe("traffic_limit");
    await env.DB.prepare("DELETE FROM clicks WHERE program_id = ?").bind(programId).run();
    expect((await billingStatus(billingEnv, accountId)).clicks).toBe(1_000_001);
    await env.DB.prepare("UPDATE account_billing SET plan = 'pro' WHERE account_id = ?").bind(accountId).run();
    expect((await billingStatus(billingEnv, accountId)).reportsAllowed).toBe(true);
    const nextMonth = new Date(); nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1, 1);
    expect((await billingStatus(billingEnv, accountId, nextMonth.getTime())).clicks).toBe(0);
  });

  it("honors a three-year DB trial and schedules its midpoint from the actual dates", async () => {
    const now = Date.now();
    const end = new Date(now); end.setUTCFullYear(end.getUTCFullYear() + 3);
    await env.DB.prepare("UPDATE account_billing SET trial_started_at = ?, trial_ends_at = ?, subscription_status = NULL, plan = 'starter' WHERE account_id = ?")
      .bind(now, end.getTime(), accountId).run();
    await env.DB.prepare("DELETE FROM billing_usage WHERE account_id = ?").bind(accountId).run();
    expect((await billingStatus(billingEnv, accountId, now + 15 * 86400_000)).reportsAllowed).toBe(true);
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({ results: 1 }));
    const mailEnv = { ...billingEnv, BENTO_SITE_UUID: "test-site", BENTO_PUBLISHABLE_KEY: "test-public", BENTO_SECRET_KEY: "test-secret" };
    await billingEmails(mailEnv, now);
    await billingEmails(mailEnv, now + 7 * 86400_000);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0][1]?.body)).toContain("capve_trial_started");
    await billingEmails(mailEnv, now + (end.getTime() - now) / 2 + 1);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(String(fetch.mock.calls[1][1]?.body)).toContain("capve_trial_midway");
  });


  it("applies signed subscription updates and cannot unlock from a delayed stale event", async () => {
    await env.DB.prepare("UPDATE account_billing SET stripe_customer_id = 'cus_test', trial_ends_at = 1 WHERE account_id = ?").bind(accountId).run();
    const stripeEnv = { ...billingEnv, STRIPE_SECRET_KEY: "sk_test_fake", STRIPE_WEBHOOK_SECRET: "whsec_test", STRIPE_PRICE_PRO: "price_pro" };
    let subscription = { id: "sub_test", object: "subscription", customer: "cus_test", status: "active", trial_end: null,
      items: { data: [{ price: { id: "price_pro" }, current_period_end: Math.floor(Date.now() / 1000) + 86400 }] } };
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json(subscription));
    const stripe = new Stripe("sk_test_fake");
    async function webhook(created: number) {
      const payload = JSON.stringify({ id: `evt_${created}`, object: "event", created, type: "customer.subscription.updated", data: { object: subscription } });
      const signature = await stripe.webhooks.generateTestHeaderStringAsync({ payload, secret: "whsec_test", cryptoProvider: Stripe.createSubtleCryptoProvider() });
      const ctx = createExecutionContext();
      const response = await worker.fetch(new Request("http://localhost/api/billing/webhook", {
        method: "POST", headers: { "stripe-signature": signature }, body: payload,
      }), stripeEnv, ctx);
      await waitOnExecutionContext(ctx);
      return response;
    }
    expect((await webhook(200)).status).toBe(200);
    expect((await billingStatus(stripeEnv, accountId)).reportsAllowed).toBe(true);
    expect((await billingStatus(stripeEnv, accountId)).plan).toBe("pro");
    subscription = { ...subscription, status: "canceled" };
    expect((await webhook(300)).status).toBe(200);
    expect((await billingStatus(stripeEnv, accountId)).reportsAllowed).toBe(false);
    expect((await webhook(100)).status).toBe(200);
    expect((await billingStatus(stripeEnv, accountId)).reportsAllowed).toBe(false);
  });

  it("reconciles invoice recovery and failed payments without advancing the subscription event watermark", async () => {
    await env.DB.prepare(`UPDATE account_billing SET stripe_customer_id = 'cus_invoice',
      stripe_subscription_id = 'sub_invoice', stripe_event_created = 500, trial_ends_at = 1,
      subscription_status = 'past_due' WHERE account_id = ?`).bind(accountId).run();
    const configured = { ...billingEnv, STRIPE_SECRET_KEY: "sk_test_fake", STRIPE_WEBHOOK_SECRET: "whsec_test", STRIPE_PRICE_PRO: "price_pro" };
    let subscription = { id: "sub_invoice", object: "subscription", customer: "cus_invoice", status: "active", trial_end: null,
      items: { data: [{ price: { id: "price_pro" }, current_period_end: Math.floor(Date.now() / 1000) + 86400 }] } };
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json(subscription));
    const stripe = new Stripe("sk_test_fake");
    async function deliver(type: string, customer = "cus_invoice") {
      const payload = JSON.stringify({ id: "evt_invoice", object: "event", created: 900, type,
        data: { object: { id: "in_test", object: "invoice", customer,
          parent: { type: "subscription_details", subscription_details: { subscription: "sub_invoice" } } } } });
      const signature = await stripe.webhooks.generateTestHeaderStringAsync({ payload, secret: "whsec_test", cryptoProvider: Stripe.createSubtleCryptoProvider() });
      return call("/api/billing/webhook", { method: "POST", headers: { "stripe-signature": signature }, body: payload }, configured);
    }
    expect((await deliver("invoice.paid")).status).toBe(200);
    expect((await billingStatus(configured, accountId)).reportsAllowed).toBe(true);
    expect((await env.DB.prepare("SELECT stripe_event_created FROM account_billing WHERE account_id = ?").bind(accountId)
      .first<{ stripe_event_created: number }>())?.stripe_event_created).toBe(500);
    subscription = { ...subscription, status: "past_due" };
    expect((await deliver("invoice.payment_failed")).status).toBe(200);
    expect((await billingStatus(configured, accountId)).reportsAllowed).toBe(false);
    // A delayed paid invoice cannot reactivate a currently past-due subscription.
    expect((await deliver("invoice.paid")).status).toBe(200);
    expect((await billingStatus(configured, accountId)).reportsAllowed).toBe(false);
    subscription = { ...subscription, status: "active" };
    expect((await deliver("invoice.payment_action_required")).status).toBe(200);
    expect((await deliver("invoice.finalization_failed")).status).toBe(200);
    expect((await deliver("invoice.paid", "cus_other")).status).toBe(200);
    subscription = { ...subscription, customer: "cus_other" };
    expect((await deliver("invoice.paid")).status).toBe(400);
    subscription = { ...subscription, customer: "cus_invoice" };
    subscription = { ...subscription, items: { data: [{ ...subscription.items.data[0], price: { id: "price_unrelated" } }] } };
    expect((await deliver("invoice.paid")).status).toBe(200);
    expect((await billingStatus(configured, accountId)).reportsAllowed).toBe(false);
  });

  it.each(["invoice.paid", "customer.subscription.updated"])("retries %s if another webhook wins the subscription-ID race", async (type) => {
    await env.DB.prepare(`UPDATE account_billing SET stripe_customer_id = 'cus_race',
      stripe_subscription_id = NULL, stripe_event_created = 500, trial_ends_at = 1 WHERE account_id = ?`).bind(accountId).run();
    const configured = { ...billingEnv, STRIPE_SECRET_KEY: "sk_test_fake", STRIPE_WEBHOOK_SECRET: "whsec_test", STRIPE_PRICE_PRO: "price_pro" };
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      await env.DB.prepare("UPDATE account_billing SET stripe_event_created = 600, stripe_subscription_id = 'sub_race', subscription_status = 'canceled' WHERE account_id = ?").bind(accountId).run();
      return Response.json({ id: "sub_race", customer: "cus_race", status: "active", trial_end: null,
        items: { data: [{ price: { id: "price_pro" }, current_period_end: Math.floor(Date.now() / 1000) + 86400 }] } });
    });
    const payload = JSON.stringify({ id: "evt_race", object: "event", created: 900, type,
      data: { object: type === "invoice.paid" ? { id: "in_race", object: "invoice", customer: "cus_race",
        parent: { subscription_details: { subscription: "sub_race" } } } :
        { id: "sub_race", object: "subscription", customer: "cus_race" } } });
    const signature = await new Stripe("sk_test_fake").webhooks.generateTestHeaderStringAsync({ payload, secret: "whsec_test", cryptoProvider: Stripe.createSubtleCryptoProvider() });
    expect((await call("/api/billing/webhook", { method: "POST", headers: { "stripe-signature": signature }, body: payload }, configured)).status).toBe(503);
    expect((await billingRow(configured, accountId)).subscription_status).toBe("canceled");
    expect((await billingStatus(configured, accountId)).reportsAllowed).toBe(false);
  });

  it("does not grant access from Checkout completion when the subscription is incomplete", async () => {
    await env.DB.prepare("UPDATE account_billing SET stripe_customer_id = 'cus_checkout', trial_ends_at = 1 WHERE account_id = ?").bind(accountId).run();
    const configured = { ...billingEnv, STRIPE_SECRET_KEY: "sk_test_fake", STRIPE_WEBHOOK_SECRET: "whsec_test", STRIPE_PRICE_PRO: "price_pro" };
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({ id: "sub_checkout", object: "subscription",
      customer: "cus_checkout", status: "incomplete", trial_end: null,
      items: { data: [{ price: { id: "price_pro" }, current_period_end: Math.floor(Date.now() / 1000) + 86400 }] } }));
    for (const type of ["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed"]) {
      const payload = JSON.stringify({ id: "evt_checkout", object: "event", created: 900, type,
        data: { object: { id: "cs_test", object: "checkout.session", mode: "subscription", customer: "cus_checkout", subscription: "sub_checkout" } } });
      const signature = await new Stripe("sk_test_fake").webhooks.generateTestHeaderStringAsync({ payload, secret: "whsec_test", cryptoProvider: Stripe.createSubtleCryptoProvider() });
      expect((await call("/api/billing/webhook", { method: "POST", headers: { "stripe-signature": signature }, body: payload }, configured)).status).toBe(200);
      expect((await billingStatus(configured, accountId)).reportsAllowed).toBe(false);
    }
  });

  it("uses the dedicated portal configuration for invoice and subscription self-service", async () => {
    await env.DB.prepare("UPDATE account_billing SET stripe_customer_id = 'cus_portal' WHERE account_id = ?").bind(accountId).run();
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ url: "https://billing.stripe.com/session" }));
    const response = await call("/api/billing/portal", { method: "POST" }, { ...billingEnv,
      STRIPE_SECRET_KEY: "sk_test_fake", STRIPE_PORTAL_CONFIGURATION: "bpc_capve" });
    expect(response.status).toBe(200);
    expect(new URLSearchParams(String(fetch.mock.calls[0][1]?.body)).get("configuration")).toBe("bpc_capve");
  });

  it.each(["false", "true"])("reuses Checkout, preserves the trial and honors automatic tax=%s", async (automaticTax) => {
    const configured = { ...billingEnv, STRIPE_SECRET_KEY: "sk_test_fake", STRIPE_PRICE_STARTER: "price_starter", STRIPE_AUTOMATIC_TAX: automaticTax };
    const checkoutBodies: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/customers")) return Response.json({ id: "cus_checkout" });
      if (url.includes("/subscriptions")) return Response.json({ data: [] });
      if (init?.method === "POST") checkoutBodies.push(String(init.body));
      return Response.json({ id: "cs_test", url: "https://checkout.stripe.com/test", status: "open" });
    });
    const first = await call("/api/billing/checkout", { method: "POST", body: JSON.stringify({ plan: "starter" }) }, configured);
    expect(first.status).toBe(200);
    expect((await call("/api/billing/checkout", { method: "POST", body: JSON.stringify({ plan: "starter" }) }, configured)).status).toBe(200);
    expect(checkoutBodies).toHaveLength(1);
    expect(checkoutBodies[0]).toContain("trial_end");
    expect(checkoutBodies[0]).toContain("price_starter");
    const params = new URLSearchParams(checkoutBodies[0]);
    expect(params.get("billing_address_collection")).toBe("required");
    expect(params.get("customer_update[address]")).toBe("auto");
    expect(params.get("tax_id_collection[enabled]")).toBe("true");
    expect(params.get("automatic_tax[enabled]")).toBe(automaticTax);
    expect(params.get("subscription_data[billing_mode][type]")).toBe("flexible");
    expect(params.get("integration_identifier")).toMatch(/^capve_checkout_[a-z]{8}$/);
    expect(params.has("payment_method_types")).toBe(false);
  });

  it("allows subscribing again after a completed Checkout's subscription was canceled", async () => {
    await env.DB.prepare("UPDATE account_billing SET stripe_customer_id = 'cus_return', stripe_subscription_id = 'sub_old', subscription_status = 'canceled' WHERE account_id = ?").bind(accountId).run();
    await env.DB.prepare("INSERT INTO billing_checkouts (account_id, request_id, plan, expires_at, session_id) VALUES (?, 'old', 'starter', ?, 'cs_old')")
      .bind(accountId, Date.now() + 86400_000).run();
    const configured = { ...billingEnv, STRIPE_SECRET_KEY: "sk_test_fake", STRIPE_PRICE_STARTER: "price_starter" };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/subscriptions")) return Response.json({ data: [{ id: "sub_old", status: "canceled" }] });
      if (url.includes("/cs_old")) return Response.json({ id: "cs_old", status: "complete", subscription: "sub_old" });
      return Response.json({ id: "cs_new", url: "https://checkout.stripe.com/new", status: "open" });
    });
    const response = await call("/api/billing/checkout", { method: "POST", body: JSON.stringify({ plan: "starter" }) }, configured);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: "https://checkout.stripe.com/new" });
  });

  it("retries a rejected Bento event and does not resend after acceptance", async () => {
    const mailEnv = { ...billingEnv, BENTO_SITE_UUID: "test-site", BENTO_PUBLISHABLE_KEY: "test-public", BENTO_SECRET_KEY: "test-secret" };
    const fetch = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("temporarily unavailable", { status: 503 }))
      .mockImplementation(async () => Response.json({ results: 1 }));
    await billingEmails(mailEnv);
    await billingEmails(mailEnv);
    await billingEmails(mailEnv);
    expect(fetch).toHaveBeenCalledTimes(2);
    const rows = await env.DB.prepare("SELECT delivered_at FROM billing_email_events WHERE account_id = ?").bind(accountId).all<{ delivered_at: number | null }>();
    expect(rows.results).toHaveLength(1);
    expect(rows.results[0].delivered_at).not.toBeNull();
  });

  it("disables Bento tracking on verification and password-reset emails", async () => {
    const mailEnv = { ...billingEnv, BENTO_SITE_UUID: "test-site", BENTO_PUBLISHABLE_KEY: "test-public", BENTO_SECRET_KEY: "test-secret" };
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({ results: 1 }));
    for (const makeMail of [resetPasswordEmail, verifyEmailEmail]) {
      await sendEmail(mailEnv, { to: "seed@example.com", ...makeMail("https://capve.app", "private-token") });
    }
    expect(fetch).toHaveBeenCalledTimes(2);
    for (const [, init] of fetch.mock.calls) {
      const payload = JSON.parse(String(init?.body));
      expect(payload.emails[0].html_body).toContain('disable_click');
      expect(payload.emails[0].html_body).toContain('disable_open');
      expect(payload.emails[0].html_body).toContain('disable_utms');
      expect(payload.emails[0].html_body).toContain('private-token');
      expect(payload.emails[0].transactional).toBe(true);
    }
  });

  it.each([400, 500])("releases only definitively rejected Stripe checkout reservations (HTTP %i)", async (status) => {
    const configured = { ...billingEnv, STRIPE_SECRET_KEY: "sk_test_fake", STRIPE_PRICE_STARTER: "price_starter", STRIPE_PRICE_PRO: "price_pro" };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/customers")) return Response.json({ id: "cus_failed" });
      if (url.includes("/subscriptions")) return Response.json({ data: [] });
      return Response.json({ error: { type: status === 400 ? "invalid_request_error" : "api_error", message: "Checkout failed" } }, {
        status, headers: { "Stripe-Should-Retry": "false" },
      });
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await call("/api/billing/checkout", { method: "POST", body: JSON.stringify({ plan: "starter" }) }, configured);
    expect(response.status).toBe(status);
    const attempt = await env.DB.prepare("SELECT request_id FROM billing_checkouts WHERE account_id = ?").bind(accountId).first();
    expect(attempt === null).toBe(status === 400);
    if (status === 500) {
      expect((await call("/api/billing/checkout", { method: "POST", body: JSON.stringify({ plan: "pro" }) }, configured)).status).toBe(409);
    }
  });

  it("grants the Medialab migration only to its confirmed ID and email", async () => {
    const id = "usr_f26ae7acc0337df4";
    await env.DB.prepare("INSERT INTO users (id, email, created_at) VALUES (?, 'other@example.com', ?)").bind(id, Date.now()).run();
    const original = await billingRow(billingEnv, id);
    await env.DB.prepare(medialabMigration).run();
    expect((await billingRow(billingEnv, id)).trial_ends_at).toBe(original.trial_ends_at);
    await env.DB.prepare("UPDATE users SET email = 'team.mediapath@gmail.com' WHERE id = ?").bind(id).run();
    const unaffected = await billingRow(billingEnv, accountId);
    await env.DB.prepare(medialabMigration).run();
    const updated = await billingRow(billingEnv, id);
    const expected = new Date(updated.trial_started_at); expected.setUTCFullYear(expected.getUTCFullYear() + 3);
    expect(updated.trial_ends_at).toBe(expected.getTime());
    expect((await billingRow(billingEnv, accountId)).trial_ends_at).toBe(unaffected.trial_ends_at);
  });

  it("corrects delayed rollout trials without resetting new accounts, subscribers or courtesy overrides", async () => {
    const now = Date.now();
    const oldStart = now - 30 * 86400_000;
    for (const [suffix, days, subscribed, cohort] of [
      ["existing", 14, false, true], ["new", 14, false, false],
      ["courtesy", 1095, false, true], ["paid", 14, true, true],
    ] as const) {
      const id = `usr_rollout_${suffix}`;
      await env.DB.prepare("INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)")
        .bind(id, `${suffix}@rollout.example.com`, oldStart).run();
      await env.DB.prepare(`INSERT INTO account_billing
        (account_id, trial_started_at, trial_ends_at, stripe_subscription_id) VALUES (?, ?, ?, ?)`)
        .bind(id, oldStart, oldStart + days * 86400_000, subscribed ? "sub_rollout" : null).run();
      if (cohort) await env.DB.prepare("INSERT INTO billing_rollout_accounts (account_id) VALUES (?)").bind(id).run();
    }
    const result = await env.DB.prepare(resetRolloutTrials).all<{ account_id: string; trial_started_at: number; trial_ends_at: number }>();
    expect(result.results).toHaveLength(1);
    expect(result.results[0].account_id).toBe("usr_rollout_existing");
    expect(result.results[0].trial_started_at).toBeGreaterThanOrEqual(now - 1000);
    expect(result.results[0].trial_ends_at - result.results[0].trial_started_at).toBe(14 * 86400_000);
    for (const suffix of ["new", "courtesy", "paid"]) {
      const row = await billingRow(billingEnv, `usr_rollout_${suffix}`);
      expect(row.trial_started_at).toBe(oldStart);
    }
  });

  it("bounds billing-email scans and resumes with a durable cursor across invocations", async () => {
    await env.DB.prepare("UPDATE users SET email_verified = 0").run();
    const now = Date.now();
    await env.DB.batch(Array.from({ length: BILLING_EMAIL_BATCH_SIZE + 1 }, (_, i) =>
      env.DB.prepare("INSERT INTO users (id, email, email_verified, created_at) VALUES (?, ?, 1, ?)")
        .bind(`usr_batch_${String(i).padStart(3, "0")}`, `batch-${i}@example.com`, now)));
    // Every account emits both a trial event and an overage event: the largest event set.
    await env.DB.batch(Array.from({ length: BILLING_EMAIL_BATCH_SIZE + 1 }, (_, i) =>
      env.DB.prepare("INSERT INTO billing_usage (account_id, period, clicks) VALUES (?, ?, ?)")
        .bind(`usr_batch_${String(i).padStart(3, "0")}`, new Date(now).toISOString().slice(0, 7), 1_000_001)));
    const mailEnv = { ...billingEnv, BENTO_SITE_UUID: "test-site", BENTO_PUBLISHABLE_KEY: "test-public", BENTO_SECRET_KEY: "test-secret" };
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({ results: 1 }));
    const prepare = vi.spyOn(env.DB, "prepare");
    const run = async () => {
      const before = prepare.mock.calls.length;
      await billingEmails(mailEnv, now);
      expect(prepare.mock.calls.length - before).toBeLessThanOrEqual(BILLING_EMAIL_QUERY_BUDGET);
      return env.DB.prepare("SELECT cursor, lease_token FROM billing_email_progress WHERE id = 1")
        .first<{ cursor: string; lease_token: string | null }>();
    };
    expect(await run()).toMatchObject({ cursor: "usr_batch_002", lease_token: null });
    expect(fetch).toHaveBeenCalledTimes(6);
    let completed = false;
    for (let i = 0; i < BILLING_EMAIL_BATCH_SIZE; i++) {
      if ((await run())?.cursor === "") { completed = true; break; }
    }
    expect(completed).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2 * (BILLING_EMAIL_BATCH_SIZE + 1));
    // A full second sweep claims no already-delivered events, under the same budget.
    for (let i = 0; i < BILLING_EMAIL_BATCH_SIZE; i++) {
      if ((await run())?.cursor === "") break;
    }
    expect(fetch).toHaveBeenCalledTimes(2 * (BILLING_EMAIL_BATCH_SIZE + 1));
  });

  it("rejects unsigned webhooks, invalid plans and cross-origin checkout", async () => {
    const configured = { ...billingEnv, STRIPE_SECRET_KEY: "sk_test_fake", STRIPE_WEBHOOK_SECRET: "whsec_fake" };
    expect((await call("/api/billing/webhook", { method: "POST", body: "{}" }, configured)).status).toBe(400);
    expect((await call("/api/billing/checkout", { method: "POST", body: JSON.stringify({ plan: "unknown" }) }, configured)).status).toBe(400);
    expect((await call("/api/billing/checkout", { method: "POST", headers: { Origin: "https://attacker.example" }, body: "{}" }, configured)).status).toBe(403);
  });
});
