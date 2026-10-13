import { describe, expect, it } from "vitest";
import { apexHostAliases, findVeloAccessApp } from "../scripts/lib/access-setup";

describe("legacy access app lookup", () => {
  it("adds www alias for apex hosts only", () => {
    expect(apexHostAliases("capve.app")).toEqual(["capve.app", "www.capve.app"]);
    expect(apexHostAliases("app.example.com")).toEqual(["app.example.com"]);
  });

  it("finds existing Capve access app by name, legacy Velo name, or domain", () => {
    const legacyApps = [
      { name: "Other", domain: "other.example.com/app" },
      { name: "Velo", domain: "capve.app/app", id: "app-1" },
    ];
    expect(findVeloAccessApp(legacyApps, "capve.app")?.id).toBe("app-1");

    const capveApps = [
      { name: "Other", domain: "other.example.com/app" },
      { name: "Capve", domain: "capve.app/app", id: "app-capve" },
    ];
    expect(findVeloAccessApp(capveApps, "capve.app")?.id).toBe("app-capve");

    const byDestination = [
      {
        name: "Custom",
        destinations: [{ type: "public", uri: "capve.app/app*" }],
        id: "app-2",
      },
    ];
    expect(findVeloAccessApp(byDestination, "capve.app")?.id).toBe("app-2");
  });
});
