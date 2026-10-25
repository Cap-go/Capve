import type { Env } from "../types";

export function bentoConfigured(env: Env): boolean {
  return !!(env.BENTO_SITE_UUID && env.BENTO_PUBLISHABLE_KEY && env.BENTO_SECRET_KEY);
}

export async function bentoRequest(env: Env, kind: "events" | "emails", items: unknown[]) {
  if (!bentoConfigured(env)) throw new Error("Bento is not configured");
  const response = await fetch(`https://app.bentonow.com/api/v1/batch/${kind}?site_uuid=${encodeURIComponent(env.BENTO_SITE_UUID ?? "")}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${env.BENTO_PUBLISHABLE_KEY}:${env.BENTO_SECRET_KEY}`)}`,
      "Content-Type": "application/json", "User-Agent": "Capve/1.0 (https://capve.app)",
    },
    body: JSON.stringify({ [kind]: items }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Bento ${kind} returned ${response.status}`);
  const result: unknown = await response.json();
  if (!result || typeof result !== "object" || !("results" in result) || result.results !== items.length)
    throw new Error(`Bento did not accept all ${kind}`);
}
