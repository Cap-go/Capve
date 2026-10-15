import { CopyButton } from "./ui";

export function CodeBlock({ children }: { children: string }) {
  return (
    <div className="relative min-w-0">
      <pre className="mono docs-code overflow-x-auto whitespace-pre-wrap break-all rounded-md border border-[var(--velo-border)] bg-[var(--velo-bg)] p-4 pr-16 text-xs leading-relaxed">
        {children}
      </pre>
      <CopyButton className="absolute right-2 top-2" text={children} />
    </div>
  );
}
