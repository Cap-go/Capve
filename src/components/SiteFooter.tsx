import { Link } from "react-router-dom";
import { GITHUB_REPO_URL, PRODUCTION_APP_URL } from "../lib/constants";

export function SiteFooter() {
  return (
    <footer className="mx-auto max-w-6xl px-6 text-sm text-[var(--velo-muted)]">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--velo-border)] py-8">
        <p>
          Capve at{" "}
          <a className="underline" href={PRODUCTION_APP_URL}>
            capve.app
          </a>
          . Source on{" "}
          <a className="underline" href={GITHUB_REPO_URL} target="_blank" rel="noreferrer">
            GitHub
          </a>
          .
        </p>
        <nav aria-label="Legal" className="flex gap-4">
          <Link className="underline" to="/privacy">
            Privacy
          </Link>
          <Link className="underline" to="/terms">
            Terms
          </Link>
        </nav>
      </div>
    </footer>
  );
}
