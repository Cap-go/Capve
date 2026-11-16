# MCP interoperability and quality checks

Checked against the linked vendor documentation on 2026-11-15. Capve exposes a stateless Streamable HTTP MCP endpoint at `/mcp`. Authentication uses a personal Capve bearer token on every request. Production is `https://capve.app/mcp`.

## What each tester measures

| Tool | Useful coverage | Result to record |
| --- | --- | --- |
| [Manufact](https://manufact.com/) | Hosted MCP discovery and tool quality evaluation | The actual report URL, scan date, endpoint and category scores; local tests are not a Manufact score |
| [Cloudflare's remote MCP testing guide](https://developers.cloudflare.com/agents/model-context-protocol/guides/test-remote-mcp-server/) | Inspector plus the Workers AI Playground for real hosted client calls | Connection result and the actual prompt/tool trace; not a numeric certification |
| [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) | Transport, initialization, discovery, direct tool calls and errors | CLI exit status, tester version, requested protocol version, tool names and assertions |
| [MCPJam CLI](https://docs.mcpjam.com/cli/overview) | Protocol conformance, host compatibility, schema checks and direct calls | JSON check report, including failures and skips; host emulation is not a real ChatGPT run |
| [OpenAI API](https://developers.openai.com/api/docs/guides/tools-connectors-mcp) | Actual remote MCP tool import and model-selected tool calls | `mcp_list_tools` and `mcp_call` results, model, date and endpoint |
| [OpenAI plugin testing](https://developers.openai.com/plugins/deploy/connect-chatgpt) | Inspector, API Playground, prompts in ChatGPT, metadata refresh and review behavior | Observed workflow outcomes; no public numeric OpenAI MCP score was identified |
| [Promptfoo MCP provider](https://www.promptfoo.dev/docs/providers/mcp/) | Repeatable direct-tool assertions and optional model workflow/security evaluations | The chosen suite's pass rate, dataset and model; not a provider-wide score |

Use a disposable account containing synthetic campaigns. Tools that create, change or delete campaigns, domains, automation or team access affect real account state. The read-only examples below do not exercise those mutations. Do not submit a production customer's credentials or results to a hosted evaluator.

## Repository regression suite

```bash
bun run test
bun run typecheck
bun run build
bun run test:mcp:clients
bun run test:mcp:external
```

The Worker integration tests exercise Capve's actual authorization, account isolation, API dispatch and billing behavior. Protocol tests should also cover malformed JSON/RPC, notifications, header negotiation, rejected origins, unknown methods/tools, input validation, output contracts and recovery after errors. Keep these checks in CI; a metadata-only score does not establish that a tool works.

`test:mcp:clients` creates an isolated local D1 database, starts Wrangler on an available loopback port, seeds a disposable token, exercises the official SDK clients and deletes its fixtures. `test:mcp:external` additionally downloads pinned Inspector, official conformance and MCPJam CLIs into the package-manager cache and tests the same local Worker. It never deploys or sends its token to a hosted tester.

The [2026-07-28 MCP revision](https://modelcontextprotocol.io/specification/2026-07-28/changelog) introduces per-request metadata and `server/discover`. Its HTTP requests also require matching `MCP-Protocol-Version`, `Mcp-Method` and, for named tool calls, `Mcp-Name` headers. Capve preserves the older initialize flow separately. Modern results identify their completion type; discovery and tool catalogs instruct clients to keep cached results private to the authorization context and refetch before reuse. The older SDK package tests legacy compatibility; the stable [v2 TypeScript client](https://github.com/modelcontextprotocol/typescript-sdk) tests the modern contract.

## Direct client checks

Start the local installation with `bun run db:migrate:local` and `bun run dev`. Register a disposable user and create a token in **AI / MCP**. Set `CAPVE_MCP_URL` and `CAPVE_MCP_TOKEN` in your shell; keep the token out of command history and saved reports. The local URL is `http://localhost:5173/mcp`.

The [Inspector CLI](https://github.com/modelcontextprotocol/inspector) accepts HTTP endpoints and custom headers:

```bash
bunx @modelcontextprotocol/inspector@2.15.0 --cli "$CAPVE_MCP_URL" \
  --transport http --header "Authorization: Bearer $CAPVE_MCP_TOKEN" \
  --method tools/list

bunx @modelcontextprotocol/inspector@2.15.0 --cli "$CAPVE_MCP_URL" \
  --transport http --header "Authorization: Bearer $CAPVE_MCP_TOKEN" \
  --method tools/call --tool-name get_settings
```

MCPJam offers independent client checks. Pin the version used when saving evidence:

```bash
bunx @mcpjam/cli@6.2.2 --no-telemetry --format json server doctor \
  --url "$CAPVE_MCP_URL" --access-token "$CAPVE_MCP_TOKEN"

bunx @mcpjam/cli@6.2.2 --no-telemetry --format json protocol conformance \
  --url "$CAPVE_MCP_URL" --access-token "$CAPVE_MCP_TOKEN" \
  --protocol-version 2026-07-28 \
  --fixture-tool whoami --fixture-tool get_settings --fixture-tool list_campaigns
```

Capabilities that Capve does not advertise, such as server-initiated sampling or an MCP Apps UI, are outside its contract. Record unsupported/skip results explicitly; do not enable empty capabilities to improve a score. Static bearer authentication is not OAuth, and an OAuth conformance failure cannot be fixed by advertising a nonexistent authorization server.

### Observed local evaluation, 2026-11-15

MCPJam CLI 6.2.2, checker 10.7.0, profile `mcp-protocol@2026-11-02.1` tested the actual local Worker with an isolated D1 database and a disposable token:

| Protocol | Before correction | After correction | Coverage |
| --- | --- | --- | --- |
| `2026-07-28` | 4.1/100: modern discovery/envelopes unsupported | **100/100** | 23 applicable checks passed; 19 not applicable; 2 probes need optional-feature fixtures; no failures |
| `2025-11-25` | 93.7/100: hostile Host + Origin returned 404 | **100/100**: invalid Origin returns 403 | 16 applicable checks passed; 28 not applicable; none failed or unable to run |
| `2025-06-18` | — | 100/100 | Same 16/28 coverage; advisory that this protocol is superseded |
| `2025-03-26` | — | 100/100 | Same 16/28 coverage; advisory that this protocol is superseded |

The `2025-11-25` check caught a middleware-ordering defect: host filtering returned 404 before the MCP Origin check could return the required 403. The corrected middleware rejects hostile origins before authentication and host routing. These scores apply to MCPJam's protocol profile and this local build; they are not Manufact scores or production results.

The modern profile's two unexecuted probes require a log-producing tool and a tool requesting client input. Capve exposes neither feature; they are not counted as passing. The modern SDK (`@modelcontextprotocol/client` 2.4.0) also discovered 93 tools and successfully called four reads; the legacy SDK 1.32.2 passed initialization, ping, the same catalog/four reads and two error cases. Inspector 2.15.0 passed strict catalog validation with zero warnings and a `whoami` call. Official conformance 0.1.16 passed five checks across its four applicable scenarios (initialize, ping, tools-list, DNS rebinding); its other scenarios require fixture features this server does not offer.

[Manufact's mcp-use CLI](https://docs.mcp-use.com/typescript/tooling/client-cli) 2.12.4 with `@mcp-use/client` 2.4.5 connected in `legacy`, `auto` and `modern` modes, listed 93 tools, called `whoami` and `list_campaigns`, and correctly rejected `get_campaign` without its ID. Modern mode failed before modern protocol support and passed afterward. The public Manufact catalog lookup for Capve returned 404; its hosted evaluation score has not been measured.

MCPJam's OpenAI readiness check passed the tool annotation, description, input-schema and name-length requirements. It remained **not ready** for directory submission: the local URL is plaintext HTTP, OAuth discovery was absent in that revision, and a real domain-verification token/submission profile is not supplied. Its separate host-compatibility catalog reported 28 compatible tool surfaces, but that uses supplied credentials and host profiles. It does not demonstrate that those 28 clients can authenticate or that real ChatGPT connection succeeds.

## OpenAI Responses API

The optional smoke check uses a public HTTPS deployment and three read-only tools: `whoami`, `list_campaigns`, `get_settings`. It requires `OPENAI_API_KEY`, `OPENAI_MODEL`, `CAPVE_MCP_URL` and `CAPVE_MCP_TOKEN` in the environment:

```bash
node scripts/test-mcp-openai.mjs
```

Running this sends the disposable account's MCP token and tool results to OpenAI and incurs model usage. It fails if discovery or any required call fails, and only prints result metadata. This checks the real Responses API client; it does not claim ChatGPT authentication or directory approval. See [OpenAI remote MCP documentation](https://developers.openai.com/api/docs/guides/tools-connectors-mcp).

### ChatGPT authentication boundary

OpenAI's [ChatGPT authentication guide](https://developers.openai.com/plugins/build/auth) requires an OAuth flow for account-linked remote plugins and says ChatGPT cannot present custom API keys. Capve now implements OAuth discovery, dynamic registration, PKCE consent, token refresh and revocation; see [MCP OAuth](mcp-oauth.md). Both official MCP SDK generations are tested locally. A real ChatGPT connection and hosted directory evaluation must still be verified after deployment; a passing Responses API or local SDK check does not establish either.

### Workflow evaluation set

Run these in a synthetic account, retaining the prompt, chosen tools, result and assertion. Negative cases must fail without changing data.

| Prompt or direct call | Expected evidence |
| --- | --- |
| “Which Capve account am I connected to? List my campaigns.” | `whoami`, then `list_campaigns`; account matches the fixture |
| “Show clicks, conversions, revenue and ROI for last week.” | Report tools; correct date range/account timezone; cents converted for display; no sum across currencies |
| “Find campaign X and explain where visitors are sent.” | Lookup before using IDs; campaign and rotation/path reads; no mutation |
| “Create a paused test campaign pointing to https://example.com.” | Valid create input and subsequent get/list proving the saved result |
| “Pause the test campaign, then confirm its status.” | Correct update target and follow-up read; no other campaign changed |
| Unknown campaign ID | Model-visible error; no fabricated campaign |
| Viewer attempts campaign update | Permission denial and unchanged database |
| Missing token, revoked token, or another account's object ID | No protected data returned |
| Unexpected argument, wrong type, out-of-range limit | Useful input error before dispatch |
| Trial-expired report query | Billing access error; no bypass through MCP |

Tool descriptions should explain when to use a tool, prerequisites and limits. All three safety hints must be explicit and reflect actual side effects; updates may overwrite, and automation may send external notifications. These follow [OpenAI tool-design guidance](https://developers.openai.com/plugins/plan/tools), not a promise of review approval. Validate successful structured output against its advertised schema as required by the [MCP tool contract](https://modelcontextprotocol.io/specification/2025-11-25/server/tools).

## Hosted retest after deployment

Martin must merge only after review and CI approval and allow the production deploy workflow to finish; agents must not deploy this repository. Then rerun Inspector and the optional OpenAI smoke check against `https://capve.app/mcp`, refresh cached tool metadata in connected clients, and request a new Manufact evaluation using a disposable account. Record the deployed commit, tool count, test versions, report URLs, scores and unresolved findings. Until a new external report exists, report local results separately and leave the hosted score unverified.

## OAuth regression coverage

`bun run test` includes `tests/oauth.test.ts`: discovery, registration, PKCE, redirect and audience validation, CSRF, consent expiry, concurrent code/refresh redemption, replay revocation, password reset, account isolation, and connection management.

`bun run test:mcp:clients` also runs the OAuth flow through both installed official MCP SDK generations against an isolated Worker and migrated D1. It begins without credentials, discovers the authorization server, registers a client, obtains consent using a disposable local user, exchanges the PKCE code, calls tools, automatically refreshes after a 401, and verifies revocation. These checks run in PR CI without production credentials or a paid AI model. Browser screenshots use local fixtures; they are not a hosted checker score.
