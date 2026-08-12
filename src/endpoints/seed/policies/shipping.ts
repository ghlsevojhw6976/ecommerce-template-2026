import { contentBlock, h, p } from './lexical'

/**
 * Shipping & Delivery.
 *
 * Unexpected cost at checkout is the single largest cause of cart abandonment
 * (39% of shoppers who intended to buy). Every number a customer might be
 * surprised by therefore appears here, stated plainly, and the same values are
 * surfaced on the product page — both read from Company settings, so they
 * cannot drift apart.
 *
 * Delivery estimates are given as ranges with a stated dispatch time rather
 * than a single optimistic number. Understating delivery is a short-term
 * conversion trick that produces long-term support load and chargebacks.
 */
export const shippingPage = {
  title: 'Shipping & Delivery',
  slug: 'shipping',
  layout: [
    contentBlock([
      p(
        'Everything below is what you will actually pay and actually wait. No costs appear for the first time at checkout.',
      ),

      h('h2', 'Cost'),
      p(
        'Standard shipping is free on orders of **{{company.freeShippingThreshold}}** or more. Below that, a flat **{{company.flatShippingFee}}** shipping fee applies — the same figure shown on the product page before you add anything to your cart, and again on the cart and checkout review pages before you pay. It never changes at the final payment step.',
      ),
      p(
        'Prices shown on the site exclude sales tax where applicable. Tax is calculated at checkout based on your delivery address, and shown before you pay.',
      ),

      h('h2', 'Dispatch'),
      p(
        'Orders placed before 1pm on a business day are usually picked the same day. We dispatch within **{{company.processingTime}}**.',
      ),
      p(
        'Some items ship directly from the maker or our supplier. Where that applies it is stated on the product page along with that item’s own lead time, because it is often longer than our standard dispatch.',
      ),

      h('h2', 'Delivery times'),
      // Mode-aware: the cross-border statement (origin, door-to-door window,
      // customs) when the Shipping & Customs toggle is on; the domestic tiers
      // when it is off. One placeholder, so this page can never quote delivery
      // times that contradict the product-page disclaimer.
      p('{{company.deliveryTimes}}'),
      p(
        'Business days exclude weekends and public holidays. Carriers run slower in the weeks before major holidays, and during severe weather.',
      ),

      h('h2', 'Tracking'),
      p(
        'You will get a tracking number by email as soon as your order leaves us. If tracking has not updated for more than two business days, contact us at **{{company.supportEmail}}** and we will chase the carrier — you should not have to do that yourself.',
      ),

      h('h2', 'Larger and heavier items'),
      p(
        'Oversized items ship on a pallet or by two-person carrier, and the courier will contact you to arrange a delivery window. These cannot be left with a neighbour or in a safe place.',
      ),

      h('h2', 'Delivery addresses'),
      p(
        'We deliver to street addresses and workplaces. We cannot deliver to PO boxes for higher-value orders, because those require a signature.',
      ),
      p(
        'Check your delivery address carefully before confirming. Once an order has been dispatched we cannot redirect it, and a parcel returned to us as undeliverable is refunded minus the outbound shipping cost.',
      ),

      h('h2', 'Missing or late parcels'),
      p(
        'If tracking shows delivered and you do not have it, check with neighbours and look for a card first — then contact us within 7 days. We will open a carrier investigation and keep you updated. You are not left to argue with the courier alone.',
      ),

      h('h2', 'Questions before you order'),
      p(
        'If you need something by a specific date, ask first: **{{company.supportEmail}}** or **{{company.phone}}**, {{company.supportHours}}. We would rather tell you it will not arrive in time than take the order.',
      ),
    ]),
  ],
}
