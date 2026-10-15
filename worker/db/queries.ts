import type {
  Affiliate,
  AffiliateStats,
  Click,
  ClickLogRow,
  ConversionLogRow,
  Program,
  ProgramStats,
} from "../types";
import { campaignKeyFromName } from "./entities";
import { affiliateCode, id, isUniqueConstraintError } from "../lib/utils";
import {
  approvedStatusSql,
  computeEventMetrics,
  conversionRatePct,
  primaryCurrency,
} from "../lib/metrics";

const PROGRAM_COLUMNS =
  "id, user_id, name, slug, api_key, destination_url, campaign_key, group_id, traffic_source_id, tags, status, created_at";

const USER_COLUMNS =
  "id, email, name, email_verified, is_platform_admin, session_version, created_at";

export async function getUserByEmail(db: D1Database, email: string) {
  return db
    .prepare(`SELECT ${USER_COLUMNS} FROM users WHERE email = ?`)
    .bind(email.toLowerCase())
    .first<{
      id: string;
      email: string;
      name: string | null;
      email_verified: number;
      is_platform_admin: number;
      session_version: number;
      created_at: number;
    }>();
}

export async function getUserById(db: D1Database, userId: string) {
  return db
    .prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`)
    .bind(userId)
    .first<{
      id: string;
      email: string;
      name: string | null;
      email_verified: number;
      is_platform_admin: number;
      session_version: number;
      created_at: number;
    }>();
}

export async function getUserPasswordHash(db: D1Database, email: string) {
  return db
    .prepare("SELECT password_hash FROM users WHERE email = ?")
    .bind(email.toLowerCase())
    .first<{ password_hash: string | null }>();
}

export async function createUser(
  db: D1Database,
  user: {
    id: string;
    email: string;
    password_hash: string;
    name?: string | null;
    created_at: number;
  },
) {
  // New accounts start unverified; invites and platform admin need a verified email.
  await db
    .prepare(
      "INSERT INTO users (id, email, password_hash, name, email_verified, is_platform_admin, created_at) VALUES (?, ?, ?, ?, 0, 0, ?)",
    )
    .bind(user.id, user.email.toLowerCase(), user.password_hash, user.name ?? null, user.created_at)
    .run();
}

/** Sets the password and bumps session_version so every existing session is revoked. */
export async function updateUserPassword(db: D1Database, userId: string, passwordHash: string) {
  await db
    .prepare(
      "UPDATE users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?",
    )
    .bind(passwordHash, userId)
    .run();
}

export async function bumpSessionVersion(db: D1Database, userId: string) {
  await db
    .prepare("UPDATE users SET session_version = session_version + 1 WHERE id = ?")
    .bind(userId)
    .run();
}

export async function markEmailVerified(db: D1Database, userId: string) {
  await db.prepare("UPDATE users SET email_verified = 1 WHERE id = ?").bind(userId).run();
}

export async function listPrograms(db: D1Database, userId: string): Promise<Program[]> {
  const { results } = await db
    .prepare(`SELECT ${PROGRAM_COLUMNS} FROM programs WHERE user_id = ? ORDER BY created_at DESC`)
    .bind(userId)
    .all<Program>();
  return results ?? [];
}

export async function getProgram(db: D1Database, programId: string, userId: string) {
  return db
    .prepare(`SELECT ${PROGRAM_COLUMNS} FROM programs WHERE id = ? AND user_id = ?`)
    .bind(programId, userId)
    .first<Program>();
}

export async function getProgramById(db: D1Database, programId: string) {
  return db
    .prepare(`SELECT ${PROGRAM_COLUMNS} FROM programs WHERE id = ?`)
    .bind(programId)
    .first<Program>();
}

export async function getProgramByConvertSecret(db: D1Database, secret: string) {
  return db
    .prepare(`SELECT ${PROGRAM_COLUMNS} FROM programs WHERE convert_secret = ?`)
    .bind(secret)
    .first<Program>();
}

export async function createProgram(
  db: D1Database,
  program: Program & { convert_secret: string },
) {
  await db
    .prepare(
      `INSERT INTO programs (
        id, user_id, name, slug, api_key, destination_url, convert_secret,
        campaign_key, group_id, traffic_source_id, tags, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      program.id,
      program.user_id,
      program.name,
      program.slug,
      program.api_key,
      program.destination_url,
      program.convert_secret,
      program.campaign_key ?? null,
      program.group_id ?? null,
      program.traffic_source_id ?? null,
      program.tags ?? null,
      program.status ?? "active",
      program.created_at,
    )
    .run();
}

export async function updateProgram(
  db: D1Database,
  programId: string,
  userId: string,
  updates: {
    name?: string;
    destination_url?: string | null;
    group_id?: string | null;
    traffic_source_id?: string | null;
    tags?: string | null;
    status?: string;
  },
): Promise<Program | null> {
  const existing = await getProgram(db, programId, userId);
  if (!existing) return null;

  const next = {
    name: updates.name?.trim() || existing.name,
    destination_url:
      updates.destination_url === undefined
        ? existing.destination_url
        : updates.destination_url,
    group_id: updates.group_id === undefined ? existing.group_id : updates.group_id,
    traffic_source_id:
      updates.traffic_source_id === undefined
        ? existing.traffic_source_id
        : updates.traffic_source_id,
    tags: updates.tags === undefined ? existing.tags : updates.tags,
    status: updates.status ?? existing.status,
  };

  await db
    .prepare(
      `UPDATE programs SET name = ?, destination_url = ?,
       group_id = ?, traffic_source_id = ?, tags = ?, status = ?
       WHERE id = ? AND user_id = ?`,
    )
    .bind(
      next.name,
      next.destination_url,
      next.group_id,
      next.traffic_source_id,
      next.tags,
      next.status,
      programId,
      userId,
    )
    .run();

  return getProgram(db, programId, userId);
}

export async function listAffiliates(db: D1Database, programId: string): Promise<Affiliate[]> {
  const { results } = await db
    .prepare(
      "SELECT id, program_id, name, code, created_at FROM affiliates WHERE program_id = ? ORDER BY created_at DESC",
    )
    .bind(programId)
    .all<Affiliate>();
  return results ?? [];
}

export async function getAffiliateByCode(db: D1Database, code: string) {
  return db
    .prepare("SELECT id, program_id, name, code, created_at FROM affiliates WHERE code = ?")
    .bind(code)
    .first<Affiliate>();
}

export async function createAffiliate(db: D1Database, affiliate: Affiliate) {
  await db
    .prepare("INSERT INTO affiliates (id, program_id, name, code, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(affiliate.id, affiliate.program_id, affiliate.name, affiliate.code, affiliate.created_at)
    .run();
}

export async function createAffiliateWithUniqueCode(
  db: D1Database,
  input: { program_id: string; name: string },
  maxAttempts = 8,
): Promise<Affiliate> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const affiliate: Affiliate = {
      id: id("aff"),
      program_id: input.program_id,
      name: input.name,
      code: affiliateCode(),
      created_at: Date.now(),
    };
    try {
      await createAffiliate(db, affiliate);
      return affiliate;
    } catch (error) {
      if (isUniqueConstraintError(error)) continue;
      throw error;
    }
  }
  throw new Error("Could not generate unique affiliate code");
}

export async function getClickById(db: D1Database, clickId: string): Promise<Click | null> {
  return db
    .prepare(
      "SELECT id, program_id, affiliate_id, ip, user_agent, created_at FROM clicks WHERE id = ?",
    )
    .bind(clickId)
    .first<Click>();
}

const CLICK_CONTEXT_COLUMNS = [
  "country",
  "region",
  "city",
  "device_type",
  "os",
  "browser",
  "isp",
  "referrer_domain",
  "sub1",
  "sub2",
  "sub3",
  "sub4",
  "sub5",
  "sub6",
  "sub7",
  "sub8",
  "sub9",
  "sub10",
  "external_id",
  "cost_cents",
  "visitor_hash",
] as const;

export type ClickContextColumns = Partial<
  Record<(typeof CLICK_CONTEXT_COLUMNS)[number], string | number | null>
>;

/** Traffic source of the click's campaign at click time (bind: program id). */
const CLICK_SOURCE_SQL =
  "FROM programs p JOIN traffic_sources ts ON ts.id = p.traffic_source_id WHERE p.id = ?";

export async function recordClick(
  db: D1Database,
  click: {
    id: string;
    program_id: string;
    affiliate_id: string;
    ip?: string | null;
    user_agent?: string | null;
    path_id?: string | null;
    lander_id?: string | null;
    offer_id?: string | null;
    is_unique?: boolean;
    /**
     * When set, `is_unique` is computed inside the INSERT (no prior click with the
     * same visitor_hash on this campaign since this time): one D1 round trip.
     */
    unique_since?: number;
    is_bot?: boolean;
    created_at: number;
  } & ClickContextColumns,
) {
  const contextValues = CLICK_CONTEXT_COLUMNS.map((column) => click[column] ?? null);
  const costIndex = CLICK_CONTEXT_COLUMNS.indexOf("cost_cents");
  const contextPlaceholders = CLICK_CONTEXT_COLUMNS.map((column) =>
    // Without an explicit `cost`, snapshot the source's CPC/CPM cost now (history stays fixed).
    column === "cost_cents"
      ? `COALESCE(?, (SELECT CASE ts.cost_type WHEN 'cpc' THEN ts.default_cost_cents
          WHEN 'cpm' THEN ts.default_cost_cents / 1000.0 END ${CLICK_SOURCE_SQL}))`
      : "?",
  );
  const explicitCost = contextValues[costIndex];
  const uniqueInline = click.unique_since != null;
  const uniqueSql = uniqueInline
    ? "NOT EXISTS (SELECT 1 FROM clicks WHERE program_id = ? AND visitor_hash = ? AND created_at >= ?)"
    : "?";
  const uniqueBinds = uniqueInline
    ? [click.program_id, click.visitor_hash ?? null, click.unique_since!]
    : [click.is_unique === false ? 0 : 1];
  await db
    .prepare(
      `INSERT INTO clicks (
        id, program_id, affiliate_id, ip, user_agent,
        path_id, lander_id, offer_id, ${CLICK_CONTEXT_COLUMNS.join(", ")},
        traffic_source_id, cpa_cost_cents,
        is_unique, is_bot, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${contextPlaceholders.join(", ")},
        (SELECT traffic_source_id FROM programs WHERE id = ?),
        CASE WHEN ? IS NULL THEN (SELECT CASE WHEN ts.cost_type = 'cpa' THEN ts.default_cost_cents END
          ${CLICK_SOURCE_SQL}) END,
        ${uniqueSql}, ?, ?)`,
    )
    .bind(
      click.id,
      click.program_id,
      click.affiliate_id,
      click.ip ?? null,
      click.user_agent ?? null,
      click.path_id ?? null,
      click.lander_id ?? null,
      click.offer_id ?? null,
      ...contextValues.flatMap((value, index) =>
        index === costIndex ? [value, click.program_id] : [value],
      ),
      click.program_id,
      explicitCost,
      click.program_id,
      ...uniqueBinds,
      click.is_bot ? 1 : 0,
      click.created_at,
    )
    .run();
}

/** Unique = no click from the same ip+UA hash on this campaign within the window. */
export async function isUniqueVisitor(
  db: D1Database,
  programId: string,
  visitorHash: string,
  since: number,
): Promise<boolean> {
  const row = await db
    .prepare(
      "SELECT 1 AS hit FROM clicks WHERE program_id = ? AND visitor_hash = ? AND created_at >= ? LIMIT 1",
    )
    .bind(programId, visitorHash, since)
    .first<{ hit: number }>();
  return !row;
}

export type TrackedClick = {
  id: string;
  program_id: string;
  affiliate_id: string;
  path_id: string | null;
  lander_id: string | null;
  offer_id: string | null;
  external_id: string | null;
  country: string | null;
  lp_clicked_at: number | null;
  created_at: number;
} & Record<`sub${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10}`, string | null>;

export async function getTrackedClick(db: D1Database, clickId: string) {
  return db
    .prepare(
      `SELECT id, program_id, affiliate_id, path_id, lander_id, offer_id, external_id, country,
        sub1, sub2, sub3, sub4, sub5, sub6, sub7, sub8, sub9, sub10, lp_clicked_at, created_at
       FROM clicks WHERE id = ?`,
    )
    .bind(clickId)
    .first<TrackedClick>();
}

export async function markLpClick(db: D1Database, clickId: string, at: number) {
  await db
    .prepare("UPDATE clicks SET lp_clicked_at = ? WHERE id = ? AND lp_clicked_at IS NULL")
    .bind(at, clickId)
    .run();
}

export async function getOfferForUser(db: D1Database, offerId: string, userId: string) {
  return db
    .prepare("SELECT id, url, payout_cents FROM offers WHERE id = ? AND user_id = ?")
    .bind(offerId, userId)
    .first<{ id: string; url: string; payout_cents: number }>();
}

export type ConversionInput = {
  id: string;
  program_id: string;
  affiliate_id: string;
  click_id?: string | null;
  order_id: string;
  amount_cents: number;
  status?: string;
  status2?: string | null;
  event?: string | null;
  currency?: string;
  created_at: number;
};

export type ConversionRecordStatus = "created" | "updated" | "duplicate";

export type StoredConversion = {
  id: string;
  click_id: string | null;
  order_id: string;
  amount_cents: number;
  status: string;
  status2: string | null;
  event: string | null;
  currency: string;
};

/**
 * Insert a conversion. On (program_id, order_id) conflict:
 * - without `update`, or for a different click → "duplicate" (idempotent)
 * - with `update` → status/payout are updated when they changed (Binom status upsert);
 *   identical repeats stay "duplicate". Fields left undefined keep the stored value.
 */
export async function recordConversion(
  db: D1Database,
  conversion: ConversionInput,
  update?: { status?: string; status2?: string | null; amount_cents?: number },
): Promise<{ status: ConversionRecordStatus; conversion: StoredConversion; previous_status?: string }> {
  const inserted: StoredConversion = {
    id: conversion.id,
    click_id: conversion.click_id ?? null,
    order_id: conversion.order_id,
    amount_cents: conversion.amount_cents,
    status: conversion.status ?? "lead",
    status2: conversion.status2 ?? null,
    event: conversion.event ?? null,
    currency: conversion.currency ?? "USD",
  };
  try {
    await db
      .prepare(
        `INSERT INTO conversions (
          id, program_id, affiliate_id, click_id, order_id,
          amount_cents, status, status2, event, currency, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        conversion.id,
        conversion.program_id,
        conversion.affiliate_id,
        inserted.click_id,
        inserted.order_id,
        inserted.amount_cents,
        inserted.status,
        inserted.status2,
        inserted.event,
        inserted.currency,
        conversion.created_at,
      )
      .run();
    return { status: "created", conversion: inserted };
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
  }

  const existing = await db
    .prepare(
      `SELECT id, click_id, order_id, amount_cents, status, status2, event, currency
       FROM conversions WHERE program_id = ? AND order_id = ?`,
    )
    .bind(conversion.program_id, conversion.order_id)
    .first<StoredConversion>();
  if (!existing) return { status: "duplicate", conversion: inserted };
  if (!update || existing.click_id !== (conversion.click_id ?? null)) {
    return { status: "duplicate", conversion: existing };
  }

  const next: StoredConversion = {
    ...existing,
    status: update.status ?? existing.status,
    status2: update.status2 === undefined ? existing.status2 : update.status2,
    amount_cents: update.amount_cents ?? existing.amount_cents,
  };
  if (
    next.status === existing.status &&
    next.status2 === existing.status2 &&
    next.amount_cents === existing.amount_cents
  ) {
    return { status: "duplicate", conversion: existing };
  }

  await db
    .prepare(
      "UPDATE conversions SET status = ?, status2 = ?, amount_cents = ?, updated_at = ? WHERE id = ?",
    )
    .bind(next.status, next.status2, next.amount_cents, Date.now(), existing.id)
    .run();
  return { status: "updated", conversion: next, previous_status: existing.status };
}

export async function listClickLog(
  db: D1Database,
  programId: string,
  limit = 50,
  offset = 0,
): Promise<ClickLogRow[]> {
  const { results } = await db
    .prepare(
      `SELECT
        c.id, c.program_id, c.affiliate_id, c.ip, c.user_agent, c.created_at,
        a.name AS affiliate_name, a.code AS affiliate_code,
        EXISTS(SELECT 1 FROM conversions cv WHERE cv.click_id = c.id) AS converted
      FROM clicks c
      JOIN affiliates a ON a.id = c.affiliate_id
      WHERE c.program_id = ?
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?`,
    )
    .bind(programId, limit, offset)
    .all<{
      id: string;
      program_id: string;
      affiliate_id: string;
      ip: string | null;
      user_agent: string | null;
      created_at: number;
      affiliate_name: string;
      affiliate_code: string;
      converted: number;
    }>();

  return (results ?? []).map((r) => ({
    id: r.id,
    program_id: r.program_id,
    affiliate_id: r.affiliate_id,
    ip: r.ip,
    user_agent: r.user_agent,
    created_at: r.created_at,
    affiliate_name: r.affiliate_name,
    affiliate_code: r.affiliate_code,
    converted: Boolean(r.converted),
  }));
}

export async function listConversionLog(
  db: D1Database,
  programId: string,
  limit = 50,
  offset = 0,
): Promise<ConversionLogRow[]> {
  const { results } = await db
    .prepare(
      `SELECT
        cv.id, cv.program_id, cv.affiliate_id, cv.click_id, cv.order_id,
        cv.amount_cents, cv.status, cv.status2, cv.event, cv.currency, cv.created_at,
        a.name AS affiliate_name, a.code AS affiliate_code
      FROM conversions cv
      JOIN affiliates a ON a.id = cv.affiliate_id
      WHERE cv.program_id = ?
      ORDER BY cv.created_at DESC
      LIMIT ? OFFSET ?`,
    )
    .bind(programId, limit, offset)
    .all<ConversionLogRow>();
  return results ?? [];
}

export async function getProgramStats(db: D1Database, program: Program): Promise<ProgramStats> {
  const affiliates = await listAffiliates(db, program.id);
  const [clickRows, convertedRows, conversionRows] = await Promise.all([
    db
      .prepare(
        "SELECT affiliate_id, COUNT(*) AS count FROM clicks WHERE program_id = ? GROUP BY affiliate_id",
      )
      .bind(program.id)
      .all<{ affiliate_id: string; count: number }>(),
    db
      .prepare(
        `SELECT cv.affiliate_id, COUNT(DISTINCT cv.click_id) AS count
         FROM conversions cv
         WHERE cv.program_id = ? AND cv.click_id IS NOT NULL AND ${approvedStatusSql("cv")}
         GROUP BY cv.affiliate_id`,
      )
      .bind(program.id)
      .all<{ affiliate_id: string; count: number }>(),
    db
      .prepare(
        `SELECT cv.affiliate_id, cv.event, UPPER(cv.currency) AS currency,
           COUNT(DISTINCT COALESCE(cv.click_id, cv.id)) AS units,
           SUM(CASE WHEN cv.click_id IS NULL THEN 1 ELSE 0 END) AS clickless,
           COALESCE(SUM(cv.amount_cents), 0) AS revenue
         FROM conversions cv
         WHERE cv.program_id = ? AND ${approvedStatusSql("cv")}
         GROUP BY cv.affiliate_id, cv.event, UPPER(cv.currency)`,
      )
      .bind(program.id)
      .all<{
        affiliate_id: string;
        event: string | null;
        currency: string | null;
        units: number;
        clickless: number;
        revenue: number;
      }>(),
  ]);

  type EventAcc = { count: number; revenue_by_currency: Record<string, number> };
  type ConvAcc = {
    count: number;
    revenue_by_currency: Record<string, number>;
    events: Record<string, EventAcc>;
  };
  const clicksBy = new Map((clickRows.results ?? []).map((r) => [r.affiliate_id, r.count]));
  const conversionsBy = new Map<string, ConvAcc>();
  const accFor = (affiliateId: string) => {
    let acc = conversionsBy.get(affiliateId);
    if (!acc) {
      acc = { count: 0, revenue_by_currency: {}, events: {} };
      conversionsBy.set(affiliateId, acc);
    }
    return acc;
  };
  for (const row of convertedRows.results ?? []) accFor(row.affiliate_id).count += row.count;
  const currencyCounts = new Map<string, number>();
  for (const row of conversionRows.results ?? []) {
    const acc = accFor(row.affiliate_id);
    const currency = row.currency || "USD";
    acc.count += row.clickless;
    acc.revenue_by_currency[currency] = (acc.revenue_by_currency[currency] ?? 0) + row.revenue;
    currencyCounts.set(currency, (currencyCounts.get(currency) ?? 0) + row.units);
    if (row.event) {
      const ev = (acc.events[row.event] ??= { count: 0, revenue_by_currency: {} });
      ev.count += row.units;
      ev.revenue_by_currency[currency] = (ev.revenue_by_currency[currency] ?? 0) + row.revenue;
    }
  }
  const currency = primaryCurrency(currencyCounts);
  const eventMetrics = (events: Record<string, EventAcc>, clicks: number) =>
    computeEventMetrics(
      Object.fromEntries(
        Object.entries(events).map(([name, ev]) => [
          name,
          { count: ev.count, revenue_cents: ev.revenue_by_currency[currency] ?? 0 },
        ]),
      ),
      clicks,
      null,
    );
  const addTo = (target: Record<string, number>, source: Record<string, number>) => {
    for (const [key, value] of Object.entries(source)) target[key] = (target[key] ?? 0) + value;
  };

  const stats: AffiliateStats[] = affiliates.map((affiliate) => {
    const clickCount = clicksBy.get(affiliate.id) ?? 0;
    const conversions = conversionsBy.get(affiliate.id);
    const conversionCount = conversions?.count ?? 0;
    const events = conversions?.events ?? {};
    return {
      ...affiliate,
      clicks: clickCount,
      conversions: conversionCount,
      revenue_cents: conversions?.revenue_by_currency[currency] ?? 0,
      conversion_rate: conversionRatePct(conversionCount, clickCount),
      events: Object.fromEntries(Object.entries(events).map(([name, ev]) => [name, ev.count])),
      event_metrics: eventMetrics(events, clickCount),
      revenue_by_currency: conversions?.revenue_by_currency ?? {},
    };
  });

  const totals = { clicks: 0, conversions: 0, revenue_cents: 0 };
  const revenueByCurrency: Record<string, number> = {};
  const totalEvents: Record<string, EventAcc> = {};
  for (const row of stats) {
    totals.clicks += row.clicks;
    totals.conversions += row.conversions;
    totals.revenue_cents += row.revenue_cents;
    addTo(revenueByCurrency, row.revenue_by_currency);
  }
  for (const acc of conversionsBy.values()) {
    for (const [name, ev] of Object.entries(acc.events)) {
      const total = (totalEvents[name] ??= { count: 0, revenue_by_currency: {} });
      total.count += ev.count;
      addTo(total.revenue_by_currency, ev.revenue_by_currency);
    }
  }

  return {
    program,
    totals: {
      ...totals,
      conversion_rate: conversionRatePct(totals.conversions, totals.clicks),
      events: Object.fromEntries(Object.entries(totalEvents).map(([name, ev]) => [name, ev.count])),
      event_metrics: eventMetrics(totalEvents, totals.clicks),
      revenue_by_currency: revenueByCurrency,
    },
    currency,
    affiliates: stats,
  };
}
