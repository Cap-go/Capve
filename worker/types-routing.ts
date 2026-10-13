export type RotationMode = "normal" | "smart" | "fix_on" | "top_to_bottom";

export type FlowType = "direct" | "lander" | "lander_offer" | "offer";

export type Rotation = {
  id: string;
  program_id: string;
  mode: RotationMode;
  fixed_path_id: string | null;
  created_at: number;
};

export type Path = {
  id: string;
  rotation_id: string;
  name: string;
  flow_type: FlowType;
  weight: number;
  sort_order: number;
  direct_url: string | null;
  lander_id: string | null;
  offer_id: string | null;
  enabled: boolean;
  created_at: number;
};

export type PathWithEntities = Path & {
  lander_url: string | null;
  lander_name: string | null;
  offer_url: string | null;
  offer_name: string | null;
};

export type RotationConfig = {
  rotation: Rotation;
  paths: PathWithEntities[];
};

export type RoutingContext = {
  click_id: string;
  velo_ref: string;
  campaign_key: string | null;
  campaign_id?: string | null;
  offer_id?: string | null;
  lander_id?: string | null;
  country?: string | null;
  external_id?: string | null;
  /** Public LP → offer click URL (`/lp/{click_id}`). */
  lp_click_url?: string | null;
  subs?: Partial<Record<string, string | null>>;
};

export type ResolvedDestination = {
  url: URL;
  path_id: string | null;
  lander_id: string | null;
  offer_id: string | null;
};
