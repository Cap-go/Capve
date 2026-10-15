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
  /** null = default pool; otherwise the routing rule this path belongs to. */
  rule_id: string | null;
};

/** One weighted lander or offer inside a path. */
export type PathItem = {
  id: string;
  weight: number;
  url: string;
  name: string;
};

export type PathWithEntities = Path & {
  lander_url: string | null;
  lander_name: string | null;
  offer_url: string | null;
  offer_name: string | null;
  landers: PathItem[];
  offers: PathItem[];
};

export type RuleOperator = "in" | "not_in";

export type RuleField =
  | "country"
  | "region"
  | "city"
  | "device_type"
  | "os"
  | "browser"
  | "isp"
  | "asn"
  | "language"
  | "connection"
  | "bot"
  | "referrer_domain"
  | "ip"
  | "weekday"
  | "hour"
  | "sub1"
  | "sub2"
  | "sub3"
  | "sub4"
  | "sub5"
  | "sub6"
  | "sub7"
  | "sub8"
  | "sub9"
  | "sub10";

export type RuleCondition = {
  field: RuleField;
  op: RuleOperator;
  values: string[];
};

export type RoutingRule = {
  id: string;
  program_id: string;
  name: string;
  sort_order: number;
  conditions: RuleCondition[];
  timezone: string;
  enabled: boolean;
  created_at: number;
};

export type RoutingRuleWithPaths = RoutingRule & { paths: PathWithEntities[] };

export type RotationConfig = {
  rotation: Rotation;
  /** Default pool (paths without a rule). */
  paths: PathWithEntities[];
  /** Ordered rules; first match wins, else `paths`. */
  rules: RoutingRuleWithPaths[];
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
