import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ONBOARDING_STEPS, type OnboardingStatus, type OnboardingStep } from "../../shared/onboarding";
import { api, type User } from "../lib/api";
import { campaignHref } from "../lib/campaign-route";
import { ErrorBox } from "./ui";

const COPY: Record<OnboardingStep, { title: string; description: string; action: string }> = {
  verify: {
    title: "Verify your email",
    description: "Open the verification email we sent you. This confirms your account and enables team invitations. You can start setting up your campaign while you wait.",
    action: "Resend verification email",
  },
  campaign: {
    title: "Create your first campaign",
    description: "Open Campaigns, choose Create a campaign, and give it a name and a destination URL. If your offer needs a click ID, put {click_id} in its sub-ID parameter. You can add a traffic source, reusable offers, and landers later.",
    action: "Create a campaign",
  },
  click: {
    title: "Send a click through your tracking link",
    description: "In your campaign’s Tracking tab, copy the campaign link and open it in a normal browser. Confirm it reaches your destination, then check the Click log. Keep the click_id passed to your destination for the next step. Bot clicks do not complete this step.",
    action: "Get tracking link",
  },
  conversion: {
    title: "Receive your first attributed conversion",
    description: "Copy the incoming postback URL from Tracking into your affiliate network. Map cnv_id to the network’s saved click ID and payout to its payout token. Send a test conversion for the click above, then check Conversions. Keep your postback key server-side. A conversion tied to a non-bot click in this campaign completes setup; rejected conversions do not count.",
    action: "Set up conversion tracking",
  },
};

export function GettingStartedPanel({ user }: { user: User }) {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const saving = useRef(false);
  const revision = useRef(0);
  const owner = user.role === "owner" && !user.impersonating;
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      if (saving.current) return;
      const request = ++revision.current;
      return api.onboarding().then((value) => {
        if (!cancelled && request === revision.current) { setStatus(value); setError(""); }
      }).catch((err) => { if (!cancelled && request === revision.current) setError(err.message); });
    };
    void refresh();
    const interval = window.setInterval(refresh, 15_000);
    window.addEventListener("focus", refresh);
    return () => { cancelled = true; clearInterval(interval); window.removeEventListener("focus", refresh); };
  }, []);

  async function preferences(patch: { dismissed?: boolean; emailTips?: boolean }) {
    saving.current = true; revision.current++;
    setBusy(true); setError("");
    try { setStatus(await api.updateOnboarding(patch)); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not save preferences"); }
    finally { saving.current = false; setBusy(false); }
  }

  const completed = status ? ONBOARDING_STEPS.filter((step) => status.steps[step]).length : 0;
  return <div className="space-y-6 max-w-4xl">
    <ErrorBox message={error} />
    {!status ? <p role="status">Loading your setup progress…</p> : <>
      <section className="card p-6 space-y-4" aria-labelledby="setup-heading">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-[var(--velo-muted)]">{completed} of {ONBOARDING_STEPS.length} steps complete</p>
            <h2 id="setup-heading" className="text-2xl font-semibold mt-2">{status.complete ? "Your tracking loop is working" : "See where your first conversion came from"}</h2>
            <p className="text-[var(--velo-muted)] mt-2">{status.complete
              ? "Capve has connected a conversion to a real click. Open your campaign report to see the source, revenue, cost, and profit. A test conversion proves the connection, not campaign profitability."
              : "Start with one campaign. We’ll check your account’s actual tracking data as you work, and keep your next step here."}</p>
          </div>
          <Link className="btn btn-secondary" to={status.complete && status.campaignId ? campaignHref(status.campaignId) : "/app/campaigns"}>
            {status.complete ? "View campaign report" : "Explore dashboard"}
          </Link>
        </div>
        <progress className="w-full h-2 accent-[var(--velo-accent)]" aria-label="Account setup progress" max={4} value={completed} />
      </section>
      <ol className="space-y-3">
        {ONBOARDING_STEPS.map((step, index) => {
          const done = status.steps[step];
          const current = status.nextStep === step;
          const href = step === "campaign" || !status.campaignId ? "/app/campaigns" : campaignHref(status.campaignId, "tracking");
          return <li key={step} className="card p-5" aria-current={current ? "step" : undefined}>
            <div className="flex gap-4">
              <span className="text-sm font-semibold shrink-0 mt-1" aria-label={done ? "Complete" : `Step ${index + 1}`}>{done ? "✓" : `${index + 1}.`}</span>
              <div className="min-w-0 space-y-3">
                <h3 className="font-semibold">{COPY[step].title}{current ? " · Up next" : ""}</h3>
                <p className="text-sm text-[var(--velo-muted)]">{COPY[step].description}</p>
                {step === "verify" ? !done && (owner ? <button type="button" className="btn btn-secondary" disabled={busy} onClick={async () => {
                  setBusy(true); setError(""); setMessage("");
                  try { const result = await api.resendVerification(); setMessage(result.already_verified ? "Your email is already verified. Progress will refresh shortly." : "Verification email requested. Check your inbox."); }
                  catch (err) { setError(err instanceof Error ? err.message : "Could not send verification email"); }
                  finally { setBusy(false); }
                }}>{COPY[step].action}</button> : <p className="text-sm">Ask the account owner to verify their email.</p>)
                  : <Link className={current ? "btn btn-primary" : "btn btn-secondary"} to={href}>{COPY[step].action}</Link>}
              </div>
            </div>
          </li>;
        })}
      </ol>
      {message && <p role="status" className="text-sm">{message}</p>}
      <section className="card p-5 space-y-3">
        <h2 className="font-semibold">Make this account yours</h2>
        <p className="text-sm text-[var(--velo-muted)]">Set your report timezone and optionally add a custom tracking domain in <Link className="underline" to="/app/settings">Settings</Link>. You can also <Link className="underline" to="/app/mcp">connect an AI assistant</Link> to walk through setup with you.</p>
        <p className="text-sm"><Link className="underline" to="/docs/postback">Postback setup guide</Link> · <Link className="underline" to="/docs">Quick start</Link></p>
        {owner && <>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={status.emailTips} disabled={busy} onChange={(e) => void preferences({ emailTips: e.target.checked })} />
            Email me setup tips and reminders. Unsubscribe anytime; authentication and billing notices are separate.
          </label>
          <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => void preferences({ dismissed: !status.dismissed })}>
            {status.dismissed ? "Show this guide when I sign in" : "Skip this guide on sign-in"}
          </button>
          {status.dismissed && <p className="text-sm text-[var(--velo-muted)]">You can always return from Getting started in the sidebar. Setup reminders are paused.</p>}
        </>}
      </section>
    </>}
  </div>;
}
