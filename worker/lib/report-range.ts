import { getAccountTimezone } from "../db/settings";
import { parseReportFilters, type ReportFilters } from "./metrics";
import { parseRangeBoundary, timeZoneOffsetMinutes } from "./timezone";

export type ZonedReportFilters = ReportFilters & {
  /** Account timezone (IANA). */
  timezone: string;
  /** UTC offset (minutes) at the range start, used for date buckets. */
  tz_offset_minutes: number;
};

/**
 * Report filters from query params, in the account timezone. `from`/`to` accept Unix ms or
 * YYYY-MM-DD (a calendar day in the account timezone).
 */
export async function zonedReportFilters(
  db: D1Database,
  accountId: string,
  query: (name: string) => string | undefined,
  options: { onlyRange?: boolean } = {},
): Promise<ZonedReportFilters> {
  const timezone = await getAccountTimezone(db, accountId);
  const base = options.onlyRange
    ? {}
    : parseReportFilters({
        group_id: query("group_id"),
        traffic_source_id: query("traffic_source_id"),
        status: query("status"),
      });
  const from = parseRangeBoundary(query("from"), timezone, "from");
  const to = parseRangeBoundary(query("to"), timezone, "to");
  const anchor = from != null && Number.isFinite(from) ? from : Date.now();
  return {
    ...base,
    from,
    to,
    timezone,
    tz_offset_minutes: timeZoneOffsetMinutes(timezone, anchor),
  };
}
