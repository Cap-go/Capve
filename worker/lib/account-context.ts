import { SignJWT, jwtVerify } from "jose";
import type { Env, User } from "../types";
import { authSecret, readSessionCookie, sessionCookie } from "./session";

export const ACCOUNT_CONTEXT_COOKIE = "capve_account_context";
export type AccountContext =
  | { kind: "account"; account_id: string }
  | { kind: "impersonation"; account_id: string; return_account_id: string };

export async function accountContextCookie(
  env: Pick<Env, "AUTH_SECRET">,
  user: User,
  context: AccountContext,
  secure: boolean,
) {
  const maxAge = context.kind === "impersonation" ? 3600 : 60 * 60 * 24 * 30;
  const token = await new SignJWT({ ...context, sv: user.session_version ?? 0 })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience("capve-account-context")
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${maxAge}s`)
    .sign(authSecret(env));
  return sessionCookie(token, secure, ACCOUNT_CONTEXT_COOKIE, maxAge);
}

export async function readAccountContext(
  c: {
    env: Env;
    req: { header: (name: string) => string | undefined };
  },
  user: User,
): Promise<AccountContext | null> {
  const token = readSessionCookie(
    c.req.header("cookie") ?? null,
    ACCOUNT_CONTEXT_COOKIE,
  );
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, authSecret(c.env), {
      algorithms: ["HS256"],
      audience: "capve-account-context",
      subject: user.id,
    });
    if (
      payload.sv !== (user.session_version ?? 0) ||
      typeof payload.account_id !== "string"
    )
      return null;
    if (payload.kind === "account")
      return { kind: "account", account_id: payload.account_id };
    if (
      payload.kind === "impersonation" &&
      typeof payload.return_account_id === "string"
    ) {
      return {
        kind: "impersonation",
        account_id: payload.account_id,
        return_account_id: payload.return_account_id,
      };
    }
    return null;
  } catch {
    return null;
  }
}
