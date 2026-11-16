import type { AssistantCard } from "../src/lib/assistant/types";
import { logoutSession } from "../src/lib/logout";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { beginChatGptSignIn, completeChatGptSignIn, getChatGptAccessToken, loadChatGptCredentials, signOutChatGpt, pkceChallenge, CHATGPT_REDIRECT_URI } from "../src/lib/assistant/chatgptAuth";
import { parseChatGptCallback } from "../src/lib/assistant/chatgptCallback";
import { parseResponseStream, runAssistant, needsConfirmation, sanitizeConsolePath } from "../src/lib/assistant/agent";

const data = new Map<string, string>();
const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key) };
const stream = (output: unknown[]) => new Response(`data: ${JSON.stringify({ type: "response.completed", response: { output } })}\n\n`);
const tool = { name: "create_campaign", description: "Create campaign", inputSchema: {}, annotations: { readOnlyHint: false, destructiveHint: false } };

beforeEach(() => { data.clear(); vi.stubGlobal("sessionStorage", storage); });
afterEach(() => vi.unstubAllGlobals());

describe("ChatGPT connection", () => {
  it("uses PKCE, per-user state and a Capve agent identity", async () => {
    const url = new URL(await beginChatGptSignIn("user1"));
    expect(url.searchParams.get("agent_name_hint")).toBe("Capve");
    const pending = JSON.parse(data.get("capve-assistant-chatgpt-pending:user1")!);
    expect(url.searchParams.get("code_challenge")).toBe(await pkceChallenge(pending.verifier));
    expect(url.searchParams.get("state")).toBe(pending.state);
    expect(parseChatGptCallback("https://evil.example/?code=x", CHATGPT_REDIRECT_URI)).toBeNull();
    expect(parseChatGptCallback("http://127.0.0.1:9999/auth/callback?code=x", CHATGPT_REDIRECT_URI)).toBeNull();
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(completeChatGptSignIn("user1", { state: "wrong", code: "x", clientId: "oaiapp_1" })).rejects.toThrow();
    await expect(completeChatGptSignIn("user2", { state: pending.state, code: "x", clientId: "oaiapp_1" })).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("exchanges a valid callback, rotates refresh tokens and clears on disconnect", async () => {
    await beginChatGptSignIn("user1");
    const pending = JSON.parse(data.get("capve-assistant-chatgpt-pending:user1")!);
    const idToken = `header.${btoa(JSON.stringify({ iss: "https://auth.openai.com", aud: "oaiapp_1", nonce: pending.nonce, email: "person@example.com" }))}.signature`;
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ access_token: "first", refresh_token: "refresh1", id_token: idToken, expires_in: 0, scope: "chatgpt.tokens.use.direct" }))
      .mockResolvedValueOnce(Response.json({ access_token: "second", refresh_token: "refresh2", expires_in: 3600 }));
    vi.stubGlobal("fetch", fetcher);
    await completeChatGptSignIn("user1", { state: pending.state, code: "code", clientId: "oaiapp_1" });
    expect(await getChatGptAccessToken("user1")).toBe("second");
    expect(loadChatGptCredentials("user1")?.refreshToken).toBe("refresh2");
    expect(data.has("capve-assistant-chatgpt-pending:user1")).toBe(false);
    signOutChatGpt("user1"); expect(loadChatGptCredentials("user1")).toBeNull();
  });

  it.each(["current", "all"] as const)("forgets credentials and pending sign-in on %s-session logout", async (scope) => {
    storage.setItem("capve-assistant-chatgpt:user1", JSON.stringify({ accessToken: "access", refreshToken: "refresh" }));
    await beginChatGptSignIn("user1");
    const fetcher = vi.fn(async (_url: string) => {
      expect(loadChatGptCredentials("user1")).toBeNull();
      // A concurrent refresh finishing during the logout request must not restore the connection.
      storage.setItem("capve-assistant-chatgpt:user1", JSON.stringify({ accessToken: "late", refreshToken: "late-refresh" }));
      return Response.json({ ok: true });
    });
    vi.stubGlobal("fetch", fetcher);
    await logoutSession("user1", scope);
    expect(fetcher.mock.calls[0][0]).toBe(scope === "all" ? "/api/auth/logout-all" : "/api/auth/logout");
    expect(loadChatGptCredentials("user1")).toBeNull();
    expect(storage.getItem("capve-assistant-chatgpt-pending:user1")).toBeNull();
  });

  it("rejects expired sign-in and a mismatched ID-token nonce", async () => {
    await beginChatGptSignIn("user1");
    const pending = JSON.parse(data.get("capve-assistant-chatgpt-pending:user1")!);
    const fetcher = vi.fn().mockResolvedValue(Response.json({ access_token: "first", id_token: `h.${btoa(JSON.stringify({ iss: "https://auth.openai.com", aud: "oaiapp_1", nonce: "wrong" }))}.s`, scope: "chatgpt.tokens.use.direct" }));
    vi.stubGlobal("fetch", fetcher);
    await expect(completeChatGptSignIn("user1", { state: pending.state, code: "code", clientId: "oaiapp_1" })).rejects.toThrow("chatgpt_invalid_id_token");
    expect(loadChatGptCredentials("user1")).toBeNull();
    storage.setItem("capve-assistant-chatgpt-pending:user1", JSON.stringify({ ...pending, expiresAt: 1 }));
    await expect(completeChatGptSignIn("user1", { state: pending.state, code: "code", clientId: "oaiapp_1" })).rejects.toThrow("chatgpt_sign_in_expired");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("assistant tool loop", () => {
  it("does not run tools from an interrupted stream", () => {
    expect(parseResponseStream('data: {"type":"response.output_item.done","item":{"type":"function_call","name":"delete_campaign","call_id":"1","arguments":"{}"}}\n\n').calls).toEqual([]);
  });
  it("requires confirmation for writes and unknown annotations, and limits console links", () => {
    expect(needsConfirmation(tool)).toBe(true);
    expect(needsConfirmation({ ...tool, annotations: undefined })).toBe(true);
    expect(needsConfirmation({ ...tool, annotations: { readOnlyHint: true } })).toBe(false);
    for (const path of ["//evil.example", "/app/\\evil", "https://evil.example", "/api/auth/logout"]) expect(sanitizeConsolePath(path)).toBeNull();
    expect(sanitizeConsolePath("/app/campaigns")).toBe("/app/campaigns");
  });
  it("proposes changes without executing, then executes only the confirmed arguments", async () => {
    const calls: Record<string, unknown>[] = [];
    const onMutation = vi.fn();
    let proposed = false;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      expect((init.headers as Record<string, string>)["X-Capve-Account"]).toBe("account1");
      if (url.endsWith("/mcp")) {
        const body = JSON.parse(init.body as string);
        if (body.method === "tools/list") return Response.json({ result: { tools: [tool] } });
        calls.push(body.params);
        return Response.json({ result: { content: [{ text: "Created campaign" }] } });
      }
      if (url.endsWith("/models")) return Response.json({ models: [{ slug: "test-model", visibility: "list" }] });
      const body = JSON.parse(init.body as string);
      expect(body.store).toBe(false); expect(body.stream).toBe(true);
      if (!proposed) { proposed = true; return stream([{ type: "function_call", namespace: "capve", name: "create_campaign", call_id: "call1", arguments: '{"name":"New campaign"}' }]); }
      return stream([{ type: "message", content: [{ type: "output_text", text: "Review your action." }] }]);
    }));
    const options = { onMutation, accessToken: "test-loop-token", accountId: "account1", messages: [{ role: "user" as const, content: "Create a campaign" }], context: {} };
    const proposal = await runAssistant(options);
    expect(calls).toHaveLength(0); expect(proposal.cards[0].type).toBe("confirm");
    expect(onMutation).not.toHaveBeenCalled();
    await runAssistant({ ...options, confirm: { tool: "create_campaign", arguments: { name: "New campaign" } } });
    expect(calls).toEqual([{ name: "create_campaign", arguments: { name: "New campaign" } }]);
    expect(onMutation).toHaveBeenCalledTimes(1);
  });
  it("keeps multiple write proposals pending until each is separately confirmed", async () => {
    const writes: unknown[] = [];
    const inputs: string[] = [];
    let modelCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith("/mcp")) {
        const body = JSON.parse(init.body as string);
        if (body.method === "tools/list") return Response.json({ result: { tools: [tool] } });
        writes.push(body.params);
        return Response.json({ result: { content: [{ text: "Created" }] } });
      }
      if (url.endsWith("/models")) return Response.json({ models: [] });
      inputs.push(JSON.stringify(JSON.parse(init.body as string).input));
      if (++modelCalls === 1) return stream(["First campaign", "Second campaign"].map((name, i) => ({
        type: "function_call", namespace: "capve", name: "create_campaign", call_id: `create${i}`, arguments: JSON.stringify({ name }),
      })));
      return stream([{ type: "message", content: [{ type: "output_text", text: "Review the pending actions." }] }]);
    }));
    const options = { accessToken: "siblings-test", accountId: "account1", messages: [{ role: "user" as const, content: "Create two campaigns" }], context: {} };
    const proposal = await runAssistant(options);
    const cards = proposal.cards.filter((card): card is Extract<AssistantCard, { type: "confirm" }> => card.type === "confirm");
    expect(cards).toHaveLength(2); expect(writes).toHaveLength(0);
    await runAssistant({ ...options, confirm: cards[0], pendingConfirmations: [cards[1]] });
    expect(writes).toEqual([{ name: "create_campaign", arguments: { name: "First campaign" } }]);
    expect(inputs.at(-1)).toContain("still await separate confirmation and have NOT run");
    expect(inputs.at(-1)).toContain("Second campaign");
    await runAssistant({ ...options, confirm: cards[1], pendingConfirmations: [] });
    expect(writes).toEqual([
      { name: "create_campaign", arguments: { name: "First campaign" } },
      { name: "create_campaign", arguments: { name: "Second campaign" } },
    ]);
  });

  it.each([
    { ok: true, readOnly: false }, { ok: false, readOnly: false }, { ok: true, readOnly: true },
  ])("notifies the dashboard only for successful mutations before summarizing: %j", async ({ ok, readOnly }) => {
    const onMutation = vi.fn();
    const confirmedTool = { ...tool, annotations: { readOnlyHint: readOnly, openWorldHint: true } };
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith("/mcp")) {
        if (JSON.parse(init.body as string).method === "tools/list") return Response.json({ result: { tools: [confirmedTool] } });
        return Response.json({ result: { isError: !ok, content: [{ text: ok ? "Created" : "Forbidden" }] } });
      }
      if (url.endsWith("/models")) return Response.json({ models: [] });
      expect(onMutation).toHaveBeenCalledTimes(ok && !readOnly ? 1 : 0);
      return Response.json({ error: { code: "unavailable" } }, { status: 503 });
    }));
    const run = runAssistant({ accessToken: "mutation-test", accountId: "account1", messages: [], context: {}, onMutation,
      confirm: { tool: "create_campaign", arguments: { name: "New campaign" } },
    });
    if (ok) expect((await run).actions[0].ok).toBe(true);
    else await expect(run).rejects.toThrow();
    expect(onMutation).toHaveBeenCalledTimes(ok && !readOnly ? 1 : 0);
  });

  it.each(["", "Choose an option."])("preserves question cards when the assistant summary is %j", async (summary) => {
    const inputs: Array<Array<{ role: string; content?: string }>> = [];
    let responseCount = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith("/mcp")) return Response.json({ result: { tools: [] } });
      if (url.endsWith("/models")) return Response.json({ models: [] });
      inputs.push(JSON.parse(init.body as string).input);
      responseCount++;
      if (responseCount === 1) return stream([{ type: "function_call", namespace: "capve_ui", name: "ask_user", call_id: "question1", arguments: JSON.stringify({ question: "Compare ROI for the last seven days?", options: ["Yes", "No"], allow_free_text: true }) }]);
      return stream([{ type: "message", content: [{ type: "output_text", text: summary }] }]);
    }));
    const messages = [{ role: "user" as const, content: "Compare performance" }];
    const options = { accessToken: "question-test", accountId: "account1", context: {}, messages };
    const question = await runAssistant(options);
    expect(question.cards[0]).toMatchObject({ type: "question" });
    // Plain/free-text answers must work even without a question prefix from the UI.
    await runAssistant({ ...options, messages: [...messages,
      { role: "assistant", content: question.reply, cards: question.cards },
      { role: "user", content: "Yes" },
    ] });
    expect(inputs.at(-1)).toEqual([
      messages[0],
      { role: "assistant", content: [summary, 'Question: Compare ROI for the last seven days?\nOptions: ["Yes","No"]'].filter(Boolean).join("\n\n") },
      { role: "user", content: "Yes" },
    ]);
  });

  it("never starts a tool loop after account-switch cancellation", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const controller = new AbortController(); controller.abort();
    await expect(runAssistant({ accessToken: "test", accountId: "old", signal: controller.signal, messages: [], context: {} })).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
