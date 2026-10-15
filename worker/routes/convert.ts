import { Hono } from "hono";
import { cors } from "hono/cors";
import { getProgramByConvertSecret } from "../db/queries";
import {
  createConversion,
  resolveAffiliateByCode,
  resolveAffiliateFromClick,
} from "../lib/conversion";
import { normalizeEvent } from "../lib/postback";
import { backgroundTasks } from "../lib/background";
import type { Env } from "../types";
import { readAffiliateCookie } from "../lib/auth";

const convert = new Hono<{ Bindings: Env }>();

convert.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "X-Program-Secret"],
    maxAge: 86400,
  }),
);

convert.post("/", async (c) => {
  const secret = c.req.header("X-Program-Secret");
  if (!secret) {
    return c.json({ error: "X-Program-Secret header required" }, 401);
  }

  const program = await getProgramByConvertSecret(c.env.DB, secret);
  if (!program) {
    return c.json({ error: "Invalid campaign secret" }, 401);
  }

  const body = await c.req.json<{
    order_id?: string;
    amount?: number;
    affiliate_code?: string;
    click_id?: string;
    cnv_id?: string;
    status?: string;
    status2?: string;
    event?: string;
    currency?: string;
    disable_postback?: boolean;
  }>();

  const orderId = body.order_id?.trim();
  const amount = body.amount;

  if (!orderId || typeof amount !== "number" || amount < 0) {
    return c.json({ error: "order_id and amount (number >= 0) required" }, 400);
  }

  const event = normalizeEvent(body.event);
  if (event === false) {
    return c.json({ error: "event must be 1-40 chars: a-z, 0-9, _ . -" }, 400);
  }

  const clickId = body.click_id?.trim() || body.cnv_id?.trim();
  let affiliate: { id: string; code: string };
  let resolvedClickId: string | null = null;

  if (clickId) {
    const resolved = await resolveAffiliateFromClick(c.env.DB, clickId, program.id);
    if (!resolved) {
      return c.json({ error: "Click not found for this campaign" }, 404);
    }
    affiliate = resolved.affiliate;
    resolvedClickId = resolved.click.id;
  } else {
    const affiliateCode =
      body.affiliate_code?.trim() || readAffiliateCookie(c.req.header("Cookie") ?? null);
    if (!affiliateCode) {
      return c.json({ error: "affiliate_code or click_id required" }, 400);
    }
    const resolved = await resolveAffiliateByCode(c.env.DB, program.id, affiliateCode);
    if (!resolved) {
      return c.json({ error: "Affiliate not found for this campaign" }, 404);
    }
    affiliate = resolved.affiliate;
  }

  const result = await createConversion(c.env.DB, program, affiliate, {
    program_id: program.id,
    affiliate_id: affiliate.id,
    click_id: resolvedClickId,
    order_id: orderId,
    amount,
    status: body.status?.trim() || "lead",
    status2: body.status2?.trim() || null,
    event,
    currency: body.currency?.trim() || "USD",
    disable_s2s: body.disable_postback === true,
  }, backgroundTasks(c));

  return c.json({ ok: true, ...result });
});

export { convert };
