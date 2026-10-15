import { Hono } from "hono";
import { getAccountSettings, updateAccountSettings } from "../db/settings";
import { requireUser, requireWrite } from "../lib/access";
import { isValidTimeZone } from "../lib/timezone";
import type { Env } from "../types";

/** Account-level settings (report timezone). */
const settings = new Hono<{ Bindings: Env }>();

settings.get("/", async (c) => {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  return c.json({ settings: await getAccountSettings(c.env.DB, session.account_id) });
});

settings.put("/", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;

  const body = await c.req.json<{ timezone?: unknown }>().catch(() => ({}) as { timezone?: unknown });
  if (!isValidTimeZone(body.timezone)) {
    return c.json({ error: "timezone must be an IANA name such as UTC or Europe/Paris" }, 400);
  }
  const saved = await updateAccountSettings(c.env.DB, session.account_id, {
    timezone: body.timezone.trim(),
  });
  return c.json({ settings: saved });
});

export { settings };
