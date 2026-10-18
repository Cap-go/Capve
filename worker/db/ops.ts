import type { EntityNote, PendingInvite, TeamMember, Trigger } from "../types-ops";
import { id } from "../lib/utils";

export async function findTeamMembership(
  db: D1Database,
  email: string,
  accountId?: string,
): Promise<{ owner_user_id: string; role: "admin" | "viewer" } | null> {
  return db
    .prepare(
      `SELECT owner_user_id, role FROM team_members
       WHERE email = ? AND accepted_at IS NOT NULL ${accountId ? "AND owner_user_id = ?" : ""}
       ORDER BY accepted_at ASC, id ASC LIMIT 1`,
    )
    .bind(...(accountId ? [email.toLowerCase(), accountId] : [email.toLowerCase()]))
    .first<{ owner_user_id: string; role: "admin" | "viewer" }>();
}

export async function listPendingInvites(
  db: D1Database,
  email: string,
): Promise<PendingInvite[]> {
  const { results } = await db
    .prepare(
      `SELECT tm.id, tm.owner_user_id, u.email AS owner_email, tm.role, tm.created_at
       FROM team_members tm
       LEFT JOIN users u ON u.id = tm.owner_user_id
       WHERE tm.email = ? AND tm.accepted_at IS NULL
       ORDER BY tm.created_at ASC`,
    )
    .bind(email.toLowerCase())
    .all<PendingInvite>();
  return results ?? [];
}

export async function acceptInvite(
  db: D1Database,
  inviteId: string,
  email: string,
): Promise<boolean> {
  const result = await db
    .prepare(
      "UPDATE team_members SET accepted_at = ? WHERE id = ? AND email = ? AND accepted_at IS NULL",
    )
    .bind(Date.now(), inviteId, email.toLowerCase())
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function declineInvite(
  db: D1Database,
  inviteId: string,
  email: string,
): Promise<boolean> {
  const result = await db
    .prepare("DELETE FROM team_members WHERE id = ? AND email = ? AND accepted_at IS NULL")
    .bind(inviteId, email.toLowerCase())
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function listTeamMembers(
  db: D1Database,
  ownerUserId: string,
): Promise<TeamMember[]> {
  const { results } = await db
    .prepare(
      "SELECT id, owner_user_id, email, role, created_at, accepted_at FROM team_members WHERE owner_user_id = ? ORDER BY created_at ASC",
    )
    .bind(ownerUserId)
    .all<TeamMember>();
  return results ?? [];
}

export async function addTeamMember(
  db: D1Database,
  ownerUserId: string,
  email: string,
  role: "admin" | "viewer",
): Promise<TeamMember> {
  const member: TeamMember = {
    id: id("mbr"),
    owner_user_id: ownerUserId,
    email: email.toLowerCase(),
    role,
    created_at: Date.now(),
    accepted_at: null,
  };
  await db
    .prepare(
      "INSERT INTO team_members (id, owner_user_id, email, role, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(member.id, member.owner_user_id, member.email, member.role, member.created_at)
    .run();
  return member;
}

export async function removeTeamMember(
  db: D1Database,
  memberId: string,
  ownerUserId: string,
): Promise<boolean> {
  const result = await db
    .prepare("DELETE FROM team_members WHERE id = ? AND owner_user_id = ?")
    .bind(memberId, ownerUserId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function listNotes(
  db: D1Database,
  accountUserId: string,
  entityType: EntityNote["entity_type"],
  entityId: string,
): Promise<EntityNote[]> {
  const { results } = await db
    .prepare(
      `SELECT id, user_id, entity_type, entity_id, body, created_at, updated_at
       FROM entity_notes
       WHERE user_id = ? AND entity_type = ? AND entity_id = ?
       ORDER BY updated_at DESC`,
    )
    .bind(accountUserId, entityType, entityId)
    .all<EntityNote>();
  return results ?? [];
}

export async function createNote(
  db: D1Database,
  accountUserId: string,
  input: { entity_type: EntityNote["entity_type"]; entity_id: string; body: string },
): Promise<EntityNote> {
  const now = Date.now();
  const note: EntityNote = {
    id: id("nte"),
    user_id: accountUserId,
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    body: input.body,
    created_at: now,
    updated_at: now,
  };
  await db
    .prepare(
      `INSERT INTO entity_notes (id, user_id, entity_type, entity_id, body, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      note.id,
      note.user_id,
      note.entity_type,
      note.entity_id,
      note.body,
      note.created_at,
      note.updated_at,
    )
    .run();
  return note;
}

export async function deleteNote(
  db: D1Database,
  noteId: string,
  accountUserId: string,
): Promise<boolean> {
  const result = await db
    .prepare("DELETE FROM entity_notes WHERE id = ? AND user_id = ?")
    .bind(noteId, accountUserId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function listTriggers(
  db: D1Database,
  accountUserId: string,
  programId?: string,
): Promise<Trigger[]> {
  const query = programId
    ? `SELECT id, user_id, program_id, name, event, action_type, action_url, enabled, created_at
       FROM triggers WHERE user_id = ? AND (program_id = ? OR program_id IS NULL)
       ORDER BY created_at DESC`
    : `SELECT id, user_id, program_id, name, event, action_type, action_url, enabled, created_at
       FROM triggers WHERE user_id = ?
       ORDER BY created_at DESC`;

  const stmt = db.prepare(query);
  const bound = programId ? stmt.bind(accountUserId, programId) : stmt.bind(accountUserId);
  const { results } = await bound.all<{
    id: string;
    user_id: string;
    program_id: string | null;
    name: string;
    event: Trigger["event"];
    action_type: "webhook";
    action_url: string;
    enabled: number;
    created_at: number;
  }>();
  return (results ?? []).map((row) => ({
    id: row.id,
    user_id: row.user_id,
    program_id: row.program_id,
    name: row.name,
    event: row.event,
    action_type: row.action_type,
    action_url: row.action_url,
    enabled: Boolean(row.enabled),
    created_at: row.created_at,
  }));
}

export async function createTrigger(
  db: D1Database,
  accountUserId: string,
  input: {
    name: string;
    event: Trigger["event"];
    action_url: string;
    program_id?: string | null;
    enabled?: boolean;
  },
): Promise<Trigger> {
  const trigger: Trigger = {
    id: id("trg"),
    user_id: accountUserId,
    program_id: input.program_id ?? null,
    name: input.name,
    event: input.event,
    action_type: "webhook",
    action_url: input.action_url,
    enabled: input.enabled ?? true,
    created_at: Date.now(),
  };
  await db
    .prepare(
      `INSERT INTO triggers (
        id, user_id, program_id, name, event, action_type, action_url, enabled, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      trigger.id,
      trigger.user_id,
      trigger.program_id,
      trigger.name,
      trigger.event,
      trigger.action_type,
      trigger.action_url,
      trigger.enabled ? 1 : 0,
      trigger.created_at,
    )
    .run();
  return trigger;
}

export async function deleteTrigger(
  db: D1Database,
  triggerId: string,
  accountUserId: string,
): Promise<boolean> {
  const result = await db
    .prepare("DELETE FROM triggers WHERE id = ? AND user_id = ?")
    .bind(triggerId, accountUserId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function getTriggersForEvent(
  db: D1Database,
  accountUserId: string,
  programId: string,
  event: Trigger["event"],
): Promise<Trigger[]> {
  const { results } = await db
    .prepare(
      `SELECT id, user_id, program_id, name, event, action_type, action_url, enabled, created_at
       FROM triggers
       WHERE user_id = ? AND enabled = 1 AND event = ?
         AND (program_id = ? OR program_id IS NULL)`,
    )
    .bind(accountUserId, event, programId)
    .all<{
      id: string;
      user_id: string;
      program_id: string | null;
      name: string;
      event: Trigger["event"];
      action_type: "webhook";
      action_url: string;
      enabled: number;
      created_at: number;
    }>();
  return (results ?? []).map((row) => ({
    id: row.id,
    user_id: row.user_id,
    program_id: row.program_id,
    name: row.name,
    event: row.event,
    action_type: row.action_type,
    action_url: row.action_url,
    enabled: Boolean(row.enabled),
    created_at: row.created_at,
  }));
}
