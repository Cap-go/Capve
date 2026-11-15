import { Link } from "react-router-dom";
import { Pricing } from "../../components/Pricing";
import { Breadcrumbs, Container, CtaBand, FaqSection, SectionHeading } from "../blocks";
import { COMPETITORS } from "../content/competitors";
import { PLAN_FEATURES, PRICING_FAQS } from "../content/pages";
import { MarketingLayout } from "../Layout";

export function PricingPage() {
  return (
    <MarketingLayout>
      <Container className="pt-8">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Pricing" }]} />
      </Container>
      <Pricing heading="h1" />

      <section className="border-y border-[var(--velo-border)] bg-white py-16 sm:py-20">
        <Container className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <SectionHeading
            kicker="Included"
            title="Every plan, every feature."
            lead="Plans differ only by click allowance. Nothing is locked behind an upgrade."
          />
          <ul className="grid gap-3 sm:grid-cols-2">
            {PLAN_FEATURES.map((item) => (
              <li className="mk-check text-[15px]" key={item}>
                {item}
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {COMPETITORS.length > 0 && (
        <section className="py-16 sm:py-20">
          <Container>
            <SectionHeading
              kicker="Compare"
              title="What the same tracking costs elsewhere."
              lead="Entry prices as each vendor publishes them. Allowances and billing units differ, so check the comparison page for the details that matter to you."
            />
            <div className="mt-10 overflow-x-auto rounded-2xl border border-[var(--velo-border)] bg-white">
              <table className="mk-table min-w-[640px]">
                <thead>
                  <tr>
                    <th scope="col">Tracker</th>
                    <th scope="col">Entry price</th>
                    <th scope="col">Hosting</th>
                    <th scope="col">Free trial</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="mk-col-capve">
                    <th className="font-semibold" scope="row">
                      Capve
                    </th>
                    <td>$74.50/month, 1M clicks</td>
                    <td>Managed on Cloudflare</td>
                    <td>14 days, no card</td>
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
                      <td>{competitor.facts.trial}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mk-muted mt-3 text-xs">Checked {COMPETITORS[0].checked}. Sources on each comparison page.</p>
          </Container>
        </section>
      )}

      <FaqSection faqs={PRICING_FAQS} title="Pricing questions" />
      <CtaBand title="Try every feature for 14 days." />
    </MarketingLayout>
  );
}
