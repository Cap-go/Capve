import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ErrorBox, Shell } from "../components/ui";
import { oauthRequest, type OAuthRequest } from "../lib/oauth";

export function OAuthConsentPage() {
  const [params] = useSearchParams();
  const request = params.get("request") ?? "";
  const [details, setDetails] = useState<OAuthRequest | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    setDetails(null);
    setError("");
    oauthRequest<OAuthRequest>(`/request?request=${encodeURIComponent(request)}`)
      .then((value) => { if (active) setDetails(value); })
      .catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [request]);

  async function decide(approve: boolean) {
    setBusy(true);
    setError("");
    try {
      const result = await oauthRequest<{ redirect: string }>("/authorize", {
        method: "POST", body: JSON.stringify({ request, approve }),
      });
      window.location.assign(result.redirect);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not authorize app");
      setBusy(false);
    }
  }

  return (
    <Shell cta={<Link className="btn btn-ghost" to="/app/mcp">Your connections</Link>}>
      <div className="mx-auto max-w-xl px-6 py-12 sm:py-16">
        <p className="text-sm font-medium text-[var(--velo-muted)]">MCP CONNECTION</p>
        <h1 className="mt-3 text-3xl font-semibold">Connect an app to Capve</h1>
        <p className="mt-3 text-[var(--velo-muted)]">Review this request before giving an assistant access.</p>
        <ErrorBox message={error} />
        {!details && !error ? <p className="mt-8" role="status">Loading request…</p> : null}
        {details ? (
          <div className="card mt-8 space-y-6 p-6">
            <div>
              <h2 className="break-words text-xl font-semibold">{details.client_name}</h2>
              <p className="mt-1 text-sm text-[var(--velo-muted)]">App name supplied by the client. Only connect apps you trust.</p>
            </div>
            <dl className="space-y-4 text-sm">
              <div><dt className="text-[var(--velo-muted)]">Personal Capve account</dt><dd className="mt-1 break-all font-medium">{details.email}</dd></div>
              <div><dt className="text-[var(--velo-muted)]">Returns to</dt><dd className="mono mt-1 break-all">{details.redirect_uri}</dd></div>
            </dl>
            <div className="border-t border-[var(--velo-border)] pt-5">
              <h3 className="font-medium">This app will be able to</h3>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-[var(--velo-muted)]">
                <li>Read your campaigns, reports, costs and revenue.</li>
                <li>Create, edit and delete campaigns, offers and routing rules.</li>
                <li>Manage your personal account settings, team and integrations.</li>
              </ul>
            </div>
            <p className="text-sm text-[var(--velo-muted)]">Access lasts up to 30 days. Revoke it anytime in API &amp; MCP. Team accounts and platform administration are not included.</p>
            <div className="flex flex-col-reverse gap-3 sm:flex-row">
              <button className="btn btn-secondary flex-1" type="button" disabled={busy} onClick={() => decide(false)}>Cancel</button>
              <button className="btn btn-primary flex-1" type="button" disabled={busy} onClick={() => decide(true)}>{busy ? "Continuing…" : "Allow access"}</button>
            </div>
          </div>
        ) : null}
      </div>
    </Shell>
  );
}
