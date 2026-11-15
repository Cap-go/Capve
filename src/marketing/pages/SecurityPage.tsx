import { Link } from "react-router-dom";
import { GITHUB_REPO_URL } from "../../lib/constants";
import { CardGrid, Container, CtaBand, PageHero, SectionHeading } from "../blocks";
import { SUPPORT_EMAIL } from "../content/pages";
import type { Card } from "../content/types";
import { MarketingLayout } from "../Layout";

const PRACTICES: Array<{ title: string; items: string[] }> = [
  {
    title: "Accounts and sessions",
    items: [
      "Passwords are hashed with PBKDF2-SHA-256 and a random salt per password.",
      "Sessions are signed, HttpOnly, SameSite=Lax cookies, sent only over HTTPS in production.",
      "New accounts verify their email. Team invites and admin rights only apply to verified emails.",
      "Password reset and \"sign out everywhere\" revoke every existing session.",
      "Sign-in, registration and password reset are rate limited per IP address and per email.",
    ],
  },
  {
    title: "Access control",
    items: [
      "Owner, admin and viewer roles are checked on every request, not only when you sign in.",
      "The account you're working in is a signed context bound to your user, and stale requests are rejected after a switch.",
      "API tokens are shown once and stored as hashes. A token can't create tokens, and token management needs a browser session.",
      "Support access to a personal account is limited to verified platform admins, lasts at most one hour, shows a banner, and is written to the audit log.",
      "Changes made in the dashboard and with API tokens are recorded in the account's activity log.",
    ],
  },
  {
    title: "Tracking safety",
    items: [
      "Links only redirect to destinations, offers and landers you configured. Capve never acts as an open redirect.",
      "Each account has a postback key. Without it, payouts are capped to the offer payout, and you can reject keyless postbacks outright.",
      "Postback and webhook URLs must be http or https.",
      "Custom tracking domains serve only tracking paths. Everything else on them returns 404.",
      "Third-party API keys for cost sync are encrypted at rest with AES-GCM.",
    ],
  },
  {
    title: "Data handling",
    items: [
      "Capve runs on Cloudflare Workers and D1, served over HTTPS.",
      "We process tracking data only to provide the service. We don't sell it or use it for advertising.",
      "The outgoing postback delivery log is deleted after 30 days.",
      "Payment cards are handled by Stripe. Capve never sees card numbers.",
    ],
  },
];

const HIGHLIGHTS: Card[] = [
  { icon: "code", title: "Open code", body: "The source is public, so you can read exactly how your data is handled." },
  { icon: "lock", title: "Hashed secrets", body: "Passwords and API tokens are stored as hashes, never in plain text." },
  { icon: "admin", title: "No open redirects", body: "Links only go where you told them to." },
  { icon: "page", title: "Audit log", body: "Changes, token actions and support access are recorded." },
];

const PROCESSORS = [
  { name: "Cloudflare, Inc.", purpose: "Hosting, database, edge network and email delivery" },
  { name: "Stripe, Inc.", purpose: "Subscriptions and payments (no click logs)" },
  { name: "Bento (Bentonow)", purpose: "Transactional email to account holders, when enabled (no click logs)" },
  { name: "DataFast", purpose: "Website analytics on capve.app (no click logs)" },
];

export function SecurityPage() {
  return (
    <MarketingLayout>
      <PageHero
        crumbs={[{ label: "Home", href: "/" }, { label: "Security" }]}
        eyebrow="Security"
        lead="Your tracker sees your revenue, your sources and your partners. Here is how Capve protects them, in plain words you can check against the source."
        title="Security at Capve."
      >
        <div className="flex flex-wrap gap-3">
          <a className="btn btn-primary mk-btn-lg" href={`mailto:${SUPPORT_EMAIL}?subject=Security`}>
            Report a security issue
          </a>
          <a className="btn btn-secondary mk-btn-lg" href={GITHUB_REPO_URL} rel="noreferrer" target="_blank">
            Read the source
          </a>
        </div>
      </PageHero>
      <section className="pb-16">
        <Container>
          <CardGrid cards={HIGHLIGHTS} />
        </Container>
      </section>
      <section className="border-y border-[var(--velo-border)] bg-white py-16 sm:py-20">
        <Container className="grid gap-12 md:grid-cols-2">
          {PRACTICES.map((group) => (
            <div key={group.title}>
              <h2 className="text-2xl font-semibold tracking-tight">{group.title}</h2>
              <ul className="mt-5 space-y-3 text-[15px] leading-relaxed text-[#3d3d3b]">
                {group.items.map((item) => (
                  <li className="mk-check" key={item}>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Container>
      </section>
      <section className="py-16 sm:py-20">
        <Container className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <SectionHeading
            kicker="Processors"
            lead="The service providers that process data for the hosted service. The Privacy Policy lists what each receives."
            title="Who else handles data."
          />
          <div className="overflow-x-auto rounded-2xl border border-[var(--velo-border)] bg-white">
            <table className="mk-table">
              <thead>
                <tr>
                  <th scope="col">Provider</th>
                  <th scope="col">Purpose</th>
                </tr>
              </thead>
              <tbody>
                {PROCESSORS.map((processor) => (
                  <tr key={processor.name}>
                    <th scope="row">{processor.name}</th>
                    <td>{processor.purpose}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Container>
      </section>
      <section className="pb-16 sm:pb-20">
        <Container className="mk-prose max-w-3xl">
          <h2 className="text-2xl font-semibold tracking-tight text-[var(--velo-ink)]">Reporting a vulnerability</h2>
          <p className="mt-4">
            Email <a href={`mailto:${SUPPORT_EMAIL}?subject=Security`}>{SUPPORT_EMAIL}</a> with the subject
            "Security", the steps to reproduce, and the impact you see. Please give us reasonable time to fix
            the issue before you disclose it, and don't access other customers' data or degrade the service
            while testing.
          </p>
          <p className="mt-4">
            Processing terms for customer data are in section 6 of the <Link to="/terms#processing">Terms of Service</Link>.
            Personal data handling is described in the <Link to="/privacy">Privacy Policy</Link>.
          </p>
        </Container>
      </section>
      <CtaBand />
    </MarketingLayout>
  );
}
