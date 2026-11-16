import { Hono } from "hono";
import { requireUser } from "../lib/access";
import { onboardingStatus } from "../lib/onboarding";
import type { Env } from "../types";

export const onboarding = new Hono<{ Bindings: Env }>();
onboarding.get("/", async (c) => {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  c.header("Cache-Control", "no-store");
  return c.json(await onboardingStatus(c.env.DB, session.account_id));
});
onboarding.put("/", async (c) => {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  if (session.role !== "owner" || session.impersonating) return c.json({ error: "Only the account owner can change onboarding preferences" }, 403);
  const body: unknown = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)
    || Object.keys(body).length === 0
    || Object.entries(body).some(([key, value]) => !["dismissed", "emailTips"].includes(key) || typeof value !== "boolean"))
    return c.json({ error: "Provide dismissed and/or emailTips as booleans" }, 400);
  const prefs = body as { dismissed?: boolean; emailTips?: boolean };
  const now = Date.now();
  await c.env.DB.prepare(`INSERT INTO account_onboarding (account_id, dismissed, email_tips, consent_at, created_at)
    VALUES (?, ?, ?, ?, ?) ON CONFLICT(account_id) DO UPDATE SET
    dismissed = COALESCE(?, dismissed), email_tips = COALESCE(?, email_tips),
    consent_at = CASE WHEN ? = 1 AND email_tips = 0 THEN ? ELSE consent_at END`)
    .bind(session.account_id, Number(prefs.dismissed ?? false), Number(prefs.emailTips ?? false), prefs.emailTips ? now : null, now,
      prefs.dismissed === undefined ? null : Number(prefs.dismissed), prefs.emailTips === undefined ? null : Number(prefs.emailTips),
      Number(prefs.emailTips === true), now).run();
  return c.json(await onboardingStatus(c.env.DB, session.account_id));
});
