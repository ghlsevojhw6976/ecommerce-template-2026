import { contentBlock, h, p, ul } from './lexical'

/**
 * Terms & Conditions.
 *
 * ⚠️ REVIEW BEFORE LAUNCH — with a lawyer, not just internally.
 *
 * This is a competent, plain-English starting point covering the clauses an
 * ecommerce contract needs: contract formation, pricing errors, liability,
 * governing law. It is deliberately conservative and deliberately readable.
 *
 * Two clauses genuinely need professional attention rather than a template:
 *
 *  1. **Limitation of liability.** What is enforceable varies by state, and
 *     several consumer protections cannot be excluded at all. An overreaching
 *     clause is often struck out entirely, leaving you worse off than a
 *     modest one that holds.
 *  2. **Governing law and dispute resolution.** `{{company.jurisdiction}}` is
 *     filled from Company settings, but whether to require arbitration, allow
 *     class actions, or specify a venue is a commercial decision with real
 *     consequences.
 */
export const termsPage = {
  title: 'Terms & Conditions',
  slug: 'terms',
  layout: [
    contentBlock([
      p(
        'These terms govern your use of this site and any order you place. Please read them — placing an order means you accept them.',
      ),

      h('h2', 'Who you are contracting with'),
      p(
        'This site is operated by **{{company.legalName}}**, registered at {{company.address}} (company number {{company.companyNumber}}). "We" and "us" mean that company; "you" means the person placing the order.',
      ),

      h('h2', 'When a contract is formed'),
      p(
        'Adding an item to your basket or reaching checkout does not create a contract. Your order is an **offer to buy**. A contract exists only when we send you an email confirming the order has been dispatched.',
      ),
      p(
        'This matters when something goes wrong at our end — see pricing and availability below. Until dispatch, we may decline an order and refund you in full.',
      ),

      h('h2', 'Pricing and availability'),
      p(
        'Prices are shown in US dollars and exclude sales tax unless stated otherwise. Tax and shipping are calculated at checkout and shown before you pay.',
      ),
      p(
        'We try hard to keep prices and stock accurate, but errors happen. If we discover a material pricing error before dispatch we will contact you and offer the choice of proceeding at the correct price or cancelling for a full refund. **We will not silently charge you a different amount than you agreed.**',
      ),
      p(
        'If an item turns out to be unavailable after you order, we will tell you and refund in full.',
      ),

      h('h2', 'Payment'),
      p(
        'Payment is taken at checkout through our payment provider. We do not receive or store your full card details.',
      ),
      p(
        'If a payment is later reversed or disputed without cause, we may suspend or cancel orders associated with it.',
      ),

      h('h2', 'Delivery and risk'),
      p(
        'Delivery estimates are estimates, not guarantees, because the final leg is handled by carriers we do not control. Risk in the goods passes to you on delivery.',
      ),
      p('{{company.shippingDisclaimer}}'),
      p('Full detail is in our Shipping & Delivery policy, which forms part of these terms.'),

      h('h2', 'Returns'),
      p(
        'You may return most items within **{{company.returnWindow}}** of delivery under our Returns & Refunds policy, which forms part of these terms and does not affect your statutory rights.',
      ),

      h('h2', 'Product information'),
      p(
        'We describe products as accurately as we can. Photographs are illustrative — colours vary between screens, and dimensions are given to help you judge fit. Where a specification matters to your decision, check it with us before ordering rather than after.',
      ),

      h('h2', 'Warranties'),
      p(
        'All products are backed by the 40tag 24-Month Guarantee, covering defects in materials or workmanship for 24 months from delivery. This is in addition to, not instead of, your statutory rights. Where a manufacturer separately offers its own warranty, this does not replace or limit that — but 40tag’s guarantee applies regardless.',
      ),

      h('h2', 'Acceptable use'),
      ul([
        'Do not use this site unlawfully, or to defraud us or anyone else.',
        'Do not attempt to gain unauthorised access to any part of the site or its infrastructure.',
        'Do not scrape, resell or systematically extract our content or pricing.',
        'Do not place orders you do not intend to pay for.',
      ]),

      h('h2', 'Intellectual property'),
      p(
        'The content of this site — text, photography, design and code — belongs to us or our licensors. You may view and print it for your own use. Any other use requires our written permission.',
      ),

      h('h2', 'Our liability'),
      p(
        'Nothing in these terms excludes liability for death or personal injury caused by our negligence, for fraud, or for anything else that cannot lawfully be excluded.',
      ),
      p(
        'Subject to that, our total liability arising from an order is limited to the amount you paid for it, and we are not liable for indirect or consequential loss, loss of profit, or loss of data.',
      ),

      h('h2', 'Events outside our control'),
      p(
        'We are not liable for delay or failure caused by events beyond our reasonable control, including carrier failure, severe weather, industrial action or supply interruption. If such an event is likely to affect your order materially, we will contact you and you may cancel for a full refund.',
      ),

      h('h2', 'Changes to these terms'),
      p(
        'We may update these terms. The version that applies to your order is the one published when you placed it.',
      ),

      h('h2', 'Governing law'),
      p(
        'These terms are governed by the laws of **{{company.jurisdiction}}**, and disputes are subject to the courts of that jurisdiction.',
      ),

      h('h2', 'Contact'),
      p(
        'Questions about these terms: **{{company.supportEmail}}**, or write to {{company.legalName}}, {{company.address}}.',
      ),
    ]),
  ],
}
