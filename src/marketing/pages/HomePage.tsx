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
  "Compare the reported commissions and traffic costs for the casino affiliate programs I promote.",
  "Show zones with registrations but no FTDs in the last seven days.",
  "Set up a 50/50 split between these two casino offers and track registration and FTD events.",
];

const FLOW = [
  { title: "Add your affiliate programs", body: "Organize the casino offers you promote by the affiliate program or network you work with." },
  { title: "Use your tracking links", body: "Send visitors through Capve to your landing pages and casino offers." },
  { title: "Connect conversion reports", body: "Configure each program’s postbacks to send registrations, first-time deposits and your reported commissions." },
  { title: "Compare results together", body: "See tracked conversions and reported commissions beside traffic costs, by program, offer and source." },
  { title: "Improve your campaigns", body: "Test offers and landing pages, adjust traffic splits, and choose which placements to keep or change." },
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
            <h1 className="mk-h1 mt-6">One tracking dashboard for casino affiliates.</h1>
            <p className="mk-lead mt-6 max-w-xl">
              Bring the casino offers you promote, your traffic costs and the conversions and commissions
              your affiliate programs report into one dashboard. Compare performance across programs and
              traffic sources, then improve your campaigns.
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
            title="Several affiliate programs. One view of your performance."
            lead="Work with different casino affiliate programs and platforms? Bring the results they send through postbacks into Capve, so you can compare the offers you promote alongside the traffic you buy."
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
            title="Find the offers and traffic that earn their place."
            lead="Compare your affiliate programs by tracked conversions, reported commissions and traffic cost. Test landing pages, route visitors to the offers you choose and review which campaigns deserve more budget."
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
            <span className="mr-1 text-sm font-semibold">Affiliate platform templates</span>
            {NETWORK_TEMPLATE_NAMES.map((name) => (
              <span className="mk-chip" key={name}>
                {name}
              </span>
            ))}
            <span className="mk-muted text-sm">Editable postback presets for the programs you work with.</span>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-sm font-semibold">Paid traffic templates</span>
            {SOURCE_TEMPLATE_NAMES.map((name) => <span className="mk-chip" key={name}>{name}</span>)}
            <span className="mk-muted text-sm">Track the sources you buy traffic from.</span>
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
            title="Built for the affiliate behind the campaign."
            lead="Whether you promote one casino or work with several affiliate programs, keep your offers, tracked conversions and reported earnings together. Share that view with your team as you grow."
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
