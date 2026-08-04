'use client'

import * as React from 'react'
import * as LabelPrimitive from '@radix-ui/react-label'

import { cn } from '@/utilities/cn'

function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        // Was `text-primary/50 font-mono`. Under the old neutral theme primary
        // was near-black, so that read as grey — but with a brand palette
        // primary is a saturated colour, and every form label on the site
        // turned orange. A label is not decorative: it should be the most
        // legible thing next to its input.
        //
        // Mono is reserved for numerals and specifications; see globals.css.
        'flex items-center gap-2 text-sm text-foreground leading-none select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export { Label }
