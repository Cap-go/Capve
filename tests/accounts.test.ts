import { SignJWT } from "jose";
import { authSecret } from "../worker/lib/session";
import { createApiToken } from "../worker/db/api-tokens";
import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { cookieFrom, registerTestUser } from "./helpers";
import { initSql } from "./schema";
import {
  accountContextCookie,
  ACCOUNT_CONTEXT_COOKIE,
} from "../worker/lib/account-context";
import { getUserByEmail } from "../worker/db/queries";

async function call(
  path: string,
  headers: Record<string, string>,
  method = "GET",
  body?: unknown,
) {
  return SELF.fetch(`http://localhost${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function me(headers: Record<string, string>) {
  return (await (await call("/api/auth/me", headers)).json()) as {
    user: {
      id: string;
      email: string;
      account_id: string;
      account_email: string;
      role: string;
      impersonating: boolean;
      is_platform_admin: boolean;
    } | null;
  };
}
function contextHeaders(headers: Record<string, string>, response: Response) {
  const token = cookieFrom(response, ACCOUNT_CONTEXT_COOKIE);
  if (!token) throw new Error("Missing account context cookie");
  return {
    ...headers,
    Cookie: `${headers.Cookie}; ${ACCOUNT_CONTEXT_COOKIE}=${encodeURIComponent(token)}`,
  };
}
async function member(
  owner: string,
  email: string,
  role: "admin" | "viewer",
  accepted = true,
) {
  await env.DB.prepare(
    "INSERT INTO team_members (id, owner_user_id, email, role, created_at, accepted_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(
      crypto.randomUUID(),
      owner,
      email,
      role,
      Date.now(),
      accepted ? Date.now() : null,
    )
    .run();
}
async function program(headers: Record<string, string>, name: string) {
  const res = await call("/api/programs", headers, "POST", {
    name,
    destination_url: "https://merchant.example/offer",
  });
  expect(res.status).toBe(201);
  return (await res.json()) as { program: { id: string } };
}

describe("account context", () => {
  beforeAll(async () => {
    for (const sql of initSql
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean))
      await env.DB.prepare(sql).run();
  });

  it("switches between own and accepted accounts, persists, and checks live roles", async () => {
    const person = await registerTestUser();
    const one = await registerTestUser();
    const two = await registerTestUser();
    const pending = await registerTestUser();
    const ownId = (await me(person.authHeaders)).user!.id;
    const oneId = (await me(one.authHeaders)).user!.id;
    const twoId = (await me(two.authHeaders)).user!.id;
    const pendingId = (await me(pending.authHeaders)).user!.id;
    await program(person.authHeaders, "Personal");
    await program(one.authHeaders, "First team");
    const second = await program(two.authHeaders, "Second team");
    await member(oneId, person.email, "viewer");
    await member(twoId, person.email, "admin");
    await member(pendingId, person.email, "admin", false);
    const listed = (await (
      await call("/api/auth/accounts", person.authHeaders)
    ).json()) as { accounts: { account_id: string }[] };
    expect(listed.accounts[0]?.account_id).toBe(ownId);
    expect(listed.accounts).toHaveLength(3);
    expect(listed.accounts.map((item) => item.account_id)).toEqual(expect.arrayContaining([ownId, oneId, twoId]));
    expect(
      (
        await call("/api/auth/switch-account", person.authHeaders, "POST", {
          account_id: pendingId,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call("/api/auth/switch-account", person.authHeaders, "POST", {
          account_id: "unknown",
        })
      ).status,
    ).toBe(403);
    const switched = await call(
      "/api/auth/switch-account",
      person.authHeaders,
      "POST",
      { account_id: twoId },
    );
    expect(switched.status).toBe(200);
    const headers = contextHeaders(person.authHeaders, switched);
    expect((await me(headers)).user).toMatchObject({
      id: ownId,
      account_id: twoId,
      role: "admin",
      impersonating: false,
    });
    const rows = (await (await call("/api/programs", headers)).json()) as {
      programs: { id: string }[];
    };
    expect(rows.programs.map((item) => item.id)).toEqual([second.program.id]);
    expect(
      (
        await call(
          `/api/programs/${second.program.id}`,
          { ...headers, "X-Capve-Account": ownId },
          "PATCH",
          { name: "Wrong account" },
        )
      ).status,
    ).toBe(409);
    await env.DB.prepare(
      "UPDATE team_members SET role = 'viewer' WHERE owner_user_id = ? AND email = ?",
    )
      .bind(twoId, person.email)
      .run();
    expect((await programWrite(headers)).status).toBe(403);
    await env.DB.prepare(
      "DELETE FROM team_members WHERE owner_user_id = ? AND email = ?",
    )
      .bind(twoId, person.email)
      .run();
    expect((await me(headers)).user?.account_id).toBe(ownId);
    const own = contextHeaders(
      person.authHeaders,
      await call("/api/auth/switch-account", person.authHeaders, "POST", {
        account_id: ownId,
      }),
    );
    expect((await me(own)).user).toMatchObject({
      account_id: ownId,
      role: "owner",
    });
    expect(
      (
        (await (await call("/api/programs", own)).json()) as {
          programs: { name: string }[];
        }
      ).programs[0]?.name,
    ).toBe("Personal");
  });

  it("does not allow unverified or pending memberships and rejects cross-site controls", async () => {
    const person = await registerTestUser(undefined, { verified: false });
    const owner = await registerTestUser();
    const ownerId = (await me(owner.authHeaders)).user!.id;
    await member(ownerId, person.email, "admin");
    expect(
      (
        await call("/api/auth/switch-account", person.authHeaders, "POST", {
          account_id: ownerId,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call(
          "/api/auth/switch-account",
          { ...person.authHeaders, Origin: "https://foreign.example" },
          "POST",
          { account_id: ownerId },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await call("/api/auth/accounts", {
          Authorization: "Bearer capve_invalid",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call("/api/auth/impersonate", person.authHeaders, "POST", {
          account_id: ownerId,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call("/api/auth/switch-account", person.authHeaders, "POST", {
          account_id: 123,
        })
      ).status,
    ).toBe(400);
  });

  it("keeps the admin identity separate, restores the previous account, and records support access", async () => {
    const admin = await registerTestUser();
    const target = await registerTestUser();
    const team = await registerTestUser();
    const adminId = (await me(admin.authHeaders)).user!.id;
    const targetId = (await me(target.authHeaders)).user!.id;
    const teamId = (await me(team.authHeaders)).user!.id;
    await env.DB.prepare("UPDATE users SET is_platform_admin = 1 WHERE id = ?")
      .bind(adminId)
      .run();
    await member(teamId, admin.email, "viewer");
    const switched = contextHeaders(
      admin.authHeaders,
      await call("/api/auth/switch-account", admin.authHeaders, "POST", {
        account_id: teamId,
      }),
    );
    const started = await call("/api/auth/impersonate", switched, "POST", {
      account_id: targetId,
    });
    expect(started.status).toBe(200);
    const headers = contextHeaders(admin.authHeaders, started);
    expect((await me(headers)).user).toMatchObject({
      id: adminId,
      email: admin.email,
      account_id: targetId,
      account_email: target.email,
      role: "owner",
      impersonating: true,
      is_platform_admin: false,
    });
    await program(headers, "Support-created campaign");
    expect((await call("/api/admin/users", headers)).status).toBe(403);
    expect(
      (await call("/api/tokens", headers, "POST", { name: "Persistence" }))
        .status,
    ).toBe(403);
    expect(
      (
        await call("/api/auth/impersonate", headers, "POST", {
          account_id: teamId,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call("/api/auth/switch-account", headers, "POST", {
          account_id: adminId,
        })
      ).status,
    ).toBe(403);
    const stopped = contextHeaders(
      admin.authHeaders,
      await call("/api/auth/stop-impersonation", headers, "POST", {}),
    );
    expect((await me(stopped)).user).toMatchObject({
      account_id: teamId,
      impersonating: false,
      role: "viewer",
      is_platform_admin: true,
    });
    const stoppedAgain = contextHeaders(
      stopped,
      await call("/api/auth/stop-impersonation", stopped, "POST", {}),
    );
    expect((await me(stoppedAgain)).user?.account_id).toBe(teamId);
    const audit = await env.DB.prepare(
      "SELECT actor_user_id, account_id, action FROM account_access_log WHERE actor_user_id = ? ORDER BY created_at",
    )
      .bind(adminId)
      .all();
    expect(audit.results).toEqual([
      { actor_user_id: adminId, account_id: targetId, action: "impersonate" },
      {
        actor_user_id: adminId,
        account_id: targetId,
        action: "stop_impersonation",
      },
    ]);
    const reset = await call("/api/auth/logout", headers, "POST");
    expect(
      reset.headers
        .getSetCookie()
        .some(
          (cookie) =>
            cookie.startsWith(`${ACCOUNT_CONTEXT_COOKIE}=`) &&
            cookie.includes("Max-Age=0"),
        ),
    ).toBe(true);
  });

  it("rejects expired support contexts and never grants API-token impersonation", async () => {
    const admin = await registerTestUser();
    const target = await registerTestUser();
    const adminId = (await me(admin.authHeaders)).user!.id;
    const targetId = (await me(target.authHeaders)).user!.id;
    await env.DB.prepare("UPDATE users SET is_platform_admin = 1 WHERE id = ?")
      .bind(adminId)
      .run();
    const token = await createApiToken(env.DB, adminId, "Admin script");
    if (!token) throw new Error("Missing API token");
    const bearer = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token.token}`,
    };
    expect((await call("/api/admin/users", bearer)).status).toBe(200);
    expect(
      (
        await call("/api/auth/impersonate", bearer, "POST", {
          account_id: targetId,
        })
      ).status,
    ).toBe(403);
    const expired = await new SignJWT({
      kind: "impersonation",
      account_id: targetId,
      return_account_id: adminId,
      sv: 0,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setAudience("capve-account-context")
      .setSubject(adminId)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 5)
      .sign(authSecret(env));
    const expiredHeaders = {
      ...admin.authHeaders,
      Cookie: `${admin.authHeaders.Cookie}; ${ACCOUNT_CONTEXT_COOKIE}=${expired}`,
    };
    expect((await me(expiredHeaders)).user).toMatchObject({
      account_id: adminId,
      impersonating: false,
    });
    await env.DB.prepare("UPDATE users SET email_verified = 0 WHERE id = ?")
      .bind(adminId)
      .run();
    expect(
      (
        await call("/api/auth/impersonate", admin.authHeaders, "POST", {
          account_id: targetId,
        })
      ).status,
    ).toBe(403);
  });

  it("binds support cookies to the actor and session version and rechecks admin access", async () => {
    const admin = await registerTestUser();
    const target = await registerTestUser();
    const stranger = await registerTestUser();
    const adminId = (await me(admin.authHeaders)).user!.id;
    const targetId = (await me(target.authHeaders)).user!.id;
    await env.DB.prepare("UPDATE users SET is_platform_admin = 1 WHERE id = ?")
      .bind(adminId)
      .run();
    const start = await call(
      "/api/auth/impersonate",
      admin.authHeaders,
      "POST",
      { account_id: targetId },
    );
    const headers = contextHeaders(admin.authHeaders, start);
    const stolen = contextHeaders(stranger.authHeaders, start);
    expect((await me(stolen)).user?.account_id).not.toBe(targetId);
    const context = cookieFrom(start, ACCOUNT_CONTEXT_COOKIE)!;
    expect(
      (await me({ Cookie: `capve_session=${encodeURIComponent(context)}` }))
        .user,
    ).toBeNull();
    const user = await getUserByEmail(env.DB, admin.email);
    if (!user) throw new Error("Missing admin");
    const stale = await accountContextCookie(
      env,
      { ...user, session_version: 9 },
      {
        kind: "impersonation",
        account_id: targetId,
        return_account_id: adminId,
      },
      false,
    );
    expect(
      (
        await me({
          ...admin.authHeaders,
          Cookie: `${admin.authHeaders.Cookie}; ${stale.split(";")[0]}`,
        })
      ).user?.account_id,
    ).toBe(adminId);
    await env.DB.prepare("UPDATE users SET is_platform_admin = 0 WHERE id = ?")
      .bind(adminId)
      .run();
    expect((await me(headers)).user).toBeNull();
    expect(
      (await call("/api/auth/stop-impersonation", headers, "POST", {})).status,
    ).toBe(200);
    await env.DB.prepare(
      "UPDATE users SET session_version = session_version + 1 WHERE id = ?",
    )
      .bind(adminId)
      .run();
    expect((await me(headers)).user).toBeNull();
  });
});

function programWrite(headers: Record<string, string>) {
  return call("/api/programs", headers, "POST", {
    name: "Forbidden",
    destination_url: "https://merchant.example",
  });
}
