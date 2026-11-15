export const BIDDING_MODEL = "@cf/zai-org/glm-4.7-flash";
export const BIDDING_DEFAULTS = {
  enabled: false,
  dimension: "sub1",
  currency: "USD",
  window_hours: 72,
  conversion_lag_hours: 24,
  min_clicks: 100,
  min_spend_cents: 1000,
  min_conversions: 5,
  target_roi: 20,
  max_change_pct: 10,
};
export type BiddingConfig = typeof BIDDING_DEFAULTS;
export type BidDecision = {
  zone: string;
  clicks: number;
  conversions: number;
  cost_cents: number;
  revenue_cents: number;
  roi: number | null;
  change_pct: number;
  reason: string;
};
export type BiddingResult = {
  model: string;
  from: number;
  to: number;
  config: BiddingConfig;
  decisions: BidDecision[];
};
export type BiddingRun = { id: string; created_at: number; result: BiddingResult };
