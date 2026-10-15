/** Binom-compatible postback URL template for affiliate networks. */
export function buildPostbackUrl(appUrl: string): string {
  const base = appUrl.replace(/\/$/, "");
  return `${base}/click?cnv_id={click_id}&payout={payout}&cnv_status={status}`;
}

export type PostbackMacros = {
  click_id: string;
  external_id?: string;
  payout: string;
  status: string;
  status2?: string;
  event?: string;
  currency?: string;
  order_id?: string;
  affiliate_code?: string;
};

const EVENT_PATTERN = /^[a-z0-9][a-z0-9_.-]{0,39}$/;

/**
 * Normalizes a conversion event name (registration, ftd, deposit, ...).
 * Returns null when empty, false when invalid.
 */
export function normalizeEvent(raw: string | null | undefined): string | null | false {
  const value = raw?.trim().toLowerCase();
  if (!value) return null;
  return EVENT_PATTERN.test(value) ? value : false;
}

export function applyPostbackMacros(template: string, macros: PostbackMacros): string {
  let url = template;
  const replacements: Record<string, string> = {
    click_id: macros.click_id,
    clickid: macros.click_id,
    cnv_id: macros.click_id,
    external_id: macros.external_id ?? "",
    payout: macros.payout,
    status: macros.status,
    cnv_status: macros.status,
    status2: macros.status2 ?? "",
    cnv_status2: macros.status2 ?? "",
    event: macros.event ?? "",
    currency: macros.currency ?? "USD",
    cnv_currency: macros.currency ?? "USD",
    order_id: macros.order_id ?? "",
    affiliate_code: macros.affiliate_code ?? "",
  };

  for (const [key, value] of Object.entries(replacements)) {
    url = url.replaceAll(`{${key}}`, encodeURIComponent(value));
  }
  return url;
}

export const POSTBACK_TIMEOUT_MS = 5000;
export const POSTBACK_MAX_ATTEMPTS = 2;

export type PostbackDelivery = {
  /** Postback row id; when set (with `db`) every attempt is logged in postback_deliveries. */
  postbackId?: string;
  conversionId?: string | null;
  db?: D1Database;
  timeoutMs?: number;
};

type AttemptResult = { ok: boolean; status_code: number | null; error: string | null };

async function attemptPostback(url: string, timeoutMs: number): Promise<AttemptResult> {
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    // Drain the body so the connection is released.
    await res.body?.cancel().catch(() => {});
    return res.ok
      ? { ok: true, status_code: res.status, error: null }
      : { ok: false, status_code: res.status, error: `HTTP ${res.status}` };
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    const message =
      name === "TimeoutError" || name === "AbortError"
        ? `timeout after ${timeoutMs}ms`
        : error instanceof Error
          ? error.message
          : String(error);
    return { ok: false, status_code: null, error: message.slice(0, 500) };
  }
}

async function logDelivery(
  delivery: PostbackDelivery,
  url: string,
  attempt: number,
  result: AttemptResult,
): Promise<void> {
  if (!delivery.db || !delivery.postbackId) return;
  try {
    await delivery.db
      .prepare(
        `INSERT INTO postback_deliveries
          (id, postback_id, conversion_id, url, status_code, error, attempt, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        `pbd_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`,
        delivery.postbackId,
        delivery.conversionId ?? null,
        url.slice(0, 2000),
        result.status_code,
        result.error,
        attempt,
        Date.now(),
      )
      .run();
  } catch (error) {
    console.error("postback delivery log failed", error);
  }
}

/**
 * Fires one outgoing S2S postback: 5s timeout, non-2xx = failure, one retry.
 * Never throws; returns whether a delivery succeeded.
 */
export async function fireS2SPostback(
  template: string | null | undefined,
  macros: PostbackMacros,
  delivery: PostbackDelivery = {},
): Promise<boolean> {
  if (!template?.trim()) return false;
  const url = applyPostbackMacros(template.trim(), macros);
  const timeoutMs = delivery.timeoutMs ?? POSTBACK_TIMEOUT_MS;
  for (let attempt = 1; attempt <= POSTBACK_MAX_ATTEMPTS; attempt++) {
    const result = await attemptPostback(url, timeoutMs);
    await logDelivery(delivery, url, attempt, result);
    if (result.ok) return true;
  }
  return false;
}
