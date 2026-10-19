import { CopyButton } from "./ui";

/** One copyable value. Use one block per URL so Copy never grabs two links at once. */
export function CodeBlock({ children, label }: { children: string; label?: string }) {
  const block = (
    <div className="relative min-w-0">
      <pre className="mono docs-code overflow-x-auto whitespace-pre-wrap break-all rounded-md border border-[var(--velo-border)] bg-[var(--velo-bg)] p-4 pr-16 text-xs leading-relaxed">
        {children}
      </pre>
      <CopyButton className="absolute right-2 top-2" text={children} />
    </div>
  );
  if (!label) return block;
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-xs font-semibold text-[var(--velo-muted)]">{label}</p>
      {block}
    </div>
  );
}
