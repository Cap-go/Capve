import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Client as ModernClient, StreamableHTTPClientTransport as ModernTransport } from "@modelcontextprotocol/client";

/** Exercise the SDK's actual discovery, DCR, PKCE, exchange, and automatic refresh. */
export async function testMcpOAuth(base, cookie) {
  for (const modern of [false, true]) {
    let information, tokens, verifier, authorization, discovery;
    const state = crypto.randomUUID();
    const provider = {
      redirectUrl: "http://127.0.0.1:34123/callback",
      clientMetadata: {
        client_name: `SDK ${modern ? "v2" : "v1"} OAuth test`,
        redirect_uris: ["http://127.0.0.1:34123/callback"],
        token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"],
      },
      state: () => state,
      saveDiscoveryState: (value) => { discovery = value; },
      discoveryState: () => discovery,
      clientInformation: () => information,
      saveClientInformation: (value) => { information = value; },
      tokens: () => tokens,
      saveTokens: (value) => { tokens = value; },
      saveCodeVerifier: (value) => { verifier = value; },
      codeVerifier: () => verifier,
      redirectToAuthorization: (value) => { authorization = value; },
    };
    const Transport = modern ? ModernTransport : StreamableHTTPClientTransport;
    const makeClient = () => modern
      ? new ModernClient({ name: "capve-oauth-test", version: "1" }, { versionNegotiation: { mode: { pin: "2026-07-28" } } })
      : new Client({ name: "capve-oauth-test", version: "1" });
    let client = makeClient();
    const transport = new Transport(new URL(`${base}/mcp`), { authProvider: provider });
    try {
      await assert.rejects(client.connect(transport));
      assert(authorization, "SDK must discover OAuth and ask for browser authorization");
      assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
      assert.equal(authorization.searchParams.get("resource"), `${base}/mcp`);
      const begin = await fetch(authorization, { headers: { Cookie: cookie }, redirect: "manual" });
      assert.equal(begin.status, 302);
      const consent = new URL(begin.headers.get("Location"), base);
      assert.equal(consent.pathname, "/oauth/consent");
      const approved = await fetch(`${base}/oauth/authorize`, {
        method: "POST", headers: { Cookie: cookie, Origin: base, "Content-Type": "application/json" },
        body: JSON.stringify({ request: consent.searchParams.get("request"), approve: true }),
      });
      assert.equal(approved.status, 200);
      const callback = new URL((await approved.json()).redirect);
      assert.equal(callback.searchParams.get("state"), state);
      assert.equal(callback.searchParams.get("iss"), base);
      await transport.finishAuth(modern ? callback.searchParams : callback.searchParams.get("code"));
      assert(tokens?.access_token && tokens?.refresh_token);
      await client.close();
      client = makeClient();
      await client.connect(new Transport(new URL(`${base}/mcp`), { authProvider: provider }));
      const who = await client.callTool({ name: "whoami", arguments: {} });
      assert.notEqual(who.isError, true);
      assert(who.structuredContent.user.id);
      assert.equal(who.structuredContent.user.id, who.structuredContent.user.account_id);
      assert((await client.listTools()).tools.length > 0);
      await client.close();

      const previousRefresh = tokens.refresh_token;
      tokens = { ...tokens, access_token: "expired-local-test-token" };
      client = makeClient();
      await client.connect(new Transport(new URL(`${base}/mcp`), { authProvider: provider }));
      assert.notEqual(tokens.refresh_token, previousRefresh, "SDK should automatically refresh after a 401");
      assert.notEqual((await client.callTool({ name: "list_campaigns", arguments: {} })).isError, true);
      const revoked = await fetch(`${base}/oauth/revoke`, { method: "POST", body: new URLSearchParams({
        client_id: information.client_id, token: tokens.refresh_token,
      }) });
      assert.equal(revoked.status, 200);
      const denied = await fetch(`${base}/mcp`, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
      assert.equal(denied.status, 401);
      console.log(`SDK ${modern ? "v2" : "v1"} OAuth: discovery, registration, S256 consent, MCP tools, automatic refresh and revocation passed.`);
    } finally { await client.close().catch(() => {}); }
  }
}
