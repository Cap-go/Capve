import { Hono } from "hono";
import { createApiToken, deleteApiToken, listApiTokens } from "../db/api-tokens";
import { readBearerToken, requireUser } from "../lib/access";
import type { Env } from "../types";

/** Personal API tokens. Managed from the dashboard session only; a token cannot mint tokens. */
const tokens = new Hono<{ Bindings: Env }>();

tokens.use("*", async (c, next) => {
  if (readBearerToken(c.req.header("authorization"))) {
    return c.json({ error: "Manage API tokens from the dashboard" }, 403);
  }
  await next();
});

tokens.get("/", async (c) => {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  return c.json({ tokens: await listApiTokens(c.env.DB, session.id) });
});

tokens.post("/", async (c) => {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  const body = (await c.req.json<{ name?: string }>().catch(() => ({}))) as { name?: string };
  const name = body.name?.trim().slice(0, 80) || "MCP";
  const created = await createApiToken(c.env.DB, session.id, name);
  if (!created) return c.json({ error: "Token limit reached; delete an old token first" }, 400);
  return c.json(created, 201);
});

tokens.delete("/:id", async (c) => {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  const ok = await deleteApiToken(c.env.DB, c.req.param("id"), session.id);
  if (!ok) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

export { tokens };
