import { Package } from 'lucide-react'
import React from 'react'

import type { ContactDetailsBlock as Props } from '@/payload-types'
import { CompanyDetails } from '@/components/CompanyDetails'
import {
  companyLegalName,
  getCompany,
  hasSeparateReturnsAddress,
  returnsAddressLines,
} from '@/utilities/getCompany'

/**
 * Company contact details on a page.
 *
 * Reads everything from Company settings, so it cannot drift from the footer or
 * the policy pages. At higher price points a reachable, real business is a
 * conversion factor rather than an afterthought — buyers check that someone
 * exists before spending, and most consumer regimes require these details to be
 * readily available anyway.
 */
export const ContactDetails: React.FC<Props & { id?: string }> = async ({
  heading,
  intro,
  showReturnsAddress,
}) => {
  const company = await getCompany()
  const returns = showReturnsAddress && hasSeparateReturnsAddress(company)

  return (
    <div className="container">
      <div className="w-full max-w-2xl border-t border-border pt-8">
        <h2 className="text-xl md:text-2xl">{heading?.trim() || 'Other ways to reach us'}</h2>

        {intro?.trim() && (
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{intro}</p>
        )}

        <div className="mt-6 grid gap-8 sm:grid-cols-2">
          <div>
            <CompanyDetails variant="full" />
          </div>

          {returns && (
            <div>
              <div className="flex items-start gap-3">
                <Package
                  aria-hidden
                  className="mt-0.5 shrink-0 text-muted-foreground"
                  size={16}
                  strokeWidth={1.5}
                />
                <div>
                  <p className="text-sm">Returns address</p>
                  <address className="mt-1 text-sm not-italic leading-relaxed text-muted-foreground">
                    {returnsAddressLines(company).map((line) => (
                      <span className="block" key={line}>
                        {line}
                      </span>
                    ))}
                  </address>
                  {/* Nobody should post a return without contacting us first —
                      unauthorised parcels take far longer to process. */}
                  <p className="mt-2 text-xs text-muted-foreground">
                    Please request a return before sending anything back.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <p className="mt-8 text-xs text-muted-foreground">
          {companyLegalName(company)} is the trader responsible for orders placed on this site.
        </p>
      </div>
    </div>
  )
}
