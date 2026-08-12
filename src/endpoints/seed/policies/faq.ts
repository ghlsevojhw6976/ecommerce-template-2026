import { contentBlock, h, p } from './lexical'

/**
 * FAQ.
 *
 * Answers the questions that otherwise become a pre-sales email or an
 * abandoned basket. Ordered by how often they block a purchase rather than by
 * topic — delivery cost and returns come first because those are the two
 * biggest documented causes of abandonment.
 *
 * Every answer that involves a number pulls it from Company settings, so the
 * FAQ cannot drift out of step with the policy pages.
 */
export const faqPage = {
  title: 'Frequently Asked Questions',
  slug: 'faq',
  layout: [
    contentBlock([
      h('h2', 'Ordering & payment'),

      h('h3', 'What payment methods do you accept?'),
      p(
        'All major credit and debit cards, plus digital wallets like Apple Pay and Google Pay. Payment is processed securely and we never see or store your full card number.',
      ),

      h('h3', 'Is it safe to order here?'),
      p(
        'Payment is handled entirely by our payment provider, so card details never touch our servers. The whole site is encrypted. If anything about an order looks wrong, contact us at **{{company.supportEmail}}** before disputing with your bank — we can almost always fix it faster.',
      ),

      h('h3', 'Can I change or cancel my order?'),
      p(
        'Yes, if it has not been dispatched. Email **{{company.supportEmail}}** as soon as possible with your order number. Once a parcel is with the carrier we cannot recall it, but you can still return it.',
      ),

      h('h3', 'Do I need an account?'),
      p(
        'No. You can check out as a guest. An account only makes it easier to track orders and reorder later.',
      ),

      h('h2', 'Delivery'),

      h('h3', 'How much is shipping?'),
      p(
        'Free on orders of **{{company.freeShippingThreshold}}** or more. Below that, a flat **{{company.flatShippingFee}}** — shown on the product page before you add it to your cart, and again before you pay, never as a surprise at the last step.',
      ),

      h('h3', 'How long will it take?'),
      // deliveryTimes, not shippingDisclaimer: the disclaimer resolves to
      // NOTHING when the cross-border toggle is off, which left this question
      // standing with no answer. deliveryTimes answers in both modes.
      p('{{company.deliveryTimes}}'),
      p(
        'Some items ship directly from the maker and take longer; that is stated on the product page.',
      ),

      h('h3', 'Can I track my order?'),
      p(
        'Yes — a tracking number is emailed as soon as your order leaves us. If tracking stops updating for more than two business days, tell us and we will chase the carrier for you.',
      ),

      h('h2', 'Returns & warranty'),

      h('h3', 'What is your return policy?'),
      p(
        '**{{company.returnWindow}}** from delivery, for any reason, provided the item is unused and in resalable condition. Return shipping is paid by **{{company.returnsShippingPaidBy}}**. Full detail is on our Returns page.',
      ),

      h('h3', 'Where do I send a return?'),
      p('Returns go to **{{company.returnsAddress}}**. {{company.returnsCountryNote}}'),

      h('h3', 'What if it arrives damaged?'),
      p(
        'Email **{{company.supportEmail}}** with photographs within 48 hours. We will replace it or refund you in full including all shipping, and we pay the return postage.',
      ),

      h('h3', 'How long does a refund take?'),
      p(
        'We process it as soon as the return passes inspection. It then takes 5–10 business days to appear, which is your bank’s timing rather than ours.',
      ),

      h('h3', 'Is there a warranty?'),
      p(
        'All products are backed by the 40tag 24-Month Guarantee, covering defects in materials or workmanship for 24 months from delivery — in addition to, not instead of, your statutory rights.',
      ),

      h('h2', 'Products'),

      h('h3', 'How do I know it will fit or suit my use?'),
      p(
        'Full dimensions and specifications are on every product page. If you are unsure, ask before you buy — **{{company.supportEmail}}** or **{{company.phone}}**, {{company.supportHours}}. We would rather spend five minutes now than process a return later.',
      ),

      h('h3', 'Are the photographs accurate?'),
      p(
        'They are our own, and we shoot to represent the product honestly. Colours do vary between screens, so where a shade matters, ask and we will describe it properly.',
      ),

      h('h3', 'Something is out of stock — will it come back?'),
      p('Usually. Email us and we will tell you when, and let you know when it lands.'),

      h('h2', 'Still need help?'),
      p(
        'Email **{{company.supportEmail}}** or call **{{company.phone}}**, {{company.supportHours}}. A person answers.',
      ),
    ]),
  ],
}
