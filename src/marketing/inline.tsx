import { Fragment, type ReactNode } from "react";
import { Link } from "react-router-dom";

/**
 * Minimal inline markup for marketing copy kept as plain strings (so the same text
 * feeds pages, meta tags and llms.txt): `code`, **bold** and [label](/path or https://…).
 */
const TOKEN = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;

export function Inline({ text }: { text: string }) {
  const parts = text.split(TOKEN).filter(Boolean);
  return (
    <>
      {parts.map((part, index) => (
        <Fragment key={index}>{renderPart(part)}</Fragment>
      ))}
    </>
  );
}

function renderPart(part: string): ReactNode {
  if (part.startsWith("`") && part.endsWith("`")) {
    return <code className="mk-inline-code">{part.slice(1, -1)}</code>;
  }
  if (part.startsWith("**") && part.endsWith("**")) {
    return <strong className="font-semibold text-[var(--velo-ink)]">{part.slice(2, -2)}</strong>;
  }
  const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
  if (link) {
    const [, label, href] = link;
    if (href.startsWith("mailto:")) {
      return (
        <a className="mk-link" href={href}>
          {label}
        </a>
      );
    }
    if (href.startsWith("/")) {
      return (
        <Link className="mk-link" to={href}>
          {label}
        </Link>
      );
    }
    return (
      <a className="mk-link" href={href} target="_blank" rel="noreferrer">
        {label}
      </a>
    );
  }
  return part;
}

/** Same markup reduced to plain text, for meta descriptions, JSON-LD and llms.txt. */
export function plainText(text: string): string {
  return text
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}
