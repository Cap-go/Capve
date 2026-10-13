import {
  getAffiliateByCode,
  getClickById,
  getProgramById,
  getTrackedClick,
  recordConversion,
  type ConversionInput,
  type ConversionRecordStatus,
} from "../db/queries";
import { isApprovedStatus } from "./metrics";
import { getTriggersForEvent } from "../db/ops";
import { fireS2SPostback } from "./postback";
import { fireTriggerWebhooks } from "./triggers";
import { id } from "./utils";

export type CreateConversionParams = {
  program_id: string;
  affiliate_id: string;
  click_id?: string | null;
  order_id: string;
  amount: number;
  status?: string;
  status2?: string | null;
  currency?: string;
  disable_s2s?: boolean;
  /**
   * Binom-style status upsert: a repeat for the same click + order id updates
   * the stored conversion. Only fields flagged here overwrite stored values.
   */
  upsert?: { status: boolean; amount: boolean };
};

/** Deterministic sampling so every status change of one click is sent (or not) consistently. */
function sampled(key: string, percent: number): boolean {
  if (percent >= 100) return true;
  if (percent <= 0) return false;
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return hash % 100 < percent;
}

async function fireTrafficSourcePostback(
  db: D1Database,
  program: { traffic_source_id?: string | null },
  macros: { click_id: string | null; payout: number; status: string; currency: string; order_id: string; affiliate_code: string },
) {
  if (!program.traffic_source_id || !isApprovedStatus(macros.status)) return;
  const source = await db
    .prepare("SELECT s2s_postback_url, postback_percent FROM traffic_sources WHERE id = ?")
    .bind(program.traffic_source_id)
    .first<{ s2s_postback_url: string | null; postback_percent: number | null }>();
  if (!source?.s2s_postback_url?.trim()) return;
  if (!sampled(macros.click_id ?? macros.order_id, source.postback_percent ?? 100)) return;

  const click = macros.click_id ? await getTrackedClick(db, macros.click_id) : null;
  await fireS2SPostback(source.s2s_postback_url, {
    click_id: macros.click_id ?? "",
    external_id: click?.external_id ?? "",
    payout: String(macros.payout),
    status: macros.status,
    currency: macros.currency,
    order_id: macros.order_id,
    affiliate_code: macros.affiliate_code,
  });
}

export async function createConversion(
  db: D1Database,
  program: {
    id: string;
    user_id: string;
    s2s_postback_url?: string | null;
    traffic_source_id?: string | null;
  },
  affiliate: { id: string; code: string },
  params: CreateConversionParams,
): Promise<{
  status: ConversionRecordStatus;
  conversion: {
    affiliate_code: string;
    click_id: string | null;
    order_id: string;
    amount: number;
    amount_cents: number;
    status: string;
    status2: string | null;
    currency: string;
  };
}> {
  const amountCents = Math.round(params.amount * 100);
  const recorded = await recordConversion(
    db,
    {
      id: id("cnv"),
      program_id: params.program_id,
      affiliate_id: params.affiliate_id,
      click_id: params.click_id ?? null,
      order_id: params.order_id,
      amount_cents: amountCents,
      status: params.status ?? "lead",
      status2: params.status2 ?? null,
      currency: params.currency ?? "USD",
      created_at: Date.now(),
    } satisfies ConversionInput,
    params.upsert
      ? {
          status: params.upsert.status ? (params.status ?? "lead") : undefined,
          status2: params.upsert.status ? (params.status2 ?? null) : undefined,
          amount_cents: params.upsert.amount ? amountCents : undefined,
        }
      : undefined,
  );

  const stored = recorded.conversion;
  const payout = stored.amount_cents / 100;

  if (recorded.status !== "duplicate" && !params.disable_s2s) {
    await fireS2SPostback(program.s2s_postback_url, {
      click_id: stored.click_id ?? "",
      payout: String(payout),
      status: stored.status,
      status2: stored.status2 ?? undefined,
      currency: stored.currency,
      order_id: stored.order_id,
      affiliate_code: affiliate.code,
    });

    await fireTrafficSourcePostback(db, program, {
      click_id: stored.click_id,
      payout,
      status: stored.status,
      currency: stored.currency,
      order_id: stored.order_id,
      affiliate_code: affiliate.code,
    });

    const triggers = await getTriggersForEvent(db, program.user_id, program.id, "conversion");
    await fireTriggerWebhooks(triggers, {
      click_id: stored.click_id,
      payout,
      status: stored.status,
      order_id: stored.order_id,
      affiliate_code: affiliate.code,
      program_id: program.id,
    });
  }

  return {
    status: recorded.status,
    conversion: {
      affiliate_code: affiliate.code,
      click_id: stored.click_id,
      order_id: stored.order_id,
      amount: payout,
      amount_cents: stored.amount_cents,
      status: stored.status,
      status2: stored.status2,
      currency: stored.currency,
    },
  };
}

export async function resolveAffiliateFromClick(
  db: D1Database,
  clickId: string,
  programId?: string,
) {
  const click = await getClickById(db, clickId);
  if (!click) return null;
  if (programId && click.program_id !== programId) return null;

  const program = await getProgramById(db, click.program_id);
  if (!program) return null;

  const affiliates = await db
    .prepare("SELECT id, program_id, name, code, created_at FROM affiliates WHERE id = ?")
    .bind(click.affiliate_id)
    .first<{ id: string; program_id: string; name: string; code: string; created_at: number }>();

  if (!affiliates) return null;

  return { click, program, affiliate: affiliates };
}

export async function resolveAffiliateByCode(
  db: D1Database,
  programId: string,
  affiliateCode: string,
) {
  const affiliate = await getAffiliateByCode(db, affiliateCode);
  if (!affiliate || affiliate.program_id !== programId) return null;
  const program = await getProgramById(db, programId);
  if (!program) return null;
  return { program, affiliate };
}
