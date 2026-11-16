import { PLANS } from "../../shared/billing";
import { DOC_PAGES, docHref } from "../lib/docs-nav";
import { PRODUCTION_APP_URL } from "../lib/constants";
import { COMPETITORS } from "./content/competitors";
import { FEATURES } from "./content/features";
import { HOME_FAQS, PRICING_FAQS } from "./content/pages";
import { SOLUTIONS } from "./content/solutions";
import type { Faq } from "./content/types";
import { plainText } from "./inline";

/** Head tags for one public page. Drives prerendered HTML, client navigation, sitemap.xml and llms.txt. */
export type PageMeta = {
  path: string;
  title: string;
  description: string;
  section: "Home" | "Product" | "Solutions" | "Compare" | "Migrate" | "Company" | "Legal" | "Docs";
  jsonLd?: object[];
};

export const DEFAULT_TITLE = "Capve — Tracking and optimization for casino affiliates";
export const DEFAULT_DESCRIPTION =
  "One tracking dashboard for casino affiliates. Compare offers, tracked conversions, reported commissions and traffic costs across the affiliate programs you promote.";

const BRAND_SUFFIX = " | Capve";

export function absoluteUrl(path: string): string {
  return path === "/" ? `${PRODUCTION_APP_URL}/` : `${PRODUCTION_APP_URL}${path}`;
}

function faqLd(faqs: Faq[]): object {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: plainText(faq.q),
      acceptedAnswer: { "@type": "Answer", text: plainText(faq.a) },
    })),
  };
}

function breadcrumbLd(items: Array<[name: string, path: string]>): object {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map(([name, path], index) => ({
      "@type": "ListItem",
      position: index + 1,
      name,
      item: absoluteUrl(path),
    })),
  };
}

const SOFTWARE_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Capve",
  url: absoluteUrl("/"),
  applicationCategory: "BusinessApplication",
  applicationSubCategory: "Casino affiliate campaign tracking",
  operatingSystem: "Web",
  license: "https://www.gnu.org/licenses/agpl-3.0.html",
  description: DEFAULT_DESCRIPTION,
  offers: PLANS.map((plan) => ({
    "@type": "Offer",
    name: plan.name,
    price: (plan.monthlyCents / 100).toFixed(2),
    priceCurrency: "USD",
    url: absoluteUrl("/pricing"),
  })),
};

const ORGANIZATION_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Capve",
  url: absoluteUrl("/"),
  logo: absoluteUrl("/apple-touch-icon.png"),
  sameAs: ["https://github.com/Cap-go/Capve"],
};

function page(meta: PageMeta): PageMeta {
  return { ...meta, title: meta.path === "/" ? meta.title : `${meta.title}${BRAND_SUFFIX}` };
}

export const PAGES: PageMeta[] = [
  page({
    path: "/",
    section: "Home",
    title: "Capve — One tracking dashboard for casino affiliates",
    description:
      "One tracking dashboard for casino affiliates. Compare offers, tracked conversions, reported commissions and traffic costs across the affiliate programs you promote.",
    jsonLd: [ORGANIZATION_LD, SOFTWARE_LD, faqLd(HOME_FAQS)],
  }),
  page({
    path: "/pricing",
    section: "Home",
    title: "Pricing: $74.50/month for 1M clicks",
    description:
      "Capve costs half of Binom: Starter $74.50/month for 1M clicks, Pro $149.50/month for 60M clicks. Every feature on every plan, no overage fees, 14-day trial without a card.",
    jsonLd: [SOFTWARE_LD, faqLd(PRICING_FAQS), breadcrumbLd([["Home", "/"], ["Pricing", "/pricing"]])],
  }),
  page({
    path: "/features",
    section: "Product",
    title: "Casino affiliate tracking features: FTDs, postbacks, reports and MCP",
    description:
      "Track casino offers with registration and FTD postbacks, lander rotation, bot filtering, cost and revenue reports, zone blacklist rules and an MCP server.",
    jsonLd: [breadcrumbLd([["Home", "/"], ["Product", "/features"]])],
  }),
  ...FEATURES.map((feature) =>
    page({
      path: `/features/${feature.slug}`,
      section: "Product",
      title: feature.title,
      description: feature.description,
      jsonLd: [
        faqLd(feature.faqs),
        breadcrumbLd([["Home", "/"], ["Product", "/features"], [feature.name, `/features/${feature.slug}`]]),
      ],
    }),
  ),
  page({
    path: "/solutions",
    section: "Solutions",
    title: "Casino affiliate workflows: media buying, offers, teams and automation",
    description:
      "How casino affiliates use Capve for paid traffic, registration and FTD attribution, offer testing, shared reporting and API automation.",
    jsonLd: [breadcrumbLd([["Home", "/"], ["Solutions", "/solutions"]])],
  }),
  ...SOLUTIONS.map((solution) =>
    page({
      path: `/solutions/${solution.slug}`,
      section: "Solutions",
      title: solution.title,
      description: solution.description,
      jsonLd: [
        faqLd(solution.faqs),
        breadcrumbLd([["Home", "/"], ["Solutions", "/solutions"], [solution.name, `/solutions/${solution.slug}`]]),
      ],
    }),
  ),
  page({
    path: "/compare",
    section: "Compare",
    title: "Capve vs Binom, Voluum, RedTrack, Keitaro and other trackers",
    description:
      "Compare trackers for your casino affiliate workflow on price, hosting, source code, AI access and trial terms, using published vendor information.",
    jsonLd: [breadcrumbLd([["Home", "/"], ["Compare", "/compare"]])],
  }),
  ...COMPETITORS.map((competitor) =>
    page({
      path: `/compare/${competitor.slug}`,
      section: "Compare",
      title: competitor.title,
      description: competitor.description,
      jsonLd: [
        faqLd(competitor.faqs),
        breadcrumbLd([["Home", "/"], ["Compare", "/compare"], [`Capve vs ${competitor.name}`, `/compare/${competitor.slug}`]]),
      ],
    }),
  ),
  page({
    path: "/migrate",
    section: "Migrate",
    title: "Move your casino affiliate tracking to Capve",
    description:
      "Move casino campaigns from Binom, Voluum, RedTrack, Keitaro and other trackers to Capve. Map source tokens and event postbacks, then compare a parallel run.",
    jsonLd: [breadcrumbLd([["Home", "/"], ["Migration guides", "/migrate"]])],
  }),
  ...COMPETITORS.map((competitor) =>
    page({
      path: `/migrate/${competitor.slug}`,
      section: "Migrate",
      title: competitor.migrate.title,
      description: competitor.migrate.description,
      jsonLd: [
        faqLd(competitor.migrate.faqs),
        breadcrumbLd([["Home", "/"], ["Migration guides", "/migrate"], [competitor.name, `/migrate/${competitor.slug}`]]),
      ],
    }),
  ),
  page({
    path: "/security",
    section: "Company",
    title: "Security",
    description:
      "How Capve protects accounts and tracking data: hashed passwords and tokens, role checks on every request, signed sessions, no open redirects, postback keys and audit logs.",
    jsonLd: [breadcrumbLd([["Home", "/"], ["Security", "/security"]])],
  }),
  page({
    path: "/terms",
    section: "Legal",
    title: "Terms of Service",
    description: "Terms of Service for the hosted Capve campaign and affiliate tracking service at capve.app.",
    jsonLd: [breadcrumbLd([["Home", "/"], ["Terms of Service", "/terms"]])],
  }),
  page({
    path: "/privacy",
    section: "Legal",
    title: "Privacy Policy",
    description: "How Capve handles account data and the tracking data it processes for customers.",
    jsonLd: [breadcrumbLd([["Home", "/"], ["Privacy Policy", "/privacy"]])],
  }),
  page({
    path: "/imprint",
    section: "Legal",
    title: "Imprint",
    description: "Operator and contact details for the hosted Capve service at capve.app.",
    jsonLd: [breadcrumbLd([["Home", "/"], ["Imprint", "/imprint"]])],
  }),
  ...DOC_PAGES.map((doc) => ({
    path: docHref(doc.slug),
    section: "Docs" as const,
    title: `${doc.title} · Capve Docs`,
    description: `${doc.description}. Capve documentation for casino affiliate campaign tracking.`,
    jsonLd: [
      breadcrumbLd(
        doc.slug ? [["Home", "/"], ["Docs", "/docs"], [doc.title, docHref(doc.slug)]] : [["Home", "/"], ["Docs", "/docs"]],
      ),
    ],
  })),
];

const BY_PATH = new Map(PAGES.map((meta) => [meta.path, meta]));

export function getPageMeta(pathname: string): PageMeta | undefined {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return BY_PATH.get(path);
}
