import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { registerTestUser } from "./helpers";
import { initSql } from "./schema";

const MERCHANT = "https://merchant.example.com/pricing";

type Headers = Record<string, string>;

async function json<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

function api(path: string, headers: Headers, method = "GET", body?: unknown) {
  return SELF.fetch(`http://localhost${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function createProgram(headers: Headers, name = "Security Campaign") {
  const res = await api("/api/programs", headers, "POST", { name, destination_url: MERCHANT });
  expect(res.status).toBe(201);
  return (await json<{ program: { id: string; campaign_key: string } }>(res)).program;
}

describe("security hardening", () => {
  beforeAll(async () => {
    const statements = initSql
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean);
    for (const statement of statements) {
      await env.DB.prepare(statement).run();
    }
  });

  describe("team invites", () => {
    it("does not grant access until the invitee accepts", async () => {
      const owner = await registerTestUser();
      const ownerProgram = await createProgram(owner.authHeaders, "Owner Campaign");
      const invitee = await registerTestUser();
      const stranger = await registerTestUser();

      const inviteRes = await api("/api/ops/team", owner.authHeaders, "POST", {
        email: invitee.email,
        role: "viewer",
      });
      expect(inviteRes.status).toBe(201);

      const before = await json<{ programs: Array<{ id: string }> }>(
        await api("/api/programs", invitee.authHeaders),
      );
      expect(before.programs.some((p) => p.id === ownerProgram.id)).toBe(false);

      const { invites } = await json<{ invites: Array<{ id: string; role: string }> }>(
        await api("/api/ops/invites", invitee.authHeaders),
      );
      expect(invites).toHaveLength(1);
      expect(invites[0]?.role).toBe("viewer");

      const strangerInvites = await json<{ invites: unknown[] }>(
        await api("/api/ops/invites", stranger.authHeaders),
      );
      expect(strangerInvites.invites).toHaveLength(0);
      const hijack = await api(
        `/api/ops/invites/${invites[0]!.id}/accept`,
        stranger.authHeaders,
        "POST",
      );
      expect(hijack.status).toBe(404);

      const accept = await api(
        `/api/ops/invites/${invites[0]!.id}/accept`,
        invitee.authHeaders,
        "POST",
      );
      expect(accept.status).toBe(200);

      const after = await json<{ programs: Array<{ id: string }> }>(
        await api("/api/programs", invitee.authHeaders),
      );
      expect(after.programs.some((p) => p.id === ownerProgram.id)).toBe(true);

      const pending = await json<{ invites: unknown[] }>(
        await api("/api/ops/invites", invitee.authHeaders),
      );
      expect(pending.invites).toHaveLength(0);
    });

    it("lets the invitee decline", async () => {
      const owner = await registerTestUser();
      const invitee = await registerTestUser();
      await api("/api/ops/team", owner.authHeaders, "POST", {
        email: invitee.email,
        role: "admin",
      });

      const { invites } = await json<{ invites: Array<{ id: string }> }>(
        await api("/api/ops/invites", invitee.authHeaders),
      );
      const decline = await api(
        `/api/ops/invites/${invites[0]!.id}/decline`,
        invitee.authHeaders,
        "POST",
      );
      expect(decline.status).toBe(200);

      const team = await json<{ members: Array<{ email: string; role: string }> }>(
        await api("/api/ops/team", owner.authHeaders),
      );
      expect(team.members.map((member) => member.email)).toEqual([owner.email]);
      expect(team.members[0]?.role).toBe("owner");
    });
  });

  describe("campaign keys", () => {
    it("generates distinct keys across accounts for the same name", async () => {
      const a = await registerTestUser();
      const b = await registerTestUser();
      const first = await createProgram(a.authHeaders, "Same Name");
      const second = await createProgram(b.authHeaders, "Same Name");
      expect(first.campaign_key).toMatch(/^same_name_[a-z0-9]{8}$/);
      expect(second.campaign_key).toMatch(/^same_name_[a-z0-9]{8}$/);
      expect(first.campaign_key).not.toBe(second.campaign_key);
    });

    it("enforces global uniqueness in the database", async () => {
      const a = await registerTestUser();
      const b = await registerTestUser();
      const program = await createProgram(a.authHeaders, "Unique Key");
      const other = await createProgram(b.authHeaders, "Other Key");
      await expect(
        env.DB.prepare("UPDATE programs SET campaign_key = ? WHERE id = ?")
          .bind(program.campaign_key, other.id)
          .run(),
      ).rejects.toThrow(/UNIQUE/);
    });
  });

  describe("ownership checks", () => {
    it("rejects entities owned by another account", async () => {
      const a = await registerTestUser();
      const b = await registerTestUser();

      const { traffic_source } = await json<{ traffic_source: { id: string } }>(
        await api("/api/entities/traffic-sources", b.authHeaders, "POST", { name: "B src" }),
      );
      const { lander } = await json<{ lander: { id: string } }>(
        await api("/api/entities/landers", b.authHeaders, "POST", {
          name: "B lander",
          url: "https://b.example.com/lp",
        }),
      );
      const { offer } = await json<{ offer: { id: string } }>(
        await api("/api/entities/offers", b.authHeaders, "POST", {
          name: "B offer",
          url: "https://b.example.com/offer",
        }),
      );
      const { network } = await json<{ network: { id: string } }>(
        await api("/api/entities/networks", b.authHeaders, "POST", { name: "B net" }),
      );

      const create = await api("/api/programs", a.authHeaders, "POST", {
        name: "Foreign Source",
        destination_url: MERCHANT,
        traffic_source_id: traffic_source.id,
      });
      expect(create.status).toBe(400);

      const program = await createProgram(a.authHeaders, "Mine");
      const bulk = await api("/api/ops/programs/bulk", a.authHeaders, "POST", {
        program_ids: [program.id],
        traffic_source_id: traffic_source.id,
      });
      expect(bulk.status).toBe(400);

      const landerPath = await api(`/api/programs/${program.id}/paths`, a.authHeaders, "POST", {
        name: "Bad lander",
        flow_type: "lander",
        lander_id: lander.id,
      });
      expect(landerPath.status).toBe(400);

      const offerPath = await api(`/api/programs/${program.id}/paths`, a.authHeaders, "POST", {
        name: "Bad offer",
        flow_type: "offer",
        offer_id: offer.id,
      });
      expect(offerPath.status).toBe(400);

      const foreignOffer = await api("/api/entities/offers", a.authHeaders, "POST", {
        name: "A offer",
        url: "https://a.example.com/offer",
        network_id: network.id,
      });
      expect(foreignOffer.status).toBe(400);

      const otherProgram = await createProgram(b.authHeaders, "B program");
      const { path: otherPath } = await json<{ path: { id: string } }>(
        await api(`/api/programs/${otherProgram.id}/paths`, b.authHeaders, "POST", {
          name: "B path",
          flow_type: "direct",
          direct_url: "https://b.example.com/",
        }),
      );
      const fixed = await api(`/api/programs/${program.id}/rotation`, a.authHeaders, "PUT", {
        mode: "fix_on",
        fixed_path_id: otherPath.id,
      });
      expect(fixed.status).toBe(400);
    });

    it("maps fixed_path_id to the cloned path", async () => {
      const a = await registerTestUser();
      const program = await createProgram(a.authHeaders, "Fixed Source");
      const { path } = await json<{ path: { id: string } }>(
        await api(`/api/programs/${program.id}/paths`, a.authHeaders, "POST", {
          name: "Pinned",
          flow_type: "direct",
          direct_url: "https://merchant.example.com/a",
        }),
      );
      const pin = await api(`/api/programs/${program.id}/rotation`, a.authHeaders, "PUT", {
        mode: "fix_on",
        fixed_path_id: path.id,
      });
      expect(pin.status).toBe(200);

      const { program: cloned } = await json<{ program: { id: string; campaign_key: string } }>(
        await api(`/api/ops/programs/${program.id}/clone`, a.authHeaders, "POST", {}),
      );
      expect(cloned.campaign_key).not.toBe(program.campaign_key);
      const config = await json<{
        rotation: { fixed_path_id: string | null };
        paths: Array<{ id: string }>;
      }>(await api(`/api/programs/${cloned.id}/rotation`, a.authHeaders));
      expect(config.rotation.fixed_path_id).toBe(config.paths[0]?.id);
      expect(config.rotation.fixed_path_id).not.toBe(path.id);
    });
  });

  describe("postback and webhook URLs", () => {
    it("rejects non-http(s) URLs", async () => {
      const a = await registerTestUser();
      const program = await createProgram(a.authHeaders, "Postbacks");

      for (const url of ["javascript:alert(1)", "ftp://ts.example.com/pb", "file:///etc/passwd"]) {
        const bad = await api("/api/postbacks", a.authHeaders, "POST", {
          campaign_id: program.id,
          url,
        });
        expect(bad.status).toBe(400);
      }
      const good = await api("/api/postbacks", a.authHeaders, "POST", {
        campaign_id: program.id,
        url: "https://ts.example.com/pb?cid={click_id}",
      });
      expect(good.status).toBe(201);
      const { postback } = await json<{ postback: { id: string; url: string } }>(good);
      expect(postback.url).toBe("https://ts.example.com/pb?cid={click_id}");

      const badPatch = await api(`/api/postbacks/${postback.id}`, a.authHeaders, "PATCH", {
        url: "javascript:alert(1)",
      });
      expect(badPatch.status).toBe(400);

      // Postbacks of another account are invisible and cannot be attached to its entities.
      const b = await registerTestUser();
      const foreign = await api("/api/postbacks", b.authHeaders, "POST", {
        campaign_id: program.id,
        url: "https://evil.example.com/pb",
      });
      expect(foreign.status).toBe(404);
      const foreignDelete = await api(`/api/postbacks/${postback.id}`, b.authHeaders, "DELETE");
      expect(foreignDelete.status).toBe(404);

      const badTrigger = await api("/api/ops/triggers", a.authHeaders, "POST", {
        name: "Bad",
        event: "conversion",
        action_url: "data:text/plain,hi",
      });
      expect(badTrigger.status).toBe(400);
    });
  });
});
