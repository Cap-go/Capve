import { Hono } from "hono";
import { getPlatformOverview, listPlatformUsers } from "../db/admin";
import { requirePlatformAdmin } from "../lib/access";
import type { Env } from "../types";
import { stripeSetupStatus } from "../lib/stripe-setup";

const admin = new Hono<{ Bindings: Env }>();

admin.get("/stripe", async (c) => {
  const session = await requirePlatformAdmin(c);
  if (session instanceof Response) return session;
  c.header("Cache-Control", "no-store");
  return c.json(await stripeSetupStatus(c.env));
});

admin.get("/overview", async (c) => {
  const session = await requirePlatformAdmin(c);
  if (session instanceof Response) return session;

  const overview = await getPlatformOverview(c.env.DB);
  return c.json({ overview });
});

admin.get("/users", async (c) => {
  const session = await requirePlatformAdmin(c);
  if (session instanceof Response) return session;

  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  const offset = Math.max(Number(c.req.query("offset") ?? 0), 0);
  const data = await listPlatformUsers(c.env.DB, limit, offset);
  return c.json(data);
});

export { admin };
