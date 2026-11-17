import type { Components } from "react-markdown";
import { Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Allow console paths and normal web links. Drop javascript:, data:, and protocol-relative URLs. */
function safeUrl(url: string): string {
  const value = url.trim();
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") && !/\s/.test(value))
    return value;
  try {
    const parsed = new URL(value);
    if (parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "mailto:")
      return value;
  }
  catch {
    return "";
  }
  return "";
}

function components(onInternalLink?: () => void): Components {
  return {
    a({ href, children }) {
      if (!href)
        return <>{children}</>;
      if (href.startsWith("/"))
        return <Link to={href} onClick={onInternalLink}>{children}</Link>;
      return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
    },
    img({ src, alt }) {
      if (!src)
        return null;
      return <img src={src} alt={alt ?? ""} />;
    },
    input({ type, checked }) {
      if (type !== "checkbox")
        return null;
      return <input type="checkbox" defaultChecked={Boolean(checked)} disabled />;
    },
    table({ children }) {
      return <div className="assistant-table-wrap"><table>{children}</table></div>;
    },
  };
}

/** Renders an assistant reply: GitHub-flavored Markdown, including tables, with raw HTML ignored. */
export function AssistantMarkdown({ text, onInternalLink }: { text: string; onInternalLink?: () => void }) {
  return (
    <div className="assistant-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml urlTransform={safeUrl} components={components(onInternalLink)}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
