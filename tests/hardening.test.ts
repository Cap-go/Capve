import { env, fetchMock, SELF } from "cloudflare:test";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createAuthToken } from "../worker/db/auth";
import { sendEmail } from "../worker/lib/email";
import { csvEscape } from "../worker/lib/metrics";
import { isRateLimited } from "../worker/lib/rate-limit";
import type { Env } from "../worker/types";
import { cookieFrom, registerTestUser, settle } from "./helpers";
import { initSql } from "./schema";

const hits: string[] = [];

async function json<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

function api(path: string, headers: Record<string, string>, method = "GET", body?: unknown) {
  return SELF.fetch(`http://localhost${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function create<T>(headers: Record<string, string>, path: string, body: unknown): Promise<T> {
  const res = await api(path, headers, "POST", body);
  expect(res.status).toBe(201);
  return json<T>(res);
}

async function userId(email: string): Promise<string> {
  const row = await env.DB.prepare("SELECT id FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: string }>();
  return row!.id;
}

/** Campaign → offer path (payout 50.00) → affiliate; returns a fresh click id. */
async function campaignWithClick(headers: Record<string, string>, networkId?: string) {
  const { offer } = await create<{ offer: { id: string } }>(headers, "/api/entities/offers", {
    name: "Offer",
    url: "https://offer.example.com/?cid={clickid}",
    payout_cents: 5000,
    network_id: networkId,
  });
  const { program } = await create<{ program: { id: string } }>(headers, "/api/programs", {
    name: `Hardening ${crypto.randomUUID().slice(0, 6)}`,
  });
  await create(headers, `/api/programs/${program.id}/paths`, {
    name: "Offer",
    flow_type: "offer",
    offer_id: offer.id,
  });
  const { affiliate } = await create<{ affiliate: { code: string } }>(
    headers,
    `/api/programs/${program.id}/affiliates`,
    { name: "Partner" },
  );
  const res = await SELF.fetch(`http://localhost/r/${affiliate.code}`, { redirect: "manual" });
  const clickId = new URL(res.headers.get("Location")!).searchParams.get("click_id")!;
  return { program, clickId };
}

describe("security hardening", () => {
  beforeAll(async () => {
    for (const statement of initSql.split(";").map((p) => p.trim()).filter(Boolean)) {
      await env.DB.prepare(statement).run();
    }
    fetchMock.activate();
    fetchMock
      .get("https://hook.example.com")
      .intercept({
        path: (path) => {
          hits.push(path);
          return true;
        },
      })
      .reply(200, "ok")
      .persist();
  });

  afterAll(() => {
    fetchMock.deactivate();
  });

  describe("email verification", () => {
    it("registers unverified and verifies with the emailed token", async () => {
      const user = await registerTestUser(undefined, { verified: false });
      const me = await json<{ user: { email_verified: boolean } }>(
        await api("/api/auth/me", user.authHeaders),
      );
      expect(me.user.email_verified).toBe(false);

      const resend = await api("/api/auth/resend-verification", user.authHeaders, "POST");
      expect(resend.status).toBe(200);
      const tokens = await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM auth_tokens WHERE user_id = ? AND kind = 'verify'",
      )
        .bind(await userId(user.email))
        .first<{ n: number }>();
      // Resending replaces the previous link.
      expect(tokens?.n).toBe(1);

      const bad = await api("/api/auth/verify-email", {}, "POST", { token: "nope" });
      expect(bad.status).toBe(400);

      await createAuthToken(env.DB, await userId(user.email), "verify", "tok-1", Date.now() + 60_000);
      const ok = await api("/api/auth/verify-email", {}, "POST", { token: "tok-1" });
      expect(ok.status).toBe(200);
      const after = await json<{ user: { email_verified: boolean } }>(
        await api("/api/auth/me", user.authHeaders),
      );
      expect(after.user.email_verified).toBe(true);

      const reused = await api("/api/auth/verify-email", {}, "POST", { token: "tok-1" });
      expect(reused.status).toBe(400);
    });

    it("hides and blocks invites for unverified emails", async () => {
      const owner = await registerTestUser();
      const squatter = await registerTestUser(undefined, { verified: false });
      await create(owner.authHeaders, "/api/ops/team", { email: squatter.email, role: "admin" });

      const listed = await json<{ invites: unknown[]; verification_required?: boolean }>(
        await api("/api/ops/invites", squatter.authHeaders),
      );
      expect(listed.invites).toHaveLength(0);
      expect(listed.verification_required).toBe(true);

      const inviteId = (
        await env.DB.prepare("SELECT id FROM team_members WHERE email = ?")
          .bind(squatter.email)
          .first<{ id: string }>()
      )!.id;
      const accept = await api(`/api/ops/invites/${inviteId}/accept`, squatter.authHeaders, "POST");
      expect(accept.status).toBe(403);
      const decline = await api(`/api/ops/invites/${inviteId}/decline`, squatter.authHeaders, "POST");
      expect(decline.status).toBe(403);
    });
  });

  describe("session revocation", () => {
    it("revokes sessions on password reset and on sign out everywhere", async () => {
      const user = await registerTestUser();
      expect((await api("/api/programs", user.authHeaders)).status).toBe(200);

      await createAuthToken(env.DB, await userId(user.email), "reset", "reset-1", Date.now() + 60_000);
      const reset = await api("/api/auth/reset-password", {}, "POST", {
        token: "reset-1",
        password: "new-password-123",
      });
      expect(reset.status).toBe(200);
      // The old cookie is dead, the one issued by the reset works.
      expect((await api("/api/programs", user.authHeaders)).status).toBe(401);
      const fresh = { Cookie: `capve_session=${encodeURIComponent(cookieFrom(reset, "capve_session")!)}` };
      expect((await api("/api/programs", fresh)).status).toBe(200);

      const login = await api("/api/auth/login", { "Content-Type": "application/json" }, "POST", {
        email: user.email,
        password: "new-password-123",
      });
      const other = { Cookie: `capve_session=${encodeURIComponent(cookieFrom(login, "capve_session")!)}` };
      expect((await api("/api/programs", other)).status).toBe(200);

      const all = await api("/api/auth/logout-all", fresh, "POST");
      expect(all.status).toBe(200);
      expect((await api("/api/programs", fresh)).status).toBe(401);
      expect((await api("/api/programs", other)).status).toBe(401);
    });
  });

  describe("incoming postback key", () => {
    it("caps keyless payouts and rejects keyless postbacks when enforced", async () => {
      const owner = await registerTestUser();
      const { program, clickId } = await campaignWithClick(owner.authHeaders);

      const { postback_key } = await json<{
        postback_key: { key: string; required: boolean; postback_url: string };
      }>(await api("/api/ops/postback-key", owner.authHeaders));
      expect(postback_key.key).toMatch(/^[0-9a-f]{32}$/);
      expect(postback_key.required).toBe(false);
      expect(postback_key.postback_url).toContain(`&key=${postback_key.key}`);

      const { tracking } = await json<{ tracking: { postback_url: string } }>(
        await api(`/api/programs/${program.id}/tracking`, owner.authHeaders),
      );
      expect(tracking.postback_url).toContain(`&key=${postback_key.key}`);

      // No key: payout capped to the offer payout (50.00).
      const capped = await json<{ conversion: { amount_cents: number } }>(
        await SELF.fetch(`http://localhost/click?cnv_id=${clickId}&payout=9999&tx_id=a`),
      );
      expect(capped.conversion.amount_cents).toBe(5000);

      // Valid key: payout trusted.
      const trusted = await json<{ conversion: { amount_cents: number } }>(
        await SELF.fetch(
          `http://localhost/click?cnv_id=${clickId}&payout=120&tx_id=b&key=${postback_key.key}`,
        ),
      );
      expect(trusted.conversion.amount_cents).toBe(12000);

      const enforced = await api("/api/ops/postback-key", owner.authHeaders, "PUT", { required: true });
      expect(enforced.status).toBe(200);
      expect((await SELF.fetch(`http://localhost/click?cnv_id=${clickId}&tx_id=c`)).status).toBe(403);
      expect(
        (await SELF.fetch(`http://localhost/click?cnv_id=${clickId}&tx_id=c&key=wrong`)).status,
      ).toBe(403);
      expect(
        (await SELF.fetch(`http://localhost/click?cnv_id=${clickId}&tx_id=c&key=${postback_key.key}`))
          .status,
      ).toBe(200);

      const rotated = await json<{ postback_key: { key: string; required: boolean } }>(
        await api("/api/ops/postback-key/rotate", owner.authHeaders, "POST"),
      );
      expect(rotated.postback_key.key).not.toBe(postback_key.key);
      expect(rotated.postback_key.required).toBe(true);
      expect(
        (await SELF.fetch(`http://localhost/click?cnv_id=${clickId}&tx_id=d&key=${postback_key.key}`))
          .status,
      ).toBe(403);
    });

    it("hides the key from viewers", async () => {
      const owner = await registerTestUser();
      const viewer = await registerTestUser();
      const { program } = await campaignWithClick(owner.authHeaders);
      await create(owner.authHeaders, "/api/ops/team", { email: viewer.email, role: "viewer" });
      const { invites } = await json<{ invites: Array<{ id: string }> }>(
        await api("/api/ops/invites", viewer.authHeaders),
      );
      await api(`/api/ops/invites/${invites[0]!.id}/accept`, viewer.authHeaders, "POST");

      expect((await api("/api/ops/postback-key", viewer.authHeaders)).status).toBe(403);
      const { tracking } = await json<{ tracking: { postback_url: string } }>(
        await api(`/api/programs/${program.id}/tracking`, viewer.authHeaders),
      );
      expect(tracking.postback_url).not.toContain("key=");
    });
  });

  describe("outgoing postbacks and triggers", () => {
    it("fires source/network postbacks once, on becoming approved", async () => {
      const owner = await registerTestUser();
      const { network } = await create<{ network: { id: string } }>(
        owner.authHeaders,
        "/api/entities/networks",
        { name: "Net" },
      );
      const { program, clickId } = await campaignWithClick(owner.authHeaders, network.id);
      await create(owner.authHeaders, "/api/postbacks", {
        network_id: network.id,
        url: "https://hook.example.com/net?s={status}&p={payout}",
      });
      await create(owner.authHeaders, "/api/postbacks", {
        campaign_id: program.id,
        url: "https://hook.example.com/camp?s={status}",
      });
      const { postback_key } = await json<{ postback_key: { key: string } }>(
        await api("/api/ops/postback-key", owner.authHeaders),
      );
      const pb = (query: string) =>
        SELF.fetch(`http://localhost/click?cnv_id=${clickId}&key=${postback_key.key}&${query}`);

      hits.length = 0;
      await pb("cnv_status=pending&payout=10");
      await vi.waitFor(() => expect(hits).toEqual(["/camp?s=pending"]));
      await settle();
      expect(hits).toEqual(["/camp?s=pending"]);

      hits.length = 0;
      await pb("cnv_status=sale&payout=10");
      await vi.waitFor(() => expect(hits.sort()).toEqual(["/camp?s=sale", "/net?p=10&s=sale"]));
      await settle();
      expect(hits.sort()).toEqual(["/camp?s=sale", "/net?p=10&s=sale"]);

      // Payout update on an approved conversion: campaign postback only.
      hits.length = 0;
      await pb("cnv_status=sale&payout=20");
      await vi.waitFor(() => expect(hits).toEqual(["/camp?s=sale"]));
      await settle();
      expect(hits).toEqual(["/camp?s=sale"]);

      hits.length = 0;
      await pb("cnv_status=hold&payout=20");
      await vi.waitFor(() => expect(hits).toEqual(["/camp?s=hold"]));
      await settle();
      expect(hits).toEqual(["/camp?s=hold"]);
    });

    it("URL-encodes macro values in trigger webhooks", async () => {
      const owner = await registerTestUser();
      const { program, clickId } = await campaignWithClick(owner.authHeaders);
      await create(owner.authHeaders, "/api/ops/triggers", {
        name: "Hook",
        event: "conversion",
        program_id: program.id,
        action_url: "https://hook.example.com/trig?o={order_id}&s={status}",
      });
      hits.length = 0;
      await SELF.fetch(
        `http://localhost/click?cnv_id=${clickId}&tx_id=${encodeURIComponent("a&admin=1")}`,
      );
      await vi.waitFor(() => expect(hits).toContain("/trig?o=a%26admin%3D1&s=lead"));
      await settle();
      expect(hits).toContain("/trig?o=a%26admin%3D1&s=lead");
    });
  });

  describe("helpers", () => {
    it("escapes CSV formulas and carriage returns", () => {
      expect(csvEscape("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
      expect(csvEscape("+1")).toBe("'+1");
      expect(csvEscape("@SUM(A1)")).toBe("'@SUM(A1)");
      expect(csvEscape("-cmd")).toBe("'-cmd");
      expect(csvEscape("\tx")).toBe("'\tx");
      expect(csvEscape("\rx")).toBe(`"'\rx"`);
      expect(csvEscape("a\rb")).toBe(`"a\rb"`);
      expect(csvEscape("=1,2")).toBe(`"'=1,2"`);
      expect(csvEscape("-12.50")).toBe("-12.50");
      expect(csvEscape(-3)).toBe("-3");
      expect(csvEscape("plain")).toBe("plain");
    });

    it("rate limits by IP and email and no-ops without bindings", async () => {
      const request = new Request("http://localhost/api/auth/login", {
        headers: { "cf-connecting-ip": "203.0.113.9" },
      });
      const keys: string[] = [];
      const limiter = (allow: boolean) => ({
        limit: async ({ key }: { key: string }) => {
          keys.push(key);
          return { success: allow };
        },
      });
      const base = { ...env } as unknown as Env;
      expect(await isRateLimited(base, request, "login", "a@b.co")).toBe(false);

      const ok = { ...base, AUTH_IP_LIMITER: limiter(true), AUTH_EMAIL_LIMITER: limiter(true) } as Env;
      expect(await isRateLimited(ok, request, "login", "A@b.co")).toBe(false);
      expect(keys).toEqual(["login:ip:203.0.113.9", "login:email:a@b.co"]);

      const blocked = { ...base, AUTH_IP_LIMITER: limiter(true), AUTH_EMAIL_LIMITER: limiter(false) } as Env;
      expect(await isRateLimited(blocked, request, "login", "a@b.co")).toBe(true);
    });

    it("prints email bodies (auth links) only on local dev installs", async () => {
      const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const mail = { to: "a@b.co", subject: "Reset", text: "secret-link", html: "" };

      await sendEmail({ APP_URL: "https://capve.app" } as Env, mail);
      expect(log).not.toHaveBeenCalled();
      expect(JSON.stringify(warn.mock.calls)).not.toContain("secret-link");

      await sendEmail({ APP_URL: "http://localhost:5173" } as Env, mail);
      expect(JSON.stringify(log.mock.calls)).toContain("secret-link");
      log.mockRestore();
      warn.mockRestore();
    });
  });
});
