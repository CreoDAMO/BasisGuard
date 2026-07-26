import { useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft, ShieldCheck } from "lucide-react";

const sections = [
  {
    title: "1. Who We Are",
    body: (
      <p>
        BasisGuard is operated by <strong>SSDF Inc.</strong>, a Florida
        corporation ("Company," "we," "us"). Contact:{" "}
        <strong>basisguard@ssdfinc.xyz</strong>.
      </p>
    ),
  },
  {
    title: "2. Information We Collect",
    body: (
      <div className="space-y-5">
        <div>
          <h3 className="mb-2 font-medium text-zinc-200">2.1 Account Information</h3>
          <p>
            When you create an account (via Clerk), we receive your email address, and you may
            provide a display name and professional credential (e.g., CPA, EA license designation)
            if you use the platform as a reviewer or preparer. Your account is assigned a role
            (<code>cpa_partner</code>, <code>reviewer</code>, or <code>super_admin</code>) that
            determines what actions you can perform.
          </p>
        </div>
        <div>
          <h3 className="mb-2 font-medium text-zinc-200">2.2 Exchange API Credentials</h3>
          <p>
            If you connect a cryptocurrency exchange account (Coinbase, Kraken, or Gemini), you
            provide API credentials — an API key and either a secret, a private key, or both,
            depending on the exchange. These credentials are encrypted at rest using AES-256-GCM
            before storage. We do not display your secret key or private key back to you after you
            save it, and it is never written to application logs.
          </p>
          <p className="mt-3">
            <strong>What these credentials can and cannot do:</strong> the credentials you provide
            are used only to read your transaction history for tax classification purposes.
            BasisGuard does not request or use trading, withdrawal, or transfer permissions, and
            you should only grant read-level (or the exchange&apos;s equivalent minimum)
            permissions when creating the API key.
          </p>
        </div>
        <div>
          <h3 className="mb-2 font-medium text-zinc-200">2.3 Financial and Transaction Data</h3>
          <p>Once you connect an exchange or manually enter data, we store:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Raw transaction records (transaction hashes, wallet addresses, amounts, timestamps, and asset types)</li>
            <li>Classified tax positions (event type, tax treatment, cited authority, confidence tier, and rationale)</li>
            <li>Tax lot records (cost basis, acquisition dates, quantities, and disposal status)</li>
            <li>Reviewer sign-off records (name, professional credential, and timestamp of anyone who formally attests to a position)</li>
          </ul>
          <p className="mt-3">
            This is financial data by its nature. We treat it accordingly — see Section 5
            (Security) below.
          </p>
        </div>
        <div>
          <h3 className="mb-2 font-medium text-zinc-200">2.4 Usage and Notification Data</h3>
          <p>
            We generate and store in-app notifications (e.g., stale position alerts, review queue
            reminders, and sync failures) tied to your account, along with your preferences for
            which categories of notification you want to see.
          </p>
        </div>
        <div>
          <h3 className="mb-2 font-medium text-zinc-200">2.5 Information We Do Not Collect</h3>
          <p>
            We do not collect or request your exchange account password, your exchange account&apos;s
            withdrawal or trading credentials, or documents you have not chosen to upload or connect.
          </p>
        </div>
      </div>
    ),
  },
  {
    title: "3. How We Use Information",
    body: (
      <>
        <p>We use the information above to:</p>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          <li>Authenticate your account and enforce role-based access to the platform</li>
          <li>Retrieve and classify your transaction history for tax compliance purposes</li>
          <li>Generate position records, evidence logs, and exportable reports that you request</li>
          <li>Compute tax lot inventory, unrealized/realized gain-loss figures, and Tax Optimizer simulations</li>
          <li>Notify you of items requiring your attention</li>
          <li>Maintain and improve the security and reliability of the Service</li>
        </ul>
        <p className="mt-4">
          We do not sell your data, and we do not use your financial data to train third-party
          models or for advertising purposes.
        </p>
      </>
    ),
  },
  {
    title: "4. Third Parties We Share Data With",
    body: (
      <>
        <p>
          We rely on the following categories of service providers to operate BasisGuard. Each
          receives only the data necessary to perform its function:
        </p>
        <div className="mt-4 overflow-x-auto rounded border border-zinc-800">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead className="border-b border-zinc-800 text-zinc-300">
              <tr>
                <th className="px-4 py-3 font-medium">Provider category</th>
                <th className="px-4 py-3 font-medium">Example(s)</th>
                <th className="px-4 py-3 font-medium">What they receive</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80">
              <tr><td className="px-4 py-3">Authentication</td><td className="px-4 py-3">Clerk</td><td className="px-4 py-3">Email address and authentication metadata</td></tr>
              <tr><td className="px-4 py-3">Database hosting</td><td className="px-4 py-3">Neon (PostgreSQL)</td><td className="px-4 py-3">Application data described in Section 2, encrypted where noted</td></tr>
              <tr><td className="px-4 py-3">Application hosting</td><td className="px-4 py-3">Render</td><td className="px-4 py-3">Application traffic; no persistent data storage beyond logs</td></tr>
              <tr><td className="px-4 py-3">Price data</td><td className="px-4 py-3">CoinGecko</td><td className="px-4 py-3">Asset symbols and dates only — no personal or account-identifying data</td></tr>
              <tr><td className="px-4 py-3">Exchange connections</td><td className="px-4 py-3">Coinbase, Kraken, Gemini</td><td className="px-4 py-3">Your supplied credentials to pull your own transaction history</td></tr>
            </tbody>
          </table>
        </div>
        <p className="mt-4">
          We do not share your data with data brokers or advertising networks. If this changes, we
          will update this policy and, where required by law, seek your consent first.
        </p>
      </>
    ),
  },
  {
    title: "5. Security",
    body: (
      <ul className="list-disc space-y-2 pl-5">
        <li>Exchange API secrets are encrypted at rest (AES-256-GCM) and are never stored or transmitted in plain text after initial entry.</li>
        <li>Access to citation library edits, chain/protocol onboarding, treatment profile changes, and lot-record mutations is restricted to elevated roles.</li>
        <li>Signed position records are immutable; changes to a signed record require a new superseding record, preserving a complete audit trail.</li>
        <li>
          No security measure is perfect. In the event of a data breach affecting personal
          information, we will notify affected individuals within 30 days of determining a breach
          occurred, consistent with the Florida Information Protection Act (Fla. Stat. § 501.171).
          Encrypted data generally falls within FIPA&apos;s safe harbor, but we will err toward
          notification where there is genuine doubt.
        </li>
      </ul>
    ),
  },
  {
    title: "6. Data Retention",
    body: (
      <>
        <p>
          We retain your data using a tiered strategy designed to align with IRS and Florida
          record-keeping requirements:
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>
            <strong>While your account is active</strong> — all account, transaction, and position
            data is retained in full.
          </li>
          <li>
            <strong>After account closure — 7 years</strong> from the date of closure. This covers
            the IRS's standard three-year assessment window, the six-year window for substantial
            understatements of income (IRC § 6501(e)), and the Florida Department of Revenue's
            parallel audit window, with a one-year buffer.
          </li>
          <li>
            <strong>Exchange API credentials</strong> — deleted within 30 days of disconnection or
            account closure, whichever comes first.
          </li>
          <li>
            <strong>Audit trail records</strong> (signed position records, supersession chains, and
            reviewer attestations) — retained for 7 years post-closure regardless of deletion
            requests, to the extent required by applicable law.
          </li>
        </ul>
        <p className="mt-4">
          You may request deletion of your account and non-required data at any time by contacting{" "}
          <strong>basisguard@ssdfinc.xyz</strong>. We will confirm what we are and are not able to
          delete given any applicable legal holds.
        </p>
      </>
    ),
  },
  {
    title: "7. Your Rights and Choices",
    body: (
      <p>
        Depending on your jurisdiction, you may have the right to access, correct, export, or
        delete your personal information, and to withdraw consent for optional processing. To
        exercise these rights, contact <strong>basisguard@ssdfinc.xyz</strong>. You may
        disconnect an exchange connection and delete its stored credentials at any time from the
        Connections page.
      </p>
    ),
  },
  {
    title: "8. Children&apos;s Privacy",
    body: <p>BasisGuard is not directed at, and is not intended for use by, anyone under 18. We do not knowingly collect information from minors.</p>,
  },
  {
    title: "9. International Users",
    body: <p><strong>[Confirm with counsel: if you have or expect users outside the US, this section needs to address the applicable transfer mechanism — e.g., GDPR adequacy, standard contractual clauses, etc.]</strong></p>,
  },
  {
    title: "10. Changes to This Policy",
    body: <p>We will update this policy as the Service evolves and post the date of the most recent revision at the top of this page. Material changes affecting how we use previously-collected data will be communicated directly, not just posted silently.</p>,
  },
  {
    title: "11. Contact",
    body: <p>Questions about this policy: <strong>basisguard@ssdfinc.xyz</strong><br /><strong>SSDF Inc., 1945 NW 86th St, Miami, FL 33147</strong></p>,
  },
];

export default function PrivacyPolicyPage() {
  useEffect(() => {
    document.title = "Privacy Policy | BasisGuard";
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
          <h1 className="mt-6 font-serif text-4xl text-white sm:text-5xl">Privacy Policy</h1>
          <p className="mt-4 text-sm text-zinc-500">Last updated: July 25, 2026</p>
          <div className="mt-6 rounded border border-amber-900/60 bg-amber-950/20 px-4 py-3 text-sm leading-6 text-amber-200/80">
            Draft prepared for legal review. This document is not a substitute for review by a
            licensed attorney familiar with your jurisdiction and business structure.
          </div>
          <p className="mt-6 leading-7">
            This Privacy Policy describes how BasisGuard (&quot;we,&quot; &quot;us,&quot; &quot;the Service&quot;)
            collects, uses, stores, and protects information when you use the BasisGuard platform.
          </p>
        </header>
        <div className="divide-y divide-zinc-800/80">
          {sections.map((section) => (
            <section key={section.title} className="py-8">
              <h2 className="font-serif text-2xl text-white">{section.title}</h2>
              <div className="mt-4 leading-7 text-zinc-400">{section.body}</div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}