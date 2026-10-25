import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { PLANS } from "../../shared/billing";
import { Shell } from "../components/ui";

const UPDATED = "October 25, 2026";
const SUPPORT_EMAIL = "support@capgo.app";

const COMPANY = {
  name: "CodepushGo, LLC",
  address: "131 Continental Dr, Suite 305, Newark, DE 19713, United States",
  phone: "+17759865200",
};

function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} · Capve`;
    return () => {
      document.title = previous;
    };
  }, [title]);

  return (
    <Shell
      cta={
        <>
          <Link className="btn btn-ghost" to="/docs">
            Docs
          </Link>
          <Link className="btn btn-primary" to="/register">
            Start free trial
          </Link>
        </>
      }
    >
      <article className="docs-prose mx-auto max-w-3xl px-6 pb-4 pt-8">
        <h1>{title}</h1>
        <p>Last updated {UPDATED}.</p>
        {children}
      </article>
    </Shell>
  );
}

function Mail() {
  return (
    <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
  );
}

export function ImprintPage() {
  return (
    <LegalLayout title="Imprint">
      <h2>Website operator</h2>
      <p>
        <strong>{COMPANY.name}</strong>
        <br />
        US limited liability company
        <br />
        Business address: {COMPANY.address}
      </p>

      <h2>Contact</h2>
      <p>
        For questions about Capve, your account, billing, or this website, email <Mail />.
        Telephone: <a href={`tel:${COMPANY.phone}`}>{COMPANY.phone}</a>.
      </p>

      <h2>Hosted service</h2>
      <p>
        This imprint applies to the hosted Capve service at capve.app. Capve provides campaign and
        affiliate tracking and analytics. If you run your own copy of the open-source software, you
        are responsible for that installation and its legal notices.
      </p>

      <h2>Privacy and terms</h2>
      <p>
        Our <Link to="/privacy">Privacy Policy</Link> explains how we handle personal data. Our{" "}
        <Link to="/terms">Terms of Service</Link> describe the hosted service, subscriptions, and
        your responsibilities.
      </p>
    </LegalLayout>
  );
}

export function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy">
      <p>
        This policy explains how {COMPANY.name} ("Capve", "we") handles personal data when you use
        the hosted Capve service at capve.app. {COMPANY.name} is a US limited liability company at {COMPANY.address}.
      </p>
      <p>
        Capve is a campaign and affiliate analytics service. It records clicks and conversions,
        attributes them to campaigns, and shows reports. If you run your own copy of the Capve
        software, you are the operator of that copy. This policy applies only to the service we host.
      </p>

      <h2>1. Two roles</h2>
      <p>We play two different parts, and the difference matters.</p>
      <ul>
        <li>
          <strong>Account data.</strong> When you create an account, pay us, or write to support, we
          decide why and how that data is used. Under the GDPR we are the controller.
        </li>
        <li>
          <strong>Tracking data.</strong> Clicks, conversions, and the identifiers that come with
          them are collected for your campaigns. You decide the purposes and the means. You are the
          controller. We process that data on your instructions to provide the service. The{" "}
          <Link to="/terms">Terms of Service</Link> are those instructions.
        </li>
      </ul>
      <p>
        You need your own legal basis, and your own notice, for the people who click your tracking
        links or whose conversions you send us.
      </p>

      <h2>2. Account data we collect</h2>
      <p>When you use the dashboard, API, or MCP server, we collect:</p>
      <ul>
        <li>Name, email address, and a password, stored only as a hash.</li>
        <li>Account, team, and invite records, including each member's role.</li>
        <li>
          Session cookies that keep you signed in, and a cookie that remembers which account you are
          viewing.
        </li>
        <li>API and MCP tokens. We store a hash of the token. The token itself is shown once.</li>
        <li>
          Billing records: the plan you chose, trial dates, subscription status, and a Stripe
          customer id. Stripe collects and stores payment card numbers. We do not.
        </li>
        <li>
          Campaigns, offers, landers, routing rules, postback URLs, traffic-source settings, and
          other configuration you save.
        </li>
        <li>
          Security and audit logs, such as sign-in events, team changes, and actions taken with an
          API token.
        </li>
        <li>Messages you send us, and the transactional email we send you.</li>
      </ul>

      <h2>3. Tracking data we process for you</h2>
      <p>
        When someone opens a Capve tracking link, or when your server reports a conversion, the
        service stores the data needed to redirect, attribute, and report. That can include:
      </p>
      <ul>
        <li>IP address and user agent.</li>
        <li>
          Device type, operating system, and browser, read from the user agent, and a flag when the
          request looks like a bot.
        </li>
        <li>
          Approximate location and network data the edge network provides, such as country, region,
          city, and ISP.
        </li>
        <li>Referring domain, click time, and the campaign, path, lander, and offer that was served.</li>
        <li>
          Click identifiers and parameters on the link, including values you map into sub parameters,
          an external click id, and a cost if the link includes one.
        </li>
        <li>
          A random visitor id in a first-party cookie, and a hash of the IP address and user agent,
          used to count unique clicks on a campaign.
        </li>
        <li>
          Conversion details you or a network send, such as an order id, amount, currency, status,
          and the click they belong to.
        </li>
      </ul>
      <p>
        The optional browser snippet stores <code>click_id</code> and <code>velo_ref</code> in{" "}
        <code>localStorage</code> on your site. It does not send a request to Capve from the browser.
      </p>
      <p>
        We do not sell tracking data. We do not use it to advertise to those visitors, and we do not
        combine it across Capve customers to build advertising profiles.
      </p>

      <h2>4. Cookies</h2>
      <ul>
        <li>
          <code>capve_session</code> keeps you signed in. It is HttpOnly, lasts 30 days, and is
          renewed when you sign in.
        </li>
        <li>
          <code>capve_account_context</code> remembers the account you are working in. It is also
          HttpOnly.
        </li>
        <li>
          <code>_capve_vid</code> is a random visitor id set on a tracking request. It lasts one year.
          It is not an advertising id.
        </li>
        <li>
          <code>_velo_ref</code> stores the affiliate code from a tracking link for 30 days so a later
          conversion on that browser can be tied back to the click.
        </li>
      </ul>
      <p>
        Session cookies are required to use the dashboard. Tracking cookies are part of attribution.
        If a browser blocks them, some clicks will not be tied to a later visit.
      </p>

      <h2>5. Why we use account data</h2>
      <ul>
        <li>To create and run your account, team, campaigns, and reports.</li>
        <li>To take payment, apply the trial, and enforce the plan's click allowance.</li>
        <li>To send service email: verification, password reset, invites, and billing notices.</li>
        <li>To secure the service, investigate abuse, and keep audit logs.</li>
        <li>To answer support requests.</li>
        <li>To meet tax, accounting, and other legal duties.</li>
      </ul>
      <p>
        The legal bases are performance of our contract with you, our legitimate interest in keeping
        the service secure and reliable, and legal obligation where a law requires us to keep a
        record. We do not send marketing mail as part of the service.
      </p>

      <h2>6. How long we keep it</h2>
      <ul>
        <li>
          Account data is kept while the account is open, and then for as long as we need it to
          finish deletion, resolve a dispute, or meet a legal hold.
        </li>
        <li>
          Billing records are kept for as long as applicable tax and accounting laws require.
        </li>
        <li>
          Click and conversion records are kept for the life of the account. If we set a shorter
          retention window for raw clicks, clicks older than that window that have no conversion are
          deleted. Converted clicks stay with the conversion.
        </li>
        <li>The log of outgoing postback deliveries is deleted after 30 days.</li>
        <li>
          When you email us to close an account, we delete or anonymize the account and its tracking
          data within 30 days, except records we must keep and residual copies in backups, which age
          out on their normal cycle.
        </li>
      </ul>

      <h2>7. Who else receives data</h2>
      <p>We use these processors to run the hosted service:</p>
      <ul>
        <li>Cloudflare, Inc., for hosting, the database, the edge network, and email delivery.</li>
        <li>Stripe, Inc., for subscriptions and payment methods. Stripe does not receive click logs.</li>
        <li>
          Bento (Bentonow), when enabled, for transactional email to you. Bento does not receive click
          logs.
        </li>
      </ul>
      <p>
        We also send data when you tell us to. An outgoing postback sends the fields you put in that
        URL, such as a click id or payout, to the host you named. Team members see the account data
        their role allows.
      </p>
      <p>
        We disclose data if the law, a court, or a competent authority requires it, or if disclosure
        is needed to investigate abuse or to protect the rights, safety, and security of Capve, our
        customers, or the public.
      </p>
      <p>
        If we sell or reorganize the business, account data may transfer to the buyer. We will post
        notice before a different privacy policy applies. Tracking data transfers only as part of
        providing the service, or as you instruct.
      </p>

      <h2>8. International transfers</h2>
      <p>
        We are a US company. Cloudflare processes requests on a global edge network, so
        personal data may be processed outside the European Economic Area. Where the law requires a
        transfer tool, we use one the European Commission has approved, such as its standard
        contractual clauses, or we rely on an adequacy decision that covers the recipient.
      </p>

      <h2>9. Your rights</h2>
      <p>
        If you are in the EEA, the United Kingdom, or Switzerland, you can ask us to access, correct,
        delete, or restrict your account data, to object to processing based on legitimate interest,
        and to receive a portable copy. You can also complain to the competent data protection
        authority where you live or work, or where an alleged infringement occurred.
      </p>
      <p>
        For tracking data, the controller is the Capve customer who ran the campaign. Direct requests
        about a click or conversion to that customer. If you ask us, and we can identify the customer,
        we will pass the request on.
      </p>
      <p>
        California residents can ask us to know, correct, or delete the personal information we hold
        as a business, and to opt out of sale or sharing. We do not sell personal information, and we
        do not share it for cross-context behavioral advertising. We do not discriminate against you
        for exercising these rights. You may use an authorized agent if you can show the agent has
        permission to act for you.
      </p>
      <p>
        Email <Mail /> to use any of these rights. We may need to confirm that you control the
        account. We reply within the time the applicable law allows.
      </p>

      <h2>10. Children</h2>
      <p>
        Capve is a business service. You must be at least 18 to open an account. We do not knowingly
        collect account data from anyone under 18. If you believe we have, email <Mail /> and we will
        delete it.
      </p>

      <h2>11. Security</h2>
      <p>
        We protect the service with HTTPS, hashed passwords, hashed API tokens, signed HttpOnly
        session cookies, and access controls between accounts. No hosting method is perfectly secure.
        If we learn of a breach that the law requires us to announce, we will notify the affected
        customers and, where required, the supervisory authority.
      </p>

      <h2>12. Changes</h2>
      <p>
        We will post changes on this page and update the date above. If a change materially reduces
        your rights, we will also email the account owner before it takes effect.
      </p>

      <h2>13. Contact</h2>
      <p>
        {COMPANY.name}, {COMPANY.address}. Email <Mail />.
      </p>
    </LegalLayout>
  );
}

export function TermsPage() {
  return (
    <LegalLayout title="Terms of Service">
      <p>
        These terms are a contract between you and {COMPANY.name} ("Capve", "we") for the hosted
        Capve service at capve.app. {COMPANY.name} is a US limited liability company at {COMPANY.address}.
      </p>
      <p>
        By creating an account, or by using the service after these terms are shown to you, you agree
        to these terms and to the <Link to="/privacy">Privacy Policy</Link>. If you use Capve for a
        company or other organization, you confirm that you can bind it, and "you" means that
        organization.
      </p>
      <p>
        These terms cover the service we host. They are not a license to the Capve source code. The
        source is published separately, and publishing it does not include hosting, support, or an
        uptime promise.
      </p>

      <h2>1. The service</h2>
      <p>
        Capve records clicks and conversions, attributes them to campaigns and affiliates, and gives
        you reports, routing, postbacks, an HTTP API, and an MCP server. We may change, add, or
        remove features. We will not remove the core tracking and reporting functions during a paid
        period without a replacement or a pro-rata refund of that period.
      </p>
      <p>
        Tracking depends on browsers, networks, and the destinations you configure. A click can be
        lost when a browser blocks cookies, a network rewrites the link, or a destination drops the
        parameters we append. Reports describe what the service recorded. They are not a guarantee
        that every visit or sale in the outside world was captured.
      </p>

      <h2>2. Accounts</h2>
      <p>
        You must be at least 18. You will give us a working email address and keep your password,
        team invites, and API tokens safe. Tokens act as the user who created them. You are
        responsible for activity under your account, including activity by your team and by anyone
        who uses a token or a password you control.
      </p>
      <p>
        Tell us promptly at <Mail /> if you believe the account is being used without permission. We
        may suspend an account that we reasonably believe is compromised, and we will tell you when
        we do.
      </p>

      <h2>3. Your campaigns and tracking data</h2>
      <p>
        You keep ownership of the configuration, click logs, conversion records, and other content
        you submit ("Customer Content"). You give us a worldwide license to host, copy, and process
        Customer Content only as needed to provide, secure, and support the service.
      </p>
      <p>You confirm that:</p>
      <ul>
        <li>
          You have a lawful basis to collect and send the personal data in your tracking links and
          conversion calls, and you present any notice or consent the law requires.
        </li>
        <li>
          You will not send special-category data, payment card numbers, or government identity
          numbers through click parameters or conversion payloads.
        </li>
        <li>
          Your offers, landing pages, and traffic sources comply with the laws of the places you
          target, including advertising and gambling rules.
        </li>
        <li>You have the rights you need in any destination URL, creative, or name you upload.</li>
      </ul>

      <h2>4. Acceptable use</h2>
      <p>You will not, and you will not allow anyone else to:</p>
      <ul>
        <li>Break the law, or run a campaign whose traffic, offer, or destination breaks the law.</li>
        <li>Distribute malware, operate a phishing page, or send the service traffic you do not have a right to redirect.</li>
        <li>Probe, scan, or overload the service, or attempt to reach another customer's data.</li>
        <li>Bypass plan limits, share one account as a substitute for separate paid accounts, or resell the hosted service.</li>
        <li>Use the service to build a competing hosted tracker by copying non-public parts of the service. The public source repository is governed by its own license.</li>
        <li>Misrepresent Capve as the sender of your offers, or use our name or logo except to say that you use the service.</li>
      </ul>
      <p>
        We may remove content or suspend access when we reasonably believe you have broken this
        section, or when we must do so to meet the law. Where we can do it safely, we will tell you
        the reason and give you a chance to fix it first.
      </p>

      <h2>5. Trial, plans, and payment</h2>
      <p>
        A new account includes a 14-day trial. The trial does not require a card. During the trial
        you get the click allowance of the plan you selected at signup.
      </p>
      <ul>
        {PLANS.map((plan) => (
          <li key={plan.id}>
            <strong>{plan.name}.</strong> USD {(plan.monthlyCents / 100).toFixed(2)} per month, up to{" "}
            {plan.clicks.toLocaleString("en-US")} recorded clicks in each UTC calendar month.
          </li>
        ))}
      </ul>
      <p>
        Every recorded click counts, including bots, across the campaigns on the account. The
        allowance resets on the first day of each UTC month. It does not roll over. There is no
        overage charge. When the allowance is used up, or when the trial has ended and there is no
        active subscription, reports, raw logs, and CSV exports stop. Redirects, landing-page clicks,
        postbacks, and the conversion API keep running. Reports return when the allowance resets, or
        when an upgrade is confirmed, whichever comes first.
      </p>
      <p>
        Paid plans are billed monthly in US dollars through Stripe. Prices exclude taxes. Where a tax
        must be added, it is added at checkout. Only a verified owner of the account can start
        checkout or open the billing portal. Team members use the owner's plan and allowance.
      </p>
      <p>
        An upgrade takes effect when Stripe confirms it, with proration. You can cancel in the
        billing portal. Cancellation takes effect at the end of the period you already paid for, and
        you keep paid access until then. If a payment fails and the subscription is no longer active,
        report access follows the same rule as an ended trial.
      </p>
      <p>
        Fees are charged in advance and are not refundable, except where the law requires a refund,
        where we shut the service down under section 8, or where we remove a core function under
        section 1. The trial is the period for deciding whether the service fits.
      </p>
      <p>
        We may change prices or allowances. We will email the account owner at least 30 days before a
        change applies. The change applies on the next renewal after that notice. You can cancel
        before the renewal if you do not accept it.
      </p>

      <h2>6. Processing tracking data</h2>
      <p>
        For personal data in Customer Content, you are the controller and we are the processor. We
        process it only to provide the service, on the configuration and API calls you make, which are
        your instructions. We will not process it for our own advertising.
      </p>
      <ul>
        <li>People who handle it are bound to keep it confidential.</li>
        <li>
          We apply the security measures described in the Privacy Policy. You are responsible for
          securing your own destinations, secrets, and tokens.
        </li>
        <li>
          We use the subprocessors listed in the Privacy Policy. We will update that list before we
          add a subprocessor that handles tracking data. If you object on reasonable data-protection
          grounds, your remedy is to stop using the service and close the account.
        </li>
        <li>
          We will tell you without undue delay after we confirm a personal-data breach that affects
          your Customer Content.
        </li>
        <li>
          We will help you answer a data-subject request or a regulator, to the extent you cannot do
          it from the dashboard. If a request is unusual in volume, we may charge a reasonable fee or
          refuse it where the law allows.
        </li>
        <li>
          On closure, we delete Customer Content as described in the Privacy Policy. We may keep
          copies the law requires, and residual backup copies until they expire.
        </li>
        <li>
          Where tracking data is transferred outside the EEA, the transfer terms in the Privacy Policy
          apply.
        </li>
      </ul>
      <p>
        This section and the Privacy Policy are the processing terms for the service. They stay in
        force for as long as we process Customer Content.
      </p>

      <h2>7. Our intellectual property</h2>
      <p>
        We own the hosted service, the Capve name and logo, and the look of the site. We grant you a
        limited, non-exclusive, non-transferable right to use the hosted service during these terms.
        You may not copy the hosted service, frame it, or offer it as your own product. Feedback you
        choose to send us may be used to improve the service, with no duty to pay you for it.
      </p>

      <h2>8. Suspension and ending the contract</h2>
      <p>
        You may stop using Capve at any time and cancel a paid plan as described above. Email{" "}
        <Mail /> to close the account.
      </p>
      <p>
        We may suspend or close an account that does not pay, that breaks these terms, or that
        creates a risk we reasonably believe we cannot carry. We may also stop offering the hosted
        service. If we stop the service for our own convenience, and not because you broke these
        terms, we will give 30 days' notice where we can, and we will refund prepaid fees for the
        unused part of the current period.
      </p>

      <h2>9. Warranties and liability</h2>
      <p>
        The service is provided as it is. Except where the law says otherwise, we disclaim implied
        warranties of merchantability, fitness for a particular purpose, and non-infringement. We do
        not warrant uninterrupted or error-free operation, or that reports will match a network's own
        numbers.
      </p>
      <p>
        To the maximum extent the law allows, neither party is liable for lost profits, lost revenue,
        lost data, or indirect or consequential damages, even if advised they were possible. Our total
        liability arising out of the service in any 12-month period is limited to the fees you paid us
        for the service in that period. If you are still on the trial and have paid nothing, that cap
        is EUR 100.
      </p>
      <p>
        These limits do not apply to liability that cannot be limited under the law that governs these
        terms, including liability for fraud, or for death or personal injury caused by negligence.
        They also do not apply to your obligation to pay fees, or to your indemnity in section 10.
      </p>

      <h2>10. Indemnity</h2>
      <p>
        You will defend us and our directors and staff against a third-party claim that your Customer
        Content, your campaigns, or your use of the service in breach of these terms infringes that
        person's rights or breaks the law, and you will pay the damages and reasonable costs that
        result. We will tell you of the claim promptly, give you control of the defense, and help you
        at your expense. We may join with our own counsel at our expense.
      </p>

      <h2>11. Other terms</h2>
      <p>
        These terms and the Privacy Policy are the whole agreement for the hosted service. A purchase
        order or vendor form does not change them. If a court holds one provision unenforceable, the
        rest stays in force. Waiting to enforce a provision is not a waiver.
      </p>
      <p>
        You may not assign these terms without our consent, except to a successor of your whole
        business. We may assign them to an affiliate or to a successor of the Capve business.
      </p>
      <p>
        You will not use the service if you are barred by export-control or sanctions laws that apply
        to you or to us. The service is not designed for high-risk uses where a failure could cause
        death or serious injury.
      </p>

      <h2>12. Changes to these terms</h2>
      <p>
        We will post updated terms on this page and change the date above. If a change is material, we
        will email the account owner at least 30 days before it applies. If you keep using the service
        after that date, the updated terms apply. If you do not agree, cancel before that date and
        stop using the service.
      </p>

      <h2>13. Law and disputes</h2>
      <p>
        Applicable law determines the law and courts that apply to a dispute. Nothing in these terms
        takes away mandatory consumer protections or any right to bring a claim in a court that
        applicable law gives you.
      </p>

      <h2>14. Contact</h2>
      <p>
        {COMPANY.name}, {COMPANY.address}. Email <Mail />.
      </p>
    </LegalLayout>
  );
}
