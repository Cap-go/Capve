export type OAuthConnection = { id: string; name: string; created_at: number; expires_at: number };
export type OAuthRequest = { client_name: string; redirect_uri: string; email: string; scope: string };

export async function oauthRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/oauth${path}`, {
    ...init, credentials: "same-origin", headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await response.json() as T & { error_description?: string };
  if (!response.ok) throw new Error(body.error_description ?? "Could not connect the app");
  return body as T;
}

/** Only resume the local OAuth endpoint after login, never an arbitrary redirect. */
export function oauthReturnTo(search: string, origin: string): string | null {
  const value = new URLSearchParams(search).get("returnTo");
  if (!value) return null;
  try {
    const url = new URL(value, origin);
    return url.origin === origin && url.pathname === "/oauth/authorize" ? url.pathname + url.search : null;
  } catch { return null; }
}
