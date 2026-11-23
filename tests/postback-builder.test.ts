import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, it, expect } from "vitest";
import { registerTestUser } from "./helpers";
import { initSql } from "./schema";
import type { Program, ProgramTracking } from "../src/lib/api";

describe("Postback link builder", () => {
  beforeAll(async () => {
    const statements = initSql
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean);
    for (const statement of statements) {
      await env.DB.prepare(statement).run();
    }
  });

  it("infers YesPlay from goyesplay.com destination", async () => {
    const { authHeaders } = await registerTestUser("yesplay-test@test.local");
    
    const programRes = await SELF.fetch("http://localhost/api/programs", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        name: "YesPlay test",
        destination_url: "https://goyesplay.com/abc123?subid1={click_id}",
      }),
    });
    expect(programRes.status).toBe(201);
    const { program } = await programRes.json<{ program: Program }>();

    const trackingRes = await SELF.fetch(`http://localhost/api/programs/${program.id}/tracking`, {
      headers: authHeaders,
    });
    expect(trackingRes.status).toBe(200);
    const { tracking } = await trackingRes.json<{ tracking: ProgramTracking }>();
    
    expect(tracking.inferred_network).toBe("yesplay");
    expect(tracking.postback_url).toContain("cnv_id=${subid1}");
    expect(tracking.postback_url).not.toContain("payout=");
    expect(tracking.postback_url).not.toContain("cnv_status=");
    expect(tracking.postback_url).toMatch(/[?&]key=[0-9a-f]{32}$/);
  });

  it("infers YesPlay from the campaign name when the destination is elsewhere", async () => {
    const { authHeaders } = await registerTestUser("yesplay-name@test.local");
    const programRes = await SELF.fetch("http://localhost/api/programs", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        name: "YesPlay IOS",
        destination_url: "https://merchant.example.com/ios",
      }),
    });
    expect(programRes.status).toBe(201);
    const { program } = await programRes.json<{ program: Program }>();
    const trackingRes = await SELF.fetch(`http://localhost/api/programs/${program.id}/tracking`, {
      headers: authHeaders,
    });
    const { tracking } = await trackingRes.json<{ tracking: ProgramTracking }>();
    expect(tracking.inferred_network).toBe("yesplay");
    expect(tracking.postback_url).toContain("cnv_id=${subid1}&key=");
  });

  it("infers YesPlay from an offer URL", async () => {
    const { authHeaders } = await registerTestUser("yesplay-offer@test.local");
    const programRes = await SELF.fetch("http://localhost/api/programs", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ name: "Casino path", destination_url: "https://merchant.example.com/casino" }),
    });
    const { program } = await programRes.json<{ program: Program }>();
    const offerRes = await SELF.fetch("http://localhost/api/entities/offers", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        name: "YesPlay offer",
        url: "https://goyesplay.com/yavzamcgc?subid1={click_id}",
        payout_cents: 0,
      }),
    });
    expect(offerRes.status).toBe(201);
    const { offer } = await offerRes.json<{ offer: { id: string } }>();
    const pathRes = await SELF.fetch(`http://localhost/api/programs/${program.id}/paths`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ name: "Offer", flow_type: "offer", offer_id: offer.id }),
    });
    expect(pathRes.status).toBe(201);
    const trackingRes = await SELF.fetch(`http://localhost/api/programs/${program.id}/tracking`, {
      headers: authHeaders,
    });
    const { tracking } = await trackingRes.json<{ tracking: ProgramTracking }>();
    expect(tracking.inferred_network).toBe("yesplay");
  });

  it("infers Tonybet from tonybet.com destination", async () => {
    const { authHeaders } = await registerTestUser("tonybet-test@test.local");
    
    const programRes = await SELF.fetch("http://localhost/api/programs", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        name: "Tonybet test",
        destination_url: "https://tonybet.com/offer123?clickid={click_id}",
      }),
    });
    expect(programRes.status).toBe(201);
    const { program } = await programRes.json<{ program: Program }>();

    const trackingRes = await SELF.fetch(`http://localhost/api/programs/${program.id}/tracking`, {
      headers: authHeaders,
    });
    expect(trackingRes.status).toBe(200);
    const { tracking } = await trackingRes.json<{ tracking: ProgramTracking }>();
    
    expect(tracking.inferred_network).toBe("tonybet");
  });

  it("does not infer network for other destinations", async () => {
    const { authHeaders } = await registerTestUser("generic-test@test.local");
    
    const programRes = await SELF.fetch("http://localhost/api/programs", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        name: "Generic test",
        destination_url: "https://example.com/offer?aff_sub={click_id}",
      }),
    });
    expect(programRes.status).toBe(201);
    const { program } = await programRes.json<{ program: Program }>();

    const trackingRes = await SELF.fetch(`http://localhost/api/programs/${program.id}/tracking`, {
      headers: authHeaders,
    });
    expect(trackingRes.status).toBe(200);
    const { tracking } = await trackingRes.json<{ tracking: ProgramTracking }>();
    
    expect(tracking.inferred_network).toBeNull();
  });
});
