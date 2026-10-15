/** IPv4 / IPv6 parsing and CIDR matching (no dependencies). */

type ParsedIp = { version: 4 | 6; value: bigint };

function parseIpv4(raw: string): bigint | null {
  const parts = raw.split(".");
  if (parts.length !== 4) return null;
  let value = 0n;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    value = (value << 8n) | BigInt(n);
  }
  return value;
}

function parseIpv6(raw: string): bigint | null {
  let text = raw.toLowerCase();
  const zone = text.indexOf("%");
  if (zone !== -1) text = text.slice(0, zone);

  // Embedded IPv4 tail (e.g. ::ffff:1.2.3.4) → two hextets.
  const lastColon = text.lastIndexOf(":");
  if (lastColon !== -1 && text.slice(lastColon + 1).includes(".")) {
    const v4 = parseIpv4(text.slice(lastColon + 1));
    if (v4 === null) return null;
    text = `${text.slice(0, lastColon + 1)}${(v4 >> 16n).toString(16)}:${(v4 & 0xffffn).toString(16)}`;
  }

  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...tail];

  let value = 0n;
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    value = (value << 16n) | BigInt(parseInt(group, 16));
  }
  return value;
}

export function parseIp(raw: string): ParsedIp | null {
  const text = raw.trim();
  if (!text) return null;
  if (text.includes(":")) {
    const v6 = parseIpv6(text);
    if (v6 === null) return null;
    // IPv4-mapped IPv6 → IPv4 so `1.2.3.0/24` still matches.
    if (v6 >> 32n === 0xffffn) return { version: 4, value: v6 & 0xffffffffn };
    return { version: 6, value: v6 };
  }
  const v4 = parseIpv4(text);
  return v4 === null ? null : { version: 4, value: v4 };
}

/**
 * Does `ip` match `pattern` (single IP or CIDR)? Returns null when the pattern itself is
 * invalid, so callers can use it for validation too.
 */
export function ipMatches(ip: string, pattern: string): boolean | null {
  const [addr, prefixRaw, extra] = pattern.trim().split("/");
  if (extra !== undefined) return null;
  const net = parseIp(addr ?? "");
  if (!net) return null;
  const bits = net.version === 4 ? 32 : 128;
  let prefix = bits;
  if (prefixRaw !== undefined) {
    if (!/^\d{1,3}$/.test(prefixRaw)) return null;
    prefix = Number(prefixRaw);
    // `::ffff:1.2.3.0/120` style is out of scope; mapped patterns use IPv4 prefixes.
    if (prefix > bits) return null;
  }

  const target = parseIp(ip);
  if (!target || target.version !== net.version) return false;
  if (prefix === 0) return true;
  const shift = BigInt(bits - prefix);
  return target.value >> shift === net.value >> shift;
}
