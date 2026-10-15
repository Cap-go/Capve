/**
 * Account timezone helpers for reports.
 *
 * D1/SQLite has no IANA timezone support, so reports apply a fixed UTC offset at query time:
 * the offset is computed once per request at the start of the report range (or now when the
 * range is open). Ranges that cross a DST change are bucketed with the offset that applied at
 * the range start (days after the switch are off by one hour). Range boundaries given as
 * calendar dates (YYYY-MM-DD) are converted exactly, per boundary.
 */

export const DEFAULT_TIMEZONE = "UTC";

export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim() || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value.trim() });
    return true;
  } catch {
    return false;
  }
}

/** Minutes east of UTC for `timeZone` at instant `atMs` (Europe/Paris in summer = 120). */
export function timeZoneOffsetMinutes(timeZone: string, atMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(atMs));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  const flooredAt = Math.floor(atMs / 1000) * 1000;
  return Math.round((asUtc - flooredAt) / 60_000);
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** UTC ms of local midnight of `date` (YYYY-MM-DD) in `timeZone`. */
export function zonedMidnightMs(date: string, timeZone: string): number | undefined {
  const match = DATE_ONLY.exec(date);
  if (!match) return undefined;
  const naive = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(naive)) return undefined;
  const guess = naive - timeZoneOffsetMinutes(timeZone, naive) * 60_000;
  return naive - timeZoneOffsetMinutes(timeZone, guess) * 60_000;
}

/**
 * Report boundary from a query param: Unix ms stays absolute; YYYY-MM-DD is a calendar day in
 * the account timezone (`from` = start of that day, `to` = end of that day, inclusive).
 */
export function parseRangeBoundary(
  raw: string | undefined,
  timeZone: string,
  edge: "from" | "to",
): number | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  const match = DATE_ONLY.exec(value);
  if (!match) return Number(value);
  if (edge === "from") return zonedMidnightMs(value, timeZone);
  const nextDay = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + 1),
  ).toISOString();
  const nextStart = zonedMidnightMs(nextDay.slice(0, 10), timeZone);
  return nextStart === undefined ? undefined : nextStart - 1;
}
