export type TeamRole = "owner" | "admin" | "viewer";

export type User = {
  id: string;
  email: string;
  role?: TeamRole;
  account_id?: string;
  account_email?: string;
  impersonating?: boolean;
  is_platform_admin?: boolean;
  email_verified?: boolean;
};

export type PostbackKey = {
  key: string;
  required: boolean;
  postback_url: string;
};

export type PlatformOverview = {
  users: number;
  programs: number;
  affiliates: number;
  clicks: number;
  conversions: number;
  revenue_cents: number;
};

export type PlatformUserRow = {
  id: string;
  email: string;
  name: string | null;
  is_platform_admin: number;
  program_count: number;
  created_at: number;
};

export type TeamMember = {
  id: string;
  owner_user_id: string;
  email: string;
  role: "admin" | "viewer";
  created_at: number;
  accepted_at: number | null;
};

export type PendingInvite = {
  id: string;
  owner_user_id: string;
  owner_email: string | null;
  role: "admin" | "viewer";
  created_at: number;
};

export type EntityNote = {
  id: string;
  user_id: string;
  entity_type: "program" | "traffic_source" | "network" | "offer" | "lander" | "group";
  entity_id: string;
  body: string;
  created_at: number;
  updated_at: number;
};

export type Trigger = {
  id: string;
  user_id: string;
  program_id: string | null;
  name: string;
  event: "conversion" | "click";
  action_type: "webhook";
  action_url: string;
  enabled: boolean;
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

export type TrafficSource = {
  id: string;
  user_id: string;
  name: string;
  cost_type: "cpc" | "cpm" | "cpa";
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

/** Outgoing postback on exactly one campaign, traffic source or network. */
export type Postback = {
  id: string;
  user_id: string;
  program_id: string | null;
  traffic_source_id: string | null;
  network_id: string | null;
  /** Conversion event it fires for; null = every conversion. */
  event: string | null;
  url: string;
  created_at: number;
};

/** One outgoing postback attempt (1 = first try, 2 = retry). */
export type PostbackDelivery = {
  id: string;
  postback_id: string;
  conversion_id: string | null;
  url: string;
  status_code: number | null;
  error: string | null;
  attempt: number;
  ok: boolean;
  created_at: number;
};

export type PostbackOwner =
  | { campaign_id: string }
  | { traffic_source_id: string }
  | { network_id: string };

/** Approved conversions per event (registration, ftd, ...). */
export type EventCounts = Record<string, number>;

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

export type Group = {
  id: string;
  user_id: string;
  name: string;
  created_at: number;
};

export type ClickLogRow = {
  id: string;
  program_id: string;
  affiliate_id: string;
  ip: string | null;
  user_agent: string | null;
  created_at: number;
  affiliate_name: string;
  affiliate_code: string;
  converted: boolean;
};

export type ConversionLogRow = {
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
  affiliate_name: string;
  affiliate_code: string;
};

export type ProgramTracking = {
  postback_url: string;
  postback_key_required?: boolean;
  campaign_url: string | null;
  offer_url_macro: string;
  redirect_params: string[];
  /** Custom tracking domain used for this campaign's links, if any. */
  tracking_domain?: { id: string; hostname: string } | null;
};

export type RotationMode = "normal" | "smart" | "fix_on" | "top_to_bottom";
export type FlowType = "direct" | "lander" | "lander_offer" | "offer";

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
  lander_url: string | null;
  lander_name: string | null;
  offer_url: string | null;
  offer_name: string | null;
  rule_id?: string | null;
  landers?: PathItem[];
  offers?: PathItem[];
};

export type PathItem = { id: string; weight: number; url: string; name: string };

export type RuleOperator = "in" | "not_in";

export type RuleCondition = { field: string; op: RuleOperator; values: string[] };

export type RoutingRule = {
  id: string;
  program_id: string;
  name: string;
  sort_order: number;
  conditions: RuleCondition[];
  timezone: string;
  enabled: boolean;
  created_at: number;
  paths: Path[];
};

export type TrafficFilter = {
  program_id: string;
  bot_action: "route" | "safe_page";
  safe_page_url: string | null;
  block_datacenter: boolean;
};

export type BlocklistKind = "ip" | "asn" | "ua";

export type BlocklistEntry = { id: string; kind: BlocklistKind; value: string; created_at: number };

export type PathInput = {
  name: string;
  flow_type: FlowType;
  weight?: number;
  sort_order?: number;
  direct_url?: string | null;
  lander_id?: string | null;
  offer_id?: string | null;
  rule_id?: string | null;
  landers?: { lander_id: string; weight: number }[];
  offers?: { offer_id: string; weight: number }[];
};

export type Rotation = {
  id: string;
  program_id: string;
  mode: RotationMode;
  fixed_path_id: string | null;
  created_at: number;
};

export type RotationConfig = {
  rotation: Rotation;
  paths: Path[];
  rules?: RoutingRule[];
};

export type CampaignMetrics = {
  /** All clicks, bots included. */
  clicks: number;
  /** Bot clicks: no cost, left out of CR / EPC / CPC. */
  bot_clicks: number;
  lp_clicks: number;
  leads: number;
  revenue_cents: number;
  cost_cents: number;
  profit_cents: number;
  lp_ctr: number;
  cr: number;
  epc_cents: number;
  cpc_cents: number;
  /** null when there is no cost. */
  roi: number | null;
};

/** Per-event metrics: count, revenue, CR (count / clicks) and cost per event. */
export type EventMetrics = {
  count: number;
  revenue_cents: number;
  cr: number;
  cpa_cents: number | null;
};

type CurrencyFields = {
  event_metrics: Record<string, EventMetrics>;
  /** Currency of `revenue_cents`. */
  currency: string;
  revenue_by_currency: Record<string, number>;
};

export type CampaignReportRow = Program & {
  group_name: string | null;
  traffic_source_name: string | null;
  cost_type: "cpc" | "cpm" | "cpa" | null;
  default_cost_cents: number;
  metrics: CampaignMetrics;
  events: EventCounts;
} & CurrencyFields;

export type TrendPoint = {
  date: string;
  clicks: number;
  lp_clicks: number;
  leads: number;
  revenue_cents: number;
  cost_cents: number;
  events: EventCounts;
};

export type GroupedReportRow = {
  key: string | null;
  label: string;
  unique_clicks: number;
  bot_clicks: number;
  metrics: CampaignMetrics;
  events: EventCounts;
} & CurrencyFields;

export type ReportFilters = {
  from?: number;
  to?: number;
  group_id?: string;
  traffic_source_id?: string;
  status?: string;
};

export type Affiliate = {
  id: string;
  program_id: string;
  name: string;
  code: string;
  created_at: number;
};

export type AffiliateStats = Affiliate & {
  clicks: number;
  bots: number;
  conversions: number;
  revenue_cents: number;
  conversion_rate: number;
  events: EventCounts;
  event_metrics: Record<string, EventMetrics>;
  revenue_by_currency: Record<string, number>;
};

export type ProgramStats = {
  program: Program;
  totals: {
    clicks: number;
    bots: number;
    conversions: number;
    revenue_cents: number;
    conversion_rate: number;
    events: EventCounts;
    event_metrics: Record<string, EventMetrics>;
    revenue_by_currency: Record<string, number>;
  };
  currency: string;
  affiliates: AffiliateStats[];
};

let requestAccount: string | null = null;
export function setRequestAccount(accountId: string | null) {
  requestAccount = accountId;
}

export type AccessibleAccount = { account_id: string; email: string; name: string | null; role: TeamRole };

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(requestAccount && !path.startsWith("/api/auth/") ? { "X-Capve-Account": requestAccount } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 409 && data && typeof data === "object" && "code" in data && data.code === "account_changed") window.location.assign("/app");
    throw new Error((data as { error?: string }).error ?? "Request failed");
  }
  return data as T;
}

/** Paging and created_at window (Unix ms) for click/conversion logs. */
export type LogPage = { limit?: number; offset?: number; from?: number; to?: number };

function logQuery(page: LogPage): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(page)) {
    if (value != null) params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export type ApiToken = {
  id: string;
  name: string;
  prefix: string;
  last_used_at: number | null;
  created_at: number;
};

export const api = {
  accounts: () => request<{ accounts: AccessibleAccount[] }>("/api/auth/accounts"),
  switchAccount: (account_id: string) => request<{ ok: boolean }>("/api/auth/switch-account", { method: "POST", body: JSON.stringify({ account_id }) }),
  impersonate: (account_id: string) => request<{ ok: boolean }>("/api/auth/impersonate", { method: "POST", body: JSON.stringify({ account_id }) }),
  stopImpersonation: () => request<{ ok: boolean }>("/api/auth/stop-impersonation", { method: "POST", body: "{}" }),
  me: () => request<{ user: User | null }>("/api/auth/me"),
  register: (body: { email: string; password: string; name?: string }) =>
    request<{ user: User }>("/api/auth/register", { method: "POST", body: JSON.stringify(body) }),
  login: (email: string, password: string) =>
    request<{ user: User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  forgotPassword: (email: string) =>
    request<{ ok: boolean; message: string }>("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  resetPassword: (token: string, password: string) =>
    request<{ user: User }>("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    }),
  verifyEmail: (token: string) =>
    request<{ ok: boolean }>("/api/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
  resendVerification: () =>
    request<{ ok: boolean; already_verified?: boolean }>("/api/auth/resend-verification", {
      method: "POST",
    }),
  logoutAll: () => request<{ ok: boolean }>("/api/auth/logout-all", { method: "POST" }),
  postbackKey: () => request<{ postback_key: PostbackKey }>("/api/ops/postback-key"),
  setPostbackKeyRequired: (required: boolean) =>
    request<{ postback_key: PostbackKey }>("/api/ops/postback-key", {
      method: "PUT",
      body: JSON.stringify({ required }),
    }),
  rotatePostbackKey: () =>
    request<{ postback_key: PostbackKey }>("/api/ops/postback-key/rotate", { method: "POST" }),
  programs: () => request<{ programs: Program[] }>("/api/programs"),
  createProgram: (data: {
    name: string;
    destination_url?: string;
    traffic_source_id?: string;
    group_id?: string;
  }) =>
    request<{ program: Program; convert_secret: string }>("/api/programs", {
      method: "POST",
      body: JSON.stringify({
        name: data.name,
        destination_url: data.destination_url || undefined,
        traffic_source_id: data.traffic_source_id || undefined,
        group_id: data.group_id || undefined,
      }),
    }),
  updateProgram: (
    programId: string,
    data: {
      name?: string;
      destination_url?: string | null;
      traffic_source_id?: string | null;
      group_id?: string | null;
      status?: "active" | "paused";
    },
  ) =>
    request<{ program: Program }>(`/api/programs/${programId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteProgram: (programId: string) =>
    request<{ ok: boolean }>(`/api/programs/${programId}`, { method: "DELETE" }),
  tracking: (programId: string) =>
    request<{ tracking: ProgramTracking }>(`/api/programs/${programId}/tracking`),
  clicks: (programId: string, page: LogPage = {}) =>
    request<{ clicks: ClickLogRow[] }>(`/api/programs/${programId}/clicks${logQuery(page)}`),
  conversions: (programId: string, page: LogPage = {}) =>
    request<{ conversions: ConversionLogRow[] }>(
      `/api/programs/${programId}/conversions${logQuery(page)}`,
    ),
  stats: (programId: string) => request<ProgramStats>(`/api/programs/${programId}/stats`),
  createAffiliate: (programId: string, name: string) =>
    request<{ affiliate: Affiliate; tracking_url: string }>(
      `/api/programs/${programId}/affiliates`,
      {
        method: "POST",
        body: JSON.stringify({ name }),
      },
    ),
  trafficSources: () => request<{ traffic_sources: TrafficSource[] }>("/api/entities/traffic-sources"),
  createTrafficSource: (data: {
    name: string;
    cost_type?: "cpc" | "cpm" | "cpa";
    default_cost_cents?: number;
  }) =>
    request<{ traffic_source: TrafficSource }>("/api/entities/traffic-sources", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateTrafficSource: (
    sourceId: string,
    data: Partial<Pick<TrafficSource, "name" | "cost_type" | "default_cost_cents" | "postback_percent">>,
  ) =>
    request<{ traffic_source: TrafficSource }>(`/api/entities/traffic-sources/${sourceId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteTrafficSource: (sourceId: string) =>
    request<{ ok: boolean }>(`/api/entities/traffic-sources/${sourceId}`, { method: "DELETE" }),
  networks: () => request<{ networks: AffiliateNetwork[] }>("/api/entities/networks"),
  updateNetwork: (networkId: string, data: { name?: string }) =>
    request<{ network: AffiliateNetwork }>(`/api/entities/networks/${networkId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteNetwork: (networkId: string) =>
    request<{ ok: boolean }>(`/api/entities/networks/${networkId}`, { method: "DELETE" }),
  createNetwork: (data: { name: string }) =>
    request<{ network: AffiliateNetwork }>("/api/entities/networks", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  landers: () => request<{ landers: Lander[] }>("/api/entities/landers"),
  createLander: (data: { name: string; url: string }) =>
    request<{ lander: Lander }>("/api/entities/landers", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateLander: (landerId: string, data: { name?: string; url?: string }) =>
    request<{ lander: Lander }>(`/api/entities/landers/${landerId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteLander: (landerId: string) =>
    request<{ ok: boolean }>(`/api/entities/landers/${landerId}`, { method: "DELETE" }),
  offers: () => request<{ offers: Offer[] }>("/api/entities/offers"),
  updateOffer: (
    offerId: string,
    data: { name?: string; url?: string; network_id?: string | null; payout_cents?: number },
  ) =>
    request<{ offer: Offer }>(`/api/entities/offers/${offerId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteOffer: (offerId: string) =>
    request<{ ok: boolean }>(`/api/entities/offers/${offerId}`, { method: "DELETE" }),
  createOffer: (data: {
    name: string;
    url: string;
    network_id?: string | null;
    payout_cents?: number;
  }) =>
    request<{ offer: Offer }>("/api/entities/offers", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  postbacks: (owner?: PostbackOwner) =>
    request<{ postbacks: Postback[] }>(
      `/api/postbacks${owner ? `?${new URLSearchParams(owner as Record<string, string>)}` : ""}`,
    ),
  createPostback: (owner: PostbackOwner, data: { event: string | null; url: string }) =>
    request<{ postback: Postback }>("/api/postbacks", {
      method: "POST",
      body: JSON.stringify({ ...owner, ...data }),
    }),
  updatePostback: (postbackId: string, data: { event?: string | null; url?: string }) =>
    request<{ postback: Postback }>(`/api/postbacks/${postbackId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deletePostback: (postbackId: string) =>
    request<{ ok: boolean }>(`/api/postbacks/${postbackId}`, { method: "DELETE" }),
  postbackDeliveries: (postbackId: string) =>
    request<{ deliveries: PostbackDelivery[] }>(`/api/postbacks/${postbackId}/deliveries?limit=10`),
  groups: () => request<{ groups: Group[] }>("/api/entities/groups"),
  createGroup: (name: string) =>
    request<{ group: Group }>("/api/entities/groups", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  deleteGroup: (groupId: string) =>
    request<{ ok: boolean }>(`/api/entities/groups/${groupId}`, { method: "DELETE" }),
  rotation: (programId: string) =>
    request<RotationConfig>(`/api/programs/${programId}/rotation`),
  updateRotation: (programId: string, data: { mode?: RotationMode; fixed_path_id?: string | null }) =>
    request<RotationConfig>(`/api/programs/${programId}/rotation`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  createPath: (
    programId: string,
    data: {
      name: string;
      flow_type: FlowType;
      weight?: number;
      sort_order?: number;
      direct_url?: string | null;
      lander_id?: string | null;
      offer_id?: string | null;
    },
  ) =>
    request<{ path: Path }>(`/api/programs/${programId}/paths`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updatePath: (
    programId: string,
    pathId: string,
    data: Partial<{
      name: string;
      flow_type: FlowType;
      weight: number;
      sort_order: number;
      direct_url: string | null;
      lander_id: string | null;
      offer_id: string | null;
      enabled: boolean;
      landers: { lander_id: string; weight: number }[];
      offers: { offer_id: string; weight: number }[];
    }>,
  ) =>
    request<{ path: Path }>(`/api/programs/${programId}/paths/${pathId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deletePath: (programId: string, pathId: string) =>
    request<{ ok: boolean }>(`/api/programs/${programId}/paths/${pathId}`, {
      method: "DELETE",
    }),
  createPathWithItems: (programId: string, data: PathInput) =>
    request<{ path: Path }>(`/api/programs/${programId}/paths`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  rules: (programId: string) =>
    request<{ rules: RoutingRule[] }>(`/api/programs/${programId}/rules`),
  createRule: (
    programId: string,
    data: { name: string; conditions: RuleCondition[]; timezone?: string },
  ) =>
    request<{ rule: RoutingRule }>(`/api/programs/${programId}/rules`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateRule: (
    programId: string,
    ruleId: string,
    data: Partial<{
      name: string;
      conditions: RuleCondition[];
      timezone: string;
      sort_order: number;
      enabled: boolean;
    }>,
  ) =>
    request<{ rule: RoutingRule }>(`/api/programs/${programId}/rules/${ruleId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteRule: (programId: string, ruleId: string) =>
    request<{ ok: boolean }>(`/api/programs/${programId}/rules/${ruleId}`, { method: "DELETE" }),
  trafficFilter: (programId: string) =>
    request<{ filter: TrafficFilter }>(`/api/programs/${programId}/traffic-filter`),
  updateTrafficFilter: (programId: string, data: Partial<Omit<TrafficFilter, "program_id">>) =>
    request<{ filter: TrafficFilter }>(`/api/programs/${programId}/traffic-filter`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  blocklist: () =>
    request<{ entries: BlocklistEntry[]; datacenter_asns: number[] }>("/api/antifraud/blocklist"),
  addToBlocklist: (kind: BlocklistKind, values: string[]) =>
    request<{ entries: BlocklistEntry[] }>("/api/antifraud/blocklist", {
      method: "POST",
      body: JSON.stringify({ kind, values }),
    }),
  removeFromBlocklist: (entryId: string) =>
    request<{ ok: boolean }>(`/api/antifraud/blocklist/${entryId}`, { method: "DELETE" }),
  campaignReports: (filters: ReportFilters = {}) => {
    const params = new URLSearchParams();
    if (filters.from != null) params.set("from", String(filters.from));
    if (filters.to != null) params.set("to", String(filters.to));
    if (filters.group_id) params.set("group_id", filters.group_id);
    if (filters.traffic_source_id) params.set("traffic_source_id", filters.traffic_source_id);
    if (filters.status) params.set("status", filters.status);
    const qs = params.toString();
    return request<{ campaigns: CampaignReportRow[] }>(
      `/api/reports/campaigns${qs ? `?${qs}` : ""}`,
    );
  },
  campaignTrends: (programId: string, filters: Pick<ReportFilters, "from" | "to"> = {}) => {
    const params = new URLSearchParams();
    if (filters.from != null) params.set("from", String(filters.from));
    if (filters.to != null) params.set("to", String(filters.to));
    const qs = params.toString();
    return request<{ trends: TrendPoint[] }>(
      `/api/reports/campaigns/${programId}/trends${qs ? `?${qs}` : ""}`,
    );
  },
  groupedReport: (
    by: string,
    filters: ReportFilters & { campaign_id?: string } = {},
  ) => {
    const params = new URLSearchParams({ by });
    for (const [key, value] of Object.entries(filters)) {
      if (value != null && value !== "") params.set(key, String(value));
    }
    return request<{ by: string; rows: GroupedReportRow[] }>(`/api/reports/grouped?${params}`);
  },
  team: () => request<{ members: TeamMember[]; role: TeamRole }>("/api/ops/team"),
  inviteMember: (email: string, role: "admin" | "viewer") =>
    request<{ member: TeamMember }>("/api/ops/team", {
      method: "POST",
      body: JSON.stringify({ email, role }),
    }),
  removeMember: (memberId: string) =>
    request<{ ok: boolean }>(`/api/ops/team/${memberId}`, { method: "DELETE" }),
  apiTokens: () => request<{ tokens: ApiToken[] }>("/api/tokens"),
  createApiToken: (name: string) =>
    request<{ token: string; api_token: ApiToken }>("/api/tokens", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  deleteApiToken: (tokenId: string) =>
    request<{ ok: boolean }>(`/api/tokens/${tokenId}`, { method: "DELETE" }),
  invites: () => request<{ invites: PendingInvite[] }>("/api/ops/invites"),
  acceptInvite: (inviteId: string) =>
    request<{ ok: boolean }>(`/api/ops/invites/${inviteId}/accept`, { method: "POST" }),
  declineInvite: (inviteId: string) =>
    request<{ ok: boolean }>(`/api/ops/invites/${inviteId}/decline`, { method: "POST" }),
  notes: (entityType: EntityNote["entity_type"], entityId: string) =>
    request<{ notes: EntityNote[] }>(
      `/api/ops/notes?entity_type=${encodeURIComponent(entityType)}&entity_id=${encodeURIComponent(entityId)}`,
    ),
  createNote: (data: { entity_type: EntityNote["entity_type"]; entity_id: string; body: string }) =>
    request<{ note: EntityNote }>("/api/ops/notes", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  triggers: (programId?: string) =>
    request<{ triggers: Trigger[] }>(
      `/api/ops/triggers${programId ? `?program_id=${programId}` : ""}`,
    ),
  createTrigger: (data: {
    name: string;
    event: "conversion" | "click";
    action_url: string;
    program_id?: string | null;
  }) =>
    request<{ trigger: Trigger }>("/api/ops/triggers", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deleteTrigger: (triggerId: string) =>
    request<{ ok: boolean }>(`/api/ops/triggers/${triggerId}`, { method: "DELETE" }),
  bulkUpdatePrograms: (programIds: string[], updates: { status?: "active" | "paused" }) =>
    request<{ updated: number }>("/api/ops/programs/bulk", {
      method: "POST",
      body: JSON.stringify({ program_ids: programIds, ...updates }),
    }),
  cloneProgram: (programId: string, name?: string) =>
    request<{ program: Program }>(`/api/ops/programs/${programId}/clone`, {
      method: "POST",
      body: JSON.stringify(name ? { name } : {}),
    }),
  adminOverview: () => request<{ overview: PlatformOverview }>("/api/admin/overview"),
  adminUsers: (limit = 50, offset = 0) =>
    request<{ users: PlatformUserRow[]; total: number }>(
      `/api/admin/users?limit=${limit}&offset=${offset}`,
    ),
};

export function formatMoney(cents: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

/** Other currencies than `currency`, e.g. "+ €12.00" (revenue is never summed across currencies). */
export function otherCurrencies(byCurrency: Record<string, number>, currency: string): string {
  return Object.entries(byCurrency)
    .filter(([cur, cents]) => cur !== currency && cents !== 0)
    .map(([cur, cents]) => `+ ${formatMoney(cents, cur)}`)
    .join(" ");
}

export function formatPercent(value: number | null): string {
  return value == null ? "—" : `${value.toFixed(1)}%`;
}
