export function parseHttpUrl(raw: string): URL | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

/**
 * Validates an optional URL setting (postback/webhook). Returns the trimmed string,
 * null when empty, or false when it is not an http(s) URL.
 */
export function optionalHttpUrl(raw: string | null | undefined): string | null | false {
  const value = raw?.trim();
  if (!value) return null;
  return parseHttpUrl(value) ? value : false;
}

export function hostsMatch(a: URL, b: URL): boolean {
  return a.hostname.toLowerCase() === b.hostname.toLowerCase();
}

export function withQueryParam(url: URL, key: string, value: string): URL {
  const next = new URL(url.toString());
  next.searchParams.set(key, value);
  return next;
}

export type RedirectResolution =
  | { ok: true; url: URL }
  | { ok: false; error: string; status: number };

export function resolveRedirectTarget(
  programDestination: string | null | undefined,
  optionalUrl: string | undefined,
): RedirectResolution {
  if (!programDestination) {
    return { ok: false, error: "Program destination not configured", status: 503 };
  }

  const base = parseHttpUrl(programDestination);
  if (!base) {
    return { ok: false, error: "Program destination not configured", status: 503 };
  }

  if (!optionalUrl) {
    return { ok: true, url: base };
  }

  const override = parseHttpUrl(optionalUrl);
  if (!override) {
    return { ok: false, error: "Invalid or disallowed destination URL", status: 400 };
  }

  if (!hostsMatch(base, override)) {
    return { ok: false, error: "Destination host not allowed", status: 400 };
  }

  return { ok: true, url: override };
}

export function buildTrackingUrl(appUrl: string, affiliateCode: string): string {
  return `${appUrl.replace(/\/$/, "")}/r/${affiliateCode}`;
}

export function buildCampaignUrl(appUrl: string, campaignKey: string): string {
  return `${appUrl.replace(/\/$/, "")}/c/${campaignKey}`;
}

export function buildPostbackUrl(appUrl: string, postbackKey?: string): string {
  const url = `${appUrl.replace(/\/$/, "")}/click?cnv_id={click_id}&payout={payout}&cnv_status={status}`;
  return postbackKey ? `${url}&key=${encodeURIComponent(postbackKey)}` : url;
}

/** Browser-safe: persists velo_ref and click_id from the landing URL into localStorage. */
export const ATTRIBUTION_SNIPPET =
  `(function(){var p=new URLSearchParams(location.search);var r=p.get("velo_ref");var c=p.get("click_id");try{if(r)localStorage.setItem("velo_ref",r);if(c)localStorage.setItem("click_id",c)}catch(e){}})();`;

export function serverConvertExample(appUrl: string): string {
  return `// Server-side only — never expose X-Program-Secret in browser JS
const affiliateCode = req.body.affiliate_code; // e.g. from checkout form

await fetch("${appUrl}/api/v1/convert", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Program-Secret": process.env.CAPVE_CONVERT_SECRET
  },
  body: JSON.stringify({
    order_id: "order_123",
    amount: 49,
    affiliate_code: affiliateCode
  })
});`;
}
