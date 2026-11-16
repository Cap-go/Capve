import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { Context } from "hono";
import type { Env } from "../types";
import { requireUser, resolveIdentity } from "../lib/access";

/** Browser-only transport. No credentials or conversations are persisted by the Worker. */
export const assistant = new Hono<{ Bindings: Env }>();
assistant.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  if (c.req.header("Origin") !== new URL(c.req.url).origin && c.req.method !== "GET")
    return c.json({ error: "Forbidden origin" }, 403);
  if (c.req.header("Origin") && c.req.header("Origin") !== new URL(c.req.url).origin)
    return c.json({ error: "Forbidden origin" }, 403);
  if (c.req.header("authorization") || !(await resolveIdentity(c)))
    return c.json({ error: "Use a signed-in Capve session" }, 401);
  const user = await requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  if (user.impersonating) return c.json({ error: "Exit support access to use the assistant" }, 403);
  if (c.req.path.endsWith("/mcp") && !c.req.header("X-Capve-Account"))
    return c.json({ error: "Select an account first" }, 400);
  await next();
});
assistant.use("*", bodyLimit({ maxSize: 1024 * 1024 }));

async function proxy(c: Context<{ Bindings: Env }>, path: "models" | "responses" | "token") {
  let body: string | undefined;
  const headers = new Headers({ accept: path === "responses" ? "text/event-stream" : "application/json" });
  if (path === "token") {
    if (c.req.header("content-type")?.split(";")[0] !== "application/x-www-form-urlencoded")
      return c.json({ error: "Expected form encoding" }, 415);
    const form = new URLSearchParams(await c.req.text());
    const grant = form.get("grant_type");
    if (!["authorization_code", "refresh_token"].includes(grant ?? "") || !form.get("client_id"))
      return c.json({ error: "Invalid token request" }, 400);
    const allowed = ["grant_type", "client_id", "code", "code_verifier", "redirect_uri", "resource", "refresh_token"];
    if ([...form.keys()].some(key => !allowed.includes(key)) || form.get("resource") !== "https://api.openai.com/v1"
      || (grant === "authorization_code" && (form.get("redirect_uri") !== "http://127.0.0.1:1455/auth/callback" || !form.get("code") || !form.get("code_verifier")))
      || (grant === "refresh_token" && !form.get("refresh_token")))
      return c.json({ error: "Invalid token request" }, 400);
    body = form.toString();
    headers.set("content-type", "application/x-www-form-urlencoded");
  } else {
    const token = c.req.header("x-chatgpt-token");
    if (!token || token.length > 16_384 || /\s/.test(token))
      return c.json({ error: "A ChatGPT access token is required" }, 400);
    headers.set("authorization", `Bearer ${token}`);
    if (path === "responses") {
      if (c.req.header("content-type")?.split(";")[0] !== "application/json")
        return c.json({ error: "Expected JSON" }, 415);
      const payload = await c.req.json<Record<string, unknown>>().catch(() => null);
      if (!payload || payload.store !== false || payload.stream !== true)
        return c.json({ error: "Use store: false and stream: true" }, 400);
      body = JSON.stringify(payload);
      headers.set("content-type", "application/json");
    }
  }
  try {
    const upstream = await fetch(path === "token" ? "https://auth.openai.com/api/accounts/oauth/token" : `https://api.openai.com/v1/${path}`, {
      method: path === "models" ? "GET" : "POST", headers, body, redirect: "manual",
      signal: AbortSignal.any([c.req.raw.signal, AbortSignal.timeout(path === "responses" ? 90_000 : 15_000)]),
    });
    if (upstream.status >= 300 && upstream.status < 400) {
      await upstream.body?.cancel();
      return c.json({ error: "Unexpected OpenAI redirect" }, 502);
    }
    const responseHeaders = new Headers({ "Cache-Control": "no-store" });
    for (const name of ["content-type", "retry-after"]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    return c.json({ error: "Cannot reach OpenAI. Please try again." }, 502);
  }
}
assistant.get("/models", c => proxy(c, "models"));
assistant.post("/responses", c => proxy(c, "responses"));
assistant.post("/token", c => proxy(c, "token"));
