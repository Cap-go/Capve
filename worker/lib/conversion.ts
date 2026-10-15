import {
  getAffiliateByCode,
  getClickById,
  getProgramById,
  getTrackedClick,
  recordConversion,
  type ConversionInput,
  type ConversionRecordStatus,
} from "../db/queries";
import { isPostbackApprovedStatus } from "./metrics";
import { getTriggersForEvent } from "../db/ops";
import { postbacksForConversion } from "../db/postbacks";
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
  /** Conversion event (registration, ftd, ...); null = plain conversion. */
  event?: string | null;
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

/**
 * Fires every outgoing postback matching the conversion event: the campaign's
 * (every new or updated conversion, all statuses), and its traffic source's and the
 * clicked offer's network's (only when the conversion becomes approved, so once per
 * conversion; traffic source ones sampled by postback_percent).
 */
async function fireConversionPostbacks(
  db: D1Database,
  program: { id: string; user_id: string; traffic_source_id?: string | null },
  becameApproved: boolean,
  macros: {
    click_id: string | null;
    payout: number;
    status: string;
    status2: string | null;
    event: string | null;
    currency: string;
    order_id: string;
    affiliate_code: string;
  },
) {
  const click = macros.click_id ? await getTrackedClick(db, macros.click_id) : null;
  const network = click?.offer_id
    ? await db
        .prepare("SELECT network_id FROM offers WHERE id = ? AND user_id = ?")
        .bind(click.offer_id, program.user_id)
        .first<{ network_id: string | null }>()
    : null;
  const postbacks = await postbacksForConversion(
    db,
    {
      user_id: program.user_id,
      program_id: program.id,
      traffic_source_id: program.traffic_source_id ?? null,
      network_id: network?.network_id ?? null,
    },
    macros.event,
  );
  if (postbacks.length === 0) return;

  let sourcePercent = 100;
  if (program.traffic_source_id && postbacks.some((pb) => pb.traffic_source_id)) {
    const source = await db
      .prepare("SELECT postback_percent FROM traffic_sources WHERE id = ?")
      .bind(program.traffic_source_id)
      .first<{ postback_percent: number | null }>();
    sourcePercent = source?.postback_percent ?? 100;
  }
  const sourceSampled = sampled(macros.click_id ?? macros.order_id, sourcePercent);

  const values = {
    click_id: macros.click_id ?? "",
    external_id: click?.external_id ?? "",
    payout: String(macros.payout),
    status: macros.status,
    status2: macros.status2 ?? undefined,
    event: macros.event ?? undefined,
    currency: macros.currency,
    order_id: macros.order_id,
    affiliate_code: macros.affiliate_code,
  };
  await Promise.all(
    postbacks
      .filter((pb) => {
        if (pb.program_id) return true;
        if (!becameApproved) return false;
        return pb.traffic_source_id ? sourceSampled : true;
      })
      .map((pb) => fireS2SPostback(pb.url, values)),
  );
}

export async function createConversion(
  db: D1Database,
  program: {
    id: string;
    user_id: string;
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
    event: string | null;
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
      event: params.event ?? null,
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
    // Source/network postbacks fire on the not-approved → approved transition only,
    // never again on later payout or status updates of an approved conversion.
    const becameApproved =
      isPostbackApprovedStatus(stored.status) &&
      (recorded.status === "created" || !isPostbackApprovedStatus(recorded.previous_status));
    await fireConversionPostbacks(db, program, becameApproved, {
      click_id: stored.click_id,
      payout,
      status: stored.status,
      status2: stored.status2,
      event: stored.event,
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
      event: stored.event,
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
      event: stored.event,
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
