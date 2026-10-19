import { parseUserAgent } from "./ua";

export const SUB_KEYS = [
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
] as const;

export type SubKey = (typeof SUB_KEYS)[number];

export type ClickContext = {
  ip: string | null;
  user_agent: string | null;
  country: string | null;
  continent: string | null;
  region: string | null;
  city: string | null;
  device_type: string | null;
  os: string | null;
  browser: string | null;
  isp: string | null;
  referrer_domain: string | null;
  external_id: string | null;
  cost_cents: number | null;
  visitor_hash: string;
  is_bot: boolean;
} & Record<SubKey, string | null>;

type CfProperties = {
  country?: string;
  continent?: string;
  region?: string;
  city?: string;
  asOrganization?: string;
  botManagement?: { verifiedBot?: boolean; score?: number };
};

const MAX_PARAM_LENGTH = 255;

function param(url: URL, ...names: string[]): string | null {
  for (const name of names) {
    const value = url.searchParams.get(name)?.trim();
    if (value) return value.slice(0, MAX_PARAM_LENGTH);
  }
  return null;
}

/** `cost` is in currency units (e.g. 0.05) → integer cents. */
export function parseCostCents(raw: string | null): number | null {
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

function referrerDomain(raw: string | null): string | null {
  if (!raw) return null;
  try {
    return new URL(raw).hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)]
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function buildClickContext(request: Request): Promise<ClickContext> {
  const url = new URL(request.url);
  const cf = ((request as Request & { cf?: CfProperties }).cf ?? {}) as CfProperties;
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null;
  const userAgent = request.headers.get("user-agent");
  const ua = parseUserAgent(userAgent);

  const cfBot =
    cf.botManagement?.verifiedBot === true ||
    (typeof cf.botManagement?.score === "number" && cf.botManagement.score < 30);

  const subs = Object.fromEntries(SUB_KEYS.map((key) => [key, param(url, key)])) as Record<
    SubKey,
    string | null
  >;

  return {
    ip,
    user_agent: userAgent,
    country: cf.country?.toUpperCase() ?? null,
    continent: cf.continent?.toUpperCase() ?? null,
    region: cf.region ?? null,
    city: cf.city ?? null,
    device_type: ua.device_type,
    os: ua.os,
    browser: ua.browser,
    isp: cf.asOrganization ?? null,
    referrer_domain: referrerDomain(request.headers.get("referer")),
    external_id: param(url, "clickid", "external_id", "extid"),
    cost_cents: parseCostCents(param(url, "cost")),
    visitor_hash: await sha256Hex(`${ip ?? ""}|${userAgent ?? ""}`),
    is_bot: ua.is_bot || cfBot,
    ...subs,
  };
}
