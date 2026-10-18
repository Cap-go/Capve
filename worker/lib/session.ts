import { SignJWT, jwtVerify } from "jose";
import type { Env } from "../types";

export const SESSION_COOKIE = "capve_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

const MIN_SECRET_LENGTH = 32;

export function authSecret(env: Pick<Env, "AUTH_SECRET">): Uint8Array {
  const secret = env.AUTH_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      "AUTH_SECRET is not configured — run: bunx wrangler secret put AUTH_SECRET --env production",
    );
  }
  return new TextEncoder().encode(secret);
}

export type SessionClaims = {
  sub: string;
  email: string;
  /** users.session_version at sign-in; a bump revokes the session. */
  sv: number;
};

export async function signSession(
  env: Env,
  claims: SessionClaims,
): Promise<string> {
  return new SignJWT({ email: claims.email, sv: claims.sv })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(authSecret(env));
}

export async function verifySession(
  env: Env,
  token: string,
): Promise<SessionClaims | null> {
  const key = authSecret(env);
  try {
    const { payload } = await jwtVerify(token, key);
    if (payload.aud !== undefined) return null;
    const sub = payload.sub;
    const email = payload.email;
    if (typeof sub !== "string" || typeof email !== "string") return null;
    // Sessions issued before session_version existed carry no `sv`: treat as version 0.
    const sv = payload.sv === undefined ? 0 : payload.sv;
    if (typeof sv !== "number" || !Number.isInteger(sv)) return null;
    return { sub, email: email.toLowerCase(), sv };
  } catch {
    return null;
  }
}

export function sessionCookie(
  token: string,
  secure: boolean,
  name = SESSION_COOKIE,
  maxAge = SESSION_MAX_AGE,
): string {
  const parts = [
    `${name}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookie(
  secure: boolean,
  name = SESSION_COOKIE,
): string {
  const parts = [`${name}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function readSessionCookie(
  cookieHeader: string | null,
  name = SESSION_COOKIE,
): string | null {
  if (!cookieHeader) return null;
  const raw = parseCookie(cookieHeader)[name];
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

function parseCookie(header: string): Record<string, string> {
  return Object.fromEntries(
    header.split(";").map((part) => {
      const [key, ...rest] = part.trim().split("=");
      return [key, rest.join("=")];
    }),
  );
}
