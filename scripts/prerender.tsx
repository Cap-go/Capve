/**
 * Build step after `vite build`: renders every public page (marketing, legal, docs) to static HTML
 * so crawlers, link previews and AI assistants get real content and per-page meta tags.
 * The client hydrates these pages (src/main.tsx). Also writes sitemap.xml and llms.txt.
 *
 * Output (dist/client): `/pricing` → pricing.html, `/docs/mcp` → docs/mcp.html. The home page goes to
 * home.html, because index.html must stay the empty SPA shell for /app and other client routes;
 * the Worker serves home.html for `/` (worker/index.ts).
 *
 * Run with Bun: `bun scripts/prerender.tsx`.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom";
import { AppRoutes } from "../src/App";
import { AuthProvider } from "../src/lib/auth";
import { COMPETITORS } from "../src/marketing/content/competitors";
import { absoluteUrl, PAGES, type PageMeta } from "../src/marketing/registry";

const OUT_DIR = fileURLToPath(new URL("../dist/client/", import.meta.url));
const META_BLOCK = /<!-- page-meta:start[\s\S]*?<!-- page-meta:end -->/;
const ROOT = '<div id="root"></div>';

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function headTags(meta: PageMeta): string {
  const url = absoluteUrl(meta.path);
  const title = escapeHtml(meta.title);
  const description = escapeHtml(meta.description);
  const tags = [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    ...(meta.jsonLd ?? []).map(
      (data) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`,
    ),
  ];
  return tags.join("\n    ");
}

function render(path: string): string {
  return renderToString(
    <StrictMode>
      <AuthProvider>
        <StaticRouter location={path}>
          <AppRoutes />
        </StaticRouter>
      </AuthProvider>
    </StrictMode>,
  );
}

function outputFile(path: string): string {
  if (path === "/") return join(OUT_DIR, "home.html");
  return join(OUT_DIR, `${path.slice(1)}.html`);
}

function sitemap(pages: PageMeta[], lastmod: string): string {
  const urls = pages
    .map((page) => `  <url>\n    <loc>${absoluteUrl(page.path)}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

function llmsTxt(pages: PageMeta[]): string {
  const sections: PageMeta["section"][] = ["Home", "Product", "Solutions", "Compare", "Migrate", "Docs", "Company", "Legal"];
  const lines = [
    "# Capve",
    "",
    "> Capve is an open-source campaign and affiliate tracker (a Binom alternative) that runs on Cloudflare Workers and D1. It records ad clicks at the edge, routes them with rules and weighted rotations, receives conversions by S2S postback (Binom-style `cnv_id`, `payout`, `cnv_status`), filters bots, and reports profit, ROI, EPC and CR by any dimension. It includes an MCP server so AI assistants can manage campaigns. Hosted at https://capve.app from $74.50/month for 1M clicks (Pro: $149.50/month for 60M clicks), with a 14-day free trial and no card; the source is public at https://github.com/Cap-go/Capve.",
    "",
  ];
  for (const section of sections) {
    const inSection = pages.filter((page) => page.section === section);
    if (inSection.length === 0) continue;
    lines.push(`## ${section}`, "");
    for (const page of inSection) lines.push(`- [${page.title}](${absoluteUrl(page.path)}): ${page.description}`);
    lines.push("");
  }
  return lines.join("\n");
}

const template = readFileSync(join(OUT_DIR, "index.html"), "utf8");
if (!META_BLOCK.test(template) || !template.includes(ROOT)) {
  throw new Error("dist/client/index.html is missing the page-meta block or the empty #root div");
}
if (COMPETITORS.length === 0) throw new Error("No competitors: comparison and migration pages would be empty");

const seen = new Set<string>();
for (const page of PAGES) {
  if (seen.has(page.path)) throw new Error(`Duplicate page path ${page.path}`);
  seen.add(page.path);
  const body = render(page.path);
  if (body.includes("Page not found")) throw new Error(`${page.path} rendered the 404 page`);
  const html = template.replace(META_BLOCK, headTags(page)).replace(ROOT, `<div id="root">${body}</div>`);
  const file = outputFile(page.path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
}

const today = new Date().toISOString().slice(0, 10);
writeFileSync(join(OUT_DIR, "sitemap.xml"), sitemap(PAGES, today));
writeFileSync(join(OUT_DIR, "llms.txt"), llmsTxt(PAGES));
console.log(`Prerendered ${PAGES.length} pages, sitemap.xml and llms.txt into dist/client`);
