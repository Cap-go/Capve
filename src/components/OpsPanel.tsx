import { FormEvent, useEffect, useState } from "react";
import {
  api,
  type AuditEntry,
  type EntityNote,
  type PendingInvite,
  type TeamMember,
  type TeamRole,
  type Trigger,
} from "../lib/api";
import { ErrorBox, Field, CopyButton, confirmDelete } from "./ui";

export function OpsPanel({ role, accountId }: { role: TeamRole; accountId: string }) {
  const [tab, setTab] = useState<"team" | "activity" | "triggers">("team");

  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap gap-2">
        <button
          className={`btn text-sm ${tab === "team" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setTab("team")}
          type="button"
        >
          Team
        </button>
        <button
          className={`btn text-sm ${tab === "activity" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setTab("activity")}
          type="button"
        >
          Activity
        </button>
        <button
          className={`btn text-sm ${tab === "triggers" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setTab("triggers")}
          type="button"
        >
          Triggers
        </button>
      </nav>
      {tab === "team" ? (
        <>
          <PendingInvitesPanel />
          <TeamPanel role={role} accountId={accountId} />
        </>
      ) : tab === "activity" ? (
        <ActivityPanel />
      ) : (
        <TriggersPanel />
      )}
      <SessionsPanel />
    </div>
  );
}

function SessionsPanel() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function logoutEverywhere() {
    if (!window.confirm("Sign out of Capve on every device, including this one?")) return;
    setBusy(true);
    setError("");
    try {
      await api.logoutAll();
      window.location.href = "/login";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign out");
      setBusy(false);
    }
  }

  return (
    <div className="card p-5">
      <h2 className="font-semibold">Sessions</h2>
      <p className="mt-1 text-sm text-[var(--velo-muted)]">
        Revoke every signed-in browser. API tokens are managed under AI / MCP.
      </p>
      <ErrorBox message={error} />
      <button className="btn btn-secondary mt-3" disabled={busy} onClick={logoutEverywhere} type="button">
        Sign out everywhere
      </button>
    </div>
  );
}

function PendingInvitesPanel() {
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.invites().then(({ invites: items }) => setInvites(items)).catch(() => {});
  }, []);

  async function respond(inviteId: string, accept: boolean) {
    setBusy(true);
    setError("");
    try {
      if (accept) {
        await api.acceptInvite(inviteId);
        window.location.reload();
        return;
      }
      await api.declineInvite(inviteId);
      setInvites((prev) => prev.filter((i) => i.id !== inviteId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update invite");
    } finally {
      setBusy(false);
    }
  }

  if (invites.length === 0) return null;

  return (
    <div className="card p-5">
      <h2 className="font-semibold">Pending invites</h2>
      <p className="mt-1 text-sm text-[var(--velo-muted)]">
        Accepting switches your dashboard to the inviting account.
      </p>
      <ErrorBox message={error} />
      <table className="table mt-4">
        <thead>
          <tr>
            <th>From</th>
            <th>Role</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {invites.map((invite) => (
            <tr key={invite.id}>
              <td className="mono">{invite.owner_email ?? invite.owner_user_id}</td>
              <td>{invite.role}</td>
              <td className="flex gap-2">
                <button
                  className="btn btn-primary text-xs"
                  disabled={busy}
                  onClick={() => respond(invite.id, true)}
                  type="button"
                >
                  Accept
                </button>
                <button
                  className="btn btn-secondary text-xs"
                  disabled={busy}
                  onClick={() => respond(invite.id, false)}
                  type="button"
                >
                  Decline
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ActivityPanel() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .auditLog()
      .then(({ entries: rows }) => setEntries(rows))
      .catch((err) => {
        setEntries([]);
        setError(err instanceof Error ? err.message : "Could not load activity");
      });
  }, []);

  return (
    <div className="card p-5">
      <h2 className="font-semibold">Activity</h2>
      <p className="mt-1 text-sm text-[var(--velo-muted)]">
        Who changed this account. Click traffic and conversions stay in the campaign logs.
      </p>
      <ErrorBox message={error} />
      <table className="table mt-4">
        <thead>
          <tr>
            <th>When</th>
            <th>Who</th>
            <th>What</th>
          </tr>
        </thead>
        <tbody>
          {entries === null && (
            <tr>
              <td colSpan={3} className="text-[var(--velo-muted)]">
                Loading activity…
              </td>
            </tr>
          )}
          {entries?.length === 0 && (
            <tr>
              <td colSpan={3} className="text-[var(--velo-muted)]">
                No activity yet.
              </td>
            </tr>
          )}
          {entries?.map((entry) => (
            <tr key={entry.id}>
              <td className="whitespace-nowrap">
                {new Date(entry.created_at).toLocaleString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </td>
              <td className="mono">{entry.actor_email}</td>
              <td>{entry.action}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TeamPanel({ role, accountId }: { role: TeamRole; accountId: string }) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [email, setEmail] = useState("");
  const [memberRole, setMemberRole] = useState<"admin" | "viewer">("viewer");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.team().then(({ members }) => setMembers(members)).catch(() => {});
  }, []);

  async function invite(e: FormEvent) {
    e.preventDefault();
    if (role !== "owner") return;
    setBusy(true);
    setError("");
    try {
      const { member } = await api.inviteMember(email, memberRole);
      setMembers((prev) => [...prev, member]);
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not invite member");
    } finally {
      setBusy(false);
    }
  }

  async function remove(memberId: string, memberEmail: string) {
    if (!confirmDelete(`team member ${memberEmail}`, "They lose access to this account.")) return;
    setBusy(true);
    setError("");
    try {
      await api.removeMember(memberId);
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove member");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5">
      <h2 className="font-semibold">Team members</h2>
      <p className="mt-1 text-sm text-[var(--velo-muted)]">
        Your role: <strong>{role}</strong>. Viewers can read dashboards; admins can edit.
        The owner is listed with everyone invited to this account.
      </p>
      <div className="team-id">
        <span className="text-sm font-medium text-[var(--velo-muted)]">Team ID</span>
        <code className="mono">{accountId}</code>
        <CopyButton text={accountId} />
      </div>
      <ErrorBox message={error} />
      <table className="table mt-4">
        <thead>
          <tr>
            <th>Email</th>
            <th>Role</th>
            <th>Status</th>
            {role === "owner" && <th />}
          </tr>
        </thead>
        <tbody>
          {members.length === 0 && (
            <tr>
              <td colSpan={role === "owner" ? 4 : 3} className="text-[var(--velo-muted)]">
                No team members yet.
              </td>
            </tr>
          )}
          {members.map((member) => (
            <tr key={member.id}>
              <td className="mono">{member.email}</td>
              <td>{member.role}</td>
              <td>{member.accepted_at ? "active" : "pending"}</td>
              {role === "owner" && (
                <td>
                  {member.role !== "owner" && (
                    <button
                      className="btn btn-secondary text-xs"
                      disabled={busy}
                      onClick={() => remove(member.id, member.email)}
                      type="button"
                    >
                      Remove
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {role === "owner" && (
        <form className="mt-4 grid gap-3 sm:grid-cols-3" onSubmit={invite}>
          <Field
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Role</span>
            <select
              className="input"
              value={memberRole}
              onChange={(e) => setMemberRole(e.target.value as "admin" | "viewer")}
            >
              <option value="admin">Admin</option>
              <option value="viewer">Viewer</option>
            </select>
          </label>
          <div className="self-end">
            <button className="btn btn-primary" disabled={busy} type="submit">
              Invite
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function TriggersPanel() {
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [name, setName] = useState("");
  const [actionUrl, setActionUrl] = useState("");
  const [event, setEvent] = useState<"conversion" | "click">("conversion");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.triggers().then(({ triggers: items }) => setTriggers(items)).catch(() => {});
  }, []);

  async function addTrigger(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { trigger } = await api.createTrigger({ name, event, action_url: actionUrl });
      setTriggers((prev) => [trigger, ...prev]);
      setName("");
      setActionUrl("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create trigger");
    } finally {
      setBusy(false);
    }
  }

  async function remove(trigger: Trigger) {
    if (!confirmDelete(`trigger "${trigger.name}"`)) return;
    setError("");
    try {
      await api.deleteTrigger(trigger.id);
      setTriggers((prev) => prev.filter((t) => t.id !== trigger.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete trigger");
    }
  }

  return (
    <div className="card p-5">
      <h2 className="font-semibold">Triggers</h2>
      <p className="mt-1 text-sm text-[var(--velo-muted)]">
        Fire a webhook when conversions (or clicks) are recorded. Use macros:{" "}
        <code className="mono">{"{click_id}"}</code>, <code className="mono">{"{payout}"}</code>,{" "}
        <code className="mono">{"{order_id}"}</code>.
      </p>
      <ErrorBox message={error} />
      <table className="table mt-4">
        <thead>
          <tr>
            <th>Name</th>
            <th>Event</th>
            <th>URL</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {triggers.length === 0 && (
            <tr>
              <td colSpan={4} className="text-[var(--velo-muted)]">
                No triggers yet.
              </td>
            </tr>
          )}
          {triggers.map((trigger) => (
            <tr key={trigger.id}>
              <td>{trigger.name}</td>
              <td>{trigger.event}</td>
              <td className="mono max-w-xs truncate">{trigger.action_url}</td>
              <td>
                <button
                  className="btn btn-secondary text-xs"
                  onClick={() => remove(trigger)}
                  type="button"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={addTrigger}>
        <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Event</span>
          <select
            className="input"
            value={event}
            onChange={(e) => setEvent(e.target.value as "conversion" | "click")}
          >
            <option value="conversion">Conversion</option>
            <option value="click">Click</option>
          </select>
        </label>
        <Field
          label="Webhook URL"
          placeholder="https://hooks.example.com/conv?click={click_id}&payout={payout}"
          value={actionUrl}
          onChange={(e) => setActionUrl(e.target.value)}
          required
        />
        <button className="btn btn-primary sm:col-span-2" disabled={busy} type="submit">
          Add trigger
        </button>
      </form>
    </div>
  );
}

export function NotesPanel({
  entityType,
  entityId,
  canWrite,
}: {
  entityType: EntityNote["entity_type"];
  entityId: string;
  canWrite: boolean;
}) {
  const [notes, setNotes] = useState<EntityNote[]>([]);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!entityId) return;
    api.notes(entityType, entityId).then(({ notes: items }) => setNotes(items)).catch(() => {});
  }, [entityType, entityId]);

  async function addNote(e: FormEvent) {
    e.preventDefault();
    if (!canWrite) return;
    try {
      const { note } = await api.createNote({ entity_type: entityType, entity_id: entityId, body });
      setNotes((prev) => [note, ...prev]);
      setBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save note");
    }
  }

  return (
    <div className="card p-5">
      <h2 className="font-semibold">Notes</h2>
      <ErrorBox message={error} />
      {canWrite && (
        <form className="mt-3 flex gap-2" onSubmit={addNote}>
          <input
            className="flex-1 rounded-md border border-[var(--velo-border)] bg-transparent px-3 py-2"
            placeholder="Add a note…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <button className="btn btn-secondary" type="submit">
            Save
          </button>
        </form>
      )}
      <ul className="mt-4 space-y-2">
        {notes.length === 0 && <li className="text-sm text-[var(--velo-muted)]">No notes yet.</li>}
        {notes.map((note) => (
          <li className="rounded-md border border-[var(--velo-border)] p-3 text-sm" key={note.id}>
            <p>{note.body}</p>
            <p className="mt-1 text-xs text-[var(--velo-muted)]">
              {new Date(note.updated_at).toLocaleString()}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
