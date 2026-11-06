import { describe, expect, it } from "vitest";
import { DASHBOARD_PATHS, legacyDashboardHref } from "../src/lib/dashboard-route";
import { campaignHref } from "../src/lib/campaign-route";

describe("dashboard URLs", () => {
  it("gives every page and campaign section a distinct path", () => {
    expect(new Set(Object.values(DASHBOARD_PATHS)).size).toBe(Object.keys(DASHBOARD_PATHS).length);
    expect(DASHBOARD_PATHS.billing).toBe("/app/billing");
    expect(DASHBOARD_PATHS.admin).toBe("/app/admin");
    expect(campaignHref("prg_123", "targeting")).toBe("/app/campaigns/prg_123/targeting");
    expect(campaignHref("prg_123", "clicklog")).toBe("/app/campaigns/prg_123/clicklog");
  });

  it("redirects old page links and preserves Checkout return parameters", () => {
    expect(legacyDashboardHref("?entity=billing&checkout=success")).toBe("/app/billing?checkout=success");
    expect(legacyDashboardHref("?entity=mcp")).toBe("/app/mcp");
    expect(legacyDashboardHref("?entity=sources")).toBe("/app/traffic-sources");
    expect(legacyDashboardHref("?entity=admin")).toBe("/app/admin");
    expect(legacyDashboardHref("")).toBe("/app/campaigns");
  });

  it("preserves campaign bookmarks and normalizes unknown page/section names", () => {
    expect(legacyDashboardHref("?id=prg_123", "tracking")).toBe("/app/campaigns/prg_123/tracking");
    expect(legacyDashboardHref("?entity=campaigns&id=prg_123")).toBe("/app/campaigns/prg_123/performance");
    expect(legacyDashboardHref("?id=prg_123", "unknown")).toBe("/app/campaigns/prg_123/performance");
    expect(legacyDashboardHref("?entity=unknown")).toBe("/app/campaigns");
    expect(legacyDashboardHref("?entity=constructor")).toBe("/app/campaigns");
    expect(legacyDashboardHref("", "tracking")).toBe("/app/campaigns");
    expect(campaignHref("a/b?x=1")).toBe("/app/campaigns/a%2Fb%3Fx%3D1/performance");
  });
});
