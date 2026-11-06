import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import worker from "../worker";
import { stripeSetupStatus } from "../worker/lib/stripe-setup";
import type { StripeSetupStatus } from "../shared/stripe-setup";
import type { Env } from "../worker/types";
import { createApiToken } from "../worker/db/api-tokens";
import { initSql } from "./schema";
import { registerTestUser } from "./helpers";

const configured: Env = { ...env, APP_URL: "https://capve.example", BILLING_ENABLED: "false", STRIPE_AUTOMATIC_TAX: "false",
  STRIPE_SECRET_KEY: "sk_test_private", STRIPE_WEBHOOK_SECRET: "whsec_private", STRIPE_PRICE_STARTER: "price_starter",
  STRIPE_PRICE_PRO: "price_pro", STRIPE_PORTAL_CONFIGURATION: "bpc_test" };
let adminHeaders: Record<string, string>;
let userHeaders: Record<string, string>;
let adminId: string;
async function call(headers: Record<string, string>, bindings: Env = configured) {
  const ctx = createExecutionContext();
  const response = await worker.fetch(new Request("http://localhost/api/admin/stripe", { headers }), bindings, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}
function mockStripe(options: { webhookEnabled?: boolean; wrongPrice?: boolean; failPrices?: boolean } = {}) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
    expect(init?.method ?? "GET").toBe("GET");
    if (url.pathname === "/v1/account") return Response.json({ id: "acct_capve", country: "US", charges_enabled: true, payouts_enabled: true,
      business_profile: { name: "Capve", support_url: "https://capve.example/imprint" }, requirements: { currently_due: ["atlas.officers"], past_due: [] },
      settings: { payments: { statement_descriptor: "CAPGO" } } });
    if (url.pathname.startsWith("/v1/prices/")) {
      if (options.failPrices) return Response.json({ error: { type: "invalid_request_error", message: "Do not expose sk_test_private whsec_private", code: "resource_missing" } }, { status: 404 });
      const id = url.pathname.split("/").pop()!;
      return Response.json({ id, active: true, currency: options.wrongPrice ? "eur" : "usd", unit_amount: id === "price_starter" ? 7450 : 14950,
        recurring: { interval: "month", interval_count: 1, usage_type: "licensed" }, product: { id: `prod_${id}`, active: true } });
    }
    if (url.pathname === "/v1/billing_portal/configurations/bpc_test") return Response.json({ active: true,
      features: { subscription_update: { enabled: true, products: [{ product: "prod_starter", prices: ["price_starter"] }, { product: "prod_pro", prices: ["price_pro"] }] },
        subscription_cancel: { enabled: true }, invoice_history: { enabled: true }, payment_method_update: { enabled: true } },
      business_profile: { privacy_policy_url: "https://capve.example/privacy", terms_of_service_url: "https://capve.example/terms" } });
    if (url.pathname === "/v1/webhook_endpoints") return Response.json({ data: [{ id: "we_test", url: "https://capve.example/api/billing/webhook",
      status: options.webhookEnabled ? "enabled" : "disabled", enabled_events: ["*"] }], has_more: false });
    if (url.pathname === "/v1/tax/settings") return Response.json({ status: "active" });
    if (url.pathname === "/v1/tax/registrations") return Response.json({ data: [] });
    throw new Error(`Unexpected Stripe request: ${url.pathname}`);
  });
}
function check(status: StripeSetupStatus, id: string) { return status.checks.find((item) => item.id === id)!; }

beforeAll(async () => {
  for (const sql of initSql.split(";").map((s) => s.trim()).filter(Boolean)) await env.DB.prepare(sql).run();
  ({ authHeaders: adminHeaders } = await registerTestUser());
  ({ authHeaders: userHeaders } = await registerTestUser());
  const cookie = adminHeaders.Cookie;
  const me = await worker.fetch(new Request("http://localhost/api/auth/me", { headers: { Cookie: cookie } }), env, createExecutionContext());
  adminId = (await me.json<{ user: { id: string } }>()).user.id;
  await env.DB.prepare("UPDATE users SET is_platform_admin = 1 WHERE id = ?").bind(adminId).run();
});
afterEach(() => vi.restoreAllMocks());

describe("admin Stripe setup", () => {
  it("requires a verified platform admin before contacting Stripe", async () => {
    const stripe = mockStripe();
    expect((await call({})).status).toBe(401);
    expect((await call(userHeaders)).status).toBe(403);
    await env.DB.prepare("UPDATE users SET email_verified = 0 WHERE id = ?").bind(adminId).run();
    try { expect((await call(adminHeaders)).status).toBe(403); }
    finally { await env.DB.prepare("UPDATE users SET email_verified = 1 WHERE id = ?").bind(adminId).run(); }
    expect(stripe).not.toHaveBeenCalled();
  });

  it("reports deployed secrets separately from disabled billing, webhook, and missing tax registrations", async () => {
    mockStripe();
    const response = await call(adminHeaders);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const status = await response.json<StripeSetupStatus>();
    expect(status).toMatchObject({ accountId: "acct_capve", mode: "test", billingEnabled: false, automaticTaxEnabled: false });
    expect(check(status, "api-key").status).toBe("ready");
    expect(check(status, "webhook-secret").status).toBe("ready");
    expect(check(status, "billing").status).toBe("disabled");
    expect(check(status, "webhook").status).toBe("attention");
    expect(check(status, "webhook").detail).toContain("disabled");
    expect(check(status, "tax").detail).toContain("no active registrations");
    expect(check(status, "descriptor").status).toBe("attention");
    expect(check(status, "requirements").status).toBe("attention");
    expect(check(status, "price-starter").status).toBe("ready");
    expect(check(status, "portal").status).toBe("ready");
    expect(JSON.stringify(status)).not.toContain("sk_test_private");
    expect(JSON.stringify(status)).not.toContain("whsec_private");
  });

  it("shows partial Stripe failures without hiding other setup checks or leaking errors", async () => {
    mockStripe({ failPrices: true });
    const status = await stripeSetupStatus(configured);
    expect(check(status, "price-starter").status).toBe("unknown");
    expect(check(status, "api-key").status).toBe("ready");
    expect(check(status, "portal").status).toBe("ready");
    expect(JSON.stringify(status)).not.toContain("sk_test_private");
    expect(JSON.stringify(status)).not.toContain("whsec_private");
  });

  it("flags mismatched Prices and distinguishes enabled endpoint settings from signed delivery verification", async () => {
    mockStripe({ wrongPrice: true, webhookEnabled: true });
    const status = await stripeSetupStatus(configured);
    expect(check(status, "price-pro").status).toBe("attention");
    expect(check(status, "webhook").status).toBe("ready");
    expect(check(status, "webhook").detail).toContain("cannot confirm the signing secret matches");
  });

  it("does not contact Stripe when no API key is installed", async () => {
    const stripe = mockStripe();
    const status = await stripeSetupStatus({ ...configured, STRIPE_SECRET_KEY: undefined, STRIPE_WEBHOOK_SECRET: undefined });
    expect(check(status, "api-key").status).toBe("attention");
    expect(check(status, "webhook-secret").status).toBe("attention");
    expect(stripe).not.toHaveBeenCalled();
  });

  it("allows the matching MCP read for admin tokens and denies ordinary tokens", async () => {
    const noKey = { ...configured, STRIPE_SECRET_KEY: undefined };
    const token = await createApiToken(env.DB, adminId, "Stripe status");
    expect(token).not.toBeNull();
    expect((await call({ Authorization: `Bearer ${token!.token}` }, noKey)).status).toBe(200);
    const { TOOLS } = await import("../worker/mcp/tools");
    expect(TOOLS.find((tool) => tool.name === "get_stripe_setup_status")?.call({})).toEqual({ method: "GET", path: "/api/admin/stripe" });
    const user = await env.DB.prepare("SELECT id FROM users WHERE id != ? LIMIT 1").bind(adminId).first<{ id: string }>();
    const ordinary = await createApiToken(env.DB, user!.id, "No admin");
    expect((await call({ Authorization: `Bearer ${ordinary!.token}` }, noKey)).status).toBe(403);
  });
});
