import { env, SELF } from "cloudflare:test";

export function cookieFrom(response: Response, name: string): string | undefined {
  const headers = response.headers.getSetCookie?.() ?? [];
  const legacy = response.headers.get("set-cookie");
  const all = headers.length > 0 ? headers : legacy ? [legacy] : [];
  for (const line of all) {
    const [pair] = line.split(";");
    const [key, value] = pair.split("=");
    if (key.trim() === name) return decodeURIComponent(value);
  }
  return undefined;
}

/** Registers a user; marks the email verified unless `verified: false` (new accounts start unverified). */
export async function registerTestUser(email?: string, options: { verified?: boolean } = {}) {
  const address = email ?? `test-${crypto.randomUUID()}@example.com`;
  const res = await SELF.fetch("http://localhost/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: address,
      password: "test-password-12",
      name: "Test User",
    }),
  });

  if (!res.ok) {
    throw new Error(`register failed: ${res.status} ${await res.text()}`);
  }

  const session = cookieFrom(res, "capve_session");
  if (!session) throw new Error("missing session cookie");
  if (options.verified !== false) {
    await env.DB.prepare("UPDATE users SET email_verified = 1 WHERE email = ?")
      .bind(address.toLowerCase())
      .run();
  }

  return {
    email: address,
    authHeaders: {
      "Content-Type": "application/json",
      Cookie: `capve_session=${encodeURIComponent(session)}`,
    },
  };
}

/** Lets deferred (waitUntil) work run before asserting that nothing happened. */
export function settle(ms = 50): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
