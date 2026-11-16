import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { Icon } from "./Icon";
import { runAssistant, AssistantUpstreamError } from "../lib/assistant/agent";
import { beginChatGptSignIn, completeChatGptSignIn, getChatGptAccessToken, loadChatGptCredentials, signOutChatGpt, CHATGPT_REDIRECT_URI, CHATGPT_MANAGE_USAGE_URL } from "../lib/assistant/chatgptAuth";
import { parseChatGptCallback } from "../lib/assistant/chatgptCallback";
import type { AssistantCard, AssistantResponse, AssistantTurn } from "../lib/assistant/types";

type Message = AssistantTurn & Partial<AssistantResponse>;
type ConfirmCard = Extract<AssistantCard, { type: "confirm" }>;

export function AssistantChat() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  if (!user || user.impersonating || !pathname.startsWith("/app")) return null;
  return <Chat key={`${user.id}:${user.account_id}`} userId={user.id} accountId={user.account_id ?? user.id} accountName={user.account_email ?? user.email} />;
}

function Chat({ userId, accountId, accountName }: { userId: string; accountId: string; accountName: string }) {
  const { pathname } = useLocation();
  const dialog = useRef<HTMLDialogElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null);
  const running = useRef(false);
  const mounted = useRef(true);
  const [credentials, setCredentials] = useState(() => loadChatGptCredentials(userId));
  const [step, setStep] = useState<"connect" | "instructions" | "callback">("connect");
  const [callback, setCallback] = useState("");
  const [authUrl, setAuthUrl] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [used, setUsed] = useState<Set<AssistantCard>>(new Set());
  useEffect(() => {
    mounted.current = true;
    const open = () => dialog.current?.showModal();
    window.addEventListener("capve:open-assistant", open);
    return () => { mounted.current = false; controller.current?.abort(); window.removeEventListener("capve:open-assistant", open); };
  }, []);
  useEffect(() => end.current?.scrollIntoView({ block: "nearest" }), [messages, busy]);

  async function connect() {
    if (running.current) return;
    running.current = true;
    setBusy(true); setError("");
    const popup = window.open("", "capve-chatgpt-sign-in", "popup,width=520,height=760");
    // Keep the handle for navigation, but prevent the external page accessing this console.
    if (popup) popup.opener = null;
    try {
      const url = await beginChatGptSignIn(userId);
      if (!mounted.current) { popup?.close(); return; }
      setAuthUrl(url); setStep("callback");
      if (popup) popup.location.href = url;
    } catch { popup?.close(); setError("Could not start sign-in. Allow browser storage and try again."); }
    finally { running.current = false; setBusy(false); }
  }

  async function finish() {
    if (running.current) return;
    const parsed = parseChatGptCallback(callback, CHATGPT_REDIRECT_URI);
    if (!parsed) { setError("Paste the full 127.0.0.1:1455/auth/callback address from the sign-in tab."); return; }
    running.current = true; setBusy(true); setError("");
    try {
      const abort = new AbortController(); controller.current = abort;
      const connected = await completeChatGptSignIn(userId, parsed, abort.signal);
      if (mounted.current) { setCredentials(connected); setCallback(""); setAuthUrl(""); setStep("connect"); }
    } catch { setError("Sign-in could not be completed. Start again and approve ChatGPT plan access. The callback expires after 10 minutes."); }
    finally { running.current = false; setBusy(false); }
  }

  async function send(text: string, confirm?: ConfirmCard) {
    if (running.current || !text.trim()) return;
    running.current = true; setBusy(true); setError("");
    setInput("");
    // Older proposed actions must not remain clickable after the conversation moves on.
    setUsed(new Set(messages.flatMap(message => message.cards ?? [])));
    const next: Message[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    const abort = new AbortController(); controller.current = abort;
    try {
      const accessToken = await getChatGptAccessToken(userId, false, abort.signal);
      abort.signal.throwIfAborted();
      if (!accessToken) throw new Error("chatgpt_reconnect_required");
      const result = await runAssistant({
        accessToken, accountId, signal: abort.signal, messages: next,
        context: { path: pathname, accountId, accountName }, confirm,
        onMutation: () => window.dispatchEvent(new CustomEvent("capve:assistant-mutation", { detail: { accountId } })),
      });
      if (!abort.signal.aborted) setMessages([...next, { role: "assistant", content: result.reply, ...result }]);
    } catch (err) {
      if (abort.signal.aborted) return;
      const code = err instanceof AssistantUpstreamError ? err.code : err instanceof Error ? err.message : "";
      if (code === "chatgpt_reconnect_required") {
        signOutChatGpt(userId); setCredentials(null); setError("Reconnect ChatGPT to continue.");
      } else if (code === "chatgpt_usage_limit") setError("ChatGPT usage limit reached. Manage your plan usage or try again later.");
      else if (code === "chatgpt_not_eligible") setError("This ChatGPT account is not eligible for plan usage. Check your plan in ChatGPT.");
      else if (code === "assistant_session_required") setError("Your Capve session or selected account changed. Reload the console.");
      else setError(confirm ? "Could not finish the request. Check the affected resource before retrying the action." : "Could not complete this request. Please try again.");
    } finally { running.current = false; if (mounted.current) setBusy(false); }
  }

  function disconnect() {
    controller.current?.abort(); signOutChatGpt(userId); setCredentials(null);
    setMessages([]); setUsed(new Set()); setError(""); setStep("connect"); setCallback(""); setAuthUrl("");
  }

  return <>
    <button className="assistant-launcher btn btn-primary" onClick={() => dialog.current?.showModal()}><Icon name="mcp" /> Ask Capve</button>
    <dialog ref={dialog} className="assistant-dialog" aria-labelledby="assistant-title">
      <div className="assistant-header">
        <span className="assistant-mark"><Icon name="mcp" size={22} /></span>
        <div className="min-w-0 flex-1"><h2 id="assistant-title" className="font-semibold">Capve assistant</h2><p className="truncate text-xs text-[var(--velo-muted)]" title={accountName}>{accountName}</p></div>
        {credentials && <button className="btn btn-secondary text-xs" disabled={busy} onClick={disconnect}>Disconnect</button>}
        <button className="btn btn-ghost" aria-label="Close assistant" onClick={() => dialog.current?.close()}><Icon name="close" /></button>
      </div>
      <div className="assistant-body">
        {!credentials ? <div className="assistant-connect">
          <span className="text-xs font-semibold uppercase tracking-widest text-[var(--velo-muted)]">Your campaigns. Your ChatGPT.</span>
          <h3 className="mt-3 text-2xl font-semibold tracking-tight">A helping hand,<br />right in your console.</h3>
          <p className="mt-3 text-sm text-[var(--velo-muted)]">Connect ChatGPT to explore reports, find opportunities, and manage campaigns without leaving Capve.</p>
          <div className="assistant-examples">
            <p><Icon name="reports" /> Compare campaign performance</p>
            <p><Icon name="route" /> Build offers and routing paths</p>
            <p><Icon name="check" /> Review changes before they run</p>
          </div>
          {step === "connect" ? <>
            <button className="btn btn-primary w-full" onClick={() => setStep("instructions")}>Continue with ChatGPT <Icon name="arrow" /></button>
            <p className="mt-3 text-xs text-[var(--velo-muted)]">Uses your eligible ChatGPT plan. Capve sends your messages and the tool results needed to answer to OpenAI. Every change waits for your confirmation.</p>
          </> : <div className="space-y-4">
            <h4 className="font-semibold">Connect in three steps</h4>
            <ol className="list-decimal space-y-3 pl-5 text-sm">
              <li>Sign in to ChatGPT in the new tab and approve plan access for Capve.</li>
              <li>You will reach a <strong>127.0.0.1</strong> page that may say it cannot connect. That is expected. Copy its full address from the address bar.</li>
              <li>Return here and paste that address to finish connecting. Keep it private.</li>
            </ol>
            {step === "instructions" ? <button className="btn btn-primary w-full" disabled={busy} onClick={connect}>{busy ? "Opening…" : "Open ChatGPT sign-in"}</button> : <form className="space-y-3" onSubmit={event => { event.preventDefault(); void finish(); }}>
              <a href={authUrl} target="_blank" rel="noopener noreferrer" className="text-sm underline">Reopen ChatGPT sign-in</a>
              <label className="block text-sm font-medium" htmlFor="assistant-callback">Callback address</label>
              <input id="assistant-callback" className="input w-full" type="password" autoComplete="off" value={callback} onChange={event => setCallback(event.target.value)} placeholder="http://127.0.0.1:1455/auth/callback?…" />
              <button type="submit" className="btn btn-primary w-full" disabled={busy || !callback.trim()}>{busy ? "Connecting…" : "Finish connecting"}</button>
            </form>}
            <button className="btn btn-ghost text-xs" disabled={busy} onClick={() => { setStep("connect"); setCallback(""); setError(""); }}>Start over</button>
          </div>}
          <p className="mt-5 text-xs text-[var(--velo-muted)]">The connection stays in this browser tab. Capve relays requests to OpenAI without saving your ChatGPT tokens or chat on its server.</p>
        </div> : <>
          {messages.length === 0 && <div className="assistant-connect"><h3 className="text-xl font-semibold">What would you like to do?</h3><p className="mt-2 text-sm text-[var(--velo-muted)]">Connected to ChatGPT. Ask about this account or describe a change. You review every action before it runs.</p><div className="mt-6 space-y-2">{["Compare my campaigns by ROI", "Help me create a tracking campaign", "Which zones are spending without conversions?"].map(prompt => <button key={prompt} className="assistant-suggestion" onClick={() => void send(prompt)}>{prompt}<Icon name="arrow" /></button>)}</div></div>}
          <div role="log" aria-label="Conversation" aria-live="polite" className="space-y-4">
            {messages.map((message, index) => <div key={index} className={`assistant-message ${message.role}`}>
              <p className="mb-1 text-xs font-semibold">{message.role === "user" ? "You" : "Capve"}</p>
              <p className="whitespace-pre-wrap text-sm">{message.content}</p>
              {message.actions?.map((action, i) => <p className="mt-2 text-xs" key={i}>{action.ok ? "✓" : "!"} {action.title} — {action.ok ? "completed" : "failed"}</p>)}
              {message.cards?.map((card, i) => <div className="assistant-card" key={i}>
                {card.type === "link" ? <Link to={card.path} onClick={() => dialog.current?.close()} className="underline">{card.title}</Link> : card.type === "question" ? <><p>{card.question}</p><div className="mt-2 flex flex-wrap gap-2">{card.options.map(option => <button className="btn btn-secondary text-xs" key={option} disabled={busy || used.has(card)} onClick={() => void send(`Question: ${card.question}\nAnswer: ${option}`)}>{option}</button>)}</div></> : <>
                  <p className="font-semibold">Review action: {card.title}</p><p className="mt-1 text-xs">{card.description}</p>
                  <pre className="my-3 max-h-40 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(card.arguments, null, 2)}</pre>
                  <div className="flex gap-2"><button className="btn btn-primary text-xs" disabled={busy || used.has(card)} onClick={() => void send(`Confirm: ${card.title}`, card)}>{used.has(card) ? "Reviewed" : "Confirm action"}</button><button className="btn btn-secondary text-xs" disabled={busy || used.has(card)} onClick={() => setUsed(previous => new Set([...previous, card]))}>Cancel</button></div>
                </>}
              </div>)}
            </div>)}
          </div>
          {busy && <p role="status" className="mt-4 text-sm text-[var(--velo-muted)]">Working on your request…</p>}
          <div ref={end} />
        </>}
        {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      </div>
      {credentials && <form className="assistant-composer" onSubmit={event => { event.preventDefault(); void send(input); }}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--velo-muted)]"><span>Using your ChatGPT plan{credentials.email ? ` · ${credentials.email}` : ""}</span><a href={CHATGPT_MANAGE_USAGE_URL} target="_blank" rel="noopener noreferrer" className="underline">Manage usage</a></div>
        <label className="sr-only" htmlFor="assistant-message">Message Capve</label>
        <div className="flex gap-2"><input id="assistant-message" className="input min-w-0 flex-1" value={input} onChange={event => setInput(event.target.value)} placeholder="Ask about your campaigns…" disabled={busy} /><button className="btn btn-primary" type="submit" disabled={busy || !input.trim()} aria-label="Send message"><Icon name="arrow" /></button></div>
        <p className="mt-2 text-xs text-[var(--velo-muted)]">AI can make mistakes. Check reports and review proposed changes.</p>
      </form>}
    </dialog>
  </>;
}
