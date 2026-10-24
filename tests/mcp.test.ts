import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { registerTestUser } from "./helpers";
import { initSql } from "./schema";

let authHeaders: Record<string, string>;
let token: string;

type RpcReply = {
  result?: {
    tools?: Array<{ name: string; annotations: { readOnlyHint: boolean } }>;
    content?: Array<{ text: string }>;
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
    protocolVersion?: string;
  };
  error?: { code: number; message: string };
};

async function rpc(method: string, params?: unknown, bearer = token): Promise<RpcReply> {
  const res = await SELF.fetch("http://localhost/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${bearer}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  expect(res.status).toBe(200);
  return res.json();
}

async function tool(name: string, args: Record<string, unknown> = {}) {
  const reply = await rpc("tools/call", { name, arguments: args });
  return reply.result!;
}

describe("MCP server", () => {
  beforeAll(async () => {
    for (const statement of initSql.split(";").map((s) => s.trim()).filter(Boolean)) {
      await env.DB.prepare(statement).run();
    }
    ({ authHeaders } = await registerTestUser());
    const res = await SELF.fetch("http://localhost/api/tokens", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ name: "Claude" }),
    });
    expect(res.status).toBe(201);
    ({ token } = await res.json<{ token: string }>());
    expect(token).toMatch(/^capve_/);
  });

  it("rejects requests without a valid token", async () => {
    const missing = await SELF.fetch("http://localhost/mcp", { method: "POST", body: "{}" });
    expect(missing.status).toBe(401);
    expect(missing.headers.get("WWW-Authenticate")).toContain("Bearer");

    const wrong = await SELF.fetch("http://localhost/mcp", {
      method: "POST",
      headers: { Authorization: "Bearer capve_nope" },
      body: "{}",
    });
    expect(wrong.status).toBe(401);
  });

  it("initializes and lists tools", async () => {
    const init = await rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test", version: "1" },
    });
    expect(init.result?.protocolVersion).toBe("2025-06-18");

    const notified = await SELF.fetch("http://localhost/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    });
    expect(notified.status).toBe(202);

    const list = await rpc("tools/list");
    const names = list.result?.tools?.map((t) => t.name) ?? [];
    // Landing page and README advertise "91 tools".
    expect(names).toHaveLength(91);
    expect(names).toContain("list_activity");
    expect(names).toContain("create_campaign");
    expect(names).toContain("report_grouped");
    expect(list.result?.tools?.find((t) => t.name === "list_campaigns")?.annotations.readOnlyHint).toBe(
      true,
    );
  });

  it("runs a full campaign setup through tools", async () => {
    const created = await tool("create_campaign", {
      name: "MCP Campaign",
      destination_url: "https://merchant.example.com/",
    });
    expect(created.isError).toBe(false);
    const campaign = (created.structuredContent as { program: { id: string; campaign_key: string } })
      .program;

    const offer = await tool("create_offer", {
      name: "Offer",
      url: "https://merchant.example.com/offer?cid={clickid}",
      payout_cents: 500,
    });
    const offerId = (offer.structuredContent as { offer: { id: string } }).offer.id;

    const path = await tool("create_path", {
      campaign_id: campaign.id,
      name: "Offer path",
      flow_type: "offer",
      offer_id: offerId,
    });
    expect(path.isError).toBe(false);

    const redirect = await SELF.fetch(`http://localhost/c/${campaign.campaign_key}`, {
      redirect: "manual",
    });
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get("location")).toContain("merchant.example.com/offer?cid=");

    const report = await tool("report_grouped", { by: "campaign", from: "2020-01-01" });
    expect(report.isError).toBe(false);
    expect(JSON.stringify(report.structuredContent)).toContain("MCP Campaign");

    const listed = await tool("list_campaigns");
    expect(listed.content?.[0].text).toContain(campaign.id);
  });

  it("returns API errors as tool errors", async () => {
    const bad = await tool("create_campaign", { name: "x", destination_url: "ftp://nope" });
    expect(bad.isError).toBe(true);
    expect(bad.content?.[0].text).toContain("400");

    const missing = await tool("get_campaign", {});
    expect(missing.isError).toBe(true);

    const unknown = await rpc("tools/call", { name: "nope", arguments: {} });
    expect(unknown.error?.code).toBe(-32602);
  });

  it("works with the regular API too, but cannot mint tokens", async () => {
    const programs = await SELF.fetch("http://localhost/api/programs", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(programs.status).toBe(200);

    const mint = await SELF.fetch("http://localhost/api/tokens", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(mint.status).toBe(403);
  });

  it("revokes tokens", async () => {
    await tool("whoami");
    const { tokens } = await (
      await SELF.fetch("http://localhost/api/tokens", { headers: authHeaders })
    ).json<{ tokens: Array<{ id: string; prefix: string; last_used_at: number | null }> }>();
    expect(tokens).toHaveLength(1);
    expect(token.startsWith(tokens[0].prefix)).toBe(true);
    expect(tokens[0].last_used_at).not.toBeNull();

    const del = await SELF.fetch(`http://localhost/api/tokens/${tokens[0].id}`, {
      method: "DELETE",
      headers: authHeaders,
    });
    expect(del.status).toBe(200);

    const after = await SELF.fetch("http://localhost/mcp", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(after.status).toBe(401);
  });
});
