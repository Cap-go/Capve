export type TeamRole = "owner" | "admin" | "viewer";

export type SessionUser = {
  id: string;
  email: string;
  role: TeamRole;
  account_id: string;
  is_platform_admin: boolean;
  email_verified: boolean;
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
