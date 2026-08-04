'use client'
import { useCurrency } from '@payloadcms/plugin-ecommerce/client/react'
import React, { useMemo } from 'react'

type BaseProps = {
  className?: string
  currencyCodeClassName?: string
  as?: 'span' | 'p'
}

type PriceFixed = {
  amount: number
  /**
   * The struck-through was-price (cents). Rendered AFTER the charged price —
   * sale price first is the reading order shoppers expect — in muted
   * strike-through so the live price keeps the visual weight. Ignored unless
   * genuinely above `amount`, mirroring the server-side guard.
   */
  compareAtAmount?: number | null
  currencyCode?: string
  highestAmount?: never
  lowestAmount?: never
}

type PriceRange = {
  amount?: never
  compareAtAmount?: never
  currencyCode?: string
  highestAmount: number
  lowestAmount: number
}

type Props = BaseProps & (PriceFixed | PriceRange)

export const Price = ({
  amount,
  className,
  compareAtAmount,
  highestAmount,
  lowestAmount,
  currencyCode: currencyCodeFromProps,
  as = 'p',
}: Props & React.ComponentProps<'p'>) => {
  const { formatCurrency, supportedCurrencies } = useCurrency()

  const Element = as

  const currencyToUse = useMemo(() => {
    if (currencyCodeFromProps) {
      return supportedCurrencies.find((currency) => currency.code === currencyCodeFromProps)
    }
    return undefined
  }, [currencyCodeFromProps, supportedCurrencies])

  if (typeof amount === 'number') {
    const showCompareAt = typeof compareAtAmount === 'number' && compareAtAmount > amount

    return (
      <Element className={className} suppressHydrationWarning>
        {formatCurrency(amount, { currency: currencyToUse })}
        {showCompareAt && (
          <>
            {' '}
            <s className="font-normal text-muted-foreground">
              <span className="sr-only">was </span>
              {formatCurrency(compareAtAmount, { currency: currencyToUse })}
            </s>
          </>
        )}
      </Element>
    )
  }

  if (highestAmount && highestAmount !== lowestAmount) {
    return (
      <Element className={className} suppressHydrationWarning>
        {`${formatCurrency(lowestAmount, { currency: currencyToUse })} - ${formatCurrency(highestAmount, { currency: currencyToUse })}`}
      </Element>
    )
  }

  if (lowestAmount) {
    return (
      <Element className={className} suppressHydrationWarning>
        {`${formatCurrency(lowestAmount, { currency: currencyToUse })}`}
      </Element>
    )
  }

  return null
}
