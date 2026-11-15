import { Link, useParams } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { NotFoundPage } from "../../pages/NotFound";
import {
  CardGrid,
  CodeSnippet,
  Container,
  CtaBand,
  FaqSection,
  PageHero,
  SectionHeading,
  TrialButtons,
} from "../blocks";
import { COMPETITORS, findCompetitor, type Competitor } from "../content/competitors";
import { MCP_TOOL_COUNT } from "../content/features";
import { Inline } from "../inline";
import { MarketingLayout } from "../Layout";

const CAPVE_FACTS: Competitor["facts"] = {
  price: "$74.50/month, 1M clicks",
  hosting: "Managed on Cloudflare's edge, or self-host on your Cloudflare account",
  source: "Public on GitHub",
  ai: `Built-in MCP server, ${MCP_TOOL_COUNT} tools`,
  trial: "14 days, no card",
};

const FACT_LABELS: Array<[keyof Competitor["facts"], string]> = [
  ["price", "Entry price"],
  ["hosting", "Hosting"],
  ["source", "Source code"],
  ["ai", "AI assistant access"],
  ["trial", "Free trial"],
];

function Sources({ competitor }: { competitor: Competitor }) {
  return (
    <section className="pb-16">
      <Container>
        <div className="rounded-2xl border border-[var(--velo-border)] bg-white p-6 text-sm">
          <p className="font-semibold">Sources</p>
          <p className="mk-muted mt-1">
            {competitor.name} facts come from {competitor.name}'s own website and documentation, checked{" "}
            {competitor.checked}. Prices and features change; tell us at support@capgo.app if something here is
            out of date. {competitor.name} is a trademark of its owner, and this page isn't affiliated with it.
          </p>
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
            {competitor.sources.map((source) => (
              <li key={source.url}>
                <a className="mk-link" href={source.url} rel="noreferrer nofollow" target="_blank">
                  {source.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  );
}

export function ComparePage() {
  const { slug = "" } = useParams();
  const competitor = findCompetitor(slug);
  if (!competitor) return <NotFoundPage />;
  return (
    <MarketingLayout>
      <PageHero
        crumbs={[{ label: "Home", href: "/" }, { label: "Compare", href: "/compare" }, { label: `Capve vs ${competitor.name}` }]}
        eyebrow={`Capve vs ${competitor.name}`}
        lead={competitor.lead}
        title={competitor.h1}
      >
        <TrialButtons secondary={{ label: `Migrate from ${competitor.name}`, href: `/migrate/${competitor.slug}` }} />
      </PageHero>

      <section className="pb-16">
        <Container>
          <h2 className="sr-only">Side by side</h2>
          <div className="overflow-x-auto rounded-2xl border border-[var(--velo-border)] bg-white">
            <table className="mk-table min-w-[640px]">
              <thead>
                <tr>
                  <th scope="col" className="w-1/4">
                    &nbsp;
                  </th>
                  <th scope="col" className="mk-col-capve w-[37.5%]">
                    Capve
                  </th>
                  <th scope="col">{competitor.name}</th>
                </tr>
              </thead>
              <tbody>
                {competitor.rows.map((row) => (
                  <tr key={row.label}>
                    <th scope="row">{row.label}</th>
                    <td className="mk-col-capve">
                      <Inline text={row.capve} />
                    </td>
                    <td>
                      <Inline text={row.them} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Container>
      </section>

      <section className="border-y border-[var(--velo-border)] bg-white py-16 sm:py-20">
        <Container>
          <SectionHeading kicker="Why switch" title={`Why ${competitor.name} users move to Capve.`} />
          <div className="mt-10">
            <CardGrid cards={competitor.switchReasons} columns={competitor.switchReasons.length === 3 ? 3 : 4} />
          </div>
        </Container>
      </section>

      <section className="py-16 sm:py-20">
        <Container className="grid gap-10 lg:grid-cols-2">
          <div>
            <SectionHeading
              kicker="Fair to both"
              title={`When ${competitor.name} may fit better.`}
              lead="No tracker suits everyone. If one of these matters most to you, weigh it before switching."
            />
          </div>
          <ul className="space-y-3 self-center text-[15px] leading-relaxed text-[#3d3d3b]">
            {competitor.stayReasons.map((reason) => (
              <li className="mk-cross" key={reason}>
                <Inline text={reason} />
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section className="pb-16 sm:pb-20">
        <Container>
          <Link className="mk-card p-8" to={`/migrate/${competitor.slug}`}>
            <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="max-w-2xl">
              <p className="mk-kicker">Migration guide</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight">{competitor.migrate.h1}</p>
              <p className="mk-muted mt-2">
                Terms, macros and the postback URL mapped one to one, with a step-by-step plan to run both trackers
                in parallel before you switch.
              </p>
            </div>
            <span className="btn btn-primary mk-btn-lg">
              Read the guide <Icon name="arrow" />
            </span>
            </div>
          </Link>
        </Container>
      </section>

      <FaqSection faqs={competitor.faqs} title={`Capve vs ${competitor.name}: questions`} />
      <Sources competitor={competitor} />
      <CtaBand title={`Try Capve next to ${competitor.name}.`} body="Run both trackers on the same traffic for a week and compare. 14-day trial, no card." />
    </MarketingLayout>
  );
}

export function CompareIndexPage() {
  return (
    <MarketingLayout>
      <PageHero
        crumbs={[{ label: "Home", href: "/" }, { label: "Compare" }]}
        eyebrow="Compare"
        lead="How Capve compares with the trackers media buyers and affiliates use most: price, hosting, source code and AI access, from each vendor's own published pages."
        title="Capve vs other campaign trackers."
      />
      <section className="pb-16">
        <Container>
          <div className="overflow-x-auto rounded-2xl border border-[var(--velo-border)] bg-white">
            <table className="mk-table min-w-[860px]">
              <thead>
                <tr>
                  <th scope="col">Tracker</th>
                  {FACT_LABELS.map(([key, label]) => (
                    <th key={key} scope="col">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="mk-col-capve">
                  <th className="font-semibold" scope="row">
                    Capve
                  </th>
                  {FACT_LABELS.map(([key]) => (
                    <td key={key}>{CAPVE_FACTS[key]}</td>
                  ))}
                </tr>
                {COMPETITORS.map((competitor) => (
                  <tr key={competitor.slug}>
                    <th scope="row">
                      <Link className="mk-link" to={`/compare/${competitor.slug}`}>
                        {competitor.name}
                      </Link>
                    </th>
                    {FACT_LABELS.map(([key]) => (
                      <td key={key}>{competitor.facts[key]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {COMPETITORS[0] && (
            <p className="mk-muted mt-3 text-xs">
              Checked {COMPETITORS[0].checked} on each vendor's site. Sources are listed on each comparison page.
            </p>
          )}
        </Container>
      </section>
      <section className="pb-16">
        <Container>
          <CardGrid
            columns={3}
            cards={COMPETITORS.map((competitor) => ({
              title: `Capve vs ${competitor.name}`,
              body: competitor.description,
              href: `/compare/${competitor.slug}`,
            }))}
          />
        </Container>
      </section>
      <CtaBand />
    </MarketingLayout>
  );
}

const AI_MIGRATION_PROMPT =
  "I'm moving from my old tracker to Capve. Here is my offers export (CSV). Create each affiliate network, then each offer with its URL and payout, and add {clickid} where the old click id macro was. Show me the list before you create anything.";

export function MigratePage() {
  const { slug = "" } = useParams();
  const competitor = findCompetitor(slug);
  if (!competitor) return <NotFoundPage />;
  const guide = competitor.migrate;
  return (
    <MarketingLayout>
      <PageHero
        crumbs={[{ label: "Home", href: "/" }, { label: "Migration guides", href: "/migrate" }, { label: competitor.name }]}
        eyebrow={`Migrate from ${competitor.name}`}
        lead={guide.lead}
        title={guide.h1}
      >
        <TrialButtons secondary={{ label: `Capve vs ${competitor.name}`, href: `/compare/${competitor.slug}` }} />
      </PageHero>

      <section className="pb-16">
        <Container className="grid gap-10 lg:grid-cols-2">
          <div className="min-w-0">
            <h2 className="text-2xl font-semibold tracking-tight">What maps to what</h2>
            <p className="mk-muted mt-2">{competitor.name} concepts and their Capve names.</p>
            <div className="mt-6 overflow-x-auto rounded-2xl border border-[var(--velo-border)] bg-white">
              <table className="mk-table">
                <thead>
                  <tr>
                    <th scope="col">{competitor.name}</th>
                    <th scope="col" className="mk-col-capve">
                      Capve
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {guide.terms.map(([theirs, capve]) => (
                    <tr key={theirs}>
                      <th scope="row">
                        <Inline text={theirs} />
                      </th>
                      <td className="mk-col-capve">
                        <Inline text={capve} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="min-w-0">
            <h2 className="text-2xl font-semibold tracking-tight">Macros and tokens</h2>
            <p className="mk-muted mt-2">Replace these in offer and lander URLs.</p>
            <div className="mt-6 overflow-x-auto rounded-2xl border border-[var(--velo-border)] bg-white">
              <table className="mk-table">
                <thead>
                  <tr>
                    <th scope="col">{competitor.name}</th>
                    <th scope="col" className="mk-col-capve">
                      Capve
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {guide.macros.map(([theirs, capve]) => (
                    <tr key={theirs}>
                      <th scope="row">
                        <Inline text={theirs} />
                      </th>
                      <td className="mk-col-capve">
                        <Inline text={capve} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Container>
      </section>

      <section className="border-y border-[var(--velo-border)] bg-white py-16 sm:py-20">
        <Container>
          <SectionHeading kicker="Postback" title="Swap one URL in each network." />
          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <CodeSnippet label={`${competitor.name} postback`} text={guide.postback.theirs} />
            <CodeSnippet label="Capve postback" text={guide.postback.capve} />
          </div>
          <p className="mk-muted mt-5 max-w-3xl text-[15px] leading-relaxed">
            <Inline text={guide.postback.note} />
          </p>
        </Container>
      </section>

      <section className="py-16 sm:py-20">
        <Container>
          <SectionHeading kicker="Step by step" title={`Move from ${competitor.name} without losing a conversion.`} />
          <ol className="mt-10 divide-y divide-[var(--velo-border)] border-y border-[var(--velo-border)]">
            {guide.steps.map((step, index) => (
              <li className="grid gap-4 py-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-12" key={step.title}>
                <h3 className="flex items-start gap-3 text-xl font-semibold tracking-tight">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-ink)] text-sm font-semibold text-[var(--color-brand)]">
                    {index + 1}
                  </span>
                  {step.title}
                </h3>
                <div className="mk-prose min-w-0 space-y-4">
                  <p>
                    <Inline text={step.body} />
                  </p>
                  {step.bullets && (
                    <ul className="space-y-2">
                      {step.bullets.map((bullet) => (
                        <li className="mk-check" key={bullet}>
                          <Inline text={bullet} />
                        </li>
                      ))}
                    </ul>
                  )}
                  {step.code && <CodeSnippet label={step.code.label} text={step.code.text} />}
                </div>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      <section className="mk-dark py-16 sm:py-20">
        <Container className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <p className="mk-kicker">Shortcut</p>
            <h2 className="mk-h2 mt-2">Let your AI assistant do the data entry.</h2>
            <p className="mk-lead mt-4">
              Connect Capve's MCP server to Claude, Cursor or VS Code, give it your {competitor.name} export, and
              ask it to recreate networks, offers, landers and campaigns. It uses the same API as the dashboard, and
              you review every change.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="btn mk-btn-brand mk-btn-lg" to="/features/ai-mcp">
                About the MCP server
              </Link>
            </div>
          </div>
          <CodeSnippet label="Example prompt" prose text={AI_MIGRATION_PROMPT} />
        </Container>
      </section>

      <FaqSection faqs={guide.faqs} title={`Moving from ${competitor.name}: questions`} />
      <Sources competitor={competitor} />
      <CtaBand title="Set up your first campaign in parallel." body="Start a 14-day trial, mirror one campaign, and compare numbers before you move the rest." />
    </MarketingLayout>
  );
}

export function MigrateIndexPage() {
  return (
    <MarketingLayout>
      <PageHero
        crumbs={[{ label: "Home", href: "/" }, { label: "Migration guides" }]}
        eyebrow="Migration guides"
        lead="Each guide maps your current tracker's terms, macros and postback URL to Capve, then walks through a parallel run so you switch without losing conversions."
        title="Switch trackers without losing a conversion."
      />
      <section className="pb-16">
        <Container>
          <CardGrid
            columns={3}
            cards={COMPETITORS.map((competitor) => ({
              icon: "swap",
              title: `From ${competitor.name}`,
              body: competitor.migrate.description,
              href: `/migrate/${competitor.slug}`,
            }))}
          />
        </Container>
      </section>
      <section className="border-y border-[var(--velo-border)] bg-white py-16 sm:py-20">
        <Container>
          <SectionHeading
            kicker="Any tracker"
            title="The same five steps, whatever you use today."
            lead="Moving from a tracker that isn't listed? The plan doesn't change."
          />
          <ol className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            {[
              ["Recreate sources", "Start from a template, or add the source's tokens as sub IDs and cost."],
              ["Recreate networks and offers", "Swap the old click id macro for `{clickid}` in each offer URL."],
              ["Build one campaign", "Mirror a live campaign's paths, weights and rules in Capve."],
              ["Run both in parallel", "Point a slice of traffic at the Capve link and add Capve's postback in the network."],
              ["Compare, then switch", "When clicks and conversions line up, move the rest and retire the old tracker."],
            ].map(([title, body], index) => (
              <li className="rounded-2xl border border-[var(--velo-border)] p-5" key={title}>
                <span className="text-xs font-semibold text-[var(--color-brand-deep)]">0{index + 1}</span>
                <h3 className="mt-2 font-semibold">{title}</h3>
                <p className="mk-muted mt-1 text-sm leading-relaxed">
                  <Inline text={body} />
                </p>
              </li>
            ))}
          </ol>
        </Container>
      </section>
      <CtaBand />
    </MarketingLayout>
  );
}
