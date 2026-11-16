# ChatGPT in the Capve console

The **Ask Capve** button on dashboard pages opens a chat assistant. It can read reports and propose campaign, offer, routing and platform changes using Capve's existing MCP tools. Each write needs a separate **Confirm action** click showing the tool arguments. The current account's role, reporting entitlement and platform enable/write controls still apply.

## Connect

1. Sign in to Capve, select the account you want to work on and open **Ask Capve** (also available under **AI / MCP**).
2. Choose **Continue with ChatGPT** and read the data-sharing and callback instructions.
3. Choose **Open ChatGPT sign-in**. Sign in on OpenAI's page and approve ChatGPT plan usage for Capve. Eligibility and usage limits are determined by OpenAI.
4. OpenAI redirects to `http://127.0.0.1:1455/auth/callback?...`. The tab may say the page cannot connect: no local server is needed. Copy the complete address from the address bar, return to Capve and paste it into **Callback address**. Do not share it.
5. Choose **Finish connecting**, then ask a question. The callback expires after ten minutes; start over if it fails.

Examples: “Compare my campaigns by ROI”, “Help me create a tracking campaign”, or “Which zones are spending without conversions?” Review proposed changes before confirming. External platform actions still require a configured connection and enabled writes; this does not enable autonomous bidding.

**Manage usage** opens ChatGPT settings. **Disconnect** forgets the browser credentials and conversation. Signing out of Capve also forgets ChatGPT credentials. Tokens live in session storage scoped to the Capve user: the connection lasts for this tab, not across browsers. Switching account clears the conversation, cancels in-flight work and discards confirmation cards. The assistant is unavailable during support impersonation. A request already accepted by the server can finish even if the browser cancels; check the affected resource before retrying.

## Proxy and setup

This ports Capgo's `chatgptAuth`, callback parser and Responses API agent loop to React and the Capve Worker. It uses PKCE (S256), state, nonce and OpenAI's dynamically issued client ID, with rotating refresh tokens. Sign-in uses OpenAI directly; token exchange/refresh and model calls relay through session-only `/api/assistant/token`, `/models` and `/responses`. These routes have fixed upstream URLs, request size limits, no-store responses and reject redirects. They do not accept a caller-supplied upstream host or forward Capve cookies to OpenAI.

The browser sends its messages and relevant MCP results to OpenAI; the Worker does not persist ChatGPT credentials or conversations. Model requests set `store: false` and `stream: true`. This is not a claim about OpenAI's separate data policies. Normal Capve mutation audit entries remain enabled.

`/api/assistant/mcp` reuses the existing MCP catalog and API dispatch with the session cookie and captured `X-Capve-Account`, so team account selection and permissions remain intact. No personal API token is minted. These browser transport endpoints are not added as MCP tools: all business actions already have tools, and token transport must not be exposed as an agent capability. External MCP clients still use `/mcp` with their own Capve OAuth/token; that connection is independent of ChatGPT plan usage here.

No new database migration, OpenAI API key, Worker secret, paid service binding, or hostname is required. For self-hosting use HTTPS (localhost works in development), keep the existing `AUTH_SECRET` configured, and allow outgoing requests to `auth.openai.com` and `api.openai.com`.

## Release verification (Martin)

After approval and green CI, merge and let the normal deploy workflow run. Do not deploy from the development checkout. At `https://capve.app`, connect an eligible ChatGPT account, complete the callback exchange, ask a read-only question, confirm a small reversible change, inspect its result, then disconnect. Confirm the usage-limit and revoked-access states when available. Automated tests mock OpenAI: they validate transport and agent behavior, not live OpenAI eligibility or successful real-account authorization.
