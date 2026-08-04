import { Star } from 'lucide-react'
import React from 'react'

import { cn } from '@/utilities/cn'

/**
 * Rating summary.
 *
 * Renders **nothing at all** when a product has no reviews — no empty stars, no
 * "0 reviews", no placeholder. Those read worse than silence because they
 * advertise absence, and this template runs shops that may never collect
 * reviews.
 *
 * The review *count* is shown as a number rather than implied, because showing
 * it measurably lifts add-to-cart: buyers read "based on 47 reviews" as
 * evidence and a bare star row as decoration.
 */
export const Rating: React.FC<{
  average?: number | null
  count?: number | null
  size?: 'sm' | 'md'
  className?: string
  showCount?: boolean
}> = ({ average, count, size = 'md', className, showCount = true }) => {
  // The universal-by-design gate.
  if (!count || !average) return null

  const starSize = size === 'sm' ? 12 : 15
  const rounded = Math.round(average * 2) / 2

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        aria-label={`Rated ${average} out of 5 from ${count} reviews`}
        className="flex items-center gap-0.5"
        role="img"
      >
        {[1, 2, 3, 4, 5].map((i) => {
          const filled = rounded >= i
          const half = !filled && rounded >= i - 0.5
          return (
            <Star
              aria-hidden
              className={cn(
                'shrink-0',
                filled || half ? 'fill-foreground text-foreground' : 'text-border',
              )}
              key={i}
              size={starSize}
              strokeWidth={1.5}
            />
          )
        })}
      </div>

      <span className={cn('numeric text-foreground', size === 'sm' ? 'text-2xs' : 'text-xs')}>
        {average.toFixed(1)}
      </span>

      {showCount && (
        <span
          className={cn('text-muted-foreground', size === 'sm' ? 'text-2xs' : 'text-xs')}
        >
          ({count})
        </span>
      )}
    </div>
  )
}
