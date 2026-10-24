import Stripe from "stripe";
import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { beforeAll, describe, expect, it, vi, afterEach } from "vitest";
import worker from "../worker";
import type { Env } from "../worker/types";
import { billingStatus } from "../worker/lib/billing";
import { billingEmails } from "../worker/cron/billing-emails";
import type { BillingStatus } from "../shared/billing";
import { initSql } from "./schema";
import { registerTestUser } from "./helpers";
import migration from "../migrations/0024_billing.sql?raw";

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
      return call("/api/billing/webhook", { method: "POST", headers: { "stripe-signature": signature }, body: payload }, stripeEnv);
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

  it("reuses an open Checkout on retry and preserves the remaining trial", async () => {
    const configured = { ...billingEnv, STRIPE_SECRET_KEY: "sk_test_fake", STRIPE_PRICE_STARTER: "price_starter" };
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

  it("rejects unsigned webhooks, invalid plans and cross-origin checkout", async () => {
    const configured = { ...billingEnv, STRIPE_SECRET_KEY: "sk_test_fake", STRIPE_WEBHOOK_SECRET: "whsec_fake" };
    expect((await call("/api/billing/webhook", { method: "POST", body: "{}" }, configured)).status).toBe(400);
    expect((await call("/api/billing/checkout", { method: "POST", body: JSON.stringify({ plan: "unknown" }) }, configured)).status).toBe(400);
    expect((await call("/api/billing/checkout", { method: "POST", headers: { Origin: "https://attacker.example" }, body: "{}" }, configured)).status).toBe(403);
  });
});
