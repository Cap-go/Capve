import type { TrackedClick } from "./queries";

/** Single-query lookups for the public tracking hot path (/r, /lp). */

export type AffiliateLinkTarget = {
  affiliate_id: string;
  affiliate_code: string;
  id: string;
  user_id: string;
  destination_url: string | null;
  campaign_key: string | null;
  status: string;
  traffic_source_id: string | null;
  /** traffic_source_settings.tokens JSON of the campaign's source (null = none). */
  source_tokens: string | null;
};

/** Affiliate link code → affiliate + campaign in one round trip. */
export async function getAffiliateLinkTarget(db: D1Database, code: string) {
  return db
    .prepare(
      `SELECT a.id AS affiliate_id, a.code AS affiliate_code,
        p.id, p.user_id, p.destination_url, p.campaign_key, p.status,
        p.traffic_source_id, tss.tokens AS source_tokens
       FROM affiliates a
       JOIN programs p ON p.id = a.program_id
       LEFT JOIN traffic_source_settings tss ON tss.traffic_source_id = p.traffic_source_id
       WHERE a.code = ?`,
    )
    .bind(code)
    .first<AffiliateLinkTarget>();
}

/** Campaign key → campaign + its "c_{key}" traffic affiliate (null before the first click). */
export async function getCampaignLinkTarget(db: D1Database, campaignKey: string) {
  return db
    .prepare(
      `SELECT p.id, p.user_id, p.destination_url, p.campaign_key, p.status,
        p.traffic_source_id, tss.tokens AS source_tokens,
        a.id AS affiliate_id, a.code AS affiliate_code
       FROM programs p
       LEFT JOIN traffic_source_settings tss ON tss.traffic_source_id = p.traffic_source_id
       LEFT JOIN affiliates a ON a.program_id = p.id AND a.code = 'c_' || ?
       WHERE p.campaign_key = ?`,
    )
    .bind(campaignKey, campaignKey)
    .first<{
      id: string;
      user_id: string;
      destination_url: string | null;
      campaign_key: string | null;
      status: string;
      traffic_source_id: string | null;
      source_tokens: string | null;
      affiliate_id: string | null;
      affiliate_code: string | null;
    }>();
}

export type LpClickTarget = TrackedClick & {
  program_user_id: string;
  program_status: string;
  campaign_key: string | null;
  affiliate_code: string | null;
  offer_url: string | null;
};

/**
 * Click + campaign + affiliate code + offer URL in one round trip. The offer must
 * belong to the campaign owner, so only configured offer URLs are ever targets.
 */
export async function getLpClickTarget(db: D1Database, clickId: string) {
  return db
    .prepare(
      `SELECT c.id, c.program_id, c.affiliate_id, c.path_id, c.lander_id, c.offer_id,
        c.external_id, c.country,
        c.sub1, c.sub2, c.sub3, c.sub4, c.sub5, c.sub6, c.sub7, c.sub8, c.sub9, c.sub10,
        c.lp_clicked_at, c.created_at,
        p.user_id AS program_user_id, p.status AS program_status, p.campaign_key,
        a.code AS affiliate_code,
        o.url AS offer_url
       FROM clicks c
       JOIN programs p ON p.id = c.program_id
       LEFT JOIN affiliates a ON a.id = c.affiliate_id
       LEFT JOIN offers o ON o.id = c.offer_id AND o.user_id = p.user_id
       WHERE c.id = ?`,
    )
    .bind(clickId)
    .first<LpClickTarget>();
}
