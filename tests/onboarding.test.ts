import { env, SELF } from "cloudflare:test";
import { beforeAll, beforeEach, afterEach, expect, it, vi } from "vitest";
import { initSql } from "./schema";
import { BROWSER_HEADERS, cookieFrom, registerTestUser } from "./helpers";
import { onboardingEmails } from "../worker/cron/onboarding-emails";
import { onboardingStatus } from "../worker/lib/onboarding";
import type { OnboardingStatus } from "../shared/onboarding";
import type { Env } from "../worker/types";

let headers: Record<string, string>;
let accountId: string;
const bentoEnv: Env = { ...env, APP_URL: "https://capve.app", ONBOARDING_EMAILS_ENABLED: "true",
  BENTO_SITE_UUID: "test-site", BENTO_PUBLISHABLE_KEY: "test-public", BENTO_SECRET_KEY: "test-secret" };
async function call(path: string, method = "GET", body?: unknown, auth = headers) {
  return SELF.fetch(`http://localhost${path}`, { method, headers: auth, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function prefs(body: unknown) { return call("/api/onboarding", "PUT", body); }
async function status() { return (await call("/api/onboarding")).json<OnboardingStatus>(); }
async function campaign(auth = headers) {
  const result = await call("/api/campaigns", "POST", { name: "First campaign", destination_url: "https://merchant.example/offer?subid={click_id}" }, auth);
  expect(result.status).toBe(201);
  return (await result.json<{ program: { id: string; campaign_key: string } }>()).program;
}
async function click(key: string, browser = true) {
  const response = await SELF.fetch(`http://localhost/c/${key}`, { redirect: "manual", headers: browser ? BROWSER_HEADERS : {} });
  expect(response.status).toBe(302);
  return new URL(response.headers.get("Location")!).searchParams.get("click_id")!;
}
async function convert(id: string, conversionStatus = "lead") {
  const response = await SELF.fetch(`http://localhost/click?cnv_id=${id}&cnv_status=${conversionStatus}`);
  expect(response.status).toBe(200);
}
function mockBento() { return vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({ results: 1 })); }
function sent(mock: ReturnType<typeof mockBento>) {
  return mock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).events[0]);
}

beforeAll(async () => {
  for (const sql of initSql.split(";").map((s) => s.trim()).filter(Boolean)) await env.DB.prepare(sql).run();
});
beforeEach(async () => {
  ({ authHeaders: headers } = await registerTestUser());
  accountId = (await (await call("/api/auth/me")).json<{ user: { id: string } }>()).user.id;
});
afterEach(() => vi.restoreAllMocks());

it("requires authentication, validates preference input, and defaults to no email consent", async () => {
  expect((await call("/api/onboarding", "GET", undefined, {})).status).toBe(401);
  expect(await status()).toMatchObject({ accountId, emailTips: false, dismissed: false, nextStep: "campaign", complete: false });
  for (const body of [null, [], {}, { emailTips: "true" }, { complete: true }]) expect((await prefs(body)).status).toBe(400);
  const mock = mockBento();
  await onboardingEmails(bentoEnv);
  expect(mock).not.toHaveBeenCalled();
});

it("tracks a real click-to-conversion funnel, excluding bots and rejected conversions", async () => {
  const p = await campaign();
  expect(await status()).toMatchObject({ campaignId: p.id, nextStep: "click" });
  const bot = await click(p.campaign_key, false);
  await convert(bot);
  expect((await status()).steps).toMatchObject({ click: false, conversion: false });
  const human = await click(p.campaign_key);
  expect((await status()).nextStep).toBe("conversion");
  for (const rejected of ["rejected", "refunded", "chargeback", "fraud"]) {
    await convert(human, rejected);
    expect((await status()).complete).toBe(false);
  }
  await convert(human);
  expect(await status()).toMatchObject({ nextStep: null, complete: true, steps: { verify: true, campaign: true, click: true, conversion: true } });
});

it("ignores another account's campaigns and does not expose tracking data in progress", async () => {
  const other = await registerTestUser();
  await campaign(other.authHeaders);
  expect(await status()).toMatchObject({ campaignId: null, nextStep: "campaign" });
  expect(Object.keys(await status()).sort()).toEqual(["accountId", "campaignId", "complete", "dismissed", "emailTips", "nextStep", "steps"].sort());
  expect((await call("/api/onboarding", "GET", undefined, { ...headers, "X-Capve-Account": "wrong-account" })).status).toBe(409);
});

it("reads selected team progress but prevents members from changing owner consent", async () => {
  const p = await campaign();
  const viewer = await registerTestUser();
  await env.DB.prepare("INSERT INTO team_members (id, owner_user_id, email, role, created_at, accepted_at) VALUES (?, ?, ?, 'viewer', ?, ?)")
    .bind(crypto.randomUUID(), accountId, viewer.email, Date.now(), Date.now()).run();
  const selected = await call("/api/auth/switch-account", "POST", { account_id: accountId }, viewer.authHeaders);
  expect(selected.status).toBe(200);
  const context = cookieFrom(selected, "capve_account_context");
  expect(context).toBeTruthy();
  const teamHeaders = { ...viewer.authHeaders, Cookie: `${viewer.authHeaders.Cookie}; capve_account_context=${encodeURIComponent(context!)}` };
  expect(await (await call("/api/onboarding", "GET", undefined, teamHeaders)).json()).toMatchObject({ accountId, campaignId: p.id });
  expect((await call("/api/onboarding", "PUT", { emailTips: true }, teamHeaders)).status).toBe(403);
});

it("persists skip and email preferences without allowing manual completion", async () => {
  expect((await prefs({ emailTips: true, dismissed: true })).status).toBe(200);
  expect(await status()).toMatchObject({ emailTips: true, dismissed: true, complete: false });
  await prefs({ dismissed: false });
  expect(await status()).toMatchObject({ emailTips: true, dismissed: false });
  await prefs({ emailTips: false });
  expect((await status()).emailTips).toBe(false);
});

it("sends one welcome only after verification and explicit consent, independent of billing", async () => {
  await prefs({ emailTips: true });
  await env.DB.prepare("UPDATE users SET email_verified = 0 WHERE id = ?").bind(accountId).run();
  const mock = mockBento();
  await onboardingEmails(bentoEnv);
  expect(mock).not.toHaveBeenCalled();
  await env.DB.prepare("UPDATE users SET email_verified = 1 WHERE id = ?").bind(accountId).run();
  await onboardingEmails({ ...bentoEnv, BILLING_ENABLED: "false" });
  await onboardingEmails(bentoEnv);
  expect(sent(mock)).toMatchObject([{ type: "capve_onboarding_welcome", fields: {
    capve_account_id: accountId, capve_onboarding_next_step: "campaign", capve_getting_started_url: "https://capve.app/app/getting-started",
  } }]);
});

it("sends only the currently due reminder after downtime and stops on completion", async () => {
  await prefs({ emailTips: true });
  const now = Date.now();
  await env.DB.prepare("UPDATE account_onboarding SET consent_at = ? WHERE account_id = ?").bind(now - 4 * 86400_000, accountId).run();
  const p = await campaign();
  const id = await click(p.campaign_key);
  const mock = mockBento();
  await onboardingEmails(bentoEnv, now);
  await onboardingEmails(bentoEnv, now);
  expect(sent(mock).map((e) => e.type)).toEqual(["capve_onboarding_reminder_3d"]);
  await convert(id);
  await onboardingEmails(bentoEnv, now);
  await onboardingEmails(bentoEnv, now);
  expect(sent(mock).map((e) => e.type)).toEqual(["capve_onboarding_reminder_3d", "capve_onboarding_completed"]);
});

it("retries failed Bento acceptance and suppresses disabled, opted-out, and dismissed sends", async () => {
  await prefs({ emailTips: true });
  const mock = mockBento().mockResolvedValueOnce(Response.json({ results: 0 }));
  await onboardingEmails(bentoEnv);
  await onboardingEmails(bentoEnv);
  expect(mock).toHaveBeenCalledTimes(2);
  expect(sent(mock)[0].details.event_key).toBe(sent(mock)[1].details.event_key);
  await onboardingEmails({ ...bentoEnv, ONBOARDING_EMAILS_ENABLED: "false" }, Date.now() + 86400_000);
  await prefs({ dismissed: true });
  await onboardingEmails(bentoEnv, Date.now() + 86400_000);
  await prefs({ dismissed: false, emailTips: false });
  await onboardingEmails(bentoEnv, Date.now() + 86400_000);
  expect(mock).toHaveBeenCalledTimes(2);
});

it("serializes overlapping email scans and recovers an expired lease", async () => {
  await prefs({ emailTips: true });
  const mock = mockBento();
  await Promise.all([onboardingEmails(bentoEnv), onboardingEmails(bentoEnv)]);
  expect(mock).toHaveBeenCalledTimes(1);
  await env.DB.prepare("UPDATE onboarding_email_progress SET lease_until = 1, lease_token = 'crashed'").run();
  await onboardingEmails(bentoEnv, Date.now() + 86400_000);
  expect(mock).toHaveBeenCalledTimes(2);
});

it("paginates opted-in accounts so later accounts are not starved", async () => {
  await prefs({ emailTips: true });
  for (let i = 0; i < 4; i++) {
    const extra = await registerTestUser();
    await call("/api/onboarding", "PUT", { emailTips: true }, extra.authHeaders);
  }
  const mock = mockBento();
  await onboardingEmails(bentoEnv);
  expect(mock).toHaveBeenCalledTimes(3);
  await onboardingEmails(bentoEnv);
  expect(mock).toHaveBeenCalledTimes(5);
  await onboardingEmails(bentoEnv);
  expect(mock).toHaveBeenCalledTimes(5);
});

it("supports legacy accounts with no saved preferences", async () => {
  await env.DB.prepare("DELETE FROM account_onboarding WHERE account_id = ?").bind(accountId).run();
  expect(await onboardingStatus(env.DB, accountId)).toMatchObject({ dismissed: false, emailTips: false });
  expect((await prefs({ emailTips: true })).status).toBe(200);
});

it("stores signup consent only for an explicit boolean true", async () => {
  for (const emailTips of [true, false, "true"]) {
    const response = await call("/api/auth/register", "POST", {
      email: `consent-${crypto.randomUUID()}@example.com`, password: "test-password-12", emailTips,
    }, {});
    expect(response.status).toBe(201);
    const { user } = await response.json<{ user: { id: string } }>();
    expect(await onboardingStatus(env.DB, user.id)).toMatchObject({ emailTips: emailTips === true, nextStep: "verify" });
  }
});

it("rejects a mismatched conversion and uses the furthest-along campaign", async () => {
  const first = await campaign();
  const second = await campaign();
  const id = await click(second.campaign_key);
  expect((await status()).campaignId).toBe(second.id);
  await convert(id);
  await env.DB.prepare("UPDATE conversions SET program_id = ? WHERE click_id = ?").bind(first.id, id).run();
  expect((await status()).complete).toBe(false);
});

it("keeps the setup guide available when the billing trial expires", async () => {
  await env.DB.prepare("UPDATE account_billing SET trial_ends_at = 1 WHERE account_id = ?").bind(accountId).run();
  const { default: worker } = await import("../worker");
  const { createExecutionContext, waitOnExecutionContext } = await import("cloudflare:test");
  const ctx = createExecutionContext();
  const response = await worker.fetch(new Request("http://localhost/api/onboarding", { headers }),
    { ...bentoEnv, BILLING_ENABLED: "true" }, ctx);
  await waitOnExecutionContext(ctx);
  expect(response.status).toBe(200);
});

it("uses renewed consent when it changes while an earlier Bento request is pending", async () => {
  await prefs({ emailTips: true });
  const other = await registerTestUser();
  expect((await call("/api/onboarding", "PUT", { emailTips: true }, other.authHeaders)).status).toBe(200);
  await env.DB.prepare("UPDATE account_onboarding SET consent_at = ? WHERE email_tips = 1")
    .bind(Date.now() - 4 * 86400_000).run();
  const accounts = await env.DB.prepare("SELECT account_id FROM account_onboarding WHERE email_tips = 1 ORDER BY account_id")
    .all<{ account_id: string }>();
  const laterId = accounts.results[1].account_id;
  const laterHeaders = laterId === accountId ? headers : other.authHeaders;
  const mock = mockBento().mockImplementationOnce(async () => {
    // The scan already read both accounts, but has not yet accepted this first request.
    expect((await call("/api/onboarding", "PUT", { emailTips: false }, laterHeaders)).status).toBe(200);
    expect((await call("/api/onboarding", "PUT", { emailTips: true }, laterHeaders)).status).toBe(200);
    return Response.json({ results: 1 });
  });
  await onboardingEmails(bentoEnv);
  expect(sent(mock)).toMatchObject([
    { type: "capve_onboarding_reminder_3d", fields: { capve_account_id: accounts.results[0].account_id } },
    { type: "capve_onboarding_welcome", fields: { capve_account_id: laterId } },
  ]);
});
