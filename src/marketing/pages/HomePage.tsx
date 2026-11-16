import { Link } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { Pricing } from "../../components/Pricing";
import { claudeCodeCommand } from "../../lib/mcp";
import { PRODUCTION_APP_URL } from "../../lib/constants";
import {
  CardGrid,
  CodeSnippet,
  Container,
  CtaBand,
  FaqList,
  NETWORK_TEMPLATE_NAMES,
  SectionHeading,
  SOURCE_TEMPLATE_NAMES,
  TrialButtons,
  TrialNote,
} from "../blocks";
import { COMPETITORS } from "../content/competitors";
import { FEATURES, MCP_TOOL_COUNT } from "../content/features";
import { HOME_FAQS } from "../content/pages";
import { SOLUTIONS } from "../content/solutions";
import { MarketingLayout } from "../Layout";
import { ProductMock } from "../ProductMock";

const CASINO_PROMPTS = [
  "Compare cost per FTD and ROI by traffic source for my casino campaigns.",
  "Show zones with registrations but no FTDs in the last seven days.",
  "Set up a 50/50 split between these two casino offers and track registration and FTD events.",
];

const FLOW = [
  { title: "Traffic source", body: "Sends paid traffic with campaign, creative and zone tokens." },
  { title: "Capve edge", body: "Records the click, applies rules, filters bots, picks a path." },
  { title: "Lander and offer", body: "Get the click id through URL macros." },
  { title: "Postback", body: "The affiliate program reports registration, FTD and deposit events." },
  { title: "Report", body: "Compare cost per FTD and reported revenue by source, zone and offer." },
];

const PROOF = [
  { value: "50%", label: "of Binom's monthly price" },
  { value: "0", label: "servers to install or patch" },
  { value: String(MCP_TOOL_COUNT), label: "MCP tools for AI assistants" },
  { value: "10", label: "sub IDs per click, named your way" },
];

export function HomePage() {
  return (
    <MarketingLayout>
      <section className="relative overflow-hidden">
        <div aria-hidden="true" className="mk-grid-bg pointer-events-none absolute inset-0" />
        <div aria-hidden="true" className="mk-glow pointer-events-none absolute inset-0" />
        <Container className="relative grid items-center gap-12 pb-16 pt-10 sm:pt-16 lg:grid-cols-[1.05fr_1fr] lg:pb-24">
          <div className="min-w-0">
            <Link className="mk-eyebrow" to="/compare/binom">
              <b>For casino affiliates</b> Open-source tracking on Cloudflare
              <Icon name="arrow" size={14} />
            </Link>
            <h1 className="mk-h1 mt-6">Casino affiliate tracking, from click to FTD.</h1>
            <p className="mk-lead mt-6 max-w-xl">
              Connect traffic costs to registrations, first-time deposits and the revenue your affiliate programs
              report. Compare casino offers, landers and zones in one place, then act through the dashboard
              or your AI assistant.
            </p>
            <div className="mt-8">
              <TrialButtons secondary={{ label: "Compare trackers", href: "/compare" }} />
            </div>
            <TrialNote className="mt-4" />
          </div>
          <div className="min-w-0">
            <ProductMock />
          </div>
        </Container>
      </section>

      <section className="border-y border-[var(--velo-border)] bg-white">
        <Container className="grid grid-cols-2 gap-6 py-10 md:grid-cols-4">
          {PROOF.map((item) => (
            <div key={item.label}>
              <p className="text-3xl font-semibold tracking-tight sm:text-4xl">{item.value}</p>
              <p className="mk-muted mt-1 text-sm">{item.label}</p>
            </div>
          ))}
        </Container>
      </section>

      <section className="py-16 sm:py-24">
        <Container>
          <SectionHeading
            center
            kicker="How it works"
            title="Follow the click through to the first deposit."
            lead="A campaign link in the traffic source, event postbacks from the casino affiliate program, and the cost and conversion data you need to compare them."
          />
          <ol className="mk-flow mt-12">
            {FLOW.map((step, index) => (
              <li className="mk-card p-5" key={step.title}>
                <span className="text-xs font-semibold text-[var(--color-brand-deep)]">0{index + 1}</span>
                <h3 className="mt-2 font-semibold">{step.title}</h3>
                <p className="mk-muted mt-1 text-sm leading-relaxed">{step.body}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      <section className="pb-16 sm:pb-24">
        <Container>
          <SectionHeading
            kicker="Product"
            title="The tools behind your next traffic decision."
            lead="Track registrations and FTDs separately, compare offers by geo, and investigate zones that spend without converting. Every plan includes these tracking features."
          />
          <div className="mt-10">
            <CardGrid
              cards={FEATURES.map((feature) => ({
                icon: feature.icon,
                title: feature.name,
                body: feature.summary,
                href: `/features/${feature.slug}`,
              }))}
            />
          </div>
          <div className="mt-10 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-sm font-semibold">Tracking templates for</span>
            {[...SOURCE_TEMPLATE_NAMES, ...NETWORK_TEMPLATE_NAMES].map((name) => (
              <span className="mk-chip" key={name}>
                {name}
              </span>
            ))}
            <span className="mk-muted text-sm">with editable macros for your source and affiliate program.</span>
          </div>
        </Container>
      </section>

      <section className="mk-dark py-16 sm:py-24">
        <Container className="grid items-center gap-12 lg:grid-cols-2">
          <div className="min-w-0">
            <p className="mk-kicker">Your affiliate workflow, through MCP</p>
            <h2 className="mk-h2 mt-2">Ask about FTDs. Act on the evidence.</h2>
            <p className="mk-lead mt-4">
              Capve ships an MCP server with {MCP_TOOL_COUNT} tools. Connect your assistant with one token and
              ask it to compare cost per FTD, investigate weak zones, rotate casino offers and manage your Capve
              campaigns, with your account's permissions.
            </p>
            <ul className="mt-6 space-y-3">
              {CASINO_PROMPTS.map((prompt) => (
                <li className="border-l-2 border-[var(--color-brand)] pl-4 text-[15px] text-[#d6d6d3]" key={prompt}>
                  “{prompt}”
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="btn mk-btn-brand mk-btn-lg" to="/features/ai-mcp">
                How the MCP server works
              </Link>
              <Link className="btn btn-secondary mk-btn-lg" to="/docs/mcp">
                MCP docs
              </Link>
            </div>
          </div>
          <div className="min-w-0 space-y-4">
            <CodeSnippet label="Connect Claude Code" text={claudeCodeCommand(PRODUCTION_APP_URL)} />
            <div className="mk-card p-5 text-sm">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#8d8d8a]">Example</p>
              <p className="font-semibold text-white">You</p>
              <p className="mt-1 text-[#d6d6d3]">Which zones have spent without generating an FTD this week?</p>
              <p className="mt-4 font-semibold text-white">Assistant</p>
              <p className="mt-1 text-[#d6d6d3]">
                Called <code className="mk-inline-code">report_grouped</code> by <code className="mk-inline-code">sub1</code>{" "}
                for 3 casino campaigns. In this example, 14 zones spent $612 with no FTDs. Review their
                conversion delay before adding them to a blacklist for export.
              </p>
            </div>
          </div>
        </Container>
      </section>

      <section className="py-16 sm:py-24">
        <Container>
          <SectionHeading
            kicker="Solutions"
            title="Built around the casino affiliate workflow."
            lead="From a solo media buyer testing an offer to a team managing several programs, keep traffic, conversion events and reported revenue together."
          />
          <div className="mt-10">
            <CardGrid
              columns={3}
              cards={[
                ...SOLUTIONS.map((solution) => ({
                  icon: solution.icon,
                  title: solution.name,
                  body: solution.summary,
                  href: `/solutions/${solution.slug}`,
                })),
                {
                  icon: "swap",
                  title: "Switching trackers",
                  body: "Move casino campaigns with term, macro and postback mappings, then compare registration and FTD counts.",
                  href: "/migrate",
                },
              ]}
            />
          </div>
        </Container>
      </section>

      {COMPETITORS.length > 0 && (
        <section className="border-y border-[var(--velo-border)] bg-white py-16 sm:py-24">
          <Container>
            <SectionHeading
              kicker="Compare"
              title="Clicks, not events. No server, no overage."
              lead="Compare the tracking infrastructure and pricing behind your casino affiliate campaigns. Prices are each vendor's own published monthly list price."
            />
            <div className="mt-10 overflow-x-auto rounded-2xl border border-[var(--velo-border)]">
              <table className="mk-table min-w-[720px]">
                <thead>
                  <tr>
                    <th scope="col">Tracker</th>
                    <th scope="col">Entry price</th>
                    <th scope="col">Hosting</th>
                    <th scope="col">Source code</th>
                    <th scope="col">AI assistant access</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="mk-col-capve">
                    <th scope="row" className="font-semibold">
                      Capve
                    </th>
                    <td>$74.50/month, 1M clicks</td>
                    <td>Cloudflare edge, managed</td>
                    <td>Public on GitHub</td>
                    <td>MCP server, {MCP_TOOL_COUNT} tools</td>
                  </tr>
                  {COMPETITORS.map((competitor) => (
                    <tr key={competitor.slug}>
                      <th scope="row">
                        <Link className="mk-link" to={`/compare/${competitor.slug}`}>
                          {competitor.name}
                        </Link>
                      </th>
                      <td>{competitor.facts.price}</td>
                      <td>{competitor.facts.hosting}</td>
                      <td>{competitor.facts.source}</td>
                      <td>{competitor.facts.ai}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mk-muted mt-3 text-xs">
              Checked {COMPETITORS[0].checked}. See each comparison page for sources and details.
            </p>
          </Container>
        </section>
      )}

      <section className="py-16 sm:py-24">
        <Container className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <SectionHeading
              kicker="Switching"
              title="Move one casino campaign first."
              lead="Map your offers, source tokens and postbacks to Capve, then run a controlled slice of traffic. Compare registration, FTD and revenue totals before moving the rest."
            />
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="btn btn-primary mk-btn-lg" to="/migrate">
                Migration guides
              </Link>
              <Link className="btn btn-secondary mk-btn-lg" to="/docs/postback">
                Postback reference
              </Link>
            </div>
          </div>
          <CodeSnippet
            label="FTD postback URL for your affiliate program"
            text={`${PRODUCTION_APP_URL}/click?cnv_id={clickid}&payout={payout}&cnv_status={status}&event=ftd&key=YOUR_POSTBACK_KEY`}
          />
        </Container>
      </section>

      <div className="border-t border-[var(--velo-border)] bg-white">
        <Pricing />
        <Container className="pb-12">
          <Link className="mk-link text-sm font-semibold" to="/pricing">
            Full pricing details and FAQ →
          </Link>
        </Container>
      </div>

      <section className="py-16 sm:py-24">
        <Container className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <SectionHeading kicker="FAQ" title="Questions casino affiliates ask first" />
          <FaqList faqs={HOME_FAQS} />
        </Container>
      </section>

      <CtaBand />
    </MarketingLayout>
  );
}
