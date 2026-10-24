import { Hono } from "hono";
import { bulkUpdatePrograms, cloneProgram } from "../db/clone";
import { listAuditLog, recordAudit } from "../lib/audit";
import {
  acceptInvite,
  addTeamMember,
  createNote,
  createTrigger,
  declineInvite,
  deleteNote,
  deleteTrigger,
  findPendingInvite,
  getTeamMember,
  listNotes,
  listPendingInvites,
  listTeamMembers,
  listTriggers,
  removeTeamMember,
} from "../db/ops";
import { entityBelongsTo } from "../db/entities";
import { getProgram } from "../db/queries";
import type { Env } from "../types";
import { canWrite, requireUser, requireWrite } from "../lib/access";
import { buildPostbackUrl, parseHttpUrl } from "../lib/urls";
import {
  ensurePostbackKey,
  rotatePostbackKey,
  setPostbackKeyRequired,
  type PostbackKeySettings,
} from "../db/postback-key";

const ops = new Hono<{ Bindings: Env }>();

ops.get("/team", async (c) => {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  const members = await listTeamMembers(c.env.DB, session.account_id);
  return c.json({ members, role: session.role, account_id: session.account_id });
});

ops.get("/audit", async (c) => {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  const entries = await listAuditLog(c.env.DB, session.account_id);
  return c.json({ entries });
});

ops.post("/team", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;
  if (session.role !== "owner") return c.json({ error: "Only owners can invite members" }, 403);

  const body = await c.req.json<{ email?: string; role?: "admin" | "viewer" }>();
  const email = body.email?.trim().toLowerCase();
  if (!email) return c.json({ error: "Email required" }, 400);
  if (body.role !== "admin" && body.role !== "viewer") {
    return c.json({ error: "Role must be admin or viewer" }, 400);
  }

  const member = await addTeamMember(c.env.DB, session.account_id, email, body.role);
  await recordAudit(c.env.DB, {
    accountId: session.account_id,
    actorUserId: session.id,
    actorEmail: session.email,
    action: `Invited ${member.email} as ${member.role}`,
  });
  return c.json({ member }, 201);
});

ops.get("/invites", async (c) => {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  // Invites match by email: only a verified owner of that address may see them.
  if (!session.email_verified) return c.json({ invites: [], verification_required: true });
  const invites = await listPendingInvites(c.env.DB, session.email);
  return c.json({ invites });
});

ops.post("/invites/:id/accept", async (c) => {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  if (!session.email_verified) return c.json({ error: "Verify your email first" }, 403);
  const pending = await findPendingInvite(c.env.DB, c.req.param("id"), session.email);
  if (!pending) return c.json({ error: "Not found" }, 404);
  const ok = await acceptInvite(c.env.DB, c.req.param("id"), session.email);
  if (!ok) return c.json({ error: "Not found" }, 404);
  await recordAudit(c.env.DB, {
    accountId: pending.owner_user_id,
    actorUserId: session.id,
    actorEmail: session.email,
    action: "Accepted the team invite",
  });
  return c.json({ ok: true });
});

ops.post("/invites/:id/decline", async (c) => {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  if (!session.email_verified) return c.json({ error: "Verify your email first" }, 403);
  const pending = await findPendingInvite(c.env.DB, c.req.param("id"), session.email);
  if (!pending) return c.json({ error: "Not found" }, 404);
  const ok = await declineInvite(c.env.DB, c.req.param("id"), session.email);
  if (!ok) return c.json({ error: "Not found" }, 404);
  await recordAudit(c.env.DB, {
    accountId: pending.owner_user_id,
    actorUserId: session.id,
    actorEmail: session.email,
    action: "Declined the team invite",
  });
  return c.json({ ok: true });
});

// Incoming postback key (`/click?...&key=`). Owners and admins only: the key records conversions.
function postbackKeyResponse(appUrl: string, settings: PostbackKeySettings) {
  return { postback_key: { ...settings, postback_url: buildPostbackUrl(appUrl, settings.key) } };
}

ops.get("/postback-key", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;
  const settings = await ensurePostbackKey(c.env.DB, session.account_id);
  return c.json(postbackKeyResponse(c.env.APP_URL, settings));
});

ops.put("/postback-key", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;
  const body = await c.req.json<{ required?: unknown }>().catch(() => null);
  if (typeof body?.required !== "boolean") return c.json({ error: "required must be a boolean" }, 400);
  const settings = await setPostbackKeyRequired(c.env.DB, session.account_id, body.required);
  return c.json(postbackKeyResponse(c.env.APP_URL, settings));
});

ops.post("/postback-key/rotate", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;
  const settings = await rotatePostbackKey(c.env.DB, session.account_id);
  return c.json(postbackKeyResponse(c.env.APP_URL, settings));
});

ops.delete("/team/:id", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;
  if (session.role !== "owner") return c.json({ error: "Only owners can remove members" }, 403);

  const member = await getTeamMember(c.env.DB, c.req.param("id"), session.account_id);
  if (!member) return c.json({ error: "Not found" }, 404);
  const ok = await removeTeamMember(c.env.DB, member.id, session.account_id);
  if (!ok) return c.json({ error: "Not found" }, 404);
  await recordAudit(c.env.DB, {
    accountId: session.account_id,
    actorUserId: session.id,
    actorEmail: session.email,
    action: `Removed ${member.email} from the team`,
  });
  return c.json({ ok: true });
});

ops.get("/notes", async (c) => {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);

  const entityType = c.req.query("entity_type");
  const entityId = c.req.query("entity_id");
  if (!entityType || !entityId) {
    return c.json({ error: "entity_type and entity_id required" }, 400);
  }

  const notes = await listNotes(
    c.env.DB,
    session.account_id,
    entityType as Parameters<typeof listNotes>[2],
    entityId,
  );
  return c.json({ notes });
});

ops.post("/notes", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;

  const body = await c.req.json<{
    entity_type?: string;
    entity_id?: string;
    body?: string;
  }>();
  const text = body.body?.trim();
  if (!text) return c.json({ error: "Note body required" }, 400);
  if (!body.entity_type || !body.entity_id) {
    return c.json({ error: "entity_type and entity_id required" }, 400);
  }

  const note = await createNote(c.env.DB, session.account_id, {
    entity_type: body.entity_type as Parameters<typeof createNote>[2]["entity_type"],
    entity_id: body.entity_id,
    body: text,
  });
  return c.json({ note }, 201);
});

ops.delete("/notes/:id", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;

  const ok = await deleteNote(c.env.DB, c.req.param("id"), session.account_id);
  if (!ok) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

ops.get("/triggers", async (c) => {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);

  const programId = c.req.query("program_id") ?? undefined;
  const triggers = await listTriggers(c.env.DB, session.account_id, programId);
  return c.json({ triggers });
});

ops.post("/triggers", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;

  const body = await c.req.json<{
    name?: string;
    event?: "conversion" | "click";
    action_url?: string;
    program_id?: string | null;
    enabled?: boolean;
  }>();
  const name = body.name?.trim();
  const actionUrl = body.action_url?.trim();
  if (!name) return c.json({ error: "Name required" }, 400);
  if (!actionUrl || !parseHttpUrl(actionUrl)) {
    return c.json({ error: "Valid action_url required" }, 400);
  }
  if (body.event !== "conversion" && body.event !== "click") {
    return c.json({ error: "event must be conversion or click" }, 400);
  }

  if (body.program_id) {
    const program = await getProgram(c.env.DB, body.program_id, session.account_id);
    if (!program) return c.json({ error: "Campaign not found" }, 404);
  }

  const trigger = await createTrigger(c.env.DB, session.account_id, {
    name,
    event: body.event,
    action_url: actionUrl,
    program_id: body.program_id ?? null,
    enabled: body.enabled,
  });
  return c.json({ trigger }, 201);
});

ops.delete("/triggers/:id", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;

  const ok = await deleteTrigger(c.env.DB, c.req.param("id"), session.account_id);
  if (!ok) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

ops.post("/programs/bulk", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;

  const body = await c.req.json<{
    program_ids?: string[];
    status?: string;
    group_id?: string | null;
    traffic_source_id?: string | null;
    tags?: string | null;
  }>();
  const programIds = body.program_ids ?? [];
  if (programIds.length === 0) return c.json({ error: "program_ids required" }, 400);
  if (body.status !== undefined && !["active", "paused", "archived"].includes(body.status)) {
    return c.json({ error: "status must be active, paused or archived" }, 400);
  }
  if (
    body.traffic_source_id &&
    !(await entityBelongsTo(c.env.DB, "traffic_source", body.traffic_source_id, session.account_id))
  ) {
    return c.json({ error: "Invalid traffic_source_id" }, 400);
  }
  if (
    body.group_id &&
    !(await entityBelongsTo(c.env.DB, "group", body.group_id, session.account_id))
  ) {
    return c.json({ error: "Invalid group_id" }, 400);
  }

  const updates: {
    status?: string;
    group_id?: string | null;
    traffic_source_id?: string | null;
    tags?: string | null;
  } = {};
  if (body.status !== undefined) updates.status = body.status;
  if (body.group_id !== undefined) updates.group_id = body.group_id;
  if (body.traffic_source_id !== undefined) updates.traffic_source_id = body.traffic_source_id;
  if (body.tags !== undefined) updates.tags = body.tags;
  if (Object.keys(updates).length === 0) {
    return c.json({ error: "No updates provided" }, 400);
  }

  const updated = await bulkUpdatePrograms(c.env.DB, session.account_id, programIds, updates);
  return c.json({ updated });
});

ops.post("/programs/:id/clone", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;

  const body = (await c.req.json<{ name?: string }>().catch(() => ({ name: undefined }))) as {
    name?: string;
  };
  const program = await cloneProgram(
    c.env.DB,
    session.account_id,
    c.req.param("id"),
    body.name,
  );
  if (!program) return c.json({ error: "Not found" }, 404);
  return c.json({ program }, 201);
});

export { ops, canWrite };
