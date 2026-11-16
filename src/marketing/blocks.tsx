import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/Icon";
import { CopyButton } from "../components/ui";
import { FEATURES } from "./content/features";
import type { Card, Faq } from "./content/types";
import { Inline } from "./inline";

export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-4 sm:px-6 ${className}`}>{children}</div>;
}

export function TrialButtons({ secondary }: { secondary?: { label: string; href: string } }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Link className="btn btn-primary mk-btn-lg" to="/register">
        Start 14-day free trial
        <Icon name="arrow" />
      </Link>
      {secondary && (
        <Link className="btn btn-secondary mk-btn-lg" to={secondary.href}>
          {secondary.label}
        </Link>
      )}
    </div>
  );
}

export function TrialNote({ className = "" }: { className?: string }) {
  return (
    <p className={`text-sm text-[var(--velo-muted)] ${className}`}>
      No card required · Cancel anytime · Tracking keeps running if reports lock
    </p>
  );
}

export function Breadcrumbs({ items }: { items: Array<{ label: string; href?: string }> }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-[var(--velo-muted)]">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((item, index) => (
          <li className="flex items-center gap-1.5" key={item.label}>
            {index > 0 && <span aria-hidden="true">/</span>}
            {item.href ? (
              <Link className="hover:text-[var(--velo-ink)]" to={item.href}>
                {item.label}
              </Link>
            ) : (
              <span aria-current="page">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Page hero used by product, solution, comparison and migration pages. */
export function PageHero({
  crumbs,
  eyebrow,
  title,
  lead,
  children,
}: {
  crumbs: Array<{ label: string; href?: string }>;
  eyebrow: string;
  title: string;
  lead: string;
  children?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden="true" className="mk-grid-bg pointer-events-none absolute inset-0" />
      <div aria-hidden="true" className="mk-glow pointer-events-none absolute inset-0" />
      <Container className="relative pb-14 pt-8 sm:pb-20">
        <Breadcrumbs items={crumbs} />
        <p className="mk-kicker mt-10">{eyebrow}</p>
        <h1 className="mk-h1 mt-3 max-w-4xl">{title}</h1>
        <p className="mk-lead mt-5 max-w-2xl">
          <Inline text={lead} />
        </p>
        <div className="mt-8">{children ?? <TrialButtons secondary={{ label: "See pricing", href: "/pricing" }} />}</div>
      </Container>
    </section>
  );
}

export function SectionHeading({
  kicker,
  title,
  lead,
  center = false,
  id,
}: {
  kicker?: string;
  title: string;
  lead?: string;
  center?: boolean;
  id?: string;
}) {
  return (
    <div className={center ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      {kicker && <p className="mk-kicker">{kicker}</p>}
      <h2 className="mk-h2 mt-2" id={id}>
        {title}
      </h2>
      {lead && (
        <p className="mk-lead mt-4">
          <Inline text={lead} />
        </p>
      )}
    </div>
  );
}

export function CardGrid({ cards, columns = 4 }: { cards: Card[]; columns?: 2 | 3 | 4 }) {
  const cols = { 2: "md:grid-cols-2", 3: "md:grid-cols-3", 4: "md:grid-cols-2 lg:grid-cols-4" }[columns];
  return (
    <div className={`grid gap-4 ${cols}`}>
      {cards.map((card) => {
        const body = (
          <>
            {card.icon && (
              <span className="mk-icon">
                <Icon name={card.icon} />
              </span>
            )}
            <h3 className="mt-4 text-[17px] font-semibold tracking-tight">{card.title}</h3>
            <p className="mk-muted mt-2 text-[15px] leading-relaxed">
              <Inline text={card.body} />
            </p>
            {card.href && (
              <span className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-semibold">
                Learn more <Icon name="arrow" size={14} />
              </span>
            )}
          </>
        );
        return card.href ? (
          <Link className="mk-card p-6" key={card.title} to={card.href}>
            {body}
          </Link>
        ) : (
          <article className="mk-card p-6" key={card.title}>
            {body}
          </article>
        );
      })}
    </div>
  );
}

export function Steps({ steps }: { steps: Card[] }) {
  return (
    <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {steps.map((step, index) => (
        <li className="mk-card p-6" key={step.title}>
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-ink)] text-sm font-semibold text-[var(--color-brand)]">
            {index + 1}
          </span>
          <h3 className="mt-4 text-[17px] font-semibold tracking-tight">{step.title}</h3>
          <p className="mk-muted mt-2 text-[15px] leading-relaxed">
            <Inline text={step.body} />
          </p>
        </li>
      ))}
    </ol>
  );
}

export function CodeSnippet({ label, text, prose = false }: { label?: string; text: string; prose?: boolean }) {
  return (
    <div className="min-w-0">
      {label && <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--velo-muted)]">{label}</p>}
      <div className="relative">
        <pre className={prose ? "mk-code mk-code-prose" : "mk-code"}>{text}</pre>
        <CopyButton className="absolute right-2 top-2" text={text} />
      </div>
    </div>
  );
}

export function FaqList({ faqs }: { faqs: Faq[] }) {
  return (
    <div className="mk-faq border-t border-[var(--velo-border)]">
      {faqs.map((faq) => (
        <details key={faq.q}>
          <summary>{faq.q}</summary>
          <div>
            <Inline text={faq.a} />
          </div>
        </details>
      ))}
    </div>
  );
}

export function FaqSection({ faqs, title = "Questions" }: { faqs: Faq[]; title?: string }) {
  if (faqs.length === 0) return null;
  return (
    <section className="py-16 sm:py-20">
      <Container className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
        <SectionHeading kicker="FAQ" title={title} />
        <FaqList faqs={faqs} />
      </Container>
    </section>
  );
}

export function FeatureLinks({ slugs, title = "Related features" }: { slugs: string[]; title?: string }) {
  const cards = slugs
    .map((slug) => FEATURES.find((feature) => feature.slug === slug))
    .filter((feature) => feature !== undefined)
    .map((feature) => ({
      icon: feature.icon,
      title: feature.name,
      body: feature.summary,
      href: `/features/${feature.slug}`,
    }));
  return (
    <section className="py-16 sm:py-20">
      <Container>
        <SectionHeading title={title} />
        <div className="mt-8">
          <CardGrid cards={cards} columns={cards.length % 3 === 0 ? 3 : 4} />
        </div>
      </Container>
    </section>
  );
}

export function DocLinks({ links }: { links: Array<{ label: string; href: string }> }) {
  if (links.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-semibold">Read the docs:</span>
      {links.map((link) => (
        <Link className="mk-chip hover:border-[#c9c9c6]" key={link.href} to={link.href}>
          {link.label}
        </Link>
      ))}
    </div>
  );
}

export function CtaBand({
  title = "Bring your casino affiliate tracking together.",
  body = "14-day free trial with every feature. No card, no server, no sales call.",
}: {
  title?: string;
  body?: string;
}) {
  return (
    <section className="px-4 pb-16 sm:px-6 sm:pb-24">
      <div className="mk-dark relative mx-auto max-w-6xl overflow-hidden rounded-3xl px-6 py-14 sm:px-12 sm:py-16">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(50% 80% at 85% 0%, #b4f04238 0%, transparent 70%)" }}
        />
        <div className="relative grid items-center gap-8 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <h2 className="mk-h2">{title}</h2>
            <p className="mk-lead mt-4 max-w-xl">{body}</p>
          </div>
          <div className="flex flex-wrap gap-3 lg:justify-end">
            <Link className="btn mk-btn-brand mk-btn-lg" to="/register">
              Start free trial
              <Icon name="arrow" />
            </Link>
            <Link className="btn btn-secondary mk-btn-lg" to="/pricing">
              See pricing
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Featured tracking templates for casino affiliate workflows; the full catalog remains in the dashboard. */
export const SOURCE_TEMPLATE_NAMES = [
  "PropellerAds",
  "Zeropark",
  "TrafficStars",
  "RichAds",
  "Adcash",
];
export const NETWORK_TEMPLATE_NAMES = ["Cellxpert", "Affilka", "MyAffiliates", "TUNE", "Everflow", "CAKE", "Affise"];
