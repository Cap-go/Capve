import { Hono } from "hono";
import type { Env, User } from "../types";
import type { AccessibleAccount } from "../types-ops";
import {
  readBearerToken,
  resolveIdentity,
  resolveOperator,
  resolveSession,
} from "../lib/access";
import {
  accountContextCookie,
  readAccountContext,
} from "../lib/account-context";
import { getUserById } from "../db/queries";
import { isSecureRequest } from "../lib/auth";
import { id } from "../lib/utils";

export async function listAccessibleAccounts(
  db: D1Database,
  user: User,
): Promise<AccessibleAccount[]> {
  const own: AccessibleAccount = {
    account_id: user.id,
    email: user.email,
    name: user.name,
    role: "owner",
  };
  if (user.email_verified !== 1) return [own];
  const { results } = await db
    .prepare(
      `SELECT u.id AS account_id, u.email, u.name, tm.role
    FROM team_members tm JOIN users u ON u.id = tm.owner_user_id
    WHERE tm.email = ? AND tm.accepted_at IS NOT NULL AND u.id != ?
    ORDER BY tm.accepted_at, tm.id`,
    )
    .bind(user.email, user.id)
    .all<AccessibleAccount>();
  return [own, ...(results ?? [])];
}

const accounts = new Hono<{ Bindings: Env }>();
// Account context is a browser-session control, never an API-token privilege.
accounts.use("*", async (c, next) => {
  if (
    !["accounts", "switch-account", "impersonate", "stop-impersonation"].some(
      (path) => c.req.path === `/api/auth/${path}`,
    )
  )
    return next();
  if (readBearerToken(c.req.header("authorization")))
    return c.json({ error: "Use your dashboard session" }, 403);
  const origin = c.req.header("origin");
  if (origin && origin !== new URL(c.req.url).origin)
    return c.json({ error: "Forbidden origin" }, 403);
  if (
    c.req.method === "POST" &&
    !c.req.header("content-type")?.startsWith("application/json")
  ) {
    return c.json({ error: "JSON required" }, 415);
  }
  await next();
});

accounts.get("/accounts", async (c) => {
  const user = await resolveIdentity(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  return c.json({ accounts: await listAccessibleAccounts(c.env.DB, user) });
});

accounts.post("/switch-account", async (c) => {
  const user = await resolveIdentity(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const context = await readAccountContext(c, user);
  if (context?.kind === "impersonation")
    return c.json(
      { error: "Exit impersonation before switching accounts" },
      403,
    );
  const body: unknown = await c.req.json().catch(() => null);
  if (
    !body ||
    typeof body !== "object" ||
    !("account_id" in body) ||
    typeof body.account_id !== "string"
  ) {
    return c.json({ error: "account_id required" }, 400);
  }
  const account = (await listAccessibleAccounts(c.env.DB, user)).find(
    (item) => item.account_id === body.account_id,
  );
  if (!account) return c.json({ error: "Account not accessible" }, 403);
  c.header(
    "Set-Cookie",
    await accountContextCookie(
      c.env,
      user,
      { kind: "account", account_id: account.account_id },
      isSecureRequest(new URL(c.req.url)),
    ),
  );
  return c.json({ ok: true });
});

accounts.post("/impersonate", async (c) => {
  const user = await resolveIdentity(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  if (user.email_verified !== 1 || user.is_platform_admin !== 1)
    return c.json({ error: "Forbidden" }, 403);
  const current = await resolveOperator(c);
  if (!current || current.impersonating)
    return c.json({ error: "Already impersonating" }, 403);
  const body: unknown = await c.req.json().catch(() => null);
  if (
    !body ||
    typeof body !== "object" ||
    !("account_id" in body) ||
    typeof body.account_id !== "string"
  ) {
    return c.json({ error: "account_id required" }, 400);
  }
  if (body.account_id === user.id)
    return c.json(
      { error: "Use the account switcher for your own account" },
      400,
    );
  const target = await getUserById(c.env.DB, body.account_id);
  if (!target) return c.json({ error: "Account not found" }, 404);
  await c.env.DB.prepare(
    "INSERT INTO account_access_log (id, actor_user_id, account_id, action, created_at) VALUES (?, ?, ?, 'impersonate', ?)",
  )
    .bind(id("aud"), user.id, target.id, Date.now())
    .run();
  c.header(
    "Set-Cookie",
    await accountContextCookie(
      c.env,
      user,
      {
        kind: "impersonation",
        account_id: target.id,
        return_account_id: current.account_id,
      },
      isSecureRequest(new URL(c.req.url)),
    ),
  );
  return c.json({ ok: true });
});

accounts.post("/stop-impersonation", async (c) => {
  const user = await resolveIdentity(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const context = await readAccountContext(c, user);
  const previous =
    context?.kind === "impersonation"
      ? context.return_account_id
      : (context?.account_id ?? user.id);
  const restored = await resolveSession(c.env.DB, user, previous);
  if (context?.kind === "impersonation") {
    await c.env.DB.prepare(
      "INSERT INTO account_access_log (id, actor_user_id, account_id, action, created_at) VALUES (?, ?, ?, 'stop_impersonation', ?)",
    )
      .bind(id("aud"), user.id, context.account_id, Date.now())
      .run();
  }
  c.header(
    "Set-Cookie",
    await accountContextCookie(
      c.env,
      user,
      { kind: "account", account_id: restored.account_id },
      isSecureRequest(new URL(c.req.url)),
    ),
  );
  return c.json({ ok: true });
});

export { accounts };
