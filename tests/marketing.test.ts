import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { TOOLS } from "../worker/mcp/tools";
import { MCP_TOOL_COUNT } from "../src/marketing/content/features";

describe("marketing site", () => {
  it("advertises the real number of MCP tools", () => {
    expect(MCP_TOOL_COUNT).toBe(TOOLS.length);
  });

  it("redirects /home to the canonical home page", async () => {
    const res = await SELF.fetch("https://capve.app/home", { redirect: "manual" });
    expect(res.status).toBe(301);
    expect(new URL(res.headers.get("location")!, "https://capve.app").pathname).toBe("/");
  });

  it("keeps the home page off custom tracking domains", async () => {
    const res = await SELF.fetch("https://track.unknown-domain.test/");
    expect(res.status).toBe(404);
  });
});
