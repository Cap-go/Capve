import { HTTPException } from "hono/http-exception";
import type { Context } from "hono";
import type { Env, User } from "../types";
import type { SessionUser, TeamRole } from "../types-ops";
import { findUserIdByApiToken } from "../db/api-tokens";
import { findTeamMembership } from "../db/ops";
import { getUserById } from "../db/queries";
import { readAccountContext } from "./account-context";
import { readSessionCookie, verifySession } from "./session";

export async function resolveSession(
  db: D1Database,
  user: User,
  accountId?: string,
): Promise<SessionUser> {
  // Email-matched privileges (platform admin, team membership) need a verified email.
  const verified = user.email_verified === 1;
  const is_platform_admin = verified && user.is_platform_admin === 1;
  const membership =
    verified && accountId !== user.id
      ? await findTeamMembership(db, user.email, accountId)
      : null;
  if (membership) {
    return {
      id: user.id,
      email: user.email,
      role: membership.role,
      account_id: membership.owner_user_id,
      account_email:
        (await getUserById(db, membership.owner_user_id))?.email ?? "",
      impersonating: false,
      is_platform_admin,
      email_verified: verified,
    };
  }
  return {
    id: user.id,
    email: user.email,
    role: "owner",
    account_id: user.id,
    account_email: user.email,
    impersonating: false,
    is_platform_admin,
    email_verified: verified,
  };
}

export function readBearerToken(header: string | undefined): string | null {
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : null;
}

/** Session cookie (dashboard) or `Authorization: Bearer capve_…` API token (MCP, scripts). */
export async function resolveOperator(c: {
  env: Env;
  req: { header: (name: string) => string | undefined };
}): Promise<SessionUser | null> {
  const bearer = readBearerToken(c.req.header("authorization"));
  if (bearer) {
    const userId = await findUserIdByApiToken(c.env.DB, bearer);
    return userId ? sessionForUser(c.env.DB, userId) : null;
  }

  const user = await resolveIdentity(c);
  if (!user) return null;
  const context = await readAccountContext(c, user);
  if (context?.kind === "impersonation") {
    if (user.email_verified !== 1 || user.is_platform_admin !== 1) return null;
    const target = await getUserById(c.env.DB, context.account_id);
    if (!target) return null;
    return {
      id: user.id,
      email: user.email,
      role: "owner",
      account_id: target.id,
      account_email: target.email,
      impersonating: true,
      is_platform_admin: false,
      email_verified: true,
    };
  }
  return resolveSession(c.env.DB, user, context?.account_id);
}

/** The signed-in person, independent of their selected account or support context. */
export async function resolveIdentity(c: {
  env: Env;
  req: { header: (name: string) => string | undefined };
}): Promise<User | null> {
  const token = readSessionCookie(c.req.header("cookie") ?? null);
  if (!token) return null;
  const claims = await verifySession(c.env, token);
  if (!claims) return null;
  const user = await getUserById(c.env.DB, claims.sub);
  if (
    !user ||
    user.email !== claims.email ||
    (user.session_version ?? 0) !== claims.sv
  )
    return null;
  return user;
}

export async function requireUser(c: {
  env: Env;
  req: { header: (name: string) => string | undefined };
}): Promise<SessionUser | null> {
  const session = await resolveOperator(c);
  const expectedAccount = c.req.header("X-Capve-Account");
  if (session && expectedAccount && session.account_id !== expectedAccount) {
    throw new HTTPException(409, {
      res: Response.json(
        {
          error: "Account changed. Reload the dashboard.",
          code: "account_changed",
        },
        { status: 409 },
      ),
    });
  }
  return session;
}

export function canWrite(role: TeamRole): boolean {
  return role === "owner" || role === "admin";
}

export async function requireWrite(
  c: Context<{ Bindings: Env }>,
): Promise<SessionUser | Response> {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  if (!canWrite(session.role)) return c.json({ error: "Forbidden" }, 403);
  return session;
}

export async function requirePlatformAdmin(
  c: Context<{ Bindings: Env }>,
): Promise<SessionUser | Response> {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  if (!session.is_platform_admin) return c.json({ error: "Forbidden" }, 403);
  return session;
}

export async function sessionForUser(
  db: D1Database,
  userId: string,
): Promise<SessionUser | null> {
  const user = await getUserById(db, userId);
  if (!user) return null;
  return resolveSession(db, user);
}
