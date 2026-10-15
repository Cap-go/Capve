export type CostType = "cpc" | "cpm" | "cpa";

export type Group = {
  id: string;
  user_id: string;
  name: string;
  created_at: number;
};

export type TrafficSource = {
  id: string;
  user_id: string;
  name: string;
  cost_type: CostType;
  default_cost_cents: number;
  postback_percent: number;
  created_at: number;
};

export type AffiliateNetwork = {
  id: string;
  user_id: string;
  name: string;
  created_at: number;
};

export type Lander = {
  id: string;
  user_id: string;
  name: string;
  url: string;
  created_at: number;
};

export type Offer = {
  id: string;
  user_id: string;
  network_id: string | null;
  name: string;
  url: string;
  payout_cents: number;
  created_at: number;
};

export type CampaignStatus = "active" | "paused";
