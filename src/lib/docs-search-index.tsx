import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom";
import { DOC_CONTENT } from "./docs-content";
import { DOC_PAGES, docHeadingId, docHref } from "./docs-nav";

// Read the rendered articles so search includes code samples and stays in sync with edits.
export function buildDocsIndex() {
  return DOC_PAGES.flatMap((page) => {
    const Page = DOC_CONTENT[page.slug];
    const html = renderToStaticMarkup(
      <StaticRouter location={docHref(page.slug)}>
        <Page />
      </StaticRouter>,
    );
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("button").forEach((button) => button.remove());
    const headings = Array.from(doc.querySelectorAll("h1, h2"));
    return headings.map((heading, index) => {
      const range = doc.createRange();
      range.setStartAfter(heading);
      const next = headings[index + 1];
      if (next) range.setEndBefore(next);
      else range.setEndAfter(doc.body.lastChild ?? heading);
      const fragment = range.cloneContents();
      fragment
        .querySelectorAll("p, li, td, th, pre, div, h3")
        .forEach((block) => block.append(" "));
      const content = (fragment.textContent ?? "").replace(/\s+/g, " ").trim();
      const title = heading.textContent ?? page.title;
      return {
        page: page.title,
        title,
        content,
        href:
          docHref(page.slug) +
          (index ? `#${docHeadingId(title, index - 1)}` : ""),
        text: `${page.title} ${title} ${content}`.toLowerCase(),
      };
    });
  });
}
