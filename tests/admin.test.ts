import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { createAuthToken } from "../worker/db/auth";
import { cookieFrom, registerTestUser } from "./helpers";
import { initSql } from "./schema";

const ADMIN_EMAIL = "martindonadieu@gmail.com";

async function registerAdmin() {
  const res = await SELF.fetch("http://localhost/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: "test-password-12", name: "Martin" }),
  });
  const session = cookieFrom(res, "capve_session");
  return {
    res,
    authHeaders: session
      ? { "Content-Type": "application/json", Cookie: `capve_session=${encodeURIComponent(session)}` }
      : null,
  };
}

describe("platform admin", () => {
  beforeAll(async () => {
    const statements = initSql
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean);
    for (const statement of statements) {
      await env.DB.prepare(statement).run();
    }
    await env.DB.exec(`DELETE FROM auth_tokens; DELETE FROM users;`);
  });

  it("grants platform admin to PLATFORM_ADMIN_EMAILS only after email verification", async () => {
    const { res, authHeaders } = await registerAdmin();
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      user: { is_platform_admin: boolean; email: string; email_verified: boolean };
    };
    expect(body.user.email).toBe(ADMIN_EMAIL);
    // Registering the admin email is not enough: anyone could do that.
    expect(body.user.is_platform_admin).toBe(false);
    expect(body.user.email_verified).toBe(false);
    const blocked = await SELF.fetch("http://localhost/api/admin/overview", { headers: authHeaders! });
    expect(blocked.status).toBe(403);

    const user = await env.DB.prepare("SELECT id FROM users WHERE email = ?")
      .bind(ADMIN_EMAIL)
      .first<{ id: string }>();
    await createAuthToken(env.DB, user!.id, "verify", "admin-verify-token", Date.now() + 60_000);
    const verify = await SELF.fetch("http://localhost/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "admin-verify-token" }),
    });
    expect(verify.status).toBe(200);

    const me = (await (
      await SELF.fetch("http://localhost/api/auth/me", { headers: authHeaders! })
    ).json()) as { user: { is_platform_admin: boolean; email_verified: boolean } };
    expect(me.user.email_verified).toBe(true);
    expect(me.user.is_platform_admin).toBe(true);
  });

  it("returns platform overview for platform admins", async () => {
    // Verified admin email; signing in grants platform admin.
    await registerTestUser(ADMIN_EMAIL);
    const res = await SELF.fetch("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: "test-password-12" }),
    });
    const session = cookieFrom(res, "capve_session");
    const authHeaders = { Cookie: `capve_session=${encodeURIComponent(session!)}` };
    const overviewRes = await SELF.fetch("http://localhost/api/admin/overview", {
      headers: authHeaders,
    });
    expect(overviewRes.status).toBe(200);
    const body = (await overviewRes.json()) as { overview: { users: number } };
    expect(body.overview.users).toBeGreaterThan(0);
  });

  it("blocks non-admin users from admin APIs", async () => {
    const { authHeaders } = await registerTestUser();
    const res = await SELF.fetch("http://localhost/api/admin/overview", { headers: authHeaders });
    expect(res.status).toBe(403);
  });
});
