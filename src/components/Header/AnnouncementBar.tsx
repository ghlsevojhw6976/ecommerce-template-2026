import React from 'react'

import { getCompany } from '@/utilities/getCompany'

/**
 * Announcement bar.
 *
 * Says the two things that most often stop a purchase — what shipping costs and
 * how long you have to change your mind — **before** the customer reaches the
 * cart. Unexpected cost at checkout is the single biggest abandonment cause
 * (39%), and the cheapest place to defuse it is the top of every page.
 *
 * Shipping is unconditionally free (DDP, duties included) — checkout never
 * charges for it regardless of order size, so this line states that plainly
 * rather than quoting a threshold that doesn't gate anything.
 *
 * Values come from Company settings, so this can never contradict the product
 * page or the returns policy. Renders nothing when neither is configured,
 * rather than showing an empty band.
 */
export const AnnouncementBar: React.FC = async () => {
  const company = await getCompany()

  const returnDays = company.returnWindowDays

  const messages = [
    'Free shipping',
    typeof returnDays === 'number' && returnDays > 0 ? `${returnDays}-day returns` : null,
  ].filter(Boolean) as string[]

  if (!messages.length) return null

  return (
    <div className="border-b border-border bg-muted">
      <div className="container flex items-center justify-center gap-3 py-2 text-center">
        {messages.map((message, i) => (
          <React.Fragment key={message}>
            {i > 0 && (
              <span aria-hidden className="text-muted-foreground">
                ·
              </span>
            )}
            <span className="text-xs tracking-wide text-muted-foreground">{message}</span>
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}
