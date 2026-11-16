import { Hono } from "hono";
import { getOfferForUser, getTrackedClick } from "../db/queries";
import { getPostbackKey, postbackKeyMatches } from "../db/postback-key";
import { createConversion, resolveAffiliateFromClick } from "../lib/conversion";
import { normalizeEvent } from "../lib/postback";
import { backgroundTasks } from "../lib/background";
import type { Env } from "../types";

const postback = new Hono<{ Bindings: Env }>();

/**
 * Detects unreplaced macro placeholders (e.g. {payout}, ${amount}, #price#, $sum$).
 * Common patterns: {key}, ${key}, #key#, $key$.
 */
function isUnreplacedMacro(raw: string): boolean {
  const trimmed = raw.trim();
  return (
    /^\{[^{}]+\}$/.test(trimmed) ||
    /^\$\{[^{}]+\}$/.test(trimmed) ||
    /^#[^#]+#$/.test(trimmed) ||
    /^\$.+\$$/.test(trimmed) ||
    /^\[[^\]]+\]$/.test(trimmed)
  );
}

/** `undefined` = not provided; `null` = invalid. */
function parsePayout(raw: string | undefined): number | null | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  if (isUnreplacedMacro(raw)) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

/** Binom-compatible conversion postback: GET /click?cnv_id=...&payout=... */
postback.get("/", async (c) => {
  const clickId = c.req.query("cnv_id")?.trim() || c.req.query("click_id")?.trim();
  if (!clickId) {
    return c.text("cnv_id required", 400);
  }

  const resolved = await resolveAffiliateFromClick(c.env.DB, clickId);
  
  const warnings: string[] = [];
  let click: { id: string; program_id: string; affiliate_id: string } | null = null;
  let program: { id: string; user_id: string; lenient_postbacks: number; traffic_source_id?: string | null };
  let affiliate: { id: string; code: string; program_id: string };
  let lenientMode = false;

  if (!resolved) {
    const programsResult = await c.env.DB
      .prepare("SELECT id, user_id, lenient_postbacks, traffic_source_id FROM programs ORDER BY created_at DESC LIMIT 10")
      .all<{ id: string; user_id: string; lenient_postbacks: number; traffic_source_id: string | null }>();
    
    const lenientProgram = programsResult.results?.find(p => p.lenient_postbacks === 1);
    
    if (!lenientProgram) {
      return c.text("click not found", 404);
    }

    const defaultAffiliate = await c.env.DB
      .prepare("SELECT id, code, program_id FROM affiliates WHERE program_id = ? ORDER BY created_at ASC LIMIT 1")
      .bind(lenientProgram.id)
      .first<{ id: string; code: string; program_id: string }>();

    if (!defaultAffiliate) {
      return c.text("click not found", 404);
    }

    program = lenientProgram;
    affiliate = defaultAffiliate;
    lenientMode = true;
    warnings.push("unknown_click_id");
  } else {
    click = resolved.click;
    program = resolved.program;
    affiliate = resolved.affiliate;
    lenientMode = program.lenient_postbacks === 1;
  }

  const event = normalizeEvent(c.req.query("event") ?? c.req.query("cnv_event"));
  if (event === false) {
    return c.text("invalid event", 400);
  }

  const payoutRaw = c.req.query("payout");
  const statusRaw = c.req.query("cnv_status");
  
  const parsedPayout = parsePayout(payoutRaw);
  const payout = parsedPayout !== undefined ? parsedPayout : parsePayout(c.req.query("amount"));
  
  if (payout === null) {
    return c.text("invalid payout", 400);
  }
  
  if (lenientMode) {
    if ((payoutRaw && isUnreplacedMacro(payoutRaw)) || (statusRaw && isUnreplacedMacro(statusRaw))) {
      if (!warnings.includes("unfilled_placeholders")) {
        warnings.push("unfilled_placeholders");
      }
    }
  }

  // Click ids are visible to visitors, so the account's postback key gates trust:
  // enforced -> reject without it; otherwise keyless postbacks are capped to the offer payout.
  const keySettings = await getPostbackKey(c.env.DB, program.user_id);
  const keyValid = postbackKeyMatches(keySettings?.postback_key, c.req.query("key")?.trim());
  if (keySettings?.postback_key_required === 1 && !keyValid) {
    return c.text("invalid postback key", 403);
  }
  const explicitStatus =
    statusRaw && !isUnreplacedMacro(statusRaw) ? statusRaw : undefined;
  const status2 = c.req.query("cnv_status2")?.trim() || null;
  const currency = c.req.query("cnv_currency")?.trim() || "USD";
  // Without an explicit tx id the click id (+ event) is the key, so repeated postbacks
  // for the same click and event update status/payout (lead → sale) instead of being
  // dropped, while each event (registration, ftd, ...) is its own conversion.
  const orderId =
    c.req.query("order_id")?.trim() ||
    c.req.query("tx_id")?.trim() ||
    c.req.query("external_event_id")?.trim() ||
    (click ? (event ? `${click.id}:${event}` : click.id) : `${clickId}:${event ?? "unknown"}`);
  const disableS2s = c.req.query("disable_postback") === "1";

  // No payout on a plain postback → fall back to the clicked offer's payout.
  // Events (registration, ftd, ...) only carry the payout they send.
  const needsOffer = (payout === undefined && !event) || (payout !== undefined && payout !== null && !keyValid);
  const tracked = click && needsOffer ? await getTrackedClick(c.env.DB, click.id) : null;
  const offer = tracked?.offer_id
    ? await getOfferForUser(c.env.DB, tracked.offer_id, program.user_id)
    : null;
  let amount: number;
  if (payout !== null && payout !== undefined) {
    amount = !keyValid && offer?.payout_cents ? Math.min(payout, offer.payout_cents / 100) : payout;
  } else if (event) {
    amount = 0;
  } else {
    amount = (offer?.payout_cents ?? 0) / 100;
  }

  const result = await createConversion(c.env.DB, program, affiliate, {
    program_id: program.id,
    affiliate_id: affiliate.id,
    click_id: click?.id ?? null,
    order_id: orderId,
    amount,
    status: explicitStatus ?? "lead",
    status2,
    event,
    currency,
    disable_s2s: disableS2s,
    warning_flags: warnings.length > 0 ? warnings.join(",") : null,
    upsert: { status: explicitStatus !== undefined, amount: payout !== undefined },
  }, backgroundTasks(c));

  return c.json({ ok: true, ...result });
});

export { postback };
