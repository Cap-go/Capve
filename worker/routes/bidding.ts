import { Hono } from "hono";
import { BIDDING_MODEL } from "../../shared/bidding";
import { analyzeBidding, biddingSettings, latestBiddingRun } from "../db/bidding";
import { BiddingError, parseBiddingConfig } from "../lib/bidding";
import { requireUser, requireWrite } from "../lib/access";
import { requireReports } from "../lib/billing";
import { toCsv } from "../lib/metrics";
import type { Env } from "../types";

export const bidding = new Hono<{ Bindings: Env }>();
bidding.onError((err, c) => {
  if (err instanceof BiddingError) return c.json({ error: err.message }, err.status);
  throw err;
});
bidding.use("/:id/*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  const session = c.req.method === "GET" ? await requireUser(c) : await requireWrite(c);
  if (session instanceof Response) return session;
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  const owned = await c.env.DB.prepare("SELECT id FROM programs WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), session.account_id).first();
  if (!owned) return c.json({ error: "Not found" }, 404);
  await next();
});
bidding.get("/:id/settings", async (c) => c.json({
  ...await biddingSettings(c.env.DB, c.req.param("id")), available: !!c.env.AI, model: BIDDING_MODEL, beta: true,
}));
bidding.put("/:id/settings", async (c) => {
  const config = parseBiddingConfig(await c.req.json().catch(() => null));
  await c.env.DB.prepare(`INSERT INTO bidding_settings (program_id, config) VALUES (?, ?)
    ON CONFLICT(program_id) DO UPDATE SET config = excluded.config, revision = bidding_settings.revision + 1`)
    .bind(c.req.param("id"), JSON.stringify(config)).run();
  return c.json(await biddingSettings(c.env.DB, c.req.param("id")));
});
bidding.use("/:id/analyze", requireReports);
bidding.post("/:id/analyze", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;
  return c.json({ run: await analyzeBidding(c.env, c.req.param("id"), session.account_id) });
});
bidding.use("/:id/recommendations", requireReports);
bidding.get("/:id/recommendations", async (c) => {
  const run = await latestBiddingRun(c.env.DB, c.req.param("id"));
  if (c.req.query("format") === "csv") {
    if (!run) return c.json({ error: "No current recommendations" }, 404);
    return c.text(toCsv(["zone", "suggested_change_pct", "clicks", "conversions", "cost_cents", "revenue_cents", "currency", "reason"],
      run.result.decisions.map((d) => [d.zone, d.change_pct, d.clicks, d.conversions, d.cost_cents, d.revenue_cents, run.result.config.currency, d.reason])), 200,
    { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="bid-recommendations.csv"' });
  }
  return c.json({ run });
});
