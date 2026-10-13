import type { InputHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";
import { BRAND_NAME } from "../lib/constants";

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
