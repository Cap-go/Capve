/** Per-click traffic evaluation: rule context, bot / blocklist / datacenter flag, safe page. */
import { loadClickFilters } from "../db/antifraud";
import { blocklistMatch, isDatacenterAsn, safePageTarget } from "./antifraud";
import type { ClickContext } from "./click-context";
import { parseAsn, primaryLanguage, type RuleContext } from "./rules";

export type TrafficVerdict = {
  rule_context: RuleContext;
  /** UA/Cloudflare bot, blocklisted, or datacenter (when the campaign blocks datacenters). */
  is_bot: boolean;
  reason: "bot" | "blocklist" | "datacenter" | null;
  /** Configured campaign safe page for flagged traffic, else null (route normally). */
  safe_page: URL | null;
};

export function buildRuleContext(request: Request, click: ClickContext, now = Date.now()): RuleContext {
  const cf = ((request as Request & { cf?: { asn?: number | string } }).cf ?? {}) as {
    asn?: number | string;
  };
  const asn = parseAsn(cf.asn ?? null);
  return {
    ip: click.ip,
    country: click.country,
    continent: click.continent,
    region: click.region,
    city: click.city,
    device_type: click.device_type,
    os: click.os,
    browser: click.browser,
    isp: click.isp,
    referrer_domain: click.referrer_domain,
    is_bot: click.is_bot,
    sub1: click.sub1,
    sub2: click.sub2,
    sub3: click.sub3,
    sub4: click.sub4,
    sub5: click.sub5,
    sub6: click.sub6,
    sub7: click.sub7,
    sub8: click.sub8,
    sub9: click.sub9,
    sub10: click.sub10,
    asn,
    language: primaryLanguage(request.headers.get("accept-language")),
    is_datacenter: isDatacenterAsn(asn),
    now,
  };
}

export async function evaluateTraffic(
  db: D1Database,
  programId: string,
  request: Request,
  click: ClickContext,
): Promise<TrafficVerdict> {
  const ctx = buildRuleContext(request, click);
  const { filter, blocklist } = await loadClickFilters(db, programId);

  let reason: TrafficVerdict["reason"] = null;
  if (blocklistMatch(blocklist, { ip: click.ip, asn: ctx.asn, user_agent: click.user_agent })) {
    reason = "blocklist";
  } else if (filter.block_datacenter && ctx.is_datacenter) {
    reason = "datacenter";
  } else if (click.is_bot) {
    reason = "bot";
  }

  const isBot = reason !== null;
  return {
    rule_context: { ...ctx, is_bot: isBot },
    is_bot: isBot,
    reason,
    safe_page: isBot ? safePageTarget(filter) : null,
  };
}
