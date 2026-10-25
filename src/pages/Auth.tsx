import { isPlanId } from "../../shared/billing";
import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ErrorBox, Field, Shell } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

export function LoginPage() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/app" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { user: next } = await api.login(email, password);
      setUser(next);
      navigate("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell
      cta={
        <Link className="btn btn-ghost" to="/register">
          Create account
        </Link>
      }
    >
      <div className="mx-auto max-w-md px-6 py-16">
        <h1 className="text-3xl font-semibold">Sign in</h1>
        <p className="mt-2 text-[var(--velo-muted)]">Access your Capve dashboard.</p>
        <form className="card mt-8 space-y-4 p-6" onSubmit={onSubmit}>
          <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Field label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          <div className="text-right text-sm">
            <Link className="underline" to="/forgot-password">
              Forgot password?
            </Link>
          </div>
          <ErrorBox message={error} />
          <button className="btn btn-primary w-full" type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </Shell>
  );
}

export function RegisterPage() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const selectedPlan = new URLSearchParams(window.location.search).get("plan");
  const plan = isPlanId(selectedPlan) ? selectedPlan : "starter";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/app" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { user: next } = await api.register({ email, password, name: name || undefined, plan });
      setUser(next);
      navigate("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell
      cta={
        <Link className="btn btn-ghost" to="/login">
          Sign in
        </Link>
      }
    >
      <div className="mx-auto max-w-md px-6 py-16">
        <h1 className="text-3xl font-semibold">Create account</h1>
        <p className="mt-2 text-[var(--velo-muted)]">Try {plan === "pro" ? "Pro" : "Starter"} free for 14 days. No card required.</p>
        <form className="card mt-8 space-y-4 p-6" onSubmit={onSubmit}>
          <Field label="Name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Field label="Password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          <ErrorBox message={error} />
          <p className="text-sm text-[var(--velo-muted)]">
            By creating an account, you agree to the{" "}
            <Link className="underline" to="/terms">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link className="underline" to="/privacy">
              Privacy Policy
            </Link>
            .
          </p>
          <button className="btn btn-primary w-full" type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create account"}
          </button>
        </form>
      </div>
    </Shell>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await api.forgotPassword(email);
      setMessage(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell cta={<Link className="btn btn-ghost" to="/login">Back to sign in</Link>}>
      <div className="mx-auto max-w-md px-6 py-16">
        <h1 className="text-3xl font-semibold">Reset password</h1>
        <p className="mt-2 text-[var(--velo-muted)]">We will email you a reset link.</p>
        <form className="card mt-8 space-y-4 p-6" onSubmit={onSubmit}>
          <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <ErrorBox message={error} />
          {message ? <p className="text-sm">{message}</p> : null}
          <button className="btn btn-primary w-full" type="submit" disabled={busy}>
            {busy ? "Sending…" : "Send reset link"}
          </button>
        </form>
      </div>
    </Shell>
  );
}

export function ResetPasswordPage() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { user } = await api.resetPassword(token, password);
      setUser(user);
      navigate("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <Shell>
        <div className="mx-auto max-w-md px-6 py-16">
          <ErrorBox message="Missing reset token. Request a new link from the forgot password page." />
        </div>
      </Shell>
    );
  }

  return (
    <Shell cta={<Link className="btn btn-ghost" to="/login">Sign in</Link>}>
      <div className="mx-auto max-w-md px-6 py-16">
        <h1 className="text-3xl font-semibold">Choose a new password</h1>
        <form className="card mt-8 space-y-4 p-6" onSubmit={onSubmit}>
          <Field label="New password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          <ErrorBox message={error} />
          <button className="btn btn-primary w-full" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Update password"}
          </button>
        </form>
      </div>
    </Shell>
  );
}

export function VerifyEmailPage() {
  const { refresh } = useAuth();
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const [state, setState] = useState<"working" | "done" | "error">(token ? "working" : "error");
  const [error, setError] = useState(token ? "" : "Missing verification token.");
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    api
      .verifyEmail(token)
      .then(async () => {
        await refresh();
        setState("done");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Verification failed");
        setState("error");
      });
  }, [token]);

  return (
    <Shell cta={<Link className="btn btn-ghost" to="/app">Dashboard</Link>}>
      <div className="mx-auto max-w-md px-6 py-16">
        <h1 className="text-3xl font-semibold">Verify email</h1>
        {state === "working" ? (
          <p className="mt-4 text-[var(--velo-muted)]">Verifying…</p>
        ) : state === "done" ? (
          <p className="mt-4">
            Your email is verified.{" "}
            <Link className="underline" to="/app">
              Open your dashboard
            </Link>
            .
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            <ErrorBox message={error} />
            <p className="text-sm text-[var(--velo-muted)]">
              Sign in and use “Resend email” on the dashboard to get a new link.
            </p>
          </div>
        )}
      </div>
    </Shell>
  );
}
