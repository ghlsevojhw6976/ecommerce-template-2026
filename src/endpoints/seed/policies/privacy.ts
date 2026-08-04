import { contentBlock, h, p, ul } from './lexical'

/**
 * Privacy Policy.
 *
 * Structured around what CCPA/CPRA actually requires, including the
 * requirements that came into force on 1 January 2026:
 *
 *  - categories of personal information collected, and the sources
 *  - the purpose of each collection
 *  - **retention period or criteria per category** (a 2026 addition — a blanket
 *    "we keep data as long as necessary" no longer satisfies this)
 *  - categories disclosed to **service providers and contractors**, not only to
 *    third parties (also strengthened for 2026)
 *  - the full set of consumer rights and how to exercise them
 *  - a non-discrimination statement
 *
 * ⚠️ REVIEW BEFORE LAUNCH. This is a well-researched starting point, not legal
 * advice. Two things in particular need a decision by a human:
 *
 *  1. Whether the shop "sells" or "shares" personal information as CCPA defines
 *     it. Running advertising pixels for cross-context behavioural advertising
 *     usually counts, and if it does you must add a conspicuous
 *     "Do Not Sell or Share My Personal Information" link.
 *  2. Whether state laws beyond California apply to your customer base.
 */
export const privacyPage = {
  title: 'Privacy Policy',
  slug: 'privacy',
  layout: [
    contentBlock([
      p(
        'This policy explains what {{company.legalName}} collects when you use this site, why, how long we keep it, and what you can ask us to do about it.',
      ),

      h('h2', 'Who we are'),
      p(
        '{{company.legalName}} of {{company.address}} is the business responsible for the personal information described here. Contact us about anything in this policy at **{{company.supportEmail}}**.',
      ),

      h('h2', 'What we collect, and why'),

      h('h3', 'Information you give us'),
      ul([
        '**Identity and contact** — name, email, phone, billing and delivery address. Collected to take payment and deliver your order.',
        '**Order information** — what you bought, when, and for how much. Needed to fulfil the order, handle returns and meet tax obligations.',
        '**Account information** — email and a hashed password, if you create an account. We never store your password itself.',
        '**Correspondence** — what you write to us when you get in touch, so we can answer and keep context if you write again.',
      ]),

      h('h3', 'Information collected automatically'),
      ul([
        '**Device and usage** — IP address, browser, pages viewed. Used to keep the site working, detect fraud and understand what is broken.',
        '**Cookies** — see the cookies section below.',
      ]),

      h('h3', 'Information from others'),
      ul([
        '**Payment processors** — our payment provider confirms whether a payment succeeded and returns the last four digits and card brand. **We never receive or store your full card number.**',
        '**Carriers** — delivery status for your order.',
      ]),

      h('h2', 'How long we keep it'),
      p(
        'We keep each category only as long as it has a purpose, and no longer:',
      ),
      ul([
        '**Order and transaction records** — 7 years, because tax and accounting rules require it.',
        '**Account information** — until you close your account, then deleted within 30 days.',
        '**Correspondence** — 3 years from the last message, so we have context if an issue resurfaces.',
        '**Marketing preferences** — until you unsubscribe, plus a suppression record kept indefinitely so we do not email you again by mistake.',
        '**Website analytics** — 26 months.',
      ]),

      h('h2', 'Who we share it with'),
      p(
        'We do not sell your personal information. We share it only with businesses that need it to deliver what you asked for:',
      ),
      ul([
        '**Payment processing** — to take payment and handle refunds and disputes.',
        '**Shipping carriers** — name, address and phone, so they can deliver and contact you about delivery.',
        '**Suppliers** — where an item ships directly to you, that supplier receives the delivery details for that item only.',
        '**Email and support tools** — to send order confirmations and answer your messages.',
        '**Analytics** — to understand how the site is used.',
      ]),
      p(
        'These are service providers and contractors under CCPA: they may only use your information to perform the service, and are contractually barred from using it for anything else.',
      ),
      p(
        'We also disclose information where the law requires it, and to professional advisers where necessary to establish or defend legal claims.',
      ),

      h('h2', 'Your rights'),
      p(
        'Depending on where you live, you may have the right to:',
      ),
      ul([
        '**Know** what personal information we hold and how we use it.',
        '**Access** a copy of it.',
        '**Correct** anything inaccurate.',
        '**Delete** it, subject to records we are legally required to keep.',
        '**Opt out** of the sale or sharing of personal information.',
        '**Limit** how we use sensitive personal information.',
        '**Withdraw consent** to marketing at any time.',
      ]),
      p(
        'To exercise any of these, email **{{company.supportEmail}}**. We will verify your identity — usually by confirming details of a recent order — and respond within 45 days. You may use an authorised agent.',
      ),
      p(
        '**We will not discriminate against you for exercising any of these rights.** You will not be denied service, charged a different price, or given a lower standard of service.',
      ),

      h('h2', 'Cookies'),
      p(
        'Essential cookies keep your basket and session working and cannot be turned off without breaking the site. Analytics cookies help us see what is slow or broken. Where we use advertising cookies, you can refuse them without losing any functionality.',
      ),

      h('h2', 'Security'),
      p(
        'Payment card data is handled entirely by our payment provider and never touches our servers. Traffic to this site is encrypted in transit. Access to customer data internally is limited to staff who need it.',
      ),
      p(
        'No system is perfectly secure. If a breach affects your personal information, we will tell you and the relevant authority as the law requires.',
      ),

      h('h2', 'Children'),
      p(
        'This site is not intended for children under 16 and we do not knowingly collect their information. If you believe a child has given us personal information, contact us and we will delete it.',
      ),

      h('h2', 'Changes'),
      p(
        'If we change this policy materially we will update the date below and, where the change affects how we use information you already gave us, tell you directly.',
      ),

      h('h2', 'Contact'),
      p(
        '{{company.legalName}}, {{company.address}}. Email **{{company.supportEmail}}**, phone **{{company.phone}}**, {{company.supportHours}}.',
      ),
    ]),
  ],
}
