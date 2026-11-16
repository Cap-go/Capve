import { describe, expect, it, vi } from "vitest";
import { handleMcpRequest } from "../worker/mcp/server";

const version = "2026-07-28";
const versionKey = "io.modelcontextprotocol/protocolVersion";
const capabilitiesKey = "io.modelcontextprotocol/clientCapabilities";
const serverInfoKey = "io.modelcontextprotocol/serverInfo";

function rpc(method = "server/discover", params: Record<string, unknown> = {}) {
  return {
    jsonrpc: "2.0", id: 1, method,
    params: { _meta: { [versionKey]: version, [capabilitiesKey]: {} }, ...params },
  };
}

function request(body = rpc(), overrides: Record<string, string | undefined> = {}) {
  const headers = new Headers({
    "Content-Type": "application/json", Accept: "application/json, text/event-stream",
    "MCP-Protocol-Version": version, "Mcp-Method": body.method,
  });
  for (const [name, value] of Object.entries(overrides)) {
    value === undefined ? headers.delete(name) : headers.set(name, value);
  }
  return new Request("https://capve.app/mcp", { method: "POST", headers, body: JSON.stringify(body) });
}

const dispatch = () => vi.fn(async () => Response.json({ ok: true }));

describe("MCP 2026 discovery and request metadata", () => {
  it("discovers without an initialization handshake", async () => {
    const api = dispatch();
    const response = await handleMcpRequest(request(), api);
    expect(response.status).toBe(200);
    const body = await response.json() as { result: Record<string, unknown> };
    expect(body).toMatchObject({
      jsonrpc: "2.0", id: 1,
      result: {
        resultType: "complete", supportedVersions: expect.arrayContaining([version]),
        capabilities: { tools: {} }, ttlMs: 0, cacheScope: "private",
        _meta: {
          [serverInfoKey]: {
            name: "capve",
            icons: [{ src: "https://capve.app/logo.svg", mimeType: "image/svg+xml", sizes: ["any"] }],
          },
        },
      },
    });
    expect(api).not.toHaveBeenCalled();
  });

  it("lists tools directly with modern result metadata", async () => {
    const response = await handleMcpRequest(request(rpc("tools/list")), dispatch());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      result: { resultType: "complete", tools: expect.any(Array), ttlMs: 0, cacheScope: "private" },
    });
  });

  it.each([
    { "MCP-Protocol-Version": undefined },
    { "MCP-Protocol-Version": "2025-11-25" },
    { "Mcp-Method": undefined },
    { "Mcp-Method": "tools/list" },
  ])("rejects missing or inconsistent mirrored headers: %j", async (overrides) => {
    const api = dispatch();
    const response = await handleMcpRequest(request(rpc(), overrides), api);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ id: 1, error: { code: -32020 } });
    expect(api).not.toHaveBeenCalled();
  });

  it("matches HTTP header names case insensitively", async () => {
    const response = await handleMcpRequest(request(rpc(), {
      "mCp-PrOtOcOl-VeRsIoN": version, "mCp-MeThOd": "server/discover",
    }), dispatch());
    expect(response.status).toBe(200);
  });

  it.each([
    {}, { [versionKey]: version },
    { [versionKey]: version, [capabilitiesKey]: [] },
    { [versionKey]: version, [capabilitiesKey]: null },
    { [versionKey]: version, [capabilitiesKey]: { elicitation: { form: true } } },
    { [versionKey]: version, [capabilitiesKey]: {}, "io.modelcontextprotocol/logLevel": ["info"] },
  ])(
    "rejects missing or malformed request metadata: %j", async (meta) => {
      const response = await handleMcpRequest(request(rpc("tools/list", { _meta: meta })), dispatch());
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ id: 1, error: { code: -32602 } });
    },
  );

  it("names supported revisions when the request declares an unsupported revision", async () => {
    const unsupported = "2099-01-01";
    const body = rpc("server/discover", { _meta: { [versionKey]: unsupported, [capabilitiesKey]: {} } });
    const response = await handleMcpRequest(request(body, { "MCP-Protocol-Version": unsupported }), dispatch());
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      id: 1, error: { code: -32022, data: { requested: unsupported, supported: expect.arrayContaining([version]) } },
    });
  });

  it.each(["initialize", "ping", "logging/setLevel", "resources/subscribe", "resources/unsubscribe", "unknown/method"])(
    "rejects removed or unknown method %s", async (method) => {
      const response = await handleMcpRequest(request(rpc(method)), dispatch());
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ id: 1, error: { code: -32601 } });
    },
  );

  it.each([undefined, "list_campaigns"])("checks Mcp-Name before dispatch: %s", async (name) => {
    const api = dispatch();
    const response = await handleMcpRequest(request(rpc("tools/call", { name: "whoami", arguments: {} }), { "Mcp-Name": name }), api);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ id: 1, error: { code: -32020 } });
    expect(api).not.toHaveBeenCalled();
  });

  it.each(["whoami", "=?base64?d2hvYW1p?="])("executes a tool with a valid Mcp-Name: %s", async (name) => {
    const api = vi.fn(async () => Response.json({ user: null }));
    const response = await handleMcpRequest(request(rpc("tools/call", { name: "whoami", arguments: {} }), { "Mcp-Name": name }), api);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ result: {
      resultType: "complete", isError: false, structuredContent: { user: null },
      _meta: { [serverInfoKey]: { name: "capve" } },
    } });
    expect(api).toHaveBeenCalledOnce();
  });
});
