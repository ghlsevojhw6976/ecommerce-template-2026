import { SerializedEditorState } from '@payloadcms/richtext-lexical/lexical'
import React from 'react'

import { RichText } from '@/components/RichText'
import { buildPlaceholders, resolvePlaceholdersInRichText } from '@/utilities/companyPlaceholders'
import { getCompany } from '@/utilities/getCompany'

/**
 * Rich text with `{{company.*}}` placeholders resolved.
 *
 * Server component. Resolution happens here rather than inside `RichText`
 * because that one is rendered from client components too, and making it async
 * would break those call sites.
 *
 * This is what lets returns, terms, shipping and privacy pages be written once
 * and seeded into every shop: the copy stays generic, the values come from
 * Company settings, and updating the returns window in one place updates every
 * sentence that mentions it.
 */
export const CompanyRichText: React.FC<
  {
    data: SerializedEditorState
    enableGutter?: boolean
    enableProse?: boolean
  } & React.HTMLAttributes<HTMLDivElement>
> = async ({ data, ...rest }) => {
  const company = await getCompany()
  const resolved = resolvePlaceholdersInRichText(data, buildPlaceholders(company))

  return <RichText data={resolved} {...rest} />
}
