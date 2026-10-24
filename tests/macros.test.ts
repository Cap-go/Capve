import { describe, expect, it } from "vitest";
import { substituteMacros } from "../worker/lib/routing";
import type { RoutingContext } from "../worker/types-routing";

const ctx: RoutingContext = {
  click_id: "clk_abc",
  velo_ref: "c_partner",
  campaign_key: "yesplay_ios",
  external_id: "adcash_click_99",
};

describe("offer URL click macros", () => {
  it("fills {click_id} and a pasted Adcash [clickid] with the same Capve click id", () => {
    const curly = substituteMacros("https://goyesplay.com/yavzamcgc?subid1={click_id}", ctx);
    const brackets = substituteMacros("https://goyesplay.com/yavzamcgc?subid1=[clickid]", ctx);
    const encoded = substituteMacros("https://goyesplay.com/yavzamcgc?subid1=%5Bclickid%5D", ctx);
    expect(curly).toBe("https://goyesplay.com/yavzamcgc?subid1=clk_abc");
    expect(brackets).toBe(curly);
    expect(encoded).toBe(curly);
  });

  it("fills other source click macros and leaves zone and external_id alone", () => {
    expect(substituteMacros("https://go.example/?s=${SUBID}", ctx)).toBe("https://go.example/?s=clk_abc");
    expect(substituteMacros("https://go.example/?s=[CLICK_ID]", ctx)).toBe("https://go.example/?s=clk_abc");
    expect(substituteMacros("https://go.example/?z=[zone]&s={external_id}", ctx)).toBe(
      "https://go.example/?z=[zone]&s=adcash_click_99",
    );
  });
});
