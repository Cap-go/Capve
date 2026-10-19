import { Hono } from "hono";
import { markLpClick, recordClick } from "../db/queries";
import { getTriggersForEvent } from "../db/ops";
import { getAffiliateLinkTarget, getCampaignLinkTarget, getLpClickTarget } from "../db/redirect";
import { getOrCreateCampaignAffiliate, getRotationConfig } from "../db/routing";
import type { Env } from "../types";
import { affiliateCookie, isSecureRequest } from "../lib/auth";
import {
  fallbackDestination,
  newVisitorKey,
  readVisitorKey,
  resolvePathDestination,
  selectPath,
  substituteMacros,
  visitorCookie,
} from "../lib/routing";
import { backgroundTasks } from "../lib/background";
import { fireTriggerWebhooks } from "../lib/triggers";
import { id } from "../lib/utils";
import { parseHttpUrl, resolveRedirectTarget, withQueryParam } from "../lib/urls";
import { buildClickContext, SUB_KEYS } from "../lib/click-context";
import { applySourceTokens } from "../lib/source-templates";
import { parseTokenJson } from "../db/sources";
import { evaluateTraffic } from "../lib/click-filter";
import { selectRulePaths } from "../lib/rules";
import type { RoutingContext } from "../types-routing";

import type { Context } from "hono";

type AppContext = { Bindings: Env };

const UNIQUE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** LP click URL on the campaign's custom tracking domain when set, else APP_URL. */
function lpClickUrl(
  appUrl: string | undefined,
  trackingHostname: string | null | undefined,
  requestUrl: string,
  clickId: string,
): string {
  const base = trackingHostname
    ? `https://${trackingHostname}`
    : (appUrl?.trim() || new URL(requestUrl).origin).replace(/\/$/, "");
  return `${base}/lp/${clickId}`;
}

async function handleClickRedirect(
  c: Context<AppContext>,
  program: {
    id: string;
    user_id: string;
    destination_url: string | null;
    campaign_key: string | null;
    traffic_source_id?: string | null;
    /** Source token JSON, loaded with the campaign in the hot-path lookup. */
    source_tokens?: string | null;
    /** Custom tracking domain of the campaign; LP click URLs use it. */
    tracking_hostname?: string | null;
  },
  affiliate: { id: string; code: string },
) {
  const defer = backgroundTasks(c);
  // Destination is optional: campaigns can route only through paths. The same-host
  // `?url=` override needs a destination to compare against, so it is ignored without one.
  let baseDestination: string | null = null;
  if (program.destination_url) {
    const resolved = resolveRedirectTarget(program.destination_url, c.req.query("url"));
    if (!resolved.ok) {
      return c.text(resolved.error, resolved.status as 400 | 503);
    }
    baseDestination = resolved.url.toString();
  }

  const clickId = id("clk");
  const secure = isSecureRequest(new URL(c.req.url));
  const cookieHeader = c.req.header("cookie") ?? null;
  let visitorKey = readVisitorKey(cookieHeader);
  const setVisitorCookie = !visitorKey;
  if (!visitorKey) visitorKey = newVisitorKey();

  // Named source tokens (e.g. Adcash zoneid → sub1) are mapped before anything reads the subs.
  const rawContext = await buildClickContext(c.req.raw);
  const clickContext = program.source_tokens
    ? applySourceTokens(new URL(c.req.url), parseTokenJson(program.source_tokens), rawContext)
    : rawContext;
  const ctx: RoutingContext = {
    click_id: clickId,
    velo_ref: affiliate.code,
    campaign_key: program.campaign_key,
    campaign_id: program.id,
    country: clickContext.country,
    external_id: clickContext.external_id,
    lp_click_url: lpClickUrl(c.env.APP_URL, program.tracking_hostname, c.req.url, clickId),
    subs: Object.fromEntries(SUB_KEYS.map((key) => [key, clickContext[key]])),
  };

  // Anti-fraud verdict and rotation config are independent lookups: run them in parallel.
  const [config, traffic] = await Promise.all([
    getRotationConfig(c.env.DB, program.id),
    evaluateTraffic(c.env.DB, program.id, c.req.raw, clickContext),
  ]);
  let destination = fallbackDestination(baseDestination, ctx);
  let pathId: string | null = null;
  let landerId: string | null = null;
  let offerId: string | null = null;

  // Anti-fraud verdict + routing rules: flagged traffic may go to the campaign's configured
  // safe page; otherwise the first matching rule's paths replace the default pool.
  const pool = selectRulePaths(config.rules, config.paths, traffic.rule_context).paths;

  if (traffic.safe_page) {
    destination = { url: traffic.safe_page, path_id: null, lander_id: null, offer_id: null };
  } else if (pool.length > 0) {
    const path = await selectPath(c.env.DB, config.rotation, pool, {
      programId: program.id,
      visitorKey,
      defer,
    });
    if (path) {
      const pathDest = resolvePathDestination(path, baseDestination, ctx);
      if ("url" in pathDest) {
        destination = pathDest;
        pathId = pathDest.path_id;
        landerId = pathDest.lander_id;
        offerId = pathDest.offer_id;
      }
    }
  }

  if ("error" in destination) {
    return c.text(destination.error, 503);
  }

  const now = Date.now();
  const { is_bot: _uaBot, ...contextColumns } = clickContext;
  const is_bot = traffic.is_bot;
  // Awaited: /lp and conversions look this click up, so it must exist before the redirect.
  // Uniqueness is computed inside the INSERT (one round trip).
  await recordClick(c.env.DB, {
    ...contextColumns,
    // Same values rules matched on, so reports group exactly like rules route.
    asn: traffic.rule_context.asn,
    language: traffic.rule_context.language,
    connection: traffic.rule_context.is_datacenter ? "datacenter" : "residential",
    id: clickId,
    program_id: program.id,
    affiliate_id: affiliate.id,
    path_id: pathId,
    lander_id: landerId,
    offer_id: offerId,
    unique_since: now - UNIQUE_WINDOW_MS,
    is_bot,
    created_at: now,
  });

  // Click triggers are best-effort and never delay or fail the redirect.
  defer(
    (async () => {
      const clickTriggers = await getTriggersForEvent(c.env.DB, program.user_id, program.id, "click");
      await fireTriggerWebhooks(clickTriggers, {
        click_id: clickId,
        velo_ref: affiliate.code,
        campaign_key: program.campaign_key,
        program_id: program.id,
      });
    })(),
  );

  const headers = new Headers();
  headers.set("Location", destination.url.toString());
  headers.append("Set-Cookie", affiliateCookie(affiliate.code, secure));
  if (setVisitorCookie) {
    headers.append("Set-Cookie", visitorCookie(visitorKey, secure));
  }

  return new Response(null, { status: 302, headers });
}

const redirect = new Hono<AppContext>();

redirect.get("/:code", async (c) => {
  const code = c.req.param("code");
  const target = await getAffiliateLinkTarget(c.env.DB, code);
  if (!target) {
    return c.text("Affiliate link not found", 404);
  }
  if (target.status !== "active") {
    return c.text("Campaign not found", 404);
  }

  return handleClickRedirect(c, target, { id: target.affiliate_id, code: target.affiliate_code });
});

const campaign = new Hono<AppContext>();

campaign.get("/:key", async (c) => {
  const key = c.req.param("key");
  const program = await getCampaignLinkTarget(c.env.DB, key);
  if (!program || program.status !== "active") {
    return c.text("Campaign not found", 404);
  }

  // Campaign affiliate comes with the lookup; created on the first click only.
  // The rotation is created on demand by getRotationConfig.
  const affiliate =
    program.affiliate_id && program.affiliate_code
      ? { id: program.affiliate_id, code: program.affiliate_code }
      : await getOrCreateCampaignAffiliate(c.env.DB, program.id, key);

  return handleClickRedirect(
    c,
    { ...program, campaign_key: program.campaign_key ?? key },
    affiliate,
  );
});

/**
 * LP click: the lander links to `/lp/{click_id}` (macro `{lp_click_url}`). Marks the click's
 * LP click and redirects to the offer chosen for the click's path at click time.
 * Only configured offer URLs are ever used as targets.
 */
const lp = new Hono<AppContext>();

lp.get("/:clickId", async (c) => {
  const click = await getLpClickTarget(c.env.DB, c.req.param("clickId"));
  if (!click?.offer_id) {
    return c.text("Offer not found", 404);
  }
  if (click.program_status !== "active") {
    return c.text("Campaign not found", 404);
  }
  if (!click.offer_url || !click.affiliate_code) {
    return c.text("Offer not found", 404);
  }
  const affiliate = { code: click.affiliate_code };

  const ctx: RoutingContext = {
    click_id: click.id,
    velo_ref: affiliate.code,
    campaign_key: click.campaign_key,
    campaign_id: click.program_id,
    offer_id: click.offer_id,
    lander_id: click.lander_id,
    country: click.country,
    external_id: click.external_id,
    subs: Object.fromEntries(SUB_KEYS.map((key) => [key, click[key]])),
  };
  const parsed = parseHttpUrl(substituteMacros(click.offer_url, ctx));
  if (!parsed) {
    return c.text("Invalid offer URL", 503);
  }

  // LP click stat is recorded after the response; it never blocks the offer redirect.
  if (click.lp_clicked_at == null) {
    backgroundTasks(c)(markLpClick(c.env.DB, click.id, Date.now()));
  }

  let url = withQueryParam(parsed, "velo_ref", affiliate.code);
  url = withQueryParam(url, "click_id", click.id);
  return c.redirect(url.toString(), 302);
});

export { redirect, campaign, lp };
