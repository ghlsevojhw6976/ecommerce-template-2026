import type { MerchantProductInput } from './types'

import { microsToFeedPrice } from './xmlFeed'

/**
 * Facebook (Meta) catalog CSV — the third output of the ONE mapper, so the
 * affiliate guard and every skip rule hold identically for Meta as for
 * Google. Meta Commerce Manager accepts this as a file upload or a
 * scheduled-fetch URL.
 *
 * Meta quirks pinned here (and in csvFeed.int.spec.ts):
 * - availability uses SPACES: "in stock" / "out of stock"
 * - additional_image_link is a comma-joined list inside one quoted field
 * - sale_price_effective_date is the same slash-interval as Google's file
 */

const CSV_COLUMNS = [
  'id',
  'title',
  'description',
  'availability',
  'condition',
  'price',
  'link',
  'image_link',
  'additional_image_link',
  'brand',
  'gtin',
  'mpn',
  'item_group_id',
  'color',
  'size',
  'sale_price',
  'sale_price_effective_date',
  'google_product_category',
] as const

const csvCell = (value: string | undefined | null): string => {
  if (!value) return ''
  // Quote when the value contains a delimiter, quote or newline; double
  // embedded quotes per RFC 4180.
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

const AVAILABILITY: Record<string, string> = {
  in_stock: 'in stock',
  out_of_stock: 'out of stock',
  preorder: 'preorder',
  backorder: 'backorder',
}

const rowFor = (input: MerchantProductInput): string => {
  const attrs = input.productAttributes

  const saleWindow =
    attrs.salePriceEffectiveDate?.startTime && attrs.salePriceEffectiveDate?.endTime
      ? `${attrs.salePriceEffectiveDate.startTime}/${attrs.salePriceEffectiveDate.endTime}`
      : ''

  const cells: Record<(typeof CSV_COLUMNS)[number], string> = {
    id: input.offerId,
    title: attrs.title,
    description: attrs.description ?? '',
    availability: AVAILABILITY[attrs.availability] ?? attrs.availability,
    condition: attrs.condition,
    price: microsToFeedPrice(attrs.price.amountMicros, attrs.price.currencyCode),
    link: attrs.link,
    image_link: attrs.imageLink ?? '',
    additional_image_link: (attrs.additionalImageLinks ?? []).slice(0, 10).join(','),
    brand: attrs.brand ?? '',
    gtin: attrs.gtins?.[0] ?? '',
    mpn: attrs.mpn ?? '',
    item_group_id: attrs.itemGroupId ?? '',
    color: attrs.color ?? '',
    size: attrs.size ?? '',
    sale_price: attrs.salePrice
      ? microsToFeedPrice(attrs.salePrice.amountMicros, attrs.salePrice.currencyCode)
      : '',
    sale_price_effective_date: saleWindow,
    google_product_category: attrs.googleProductCategory ?? '',
  }

  return CSV_COLUMNS.map((column) => csvCell(cells[column])).join(',')
}

export const buildFacebookCsv = (inputs: MerchantProductInput[]): string =>
  [CSV_COLUMNS.join(','), ...inputs.map(rowFor)].join('\n')
