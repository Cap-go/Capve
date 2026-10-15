/** Anti-fraud: account blocklists, datacenter ASNs and per-campaign bot handling. */
import { ipMatches } from "./ip";
import { parseAsn } from "./rules";
import { parseHttpUrl } from "./urls";

export type BlocklistKind = "ip" | "asn" | "ua";
export const BLOCKLIST_KINDS: readonly BlocklistKind[] = ["ip", "asn", "ua"];

export type BlocklistEntry = {
  id: string;
  kind: BlocklistKind;
  value: string;
  created_at: number;
};

export type BotAction = "route" | "safe_page";

export type TrafficFilter = {
  program_id: string;
  /** `route` = record as bot and route normally; `safe_page` = redirect to safe_page_url. */
  bot_action: BotAction;
  safe_page_url: string | null;
  /** Treat clicks from known hosting/cloud ASNs as bots. */
  block_datacenter: boolean;
};

export function defaultTrafficFilter(programId: string): TrafficFilter {
  return { program_id: programId, bot_action: "route", safe_page_url: null, block_datacenter: false };
}

/**
 * Hosting / cloud provider ASNs. Real users rarely browse from these; scrapers, ad-network
 * checkers and proxies often do. Small on purpose; add your own via the ASN blocklist.
 */
export const DATACENTER_ASNS: ReadonlySet<number> = new Set([
  16509, 14618, 8987, // Amazon AWS
  15169, 396982, 19527, // Google Cloud
  8075, 8068, // Microsoft Azure
  14061, // DigitalOcean
  16276, // OVH
  24940, 213230, // Hetzner
  63949, // Linode / Akamai
  20473, // Vultr (Choopa)
  31898, // Oracle Cloud
  45102, // Alibaba Cloud
  132203, // Tencent Cloud
  51167, // Contabo
  12876, // Scaleway
  60781, 28753, // Leaseweb
  36351, // IBM SoftLayer
  9009, // M247
  47583, // Hostinger
  62567, // DigitalOcean (legacy)
  135377, // UCloud
]);

export function isDatacenterAsn(asn: number | null): boolean {
  return asn !== null && DATACENTER_ASNS.has(asn);
}

/** Validates and normalizes a blocklist value; null when invalid. */
export function normalizeBlocklistValue(kind: BlocklistKind, raw: string): string | null {
  const value = raw.trim();
  if (!value || value.length > 255) return null;
  if (kind === "ip") return ipMatches("0.0.0.0", value) === null ? null : value.toLowerCase();
  if (kind === "asn") {
    const asn = parseAsn(value);
    return asn === null ? null : String(asn);
  }
  return value.toLowerCase();
}

export function blocklistMatch(
  entries: Pick<BlocklistEntry, "kind" | "value">[],
  click: { ip: string | null; asn: number | null; user_agent: string | null },
): Pick<BlocklistEntry, "kind" | "value"> | null {
  const ua = click.user_agent?.toLowerCase() ?? "";
  for (const entry of entries) {
    if (entry.kind === "ip" && click.ip && ipMatches(click.ip, entry.value) === true) return entry;
    if (entry.kind === "asn" && click.asn !== null && String(click.asn) === entry.value) return entry;
    if (entry.kind === "ua" && ua && ua.includes(entry.value)) return entry;
  }
  return null;
}

/** Safe page is a configured campaign URL (http/https only), never request-supplied. */
export function safePageTarget(filter: TrafficFilter): URL | null {
  if (filter.bot_action !== "safe_page" || !filter.safe_page_url) return null;
  return parseHttpUrl(filter.safe_page_url);
}
