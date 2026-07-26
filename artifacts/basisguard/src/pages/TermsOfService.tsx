import { useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft, ShieldCheck } from "lucide-react";

const sections = [
  ["1. Acceptance of Terms", <p key="accept">By creating an account or using BasisGuard (the &quot;Service&quot;), you agree to these Terms of Service (&quot;Terms&quot;). If you&apos;re using the Service on behalf of a firm or organization, you&apos;re agreeing on its behalf, and &quot;you&quot; refers to both you and that organization.</p>],
  ["2. What BasisGuard Is — and Is Not", <><p key="what">BasisGuard is a <strong>workflow and evidence management tool</strong> for cryptocurrency tax compliance. It helps you classify transactions, track cost basis and holding periods, cite relevant IRS authority, and generate documentation.</p><p key="not" className="mt-4"><strong>BasisGuard is not a law firm, accounting firm, or tax preparer, and using it does not create an attorney-client, CPA-client, or tax-preparer relationship between you and the Company.</strong> The Service does not file tax returns, does not provide personalized tax or legal advice, and every position it generates should be reviewed by a qualified, licensed tax professional before you rely on it. A confidence tier or suggested citation is a computational suggestion grounded in cited authority — not a legal opinion or a guarantee that any specific tax position will be accepted by the IRS or any other authority.</p><p key="responsibility" className="mt-4">You are solely responsible for the accuracy and completeness of your own tax filings, regardless of what the Service classifies, suggests, or exports.</p></>],
  ["3. Accounts and Eligibility", <><p key="eligibility">You must be at least 18 years old and capable of forming a binding contract to use the Service. You&apos;re responsible for maintaining the confidentiality of your account credentials and for all activity under your account. Notify us promptly at <strong>basisguard@ssdfinc.xyz</strong> if you suspect unauthorized access.</p><p key="credential" className="mt-4">If you&apos;re a reviewer or preparer (a <code>reviewer</code> or <code>super_admin</code> role), you represent that any professional credential you enter is accurate and that you are authorized to use it, and that any sign-off you provide reflects your own genuine professional review.</p></>],
  ["4. Exchange Connections and Third-Party Credentials", <><p key="intro">You may connect third-party exchange accounts (Coinbase, Kraken, Gemini) by providing API credentials. By doing so, you represent that:</p><ul key="list" className="mt-3 list-disc space-y-2 pl-5"><li>You are authorized to provide these credentials and permit BasisGuard to access the associated transaction history.</li><li>You have granted only the minimum permissions necessary (read-level access).</li><li>You understand that BasisGuard connects to third-party APIs on your behalf, and BasisGuard is not responsible for the availability, accuracy, or conduct of any third-party exchange.</li></ul><p key="disconnect" className="mt-4">You may disconnect an exchange and revoke stored credentials at any time.</p></>],
  ["5. Acceptable Use", <><p key="agree">You agree not to:</p><ul key="list" className="mt-3 list-disc space-y-2 pl-5"><li>Use the Service to store, classify, or process data you&apos;re not authorized to access.</li><li>Attempt to circumvent role-based access controls or access data outside your authorized role.</li><li>Use the Service to generate documentation you know to be false or misleading, or knowingly misrepresent a tax position&apos;s confidence tier or supporting authority.</li><li>Interfere with the Service&apos;s operation, security, or availability, including through excessive automated requests.</li></ul></>],
  ["6. Disclaimers", <><p key="all"><strong>THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE,&quot; WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT.</strong></p><ul key="list" className="mt-4 list-disc space-y-2 pl-5"><li>Tax classifications, confidence tiers, and cited authorities reflect the Service&apos;s best available analysis at the time generated and may not reflect subsequent IRS guidance, court decisions, or legislative changes.</li><li>Price data sourced from third-party providers may be delayed, unavailable, or inaccurate. Where price data is unavailable, affected calculations will be flagged rather than silently defaulted.</li><li>Open-gap classifications require human review because they are unsettled; suggested treatment is not a representation that the IRS will agree with it.</li><li>The Service&apos;s uptime, availability, and third-party integrations may be interrupted by factors outside our control.</li></ul></>],
  ["7. Limitation of Liability", <><p key="florida">Under Florida law, limitation of liability clauses between commercial parties are generally enforceable when clear, mutual, reasonable, and not an attempt to eliminate liability entirely. This clause does not waive liability for fraud, intentional misrepresentation, or violations of consumer-protection law that cannot be limited by contract.</p><p key="limit" className="mt-4">To the maximum extent permitted by law: the Company&apos;s total liability arising out of or relating to the Service will not exceed the greater of (a) the total fees you paid the Company in the twelve months immediately preceding the claim, or (b) one hundred U.S. dollars ($100). The Company is not liable for indirect, incidental, consequential, or punitive damages, including tax penalties, interest, audit costs, or lost profits, arising from your use of or reliance on the Service.</p></>],
  ["8. Fees and Payment", <><p key="pricing">BasisGuard is offered on a subscription basis with the following tiers:</p><ul key="tiers" className="mt-3 list-disc space-y-2 pl-5"><li><strong>Free</strong> — no charge; subject to usage limits described at sign-up.</li><li><strong>Pro</strong> — $49 / month or $399 / year (billed annually).</li><li><strong>Firm</strong> — $149 / month or $1,299 / year (billed annually).</li><li><strong>Enterprise</strong> — custom pricing; contact <strong>basisguard@ssdfinc.xyz</strong> for a quote.</li></ul><p key="payment" className="mt-4">Payments are accepted in USDC via Coinbase Commerce. If you pay via cryptocurrency, you are solely responsible for any tax consequences of that payment. All fees are stated in USD-equivalent at the time of checkout. Fees are non-refundable except as required by applicable law or as separately stated in a specific written offer.</p><p key="changes" className="mt-4">We may update subscription pricing with at least 30 days&apos; advance notice to active subscribers. Price changes take effect at your next renewal date; continued use after that date constitutes acceptance of the new pricing.</p></>],
  ["9. Intellectual Property", <p key="ip">The Service, including its software, design, and the confidence-tier methodology, is owned by the Company and licensed to you for your use of the Service, not sold. Your own transaction data and the positions generated from it remain yours; we do not claim ownership of your financial data.</p>],
  ["10. Data and Privacy", <p key="privacy">Our collection and use of your information is governed by our <Link href="/privacy" className="text-white underline underline-offset-4">Privacy Policy</Link>, incorporated into these Terms by reference.</p>],
  ["11. Termination", <p key="termination">You may stop using the Service and disconnect your account at any time. We may suspend or terminate accounts that violate these Terms, including the Acceptable Use provisions in Section 5. Upon termination, Section 6 (Disclaimers), Section 7 (Limitation of Liability), and any accrued payment obligations survive.</p>],
  ["12. Changes to the Service or Terms", <p key="changes">We may update these Terms as the Service evolves. Material changes will be communicated in advance where practicable. Continued use after a change takes effect constitutes acceptance.</p>],
  ["13. Governing Law and Disputes", <p key="law">These Terms are governed by the laws of the State of Florida, without regard to conflict-of-law principles. Any dispute not otherwise resolved will be brought in the state or federal courts located in Florida, and you consent to personal jurisdiction there. <strong>[Decide before publishing: whether to require arbitration instead of litigation, and which specific county/venue within Florida.]</strong></p>],
  ["14. Contact", <p key="contact"><strong>SSDF Inc.</strong><br /><strong>1945 NW 86th St, Miami, FL 33147</strong><br /><strong>basisguard@ssdfinc.xyz</strong></p>],
] as const;

export default function TermsOfServicePage() {
  useEffect(() => {
    document.title = "Terms of Service | BasisGuard";
  }, []);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-300">
      <div className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-16">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-zinc-500 transition-colors hover:text-zinc-200">
          <ArrowLeft className="h-4 w-4" /> Back to BasisGuard
        </Link>
        <header className="mt-12 border-b border-zinc-800 pb-10">
          <div className="flex items-center gap-3 text-zinc-100">
            <ShieldCheck className="h-7 w-7" strokeWidth={1.5} />
            <span className="font-mono text-xs uppercase tracking-[0.25em] text-zinc-500">BasisGuard</span>
          </div>
          <h1 className="mt-6 font-serif text-4xl text-white sm:text-5xl">Terms of Service</h1>
          <p className="mt-4 text-sm text-zinc-500">Last updated: July 25, 2026</p>
          <div className="mt-6 rounded border border-amber-900/60 bg-amber-950/20 px-4 py-3 text-sm leading-6 text-amber-200/80">
            Draft prepared for legal review. This document is not a substitute for review by a
            licensed attorney, particularly Sections 4, 6, and 9.
          </div>
          <p className="mt-6 leading-7">
            These Terms govern your use of BasisGuard, a workflow and evidence management tool for
            cryptocurrency tax compliance.
          </p>
        </header>
        <div className="divide-y divide-zinc-800/80">
          {sections.map(([title, body]) => (
            <section key={title} className="py-8">
              <h2 className="font-serif text-2xl text-white">{title}</h2>
              <div className="mt-4 leading-7 text-zinc-400">{body}</div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}