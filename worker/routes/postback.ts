import { Hono } from "hono";
import { getOfferForUser, getTrackedClick } from "../db/queries";
import { getPostbackKey, postbackKeyMatches } from "../db/postback-key";
import { createConversion, resolveAffiliateFromClick } from "../lib/conversion";
import { normalizeEvent } from "../lib/postback";
import type { Env } from "../types";

const postback = new Hono<{ Bindings: Env }>();

/** `undefined` = not provided; `null` = invalid. */
function parsePayout(raw: string | undefined): number | null | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
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

  const payout = parsePayout(c.req.query("payout"));
  if (payout === null) {
    return c.text("invalid payout", 400);
  }

  const resolved = await resolveAffiliateFromClick(c.env.DB, clickId);
  if (!resolved) {
    return c.text("click not found", 404);
  }

  const event = normalizeEvent(c.req.query("event") ?? c.req.query("cnv_event"));
  if (event === false) {
    return c.text("invalid event", 400);
  }

  const { click, program, affiliate } = resolved;

  // Click ids are visible to visitors, so the account's postback key gates trust:
  // enforced -> reject without it; otherwise keyless postbacks are capped to the offer payout.
  const keySettings = await getPostbackKey(c.env.DB, program.user_id);
  const keyValid = postbackKeyMatches(keySettings?.postback_key, c.req.query("key")?.trim());
  if (keySettings?.postback_key_required === 1 && !keyValid) {
    return c.text("invalid postback key", 403);
  }
  const explicitStatus = c.req.query("cnv_status")?.trim() || undefined;
  const status2 = c.req.query("cnv_status2")?.trim() || null;
  const currency = c.req.query("cnv_currency")?.trim() || "USD";
  // Without an explicit tx id the click id (+ event) is the key, so repeated postbacks
  // for the same click and event update status/payout (lead → sale) instead of being
  // dropped, while each event (registration, ftd, ...) is its own conversion.
  const orderId =
    c.req.query("order_id")?.trim() ||
    c.req.query("tx_id")?.trim() ||
    c.req.query("external_event_id")?.trim() ||
    (event ? `${click.id}:${event}` : click.id);
  const disableS2s = c.req.query("disable_postback") === "1";

  // No payout on a plain postback → fall back to the clicked offer's payout.
  // Events (registration, ftd, ...) only carry the payout they send.
  const needsOffer = (payout === undefined && !event) || (payout !== undefined && !keyValid);
  const tracked = needsOffer ? await getTrackedClick(c.env.DB, click.id) : null;
  const offer = tracked?.offer_id
    ? await getOfferForUser(c.env.DB, tracked.offer_id, program.user_id)
    : null;
  let amount = payout;
  if (amount === undefined && event) {
    amount = 0;
  } else if (amount === undefined) {
    amount = (offer?.payout_cents ?? 0) / 100;
  } else if (!keyValid && offer?.payout_cents) {
    amount = Math.min(amount, offer.payout_cents / 100);
  }

  const result = await createConversion(c.env.DB, program, affiliate, {
    program_id: program.id,
    affiliate_id: affiliate.id,
    click_id: click.id,
    order_id: orderId,
    amount,
    status: explicitStatus ?? "lead",
    status2,
    event,
    currency,
    disable_s2s: disableS2s,
    upsert: { status: explicitStatus !== undefined, amount: payout !== undefined },
  });

  return c.json({ ok: true, ...result });
});

export { postback };
