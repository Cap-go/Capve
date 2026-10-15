import type { EventMetrics } from "./lib/metrics";
export type EmailBinding = {
  send: (message: {
    to: string;
    from: string;
    subject: string;
    html?: string;
    text?: string;
  }) => Promise<{ messageId: string }>;
};

export type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_URL: string;
  AUTH_SECRET: string;
  EMAIL?: EmailBinding;
  EMAIL_FROM?: string;
  PLATFORM_ADMIN_EMAILS?: string;
  /** Workers Rate Limiting bindings for /api/auth; missing = no limit (tests, old installs). */
  AUTH_IP_LIMITER?: RateLimit;
  AUTH_EMAIL_LIMITER?: RateLimit;
  /** Days to keep raw clicks without conversions; unset/0 = keep forever. */
  RAW_CLICK_RETENTION_DAYS?: string;
};

export type User = {
  id: string;
  email: string;
  name: string | null;
  email_verified: number;
  is_platform_admin: number;
  session_version: number;
  created_at: number;
};

export type Program = {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  api_key: string;
  destination_url: string | null;
  campaign_key: string | null;
  group_id: string | null;
  traffic_source_id: string | null;
  tags: string | null;
  status: string;
  created_at: number;
};

export type Click = {
  id: string;
  program_id: string;
  affiliate_id: string;
  ip: string | null;
  user_agent: string | null;
  created_at: number;
};

export type ClickLogRow = Click & {
  affiliate_name: string;
  affiliate_code: string;
  converted: boolean;
};

export type Conversion = {
  id: string;
  program_id: string;
  affiliate_id: string;
  click_id: string | null;
  order_id: string;
  amount_cents: number;
  status: string;
  status2: string | null;
  event: string | null;
  currency: string;
  created_at: number;
};

export type ConversionLogRow = Conversion & {
  affiliate_name: string;
  affiliate_code: string;
};

export type Affiliate = {
  id: string;
  program_id: string;
  name: string;
  code: string;
  created_at: number;
};

export type AffiliateStats = Affiliate & {
  /** All clicks, bots included. */
  clicks: number;
  /** Bot clicks (excluded from CR). */
  bots: number;
  /** Distinct converted clicks + click-less conversions (events do not add up). */
  conversions: number;
  /** Revenue in `currency` only. */
  revenue_cents: number;
  /** Percent, capped at 100. */
  conversion_rate: number;
  /** Approved conversions per event (registration, ftd, ...). */
  events: Record<string, number>;
  event_metrics: Record<string, EventMetrics>;
  revenue_by_currency: Record<string, number>;
};

export type ProgramStats = {
  program: Program;
  totals: {
    /** All clicks, bots included. */
    clicks: number;
    /** Bot clicks (excluded from CR). */
    bots: number;
    conversions: number;
    revenue_cents: number;
    conversion_rate: number;
    events: Record<string, number>;
    event_metrics: Record<string, EventMetrics>;
    revenue_by_currency: Record<string, number>;
  };
  /** Currency of every `revenue_cents` field (most used currency). */
  currency: string;
  affiliates: AffiliateStats[];
};
