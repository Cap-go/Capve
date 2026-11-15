import { describe, expect, it, vi } from "vitest";
import { handleMcpRequest } from "../worker/mcp/server";

async function call(name: string, args: unknown, dispatch = vi.fn(async () => Response.json({ settings: { timezone: "UTC" } }))) {
  const response = await handleMcpRequest(new Request("https://capve.app/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  }), dispatch);
  return { body: await response.json() as { result: { isError: boolean; content: { text: string }[]; structuredContent?: unknown } }, dispatch };
}

describe("MCP tool contract enforcement", () => {
  it.each([
    ["get_campaign", {}],
    ["get_settings", { unexpected: true }],
    ["create_campaign", { name: 123, destination_url: "https://example.com" }],
    ["update_campaign", { campaign_id: "prg_test", status: "typo" }],
    ["list_clicks", { campaign_id: "prg_test", limit: 0 }],
    ["list_clicks", { campaign_id: "prg_test", limit: 201 }],
    ["list_clicks", { campaign_id: "prg_test", offset: -1 }],
    ["create_path", { campaign_id: "prg_test", name: "x", offers: [{ offer_id: "off_test", weight: -1 }] }],
    ["create_path", { campaign_id: "prg_test", name: "x", offers: [{ offer_id: "off_test", typo: 1 }] }],
  ] as [string, unknown][])("rejects invalid %s arguments before API dispatch (%j)", async (name, args) => {
    const { body, dispatch } = await call(name, args);
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain("Invalid arguments");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("preserves valid structured results and their matching JSON text", async () => {
    const { body, dispatch } = await call("get_settings", {});
    expect(dispatch).toHaveBeenCalledOnce();
    expect(body.result.isError).toBe(false);
    expect(body.result.structuredContent).toEqual({ settings: { timezone: "UTC" } });
    expect(JSON.parse(body.result.content[0].text)).toEqual(body.result.structuredContent);
  });

  it("fails closed on an invalid successful API response", async () => {
    const { body } = await call("get_settings", {}, vi.fn(async () => Response.json({ settings: { timezone: 123 }, private_debug: "hidden" })));
    expect(body.result.isError).toBe(true);
    expect(body.result.structuredContent).toBeUndefined();
    expect(body.result.content[0].text).toContain("unexpected response format");
    expect(JSON.stringify(body)).not.toContain("hidden");
  });

  it("does not expose unexpected backend exception details", async () => {
    const { body } = await call("get_settings", {}, vi.fn(async () => Response.json({ error: "private SQL exception" }, { status: 500 })));
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain("Error 500");
    expect(JSON.stringify(body)).not.toContain("private SQL");
  });
});
