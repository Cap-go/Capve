import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { absoluteUrl, DEFAULT_DESCRIPTION, DEFAULT_TITLE, getPageMeta } from "./registry";

function setMeta(selector: string, attribute: "name" | "property", key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = content;
}

/**
 * Keeps <title>, description, canonical and Open Graph tags in sync on client-side navigation.
 * The first load already has them: scripts/prerender.tsx writes the same values into each page's HTML.
 */
export function RouteMeta() {
  const { pathname } = useLocation();
  useEffect(() => {
    const meta = getPageMeta(pathname);
    const title = meta?.title ?? DEFAULT_TITLE;
    const description = meta?.description ?? DEFAULT_DESCRIPTION;
    document.title = title;
    setMeta('meta[name="description"]', "name", "description", description);
    setMeta('meta[property="og:title"]', "property", "og:title", title);
    setMeta('meta[property="og:description"]', "property", "og:description", description);
    setMeta('meta[name="twitter:title"]', "name", "twitter:title", title);
    setMeta('meta[name="twitter:description"]', "name", "twitter:description", description);
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (meta) {
      if (!canonical) {
        canonical = document.createElement("link");
        canonical.rel = "canonical";
        document.head.appendChild(canonical);
      }
      canonical.href = absoluteUrl(meta.path);
      setMeta('meta[property="og:url"]', "property", "og:url", absoluteUrl(meta.path));
    } else {
      canonical?.remove();
    }
  }, [pathname]);
  return null;
}
