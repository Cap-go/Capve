export function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="mono docs-code overflow-x-auto rounded-md border border-[var(--velo-border)] bg-[var(--velo-bg)] p-4 text-xs leading-relaxed">
      {children}
    </pre>
  );
}
