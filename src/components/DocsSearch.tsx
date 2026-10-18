import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { buildDocsIndex } from "../lib/docs-search-index";

type SearchState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; entries: ReturnType<typeof buildDocsIndex> };

export function DocsSearch() {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<SearchState>({ kind: "loading" });
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        input.current?.focus();
      }
      if (event.key === "Escape") setOpen(false);
    };
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        setOpen(false);
    };
    document.addEventListener("keydown", shortcut);
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("keydown", shortcut);
      document.removeEventListener("pointerdown", outside);
    };
  }, []);

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

  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const results =
    search.kind === "ready" && terms.length
      ? search.entries
          .filter((entry) => terms.every((term) => entry.text.includes(term)))
          .slice(0, 8)
      : [];

  return (
    <div
      ref={root}
      className="docs-search"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <label className="sr-only" htmlFor="docs-search">
        Search documentation
      </label>
      <div className="docs-search-field">
        <span aria-hidden="true">⌕</span>
        <input
          ref={input}
          id="docs-search"
          name="docs-search"
          type="search"
          autoComplete="off"
          placeholder="Search documentation…"
          value={query}
          aria-expanded={open && terms.length > 0}
          aria-controls="docs-search-results"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              root.current
                ?.querySelector<HTMLAnchorElement>(".docs-search-results a")
                ?.focus();
            }
          }}
        />
        <kbd aria-hidden="true">⌘ / Ctrl K</kbd>
      </div>
      {open && terms.length > 0 && (
        <div id="docs-search-results" className="docs-search-results">
          <p role="status">
            {search.kind === "loading"
              ? "Loading articles…"
              : search.kind === "error"
                ? "Search could not load. Browse the topics below."
                : results.length
                  ? `${results.length} matching sections`
                  : "No results. Try click ID, postback, or campaign."}
          </p>
          {results.map((result) => {
            const match = result.content.toLowerCase().indexOf(terms[0] ?? "");
            const start = Math.max(0, match - 45);
            return (
              <Link
                key={result.href}
                to={result.href}
                onClick={() => setOpen(false)}
              >
                <small>{result.page}</small>
                <strong>{result.title}</strong>
                <span>
                  {start > 0 ? "…" : ""}
                  {result.content.slice(start, start + 155)}
                  {result.content.length > start + 155 ? "…" : ""}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
