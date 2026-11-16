import { useParams } from "react-router-dom";
import { NotFoundPage } from "../../pages/NotFound";
import {
  CardGrid,
  CodeSnippet,
  Container,
  CtaBand,
  DocLinks,
  FaqSection,
  FeatureLinks,
  PageHero,
  SectionHeading,
} from "../blocks";
import { FEATURES, findFeature } from "../content/features";
import { SOLUTIONS, findSolution } from "../content/solutions";
import type { Section } from "../content/types";
import { Inline } from "../inline";
import { MarketingLayout } from "../Layout";

function SectionRows({ sections }: { sections: Section[] }) {
  return (
    <div className="divide-y divide-[var(--velo-border)] border-y border-[var(--velo-border)]">
      {sections.map((section) => (
        <div className="grid gap-6 py-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-12" key={section.title}>
          <h2 className="text-2xl font-semibold tracking-tight">{section.title}</h2>
          <div className="mk-prose min-w-0 space-y-4 text-[16px]">
            <p>
              <Inline text={section.body} />
            </p>
            {section.bullets && (
              <ul className="space-y-2">
                {section.bullets.map((bullet) => (
                  <li className="mk-check" key={bullet}>
                    <Inline text={bullet} />
                  </li>
                ))}
              </ul>
            )}
            {section.code && <CodeSnippet label={section.code.label} text={section.code.text} />}
          </div>
        </div>
      ))}
    </div>
  );
}

export function FeaturePage() {
  const { slug = "" } = useParams();
  const feature = findFeature(slug);
  if (!feature) return <NotFoundPage />;
  const related = FEATURES.filter((other) => other.slug !== feature.slug)
    .slice(0, 4)
    .map((other) => other.slug);
  return (
    <MarketingLayout>
      <PageHero
        crumbs={[{ label: "Home", href: "/" }, { label: "Product", href: "/features" }, { label: feature.name }]}
        eyebrow={feature.eyebrow}
        lead={feature.lead}
        title={feature.h1}
      />
      <section className="pb-16">
        <Container>
          <CardGrid cards={feature.highlights} />
        </Container>
      </section>
      <section className="pb-8">
        <Container>
          <SectionRows sections={feature.sections} />
          <div className="mt-10">
            <DocLinks links={feature.docs} />
          </div>
        </Container>
      </section>
      <FaqSection faqs={feature.faqs} title={`${feature.name}: questions`} />
      <FeatureLinks slugs={related} title="More of the product" />
      <CtaBand />
    </MarketingLayout>
  );
}

export function FeaturesIndexPage() {
  return (
    <MarketingLayout>
      <PageHero
        crumbs={[{ label: "Home", href: "/" }, { label: "Product" }]}
        eyebrow="Product"
        lead="Follow casino traffic from source and zone to registration, FTD and reported revenue. Tracking, routing, event postbacks and reports are included on every plan."
        title="One tracker for your casino affiliate campaigns."
      />
      <section className="pb-16">
        <Container>
          <CardGrid
            cards={FEATURES.map((feature) => ({
              icon: feature.icon,
              title: feature.name,
              body: feature.description,
              href: `/features/${feature.slug}`,
            }))}
          />
        </Container>
      </section>
      <CtaBand />
    </MarketingLayout>
  );
}

export function SolutionPage() {
  const { slug = "" } = useParams();
  const solution = findSolution(slug);
  if (!solution) return <NotFoundPage />;
  return (
    <MarketingLayout>
      <PageHero
        crumbs={[{ label: "Home", href: "/" }, { label: "Solutions", href: "/solutions" }, { label: solution.name }]}
        eyebrow={solution.eyebrow}
        lead={solution.lead}
        title={solution.h1}
      />
      <section className="pb-16">
        <Container>
          <CardGrid cards={solution.pains} />
        </Container>
      </section>
      <section className="border-y border-[var(--velo-border)] bg-white py-16 sm:py-20">
        <Container>
          <SectionHeading kicker="Setup" title="How it fits your day." />
          <ol className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {solution.workflow.map((step, index) => (
              <li className="rounded-2xl border border-[var(--velo-border)] p-6" key={step.title}>
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
          <div className="mt-10">
            <DocLinks links={solution.docs} />
          </div>
        </Container>
      </section>
      <FeatureLinks slugs={solution.features} title="What you'll use most" />
      <FaqSection faqs={solution.faqs} />
      <CtaBand />
    </MarketingLayout>
  );
}

export function SolutionsIndexPage() {
  return (
    <MarketingLayout>
      <PageHero
        crumbs={[{ label: "Home", href: "/" }, { label: "Solutions" }]}
        eyebrow="Solutions"
        lead="Build a casino affiliate workflow around the way you buy traffic, compare offers, work as a team and automate decisions."
        title="From your first casino offer to a full buying team."
      />
      <section className="pb-16">
        <Container>
          <CardGrid
            columns={3}
            cards={SOLUTIONS.map((solution) => ({
              icon: solution.icon,
              title: solution.name,
              body: solution.description,
              href: `/solutions/${solution.slug}`,
            }))}
          />
        </Container>
      </section>
      <CtaBand />
    </MarketingLayout>
  );
}
