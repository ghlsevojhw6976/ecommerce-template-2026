import { contentBlock, h, p, ul } from './lexical'

/**
 * Returns & Refunds.
 *
 * Written to two constraints at once:
 *
 * **Legal.** There is no US federal law requiring returns, but the FTC requires
 * material terms to be clear and conspicuous before purchase, and a majority of
 * states impose a *default* return window on you if you fail to post a policy
 * conspicuously. California specifically requires posting unless you give a
 * full refund within seven days. So an unclear policy is worse than a strict
 * one — silence hands the terms to the state.
 *
 * **Commercial.** 15% of shoppers abandon over an unsatisfactory return policy
 * and 60% look for it on the product page. At €400–1200 the return policy is
 * doing risk reversal, not admin: it is what converts "I'll think about it".
 *
 * Written in plain English deliberately. Legalese here reads as hedging, which
 * is the opposite of reassurance.
 */
export const returnsPage = {
  title: 'Returns & Refunds',
  slug: 'returns',
  layout: [
    contentBlock([
      p(
        'We want you to be genuinely happy with what you bought. If you are not, here is exactly how to send it back — no arguments, no restocking fees.',
      ),

      h('h2', 'The short version'),
      ul([
        '**{{company.returnWindow}}** to change your mind, from the day your order arrives.',
        'Items must be unused, in resalable condition, with original packaging.',
        'Return shipping is paid by **{{company.returnsShippingPaidBy}}**.',
        'Refunds are issued to the original payment method within 5–10 business days of us receiving the item.',
      ]),

      h('h2', 'How to start a return'),
      p(
        'Email **{{company.supportEmail}}** with your order number and which item you are returning. You do not need a reason, though it helps us improve if you give one.',
      ),
      p(
        'We will reply with a return authorisation and the address to send to. Please wait for that before shipping anything — parcels sent back without authorisation can take considerably longer to process.',
      ),
      p('Returns are received at: **{{company.returnsAddress}}**'),
      p('{{company.returnsCountryNote}}'),
      p('{{company.returnsInstructions}}'),

      h('h2', 'Condition'),
      p(
        'Items need to come back in a condition we could sell again. That means unused, undamaged, and with any original packaging, tags, manuals and accessories.',
      ),
      p(
        'You are welcome to inspect an item the way you would in a shop — unbox it, look at it, try the fit. What you cannot do is use it and then return it. If an item arrives back showing use beyond reasonable inspection, we will contact you before deciding, and may offer a partial refund rather than refusing outright.',
      ),

      h('h2', 'Faulty or damaged items'),
      p(
        'This is not a return, it is a fault, and different rules apply. Contact us at **{{company.supportEmail}}** with photographs and we will arrange a replacement or a full refund including all shipping costs, at your choice. We pay return postage on faulty goods regardless of our normal returns policy.',
      ),
      p(
        'If something arrives damaged in transit, tell us within 48 hours of delivery so we can claim against the carrier.',
      ),

      h('h2', 'Refunds'),
      p(
        'Once your return arrives and passes inspection, we issue the refund to your original payment method. Card refunds typically appear within 5–10 business days, though the exact timing is set by your bank rather than by us.',
      ),
      p(
        'We refund the price you paid for the item. Original shipping is refunded when the return is because of a fault or our error.',
      ),

      h('h2', 'Exchanges'),
      p(
        'We do not process direct exchanges, because holding stock while a parcel is in transit means we sometimes cannot honour it. Return the original for a refund and place a new order — it is faster and there is no risk of the replacement selling out while we wait.',
      ),

      h('h2', 'Items we cannot accept back'),
      ul([
        'Items that have been used beyond reasonable inspection.',
        'Products returned without their original packaging where that packaging is part of the product.',
        'Anything made or engraved to your specification.',
        'Gift cards.',
      ]),

      h('h2', 'Your statutory rights'),
      p(
        'This policy sits on top of your legal rights, it does not replace them. Nothing here limits any remedy available to you under applicable consumer protection law.',
      ),

      h('h2', 'Questions'),
      p(
        'If any of this is unclear, ask before you buy — **{{company.supportEmail}}** or **{{company.phone}}**, {{company.supportHours}}. We would rather answer a question than process a return.',
      ),
    ]),
  ],
}
