import type { Env } from "../types";

export function parseAdminEmails(value: string | undefined): Set<string> {
  if (!value?.trim()) return new Set();
  return new Set(
    value
      .split(",")
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isPlatformAdminEmail(env: Env, email: string): boolean {
  return parseAdminEmails(env.PLATFORM_ADMIN_EMAILS).has(email.toLowerCase());
}

/** Grants platform admin to a configured email, only once that email is verified. */
export async function ensurePlatformAdmin(db: D1Database, env: Env, email: string): Promise<void> {
  if (!isPlatformAdminEmail(env, email)) return;
  await db
    .prepare("UPDATE users SET is_platform_admin = 1 WHERE email = ? AND email_verified = 1")
    .bind(email.toLowerCase())
    .run();
}
