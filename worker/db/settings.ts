import { DEFAULT_TIMEZONE, isValidTimeZone } from "../lib/timezone";

export type AccountSettings = { timezone: string };

export async function getAccountSettings(
  db: D1Database,
  accountId: string,
): Promise<AccountSettings> {
  const row = await db
    .prepare("SELECT timezone FROM account_settings WHERE user_id = ?")
    .bind(accountId)
    .first<{ timezone: string }>();
  const timezone =
    row?.timezone && isValidTimeZone(row.timezone) ? row.timezone : DEFAULT_TIMEZONE;
  return { timezone };
}

export async function getAccountTimezone(db: D1Database, accountId: string): Promise<string> {
  return (await getAccountSettings(db, accountId)).timezone;
}

export async function updateAccountSettings(
  db: D1Database,
  accountId: string,
  settings: AccountSettings,
): Promise<AccountSettings> {
  await db
    .prepare(
      `INSERT INTO account_settings (user_id, timezone, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET timezone = excluded.timezone, updated_at = excluded.updated_at`,
    )
    .bind(accountId, settings.timezone, Date.now())
    .run();
  return settings;
}
