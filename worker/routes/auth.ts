import { Hono } from "hono";
import type { Env } from "../types";
import { consumeAuthToken, createAuthToken, deleteAuthTokensForUser, isEmailTakenError } from "../db/auth";
import {
  bumpSessionVersion,
  createUser,
  getUserByEmail,
  getUserById,
  getUserPasswordHash,
  markEmailVerified,
  updateUserPassword,
} from "../db/queries";
import { resolveOperator, sessionForUser } from "../lib/access";
import { resetPasswordEmail, sendEmail, verifyEmailEmail } from "../lib/email";
import { isRateLimited } from "../lib/rate-limit";
import { hashPassword, verifyPassword } from "../lib/password";
import {
  clearSessionCookie,
  sessionCookie,
  signSession,
} from "../lib/session";
import { ensurePlatformAdmin } from "../lib/platform-admin";
import { id } from "../lib/utils";
import { isSecureRequest } from "../lib/auth";

const auth = new Hono<{ Bindings: Env }>();

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validPassword(password: string): boolean {
  return password.length >= 8;
}

function publicUser(session: {
  id: string;
  email: string;
  role: string;
  account_id: string;
  is_platform_admin: boolean;
  email_verified: boolean;
}) {
  return {
    id: session.id,
    email: session.email,
    role: session.role,
    account_id: session.account_id,
    is_platform_admin: session.is_platform_admin,
    email_verified: session.email_verified,
  };
}

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;

function tooManyRequests(c: { json: (body: unknown, status: 429) => Response }) {
  return c.json({ error: "Too many attempts. Try again in a minute." }, 429);
}

async function sendVerification(env: Env, user: { id: string; email: string }) {
  const rawToken = crypto.randomUUID() + crypto.randomUUID();
  await deleteAuthTokensForUser(env.DB, user.id, "verify");
  await createAuthToken(env.DB, user.id, "verify", rawToken, Date.now() + VERIFY_TTL_MS);
  const mail = verifyEmailEmail(env.APP_URL, rawToken);
  await sendEmail(env, { to: user.email, ...mail }).catch(() => undefined);
}

auth.get("/me", async (c) => {
  const session = await resolveOperator(c);
  if (!session) return c.json({ user: null });
  return c.json({ user: publicUser(session) });
});

auth.post("/register", async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    email?: string;
    password?: string;
    name?: string;
  } | null;
  const email = body?.email?.trim().toLowerCase() ?? "";
  const password = body?.password ?? "";
  const name = body?.name?.trim() || null;

  if (!validEmail(email)) return c.json({ error: "Valid email is required" }, 400);
  if (!validPassword(password)) return c.json({ error: "Password must be at least 8 characters" }, 400);
  if (await isRateLimited(c.env, c.req.raw, "register", email)) return tooManyRequests(c);

  const password_hash = await hashPassword(password);
  const userId = id("usr");
  const now = Date.now();

  try {
    await createUser(c.env.DB, {
      id: userId,
      email,
      password_hash,
      name,
      created_at: now,
    });
  } catch (error) {
    if (isEmailTakenError(error)) return c.json({ error: "Email already registered" }, 409);
    throw error;
  }

  await sendVerification(c.env, { id: userId, email });

  const token = await signSession(c.env, { sub: userId, email, sv: 0 });
  const secure = isSecureRequest(new URL(c.req.url));
  c.header("Set-Cookie", sessionCookie(token, secure));

  const session = await sessionForUser(c.env.DB, userId);
  return c.json({ user: session ? publicUser(session) : null }, 201);
});

auth.post("/login", async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    email?: string;
    password?: string;
  } | null;
  const email = body?.email?.trim().toLowerCase() ?? "";
  const password = body?.password ?? "";

  if (!email || !password) return c.json({ error: "Email and password are required" }, 400);
  if (await isRateLimited(c.env, c.req.raw, "login", email)) return tooManyRequests(c);

  const row = await getUserPasswordHash(c.env.DB, email);
  if (!row?.password_hash) return c.json({ error: "Invalid email or password" }, 401);

  const ok = await verifyPassword(password, row.password_hash);
  if (!ok) return c.json({ error: "Invalid email or password" }, 401);

  const user = await getUserByEmail(c.env.DB, email);
  if (!user) return c.json({ error: "Invalid email or password" }, 401);

  if (user.email_verified === 1) await ensurePlatformAdmin(c.env.DB, c.env, email);

  const token = await signSession(c.env, {
    sub: user.id,
    email: user.email,
    sv: user.session_version ?? 0,
  });
  const secure = isSecureRequest(new URL(c.req.url));
  c.header("Set-Cookie", sessionCookie(token, secure));

  const session = await sessionForUser(c.env.DB, user.id);
  return c.json({ user: session ? publicUser(session) : null });
});

auth.post("/logout", async (c) => {
  const secure = isSecureRequest(new URL(c.req.url));
  c.header("Set-Cookie", clearSessionCookie(secure));
  return c.json({ ok: true });
});

auth.post("/forgot-password", async (c) => {
  const body = (await c.req.json().catch(() => null)) as { email?: string } | null;
  const email = body?.email?.trim().toLowerCase() ?? "";
  if (!validEmail(email)) return c.json({ error: "Valid email is required" }, 400);
  if (await isRateLimited(c.env, c.req.raw, "forgot", email)) return tooManyRequests(c);

  const user = await getUserByEmail(c.env.DB, email);
  if (user) {
    const rawToken = crypto.randomUUID() + crypto.randomUUID();
    await deleteAuthTokensForUser(c.env.DB, user.id, "reset");
    await createAuthToken(c.env.DB, user.id, "reset", rawToken, Date.now() + 60 * 60 * 1000);
    const mail = resetPasswordEmail(c.env.APP_URL, rawToken);
    await sendEmail(c.env, { to: email, ...mail }).catch(() => undefined);
  }

  return c.json({ ok: true, message: "If that email exists, we sent a reset link." });
});

auth.post("/reset-password", async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    token?: string;
    password?: string;
  } | null;
  const token = body?.token?.trim() ?? "";
  const password = body?.password ?? "";

  if (!token) return c.json({ error: "Reset token is required" }, 400);
  if (!validPassword(password)) return c.json({ error: "Password must be at least 8 characters" }, 400);
  if (await isRateLimited(c.env, c.req.raw, "reset")) return tooManyRequests(c);

  const row = await consumeAuthToken(c.env.DB, token, "reset");
  if (!row) return c.json({ error: "Invalid or expired reset link" }, 400);

  // Revokes every existing session (session_version bump).
  const password_hash = await hashPassword(password);
  await updateUserPassword(c.env.DB, row.user_id, password_hash);
  // The reset link reached the inbox, so the address is verified.
  await markEmailVerified(c.env.DB, row.user_id);

  const dbUser = await getUserById(c.env.DB, row.user_id);
  if (!dbUser) return c.json({ error: "User not found" }, 404);
  await ensurePlatformAdmin(c.env.DB, c.env, dbUser.email);

  const sessionToken = await signSession(c.env, {
    sub: row.user_id,
    email: dbUser.email,
    sv: dbUser.session_version ?? 0,
  });
  const secure = isSecureRequest(new URL(c.req.url));
  c.header("Set-Cookie", sessionCookie(sessionToken, secure));

  const session = await sessionForUser(c.env.DB, row.user_id);
  return c.json({ user: session ? publicUser(session) : null });
});

auth.post("/verify-email", async (c) => {
  const body = (await c.req.json().catch(() => null)) as { token?: string } | null;
  const token = body?.token?.trim() ?? "";
  if (!token) return c.json({ error: "Verification token is required" }, 400);
  if (await isRateLimited(c.env, c.req.raw, "verify")) return tooManyRequests(c);

  const row = await consumeAuthToken(c.env.DB, token, "verify");
  if (!row) return c.json({ error: "Invalid or expired verification link" }, 400);

  await markEmailVerified(c.env.DB, row.user_id);
  const dbUser = await getUserById(c.env.DB, row.user_id);
  if (dbUser) await ensurePlatformAdmin(c.env.DB, c.env, dbUser.email);
  return c.json({ ok: true });
});

auth.post("/resend-verification", async (c) => {
  const session = await resolveOperator(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  if (session.email_verified) return c.json({ ok: true, already_verified: true });
  if (await isRateLimited(c.env, c.req.raw, "resend", session.email)) return tooManyRequests(c);

  await sendVerification(c.env, { id: session.id, email: session.email });
  return c.json({ ok: true });
});

/** Revokes every session of the caller (all browsers/devices), including this one. */
auth.post("/logout-all", async (c) => {
  const session = await resolveOperator(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  await bumpSessionVersion(c.env.DB, session.id);
  const secure = isSecureRequest(new URL(c.req.url));
  c.header("Set-Cookie", clearSessionCookie(secure));
  return c.json({ ok: true });
});

export { auth };
