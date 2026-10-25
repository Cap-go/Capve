import { useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { BRAND_NAME } from "../lib/constants";
import { SiteFooter } from "./SiteFooter";

export function Shell({
  children,
  cta,
}: {
  children: ReactNode;
  cta?: ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link to="/" className="flex items-center gap-2.5 text-lg font-semibold tracking-tight">
          <img
            src="/logo.svg"
            alt=""
            className="h-7 w-7"
            width={28}
            height={28}
            aria-hidden
          />
          {BRAND_NAME}
        </Link>
        <nav className="flex items-center gap-3">{cta}</nav>
      </header>
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}

export function Field({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-[var(--velo-muted)]">{label}</span>
      <input className="input" {...props} />
    </label>
  );
}

export function ErrorBox({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div
      className="rounded-md border border-red-300 bg-white px-4 py-3 text-sm text-red-700"
      role="alert"
    >
      {message}
    </div>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-[var(--velo-muted)]">{label}</span>
      <select
        className="input"
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function CopyButton({ text, className = "" }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <button
      className={`btn btn-secondary px-2 py-1 text-xs ${className}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard unavailable (insecure context): the text stays selectable.
        }
      }}
      type="button"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/** One-time secret or token with a copy button. */
export function SecretBox({ title, value }: { title: string; value: string }) {
  return (
    <div className="mt-4 rounded-md border border-[var(--velo-ink)] bg-white p-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="font-semibold">{title}</p>
        <CopyButton text={value} />
      </div>
      <p className="mono mt-2 break-all">{value}</p>
    </div>
  );
}

/** "Saving…" / "Saved" state for save buttons. */
export function useSaveState() {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  async function run<T>(action: () => Promise<T>): Promise<T> {
    setSaving(true);
    setSaved(false);
    try {
      const result = await action();
      setSaved(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setSaved(false), 2000);
      return result;
    } finally {
      setSaving(false);
    }
  }
  return { saving, saved, run };
}

export function SavedNote({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="text-sm text-[var(--velo-muted)]" role="status">
      Saved
    </span>
  );
}

/** Native confirm before destructive actions. */
export function confirmDelete(what: string, detail?: string): boolean {
  return window.confirm(`Delete ${what}?${detail ? `\n\n${detail}` : ""}`);
}
