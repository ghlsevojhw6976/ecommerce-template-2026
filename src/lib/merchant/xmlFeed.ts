import type { MerchantProductInput } from './types'

/**
 * Google Shopping feed file — RSS 2.0 with the g: namespace, the format
 * Merchant Center's "scheduled fetch" data source downloads daily.
 *
 * WHY THIS EXISTS alongside the Merchant API mapper: feed files need zero
 * Google credentials — a template user pastes one URL into Merchant Center
 * and is live. The API push (real-time price/stock sync) remains the
 * upgrade path; both derive from the SAME mapper output, so the affiliate
 * guard, sale-price mapping and skip rules cannot diverge between them.
 *
 * Format deltas from the API shape (the file spec is older):
 * - prices are decimal + currency ("649.99 USD"), not micros
 * - g:gtin is SINGULAR (the API's `gtins` array flattens to its first)
 * - identifier_exists is the string "no", never omitted-true
 * - sale_price_effective_date is a SLASH-separated ISO interval
 */

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/** "649990000" micros → "64.99 USD"-style feed price. */
export const microsToFeedPrice = (amountMicros: string, currencyCode: string): string => {
  const units = Number(amountMicros) / 1_000_000
  return `${units.toFixed(2)} ${currencyCode}`
}

const tag = (name: string, value: string | undefined | null): string =>
  value ? `<${name}>${escapeXml(value)}</${name}>` : ''

const itemXml = (input: MerchantProductInput): string => {
  const attrs = input.productAttributes

  const salePriceWindow =
    attrs.salePriceEffectiveDate?.startTime && attrs.salePriceEffectiveDate?.endTime
      ? `${attrs.salePriceEffectiveDate.startTime}/${attrs.salePriceEffectiveDate.endTime}`
      : null

  return [
    '<item>',
    tag('g:id', input.offerId),
    tag('g:title', attrs.title),
    tag('g:description', attrs.description),
    tag('g:link', attrs.link),
    tag('g:image_link', attrs.imageLink),
    ...(attrs.additionalImageLinks ?? [])
      .slice(0, 10)
      .map((link) => tag('g:additional_image_link', link)),
    tag('g:availability', attrs.availability),
    tag('g:condition', attrs.condition),
    tag('g:price', microsToFeedPrice(attrs.price.amountMicros, attrs.price.currencyCode)),
    ...(attrs.salePrice
      ? [
          tag(
            'g:sale_price',
            microsToFeedPrice(attrs.salePrice.amountMicros, attrs.salePrice.currencyCode),
          ),
        ]
      : []),
    ...(salePriceWindow ? [tag('g:sale_price_effective_date', salePriceWindow)] : []),
    tag('g:brand', attrs.brand),
    tag('g:gtin', attrs.gtins?.[0]),
    tag('g:mpn', attrs.mpn),
    ...(attrs.identifierExists === false ? ['<g:identifier_exists>no</g:identifier_exists>'] : []),
    tag('g:item_group_id', attrs.itemGroupId),
    tag('g:color', attrs.color),
    tag('g:size', attrs.size),
    tag('g:google_product_category', attrs.googleProductCategory),
    tag('g:shipping_label', attrs.shippingLabel),
    ...(attrs.shipping
      ? [
          '<g:shipping>',
          tag('g:country', attrs.shipping.country),
          tag(
            'g:price',
            microsToFeedPrice(attrs.shipping.price.amountMicros, attrs.shipping.price.currencyCode),
          ),
          '</g:shipping>',
        ]
      : []),
    '</item>',
  ]
    .filter(Boolean)
    .join('\n')
}

export const buildXmlFeed = ({
  inputs,
  shopName,
  serverUrl,
}: {
  inputs: MerchantProductInput[]
  shopName: string
  serverUrl: string
}): string =>
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    '<channel>',
    tag('title', shopName),
    tag('link', serverUrl),
    tag('description', `${shopName} product feed`),
    ...inputs.map(itemXml),
    '</channel>',
    '</rss>',
  ].join('\n')
