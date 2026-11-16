import { expect, test } from "@playwright/test";

const user = {
  id: "usr_browser_test", email: "assistant@example.com", account_id: "usr_browser_test",
  account_email: "assistant@example.com", role: "owner", email_verified: true,
};

for (const scrollReturn of ["native", "promise", "void"] as const) {
  for (const trigger of ["Enter", "example"] as const) {
    test(`${trigger} keeps chat and dashboard mounted when scrollIntoView returns ${scrollReturn}`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.addInitScript(({ userId, scrollReturn }) => {
        sessionStorage.setItem(`capve-assistant-chatgpt:${userId}`, JSON.stringify({
          accessToken: "browser-test-only", refreshToken: "", expiresAt: Date.now() + 3_600_000,
        }));
        // Exercise both contracts even on CI browsers predating promise-returning scrolling.
        if (scrollReturn !== "native") {
          const scroll = Element.prototype.scrollIntoView;
          Element.prototype.scrollIntoView = function (options) {
            scroll.call(this, options);
            if (scrollReturn === "promise") return Promise.resolve({ interrupted: false });
          };
        }
      }, { userId: user.id, scrollReturn });
      let replies = 0;
      await page.route("**/api/**", async route => {
        const path = new URL(route.request().url()).pathname;
        const fixtures: Record<string, unknown> = {
          "/api/auth/me": { user },
          "/api/auth/accounts": { accounts: [{ account_id: user.id, email: user.email, role: "owner" }] },
          "/api/billing": { enabled: false, reportsAllowed: true },
          "/api/programs": { programs: [] },
          "/api/entities/traffic-sources": { traffic_sources: [] },
          "/api/entities/groups": { groups: [] },
          "/api/reports/campaigns": { campaigns: [] },
          "/api/assistant/mcp": { result: { tools: [] } },
          "/api/assistant/models": { models: [] },
        };
        if (path === "/api/assistant/responses") {
          const event = { type: "response.completed", response: { output: [{ type: "message", content: [{ type: "output_text", text: `Reply ${++replies}` }] }] } };
          return route.fulfill({ contentType: "text/event-stream", body: `data: ${JSON.stringify(event)}\n\n` });
        }
        if (path in fixtures) return route.fulfill({ json: fixtures[path] });
        throw new Error(`Unexpected browser fixture request: ${path}`);
      });

      await page.goto("/app/campaigns");
      await page.getByRole("button", { name: "Ask Capve", exact: true }).click();
      if (trigger === "Enter") {
        await page.getByLabel("Message Capve").fill("Compare my campaigns");
        await page.getByLabel("Message Capve").press("Enter");
      } else {
        await page.getByRole("button", { name: "Compare my campaigns by ROI", exact: true }).click();
      }
      await expect(page.getByText("Reply 1", { exact: true }), errors.join("\n")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Campaigns", exact: true })).toBeVisible();
      await page.getByLabel("Message Capve").fill("And yesterday?");
      await page.getByLabel("Message Capve").press("Enter");
      await expect(page.getByText("Reply 2", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Close assistant", exact: true }).click();
      await page.getByRole("link", { name: "Documentation", exact: true }).click();
      await expect(page).toHaveURL(/\/docs$/);
      await expect(page.getByRole("heading", { name: /Know where every/ })).toBeVisible();
      expect(errors).toEqual([]);
    });
  }
}
