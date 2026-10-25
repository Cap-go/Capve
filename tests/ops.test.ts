import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { ACCOUNT_CONTEXT_COOKIE } from "../worker/lib/account-context";
import { cookieFrom, registerTestUser } from "./helpers";
import { initSql } from "./schema";

let authHeaders: Record<string, string>;

const MERCHANT = "https://merchant.example.com/pricing";

async function json<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

describe("phase 5 ops", () => {
  beforeAll(async () => {
    const statements = initSql
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean);
    for (const statement of statements) {
      await env.DB.prepare(statement).run();
    }
    await env.DB.exec(`
      DELETE FROM triggers;
      DELETE FROM entity_notes;
      DELETE FROM team_members;
      DELETE FROM visitor_assignments;
      DELETE FROM paths;
      DELETE FROM rotations;
      DELETE FROM conversions;
      DELETE FROM clicks;
      DELETE FROM affiliates;
      DELETE FROM programs;
      DELETE FROM auth_tokens;
      DELETE FROM users;
    `);
    ({ authHeaders } = await registerTestUser());
  });

  it("clones a campaign with paths", async () => {
    const { program, convert_secret: _s } = await json<{
      program: { id: string; name: string };
      convert_secret: string;
    }>(
      await SELF.fetch("http://localhost/api/programs", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ name: "Original", destination_url: MERCHANT }),
      }),
    );

    const lander = await json<{ lander: { id: string } }>(
      await SELF.fetch("http://localhost/api/entities/landers", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ name: "LP", url: "https://merchant.example.com/lp" }),
      }),
    );

    await SELF.fetch(`http://localhost/api/programs/${program.id}/paths`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ name: "Path 1", flow_type: "lander", lander_id: lander.lander.id }),
    });

    const cloneRes = await SELF.fetch(`http://localhost/api/ops/programs/${program.id}/clone`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ name: "Cloned" }),
    });
    expect(cloneRes.status).toBe(201);
    const { program: cloned } = await json<{ program: { id: string; name: string; status: string } }>(
      cloneRes,
    );
    expect(cloned.name).toBe("Cloned");
    expect(cloned.status).toBe("paused");
    expect(cloned.id).not.toBe(program.id);

    const rotation = await json<{ paths: Array<{ name: string }> }>(
      await SELF.fetch(`http://localhost/api/programs/${cloned.id}/rotation`, { headers: authHeaders }),
    );
    expect(rotation.paths).toHaveLength(1);
    expect(rotation.paths[0]?.name).toBe("Path 1");
  });

  it("bulk updates campaign status", async () => {
    const headers = authHeaders;
    const { program } = await json<{ program: { id: string } }>(
      await SELF.fetch("http://localhost/api/programs", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ name: "Bulk Target", destination_url: MERCHANT }),
      }),
    );

    const bulkRes = await SELF.fetch("http://localhost/api/ops/programs/bulk", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ program_ids: [program.id], status: "paused" }),
    });
    expect(bulkRes.status).toBe(200);
    const { updated } = await json<{ updated: number }>(bulkRes);
    expect(updated).toBe(1);

    const { program: refreshed } = await json<{ program: { status: string } }>(
      await SELF.fetch(`http://localhost/api/programs/${program.id}`, { headers }),
    );
    expect(refreshed.status).toBe("paused");
  });

  it("creates notes and team members", async () => {
    const headers = authHeaders;
    const { program } = await json<{ program: { id: string } }>(
      await SELF.fetch("http://localhost/api/programs", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ name: "Notes Campaign", destination_url: MERCHANT }),
      }),
    );

    const noteRes = await SELF.fetch("http://localhost/api/ops/notes", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        entity_type: "program",
        entity_id: program.id,
        body: "Test note content",
      }),
    });
    expect(noteRes.status).toBe(201);

    const notesList = await json<{ notes: Array<{ body: string }> }>(
      await SELF.fetch(
        `http://localhost/api/ops/notes?entity_type=program&entity_id=${program.id}`,
        { headers },
      ),
    );
    expect(notesList.notes[0]?.body).toBe("Test note content");

    const inviteRes = await SELF.fetch("http://localhost/api/ops/team", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ email: "viewer@example.com", role: "viewer" }),
    });
    expect(inviteRes.status).toBe(201);

    const team = await json<{ members: Array<{ email: string; role: string }> }>(
      await SELF.fetch("http://localhost/api/ops/team", { headers }),
    );
    expect(team.members.some((m) => m.email === "viewer@example.com")).toBe(true);
    expect(team.members.some((m) => m.role === "owner")).toBe(true);
  });

  it("shows the owner to someone who joined, and records who did it", async () => {
    const owner = await registerTestUser();
    const invitee = await registerTestUser();
    const inviteRes = await SELF.fetch("http://localhost/api/ops/team", {
      method: "POST",
      headers: owner.authHeaders,
      body: JSON.stringify({ email: invitee.email, role: "admin" }),
    });
    expect(inviteRes.status).toBe(201);

    const { invites } = await json<{ invites: Array<{ id: string }> }>(
      await SELF.fetch("http://localhost/api/ops/invites", { headers: invitee.authHeaders }),
    );
    const accept = await SELF.fetch(`http://localhost/api/ops/invites/${invites[0]!.id}/accept`, {
      method: "POST",
      headers: invitee.authHeaders,
    });
    expect(accept.status).toBe(200);

    const me = await json<{ user: { id: string; email: string } }>(
      await SELF.fetch("http://localhost/api/auth/me", { headers: owner.authHeaders }),
    );
    const team = await json<{
      account_id: string;
      role: string;
      members: Array<{ email: string; role: string }>;
    }>(await SELF.fetch("http://localhost/api/ops/team", { headers: invitee.authHeaders }));
    expect(team.role).toBe("admin");
    expect(team.account_id).toBe(me.user.id);
    expect(team.members.map((member) => member.email).sort()).toEqual(
      [owner.email, invitee.email].sort(),
    );
    expect(team.members.find((member) => member.email === owner.email)?.role).toBe("owner");

    const audit = await json<{ entries: Array<{ actor_email: string; action: string }> }>(
      await SELF.fetch("http://localhost/api/ops/audit", { headers: owner.authHeaders }),
    );
    expect(
      audit.entries.some(
        (entry) => entry.actor_email === owner.email && entry.action === `Invited ${invitee.email} as admin`,
      ),
    ).toBe(true);
    expect(
      audit.entries.some(
        (entry) => entry.actor_email === invitee.email && entry.action === "Accepted the team invite",
      ),
    ).toBe(true);

    const created = await SELF.fetch("http://localhost/api/programs", {
      method: "POST",
      headers: owner.authHeaders,
      body: JSON.stringify({ name: "Audited", destination_url: MERCHANT }),
    });
    expect(created.status).toBe(201);
    const after = await json<{ entries: Array<{ actor_email: string; action: string }> }>(
      await SELF.fetch("http://localhost/api/ops/audit", { headers: invitee.authHeaders }),
    );
    expect(
      after.entries.some(
        (entry) => entry.actor_email === owner.email && entry.action === "Created a campaign",
      ),
    ).toBe(true);
  });

  it("records sign-out everywhere after the session is revoked", async () => {
    const user = await registerTestUser();
    const out = await SELF.fetch("http://localhost/api/auth/logout-all", {
      method: "POST",
      headers: user.authHeaders,
    });
    expect(out.status).toBe(200);

    const login = await SELF.fetch("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, password: "test-password-12" }),
    });
    expect(login.status).toBe(200);
    const session = cookieFrom(login, "capve_session");
    const audit = await json<{ entries: Array<{ action: string }> }>(
      await SELF.fetch("http://localhost/api/ops/audit", {
        headers: { Cookie: `capve_session=${encodeURIComponent(session!)}` },
      }),
    );
    expect(audit.entries.some((entry) => entry.action === "Signed out everywhere")).toBe(true);
  });

  it("records personal API tokens on the owner, not the team they are viewing", async () => {
    const owner = await registerTestUser();
    const member = await registerTestUser();
    const inviteRes = await SELF.fetch("http://localhost/api/ops/team", {
      method: "POST",
      headers: owner.authHeaders,
      body: JSON.stringify({ email: member.email, role: "admin" }),
    });
    expect(inviteRes.status).toBe(201);
    const { invites } = await json<{ invites: Array<{ id: string }> }>(
      await SELF.fetch("http://localhost/api/ops/invites", { headers: member.authHeaders }),
    );
    const accept = await SELF.fetch(`http://localhost/api/ops/invites/${invites[0]!.id}/accept`, {
      method: "POST",
      headers: member.authHeaders,
    });
    expect(accept.status).toBe(200);

    const me = await json<{ user: { id: string; account_id: string } }>(
      await SELF.fetch("http://localhost/api/auth/me", { headers: member.authHeaders }),
    );
    expect(me.user.account_id).not.toBe(me.user.id);

    const created = await SELF.fetch("http://localhost/api/tokens", {
      method: "POST",
      headers: member.authHeaders,
      body: JSON.stringify({ name: "Personal" }),
    });
    expect(created.status).toBe(201);

    const teamAudit = await json<{ entries: Array<{ action: string }> }>(
      await SELF.fetch("http://localhost/api/ops/audit", { headers: owner.authHeaders }),
    );
    expect(teamAudit.entries.some((entry) => entry.action === "Created an API token")).toBe(false);

    const switched = await SELF.fetch("http://localhost/api/auth/switch-account", {
      method: "POST",
      headers: member.authHeaders,
      body: JSON.stringify({ account_id: me.user.id }),
    });
    expect(switched.status).toBe(200);
    const context = cookieFrom(switched, ACCOUNT_CONTEXT_COOKIE);
    const personalAudit = await json<{ entries: Array<{ actor_email: string; action: string }> }>(
      await SELF.fetch("http://localhost/api/ops/audit", {
        headers: {
          Cookie: `${member.authHeaders.Cookie}; ${ACCOUNT_CONTEXT_COOKIE}=${encodeURIComponent(context!)}`,
        },
      }),
    );
    expect(
      personalAudit.entries.some(
        (entry) => entry.actor_email === member.email && entry.action === "Created an API token",
      ),
    ).toBe(true);
  });
});
