import { Clock, Mail, MapPin, Phone } from 'lucide-react'
import React from 'react'

import { companyAddressLines, companyLegalName, getCompany } from '@/utilities/getCompany'
import { cn } from '@/utilities/cn'

/**
 * Company contact details, for the contact page, footer and policy pages.
 *
 * Every field self-hides when blank, so a shop that has only filled in an email
 * gets a clean single line rather than a list of empty labels.
 *
 * Contact details are a trust signal at this price point — high-value buyers
 * check that a real business with a real address exists before spending — and
 * in most jurisdictions publishing them is a legal requirement, not a choice.
 */
export const CompanyDetails: React.FC<{
  className?: string
  /** `full` includes the registered entity and company numbers. */
  variant?: 'compact' | 'full'
}> = async ({ className, variant = 'full' }) => {
  const company = await getCompany()

  const addressLines = companyAddressLines(company)
  const email = company.supportEmail || company.email
  const items = [
    addressLines.length > 0 && { icon: MapPin, lines: addressLines },
    email && { icon: Mail, lines: [email], href: `mailto:${email}` },
    company.phone && {
      icon: Phone,
      lines: [company.phone],
      href: `tel:${company.phone.replace(/[^\d+]/g, '')}`,
    },
    company.supportHours && { icon: Clock, lines: [company.supportHours] },
  ].filter(Boolean) as {
    icon: React.ElementType
    lines: string[]
    href?: string
  }[]

  if (!items.length) return null

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <ul className="flex flex-col gap-3">
        {items.map(({ icon: Icon, lines, href }, i) => (
          <li className="flex items-start gap-3" key={i}>
            <Icon
              aria-hidden
              className="mt-0.5 shrink-0 text-muted-foreground"
              size={16}
              strokeWidth={1.5}
            />
            <div className="text-sm leading-relaxed">
              {href ? (
                <a className="transition-colors hover:text-muted-foreground" href={href}>
                  {lines[0]}
                </a>
              ) : (
                lines.map((line, j) => <div key={j}>{line}</div>)
              )}
            </div>
          </li>
        ))}
      </ul>

      {variant === 'full' && (company.companyNumber || company.taxId) && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {companyLegalName(company)}
          {company.companyNumber ? ` · Company no. ${company.companyNumber}` : ''}
          {company.taxId ? ` · Tax ID ${company.taxId}` : ''}
        </p>
      )}
    </div>
  )
}
