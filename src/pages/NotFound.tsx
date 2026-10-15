import { Link, useLocation } from "react-router-dom";
import { Shell } from "../components/ui";

/** Unknown route. `embedded` renders inside the docs layout instead of its own shell. */
export function NotFoundPage({ embedded = false }: { embedded?: boolean }) {
  const { pathname } = useLocation();
  const body = (
    <>
      <h1 className="text-3xl font-semibold">Page not found</h1>
      <p className="mt-3 text-[var(--velo-muted)]">
        Nothing lives at <span className="mono break-all">{pathname}</span>.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link className="btn btn-primary" to={pathname.startsWith("/docs") ? "/docs" : "/app"}>
          {pathname.startsWith("/docs") ? "Docs home" : "Dashboard"}
        </Link>
        <Link className="btn btn-secondary" to="/">
          Home
        </Link>
      </div>
    </>
  );
  if (embedded) return body;
  return (
    <Shell>
      <div className="mx-auto max-w-6xl px-6 py-16">{body}</div>
    </Shell>
  );
}
