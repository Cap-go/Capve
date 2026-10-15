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

export async function fireS2SPostback(
  template: string | null | undefined,
  macros: PostbackMacros,
): Promise<void> {
  if (!template?.trim()) return;
  const url = applyPostbackMacros(template.trim(), macros);
  try {
    await fetch(url, { method: "GET", redirect: "follow" });
  } catch {
    // Best-effort; do not fail the conversion if S2S is down.
  }
}
