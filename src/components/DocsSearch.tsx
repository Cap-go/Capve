import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { buildDocsIndex } from "../lib/docs-search-index";
import { Icon } from "./Icon";

type Entry = ReturnType<typeof buildDocsIndex>[number];
type SearchState = { kind: "loading" } | { kind: "error" } | { kind: "ready"; entries: Entry[] };

/** Window event that opens the search palette from anywhere in the docs. */
export const OPEN_DOCS_SEARCH = "capve:open-docs-search";

const SUGGESTED = [
  { title: "Click IDs & SubIDs", detail: "Which ID to pass, and where", href: "/docs/click-ids" },
  { title: "Connect an affiliate network", detail: "Offer URL + postback, tested end to end", href: "/docs/networks" },
  { title: "Multi-provider campaigns", detail: "Several networks behind one source", href: "/docs/campaigns" },
  { title: "Postback URL", detail: "Receive conversions from networks", href: "/docs/postback" },
  { title: "POST /api/v1/convert", detail: "Send conversions from your backend", href: "/docs/api/convert" },
];

function highlight(text: string, terms: string[]): ReactNode {
  if (!terms.length) return text;
  const pattern = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return text.split(pattern).map((part, index) => (index % 2 ? <mark key={index}>{part}</mark> : part));
}

function rank(entry: Entry, terms: string[]): number {
  const title = entry.title.toLowerCase();
  return terms.reduce((score, term) => score + (title.includes(term) ? 10 : 0) + (entry.page.toLowerCase().includes(term) ? 3 : 0), 0);
}

/** Header button plus a ⌘K command palette, in the style of DocSearch. */
export function DocsSearch() {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<SearchState>({ kind: "loading" });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLElement && event.target.closest("input, textarea, select");
      if (((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") || (event.key === "/" && !typing)) {
        event.preventDefault();
        setOpen(true);
      }
    };
    const openSearch = () => setOpen(true);
    document.addEventListener("keydown", shortcut);
    window.addEventListener(OPEN_DOCS_SEARCH, openSearch);
    return () => {
      document.removeEventListener("keydown", shortcut);
      window.removeEventListener(OPEN_DOCS_SEARCH, openSearch);
    };
  }, []);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      element.showModal();
      input.current?.select();
    }
    if (!open && element.open) element.close();
  }, [open]);

  useEffect(() => {
    if (!open || search.kind !== "loading") return;
    let cancelled = false;
    import("../lib/docs-search-index")
      .then(({ buildDocsIndex }) => {
        const entries = buildDocsIndex();
        if (!cancelled) setSearch({ kind: "ready", entries });
      })
      .catch(() => {
        if (!cancelled) setSearch({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [open, search.kind]);

  useEffect(() => {
    dialog.current?.querySelector(`#docs-result-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const results =
    search.kind === "ready" && terms.length
      ? search.entries
          .filter((entry) => terms.every((term) => entry.text.includes(term)))
          .map((entry, index) => ({ entry, score: rank(entry, terms), index }))
          .sort((a, b) => b.score - a.score || a.index - b.index)
          .slice(0, 10)
          .map(({ entry }) => entry)
      : [];
  const items = terms.length ? results.map((r) => r.href) : SUGGESTED.map((s) => s.href);

  function go(href: string) {
    setOpen(false);
    navigate(href);
  }

  return (
    <>
      <button className="docs-search-trigger" type="button" onClick={() => setOpen(true)}>
        <Icon name="search" size={15} />
        <span>Search documentation…</span>
        <kbd aria-hidden="true">⌘K</kbd>
      </button>
      <dialog
        ref={dialog}
        className="docs-search-dialog"
        aria-label="Search documentation"
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}
      >
        <div className="docs-search-panel">
          <div className="docs-search-input">
            <Icon name="search" size={18} />
            <input
              ref={input}
              type="search"
              name="docs-search"
              autoComplete="off"
              aria-label="Search documentation"
              aria-controls="docs-search-results"
              aria-activedescendant={items.length ? `docs-result-${active}` : undefined}
              placeholder="Search click IDs, postbacks, campaigns…"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  const step = event.key === "ArrowDown" ? 1 : -1;
                  setActive((current) => (items.length ? (current + step + items.length) % items.length : 0));
                }
                if (event.key === "Enter" && items[active]) {
                  event.preventDefault();
                  go(items[active]);
                }
              }}
            />
            <button type="button" className="docs-search-esc" onClick={() => setOpen(false)}>
              Esc
            </button>
          </div>
          <div id="docs-search-results" className="docs-search-body" role="listbox" aria-label="Results">
            {!terms.length ? (
              <>
                <p className="docs-search-label">Suggested</p>
                {SUGGESTED.map((item, index) => (
                  <a
                    key={item.href}
                    id={`docs-result-${index}`}
                    role="option"
                    aria-selected={index === active}
                    className={index === active ? "docs-search-hit is-active" : "docs-search-hit"}
                    href={item.href}
                    onMouseMove={() => setActive(index)}
                    onClick={(event) => {
                      event.preventDefault();
                      go(item.href);
                    }}
                  >
                    <Icon name="page" />
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.detail}</small>
                    </span>
                    <Icon name="arrow" size={14} />
                  </a>
                ))}
              </>
            ) : (
              <>
                <p className="docs-search-label" role="status">
                  {search.kind === "loading"
                    ? "Loading articles…"
                    : search.kind === "error"
                      ? "Search could not load. Browse the topics in the sidebar."
                      : results.length
                        ? `${results.length} result${results.length === 1 ? "" : "s"}`
                        : `No results for “${query.trim()}”. Try click ID, postback, or campaign.`}
                </p>
                {results.map((result, index) => {
                  const match = result.content.toLowerCase().indexOf(terms[0] ?? "");
                  const start = Math.max(0, match - 50);
                  const snippet = `${start > 0 ? "…" : ""}${result.content.slice(start, start + 150)}${result.content.length > start + 150 ? "…" : ""}`;
                  return (
                    <a
                      key={result.href}
                      id={`docs-result-${index}`}
                      role="option"
                      aria-selected={index === active}
                      className={index === active ? "docs-search-hit is-active" : "docs-search-hit"}
                      href={result.href}
                      onMouseMove={() => setActive(index)}
                      onClick={(event) => {
                        event.preventDefault();
                        go(result.href);
                      }}
                    >
                      <Icon name={result.title === result.page ? "page" : "hash"} />
                      <span>
                        <small className="docs-search-crumb">
                          {result.page}
                          {result.title !== result.page && ` › ${result.title}`}
                        </small>
                        <strong>{highlight(result.title, terms)}</strong>
                        <small>{highlight(snippet, terms)}</small>
                      </span>
                      <Icon name="arrow" size={14} />
                    </a>
                  );
                })}
              </>
            )}
          </div>
          <div className="docs-search-footer" aria-hidden="true">
            <span>
              <kbd>↵</kbd> open
            </span>
            <span>
              <kbd>↑</kbd>
              <kbd>↓</kbd> navigate
            </span>
            <span>
              <kbd>esc</kbd> close
            </span>
          </div>
        </div>
      </dialog>
    </>
  );
}
