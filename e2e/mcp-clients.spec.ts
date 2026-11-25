import { expect, test } from "@playwright/test";

const user = {
  id: "usr_mcp_test", email: "mcp@example.com", account_id: "usr_mcp_test",
  account_email: "mcp@example.com", role: "owner", email_verified: true,
};

const fixtures: Record<string, unknown> = {
  "/api/auth/me": { user },
  "/api/auth/accounts": { accounts: [{ account_id: user.id, email: user.email, role: "owner" }] },
  "/api/billing": { enabled: false, reportsAllowed: true },
  "/api/programs": { programs: [] },
  "/api/tokens": { tokens: [] },
  "/oauth/connections": { connections: [] },
};

test("AI / MCP lists every main AI client with install links and copy buttons", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.route(/\/(api|oauth)\//, async (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: path in fixtures ? fixtures[path] : {} });
  });

  await page.goto("/app/mcp");
  const names = ["Claude", "Claude Code", "ChatGPT", "Cursor", "VS Code and GitHub Copilot", "Windsurf", "Gemini CLI", "Codex", "Zed", "LM Studio", "Grok"];
  for (const name of names) {
    await expect(page.getByRole("heading", { name, exact: true, level: 3 })).toBeVisible();
  }
  const card = (name: string) => page.getByRole("region", { name, exact: true });

  await expect(card("Claude").getByRole("link", { name: "Add to Claude" })).toHaveAttribute("href", /^https:\/\/claude\.ai\/customize\/connectors\?modal=add-custom-connector/);
  await expect(card("Cursor").getByRole("link", { name: "Add to Cursor" })).toHaveAttribute("href", /^cursor:\/\/anysphere\.cursor-deeplink\/mcp\/install\?name=capve&config=/);
  await expect(card("VS Code and GitHub Copilot").getByRole("link", { name: "Add to VS Code" })).toHaveAttribute("href", /^vscode:mcp\/install\?/);
  await expect(card("LM Studio").getByRole("link", { name: "Add to LM Studio" })).toHaveAttribute("href", /^lmstudio:\/\/add_mcp\?name=capve&config=/);

  const copyUrl = page.getByRole("button", { name: "Copy MCP server URL" }).first();
  await copyUrl.click();
  await expect(page.getByRole("button", { name: "Copied MCP server URL" }).first()).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/mcp$/);

  await card("Claude Code").getByRole("button", { name: "Copy Terminal" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^claude mcp add --transport http capve .*\/mcp$/);

  await page.getByRole("navigation", { name: "Jump to an AI client" }).getByRole("link", { name: "Zed" }).click();
  await expect(page).toHaveURL(/#mcp-client-zed-card$/);
  expect(errors).toEqual([]);
});
