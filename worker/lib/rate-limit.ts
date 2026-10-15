import type { Env } from "../types";

/**
 * Workers Rate Limiting for auth endpoints, keyed on client IP and (when given) email.
 * Returns true when the request must be rejected. Missing bindings (tests, installs
 * without the `ratelimits` config) and binding errors never block.
 */
export async function isRateLimited(
  env: Env,
  request: Request,
  action: string,
  email?: string,
): Promise<boolean> {
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const checks: Array<Promise<boolean>> = [];
  if (env.AUTH_IP_LIMITER) checks.push(allowed(env.AUTH_IP_LIMITER, `${action}:ip:${ip}`));
  if (env.AUTH_EMAIL_LIMITER && email) {
    checks.push(allowed(env.AUTH_EMAIL_LIMITER, `${action}:email:${email.toLowerCase()}`));
  }
  const results = await Promise.all(checks);
  return results.some((ok) => !ok);
}

async function allowed(limiter: RateLimit, key: string): Promise<boolean> {
  try {
    const { success } = await limiter.limit({ key });
    return success;
  } catch {
    return true;
  }
}
