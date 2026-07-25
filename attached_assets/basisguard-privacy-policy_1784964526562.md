# BasisGuard Privacy Policy

**Last updated: [DATE]**

This Privacy Policy describes how BasisGuard ("we," "us," "the Service") collects, uses, stores, and protects information when you use the BasisGuard platform. It's written to reflect what the platform actually does, not a generic template — if you find a mismatch between this document and the product's real behavior, that's a bug in the document, not the product, and should be fixed.

This is a draft prepared for legal review. It is not a substitute for review by a licensed attorney familiar with your jurisdiction and business structure before publication.

---

## 1. Who We Are

BasisGuard is operated by **[ENTITY NAME — e.g., SSDF Inc.]**, a [STATE] corporation ("Company," "we," "us"). Contact: **[PRIVACY CONTACT EMAIL]**.

## 2. Information We Collect

### 2.1 Account Information
When you create an account (via Clerk), we receive your email address, and you may provide a display name and professional credential (e.g., CPA, EA license designation) if you use the platform as a reviewer or preparer. Your account is assigned a role (`cpa_partner`, `reviewer`, or `super_admin`) that determines what actions you can perform.

### 2.2 Exchange API Credentials
If you connect a cryptocurrency exchange account (Coinbase, Kraken, or Gemini), you provide API credentials — an API key and either a secret, a private key, or both, depending on the exchange. These credentials are encrypted at rest using AES-256-GCM before storage. We do not display your secret key or private key back to you after you save it, and it is never written to application logs.

**What these credentials can and cannot do:** the credentials you provide are used only to read your transaction history for tax classification purposes. BasisGuard does not request or use trading, withdrawal, or transfer permissions, and you should only grant read-level (or the exchange's equivalent minimum) permissions when creating the API key.

### 2.3 Financial and Transaction Data
Once you connect an exchange or manually enter data, we store:
- Raw transaction records (transaction hashes, wallet addresses, amounts, timestamps, asset types)
- Classified tax positions (event type, tax treatment, cited authority, confidence tier, your or your reviewer's rationale)
- Tax lot records (cost basis, acquisition dates, quantities, disposal status)
- Reviewer sign-off records (name, professional credential, and timestamp of anyone who formally attests to a position)

This is financial data by its nature. We treat it accordingly — see Section 5 (Security) below.

### 2.4 Usage and Notification Data
We generate and store in-app notifications (e.g., stale position alerts, review queue reminders, sync failures) tied to your account, along with your preferences for which categories of notification you want to see.

### 2.5 Information We Do Not Collect
We do not collect or request your exchange account password, your exchange account's withdrawal or trading credentials, or documents you have not chosen to upload or connect.

## 3. How We Use Information

We use the information above to:
- Authenticate your account and enforce role-based access to the platform
- Retrieve and classify your transaction history for tax compliance purposes
- Generate position records, evidence logs, and exportable reports (audit packages, CPA hand-off summaries, comment-letter aggregates) that you request
- Compute tax lot inventory, unrealized/realized gain-loss figures, and Tax Optimizer simulations
- Notify you of items requiring your attention (stale positions, pending review items, sync failures)
- Maintain and improve the security and reliability of the Service

We do not sell your data, and we do not use your financial data to train third-party models or for advertising purposes.

## 4. Third Parties We Share Data With

We rely on the following categories of service providers to operate BasisGuard. Each receives only the data necessary to perform its function:

| Provider category | Example(s) | What they receive |
|---|---|---|
| Authentication | Clerk | Email address, authentication metadata |
| Database hosting | Neon (PostgreSQL) | All application data described in Section 2, encrypted where noted |
| Application hosting | Render | Application traffic; no persistent data storage beyond logs |
| Price data | CoinGecko | Asset symbols and dates only — no personal or account-identifying data |
| Exchange connections | Coinbase, Kraken, Gemini | We connect *to* these providers using your supplied credentials to pull your own transaction history; we do not send your BasisGuard account data *to* them beyond what's needed to authenticate the API call |

We do not share your data with data brokers or advertising networks. If this changes, we will update this policy and, where required by law, seek your consent first.

## 5. Security

- Exchange API secrets are encrypted at rest (AES-256-GCM) and are never stored or transmitted in plain text after initial entry.
- Access to citation library edits, chain/protocol onboarding, treatment profile changes, and lot-record mutations is restricted to elevated roles (`super_admin`/`reviewer`) — not every authenticated user can alter records with tax or evidentiary consequence.
- Signed position records are immutable; changes to a signed record require a new superseding record, preserving a complete audit trail rather than allowing silent edits.
- No security measure is perfect. In the event of a data breach affecting your personal information, we will notify affected individuals within 30 days of determining a breach occurred, consistent with the Florida Information Protection Act (Fla. Stat. § 501.171) — Florida's deadline is among the strictest in the country, with only a 15-day extension available for good cause. If a breach affects 500 or more Florida residents, we will also notify the Florida Department of Legal Affairs within the same window. Encrypted data (such as your exchange API secrets, which are encrypted at rest as described above) generally falls within FIPA's safe harbor, meaning a breach limited to properly encrypted fields may not trigger the same notification obligation — but we will err toward notification where there's genuine doubt.

## 6. Data Retention

**[This section requires a business decision before publication.]** We currently retain account and transaction data for as long as your account is active, plus **[X years]** afterward, consistent with common tax record-retention practice (many practitioners retain records for 7 years as a practical buffer, though the IRS's own assessment periods are generally 3 years, extending to 6 years for substantial income understatement, and unlimited in cases of fraud or non-filing). You may request deletion of your account and associated data, subject to any records we are required to retain for legal or regulatory compliance.

## 7. Your Rights and Choices

Depending on your jurisdiction, you may have the right to access, correct, export, or delete your personal information, and to withdraw consent for optional processing. To exercise these rights, contact **[PRIVACY CONTACT EMAIL]**. You can disconnect an exchange connection and delete its stored credentials at any time from the Connections page.

## 8. Children's Privacy

BasisGuard is not directed at, and is not intended for use by, anyone under 18. We do not knowingly collect information from minors.

## 9. International Users

**[Confirm with counsel: if you have or expect users outside the US, this section needs to address the applicable transfer mechanism — e.g., GDPR adequacy, standard contractual clauses, etc. Currently left as a placeholder since scope wasn't specified.]**

## 10. Changes to This Policy

We will update this policy as the Service evolves and post the date of the most recent revision at the top of this page. Material changes affecting how we use previously-collected data will be communicated directly, not just posted silently.

## 11. Contact

Questions about this policy: **[PRIVACY CONTACT EMAIL]**
**[ENTITY NAME AND MAILING ADDRESS]**
