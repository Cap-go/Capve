import { initSql } from "./schema";
import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { handleMcpRequest, LEGACY_PROTOCOL_VERSIONS } from "../worker/mcp/server";

const endpoint = "https://capve.app/mcp";
const headers = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
  "MCP-Protocol-Version": "2025-11-25",
};
const ping = { jsonrpc: "2.0", id: 1, method: "ping" };

function request(body: unknown, overrides: HeadersInit = {}) {
  return new Request(endpoint, {
    method: "POST",
    headers: { ...headers, ...overrides },
    body: JSON.stringify(body),
  });
}

function dispatcher() {
  return vi.fn(async () => Response.json({ ok: true }));
}

describe("MCP Streamable HTTP protocol", () => {
  beforeAll(async () => {
    for (const statement of initSql.split(";").map((s) => s.trim()).filter(Boolean)) await env.DB.prepare(statement).run();
  });
  it.each([
    { url: "http://localhost/mcp", origin: "https://evil.example" },
    { url: "https://evil.example/mcp", origin: "https://evil.example" },
  ])("rejects hostile Origin before authentication and host routing: $url", async ({ url, origin }) => {
    const response = await SELF.fetch(url, {
      method: "POST", headers: { ...headers, Origin: origin }, body: JSON.stringify(ping),
    });
    expect(response.status).toBe(403);
  });

  it.each(LEGACY_PROTOCOL_VERSIONS)("negotiates supported version %s", async (version) => {
    const response = await handleMcpRequest(request({
      jsonrpc: "2.0", id: "init", method: "initialize",
      params: { protocolVersion: version, capabilities: {}, clientInfo: { name: "conformance", version: "1" } },
    }, { "MCP-Protocol-Version": version }), dispatcher());
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(await response.json()).toMatchObject({
      jsonrpc: "2.0", id: "init",
      result: {
        protocolVersion: version, capabilities: { tools: {} },
        serverInfo: {
          name: "capve",
          icons: [{ src: "https://capve.app/logo.svg", mimeType: "image/svg+xml", sizes: ["any"] }],
        },
      },
    });
  });

  it("negotiates a supported version when initialize requests an unknown one", async () => {
    const response = await handleMcpRequest(request({
      jsonrpc: "2.0", id: 0, method: "initialize",
      params: { protocolVersion: "2099-01-01", capabilities: {}, clientInfo: { name: "test", version: "1" } },
    }), dispatcher());
    expect(await response.json()).toMatchObject({ id: 0, result: { protocolVersion: LEGACY_PROTOCOL_VERSIONS[0] } });
  });

  it("rejects unsupported protocol headers before running a tool", async () => {
    const dispatch = dispatcher();
    const response = await handleMcpRequest(request(ping, { "MCP-Protocol-Version": "2099-01-01" }), dispatch);
    expect(response.status).toBe(400);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("keeps an explicitly legacy request compatible when a client adds Mcp-Method", async () => {
    const response = await handleMcpRequest(request(ping, { "Mcp-Method": "ping" }), dispatcher());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ jsonrpc: "2.0", id: 1, result: {} });
  });

  it.each(["https://evil.example", "https://capve.app.evil.example", "null"])("rejects untrusted Origin %s", async (origin) => {
    const dispatch = dispatcher();
    const response = await handleMcpRequest(request(ping, { Origin: origin }), dispatch);
    expect(response.status).toBe(403);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("accepts its own Origin and clients without Origin", async () => {
    for (const extraHeaders of [{ Origin: "https://capve.app" }, {}] as Record<string, string>[]) {
      const response = await handleMcpRequest(request(ping, extraHeaders), dispatcher());
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ jsonrpc: "2.0", id: 1, result: {} });
    }
  });

  it.each(["GET", "DELETE", "PUT"])("returns 405 for unsupported %s", async (method) => {
    const response = await handleMcpRequest(new Request(endpoint, { method }), dispatcher());
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toContain("POST");
  });

  it("rejects unsupported media types and response negotiation", async () => {
    const wrongType = await handleMcpRequest(request(ping, { "Content-Type": "text/plain" }), dispatcher());
    expect(wrongType.status).toBe(415);
    const wrongAccept = await handleMcpRequest(request(ping, { Accept: "text/html" }), dispatcher());
    expect(wrongAccept.status).toBe(406);
  });

  it("returns a JSON-RPC parse error for malformed JSON", async () => {
    const response = await handleMcpRequest(new Request(endpoint, { method: "POST", headers, body: "{" }), dispatcher());
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ jsonrpc: "2.0", error: { code: -32700 } });
  });

  it.each([
    null, [], [ping], {},
    { ...ping, jsonrpc: "1.0" },
    { ...ping, id: null },
    { ...ping, id: true },
    { ...ping, id: [] },
    { ...ping, id: 1.5 },
    { ...ping, method: 3 },
    { ...ping, params: [] },
    { ...ping, params: "bad" },
  ].map((body) => ({ body })))("rejects invalid JSON-RPC envelopes: $body", async ({ body }) => {
    const dispatch = dispatcher();
    const response = await handleMcpRequest(request(body), dispatch);
    expect(await response.json()).toMatchObject({ error: { code: -32600 } });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it.each(["notifications/initialized", "notifications/cancelled", "tools/list", "tools/call", "initialize"])(
    "never executes or replies to an id-less %s notification", async (method) => {
      const dispatch = dispatcher();
      const response = await handleMcpRequest(request({
        jsonrpc: "2.0", method,
        params: { name: "create_campaign", arguments: { name: "must not exist", destination_url: "https://merchant.example" } },
      }), dispatch);
      expect(response.status).toBe(202);
      expect(await response.text()).toBe("");
      expect(dispatch).not.toHaveBeenCalled();
    },
  );

  it("reports an unknown request method with the original ID", async () => {
    const response = await handleMcpRequest(request({ ...ping, id: "missing", method: "not/a/method" }), dispatcher());
    expect(await response.json()).toMatchObject({ jsonrpc: "2.0", id: "missing", error: { code: -32601 } });
  });

  it("handles March 2025 batches without replying to or executing notifications", async () => {
    const api = dispatcher();
    const response = await handleMcpRequest(request([
      ping,
      { jsonrpc: "2.0", method: "tools/call", params: { name: "create_campaign", arguments: { name: "Do not create" } } },
      { ...ping, id: "second" },
    ], { "MCP-Protocol-Version": "2025-03-26" }), api);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      { jsonrpc: "2.0", id: 1, result: {} },
      { jsonrpc: "2.0", id: "second", result: {} },
    ]);
    expect(api).not.toHaveBeenCalled();
  });

  it("accepts notification-only March batches and rejects empty batches", async () => {
    const notification = { jsonrpc: "2.0", method: "notifications/initialized" };
    const accepted = await handleMcpRequest(request([notification], { "MCP-Protocol-Version": "2025-03-26" }), dispatcher());
    expect(accepted.status).toBe(202);
    expect(await accepted.text()).toBe("");
    const empty = await handleMcpRequest(request([], { "MCP-Protocol-Version": "2025-03-26" }), dispatcher());
    expect(await empty.json()).toMatchObject({ error: { code: -32600 } });
  });

  it.each([undefined, {}, { name: 3 }, { name: "whoami", arguments: [] }, { name: "whoami", arguments: "bad" }])(
    "rejects malformed tool-call params without dispatch: %j", async (params) => {
      const dispatch = dispatcher();
      const response = await handleMcpRequest(request({ ...ping, method: "tools/call", params }), dispatch);
      expect(await response.json()).toMatchObject({ error: { code: -32602 } });
      expect(dispatch).not.toHaveBeenCalled();
    },
  );

  it("reports malformed initialize params", async () => {
    const response = await handleMcpRequest(request({ ...ping, method: "initialize", params: {} }), dispatcher());
    expect(await response.json()).toMatchObject({ error: { code: -32602 } });
  });

  it("turns unexpected exceptions into a bounded protocol error without leaking details", async () => {
    const response = await handleMcpRequest(request({
      ...ping, method: "tools/call", params: { name: "whoami", arguments: {} },
    }), async () => { throw new Error("private database credentials"); });
    const body = await response.json();
    expect(body).toMatchObject({ jsonrpc: "2.0", id: 1, error: { code: -32603 } });
    expect(JSON.stringify(body)).not.toContain("private database credentials");
  });
});
