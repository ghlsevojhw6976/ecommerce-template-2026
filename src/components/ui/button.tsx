import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/utilities/cn'

const buttonVariants = cva(
  "relative inline-flex items-center justify-center hover:cursor-pointer gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[color,box-shadow] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 ',
        destructive:
          'bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40',
        // Token PAIRS only: a hover background must bring its own paired
        // foreground. The template shipped `hover:bg-accent
        // hover:bg-primary-foreground` here — two conflicting backgrounds
        // (the second won) and no hover text colour, which under a palette
        // whose primary-foreground is dark rendered dark text on a dark
        // hover: an invisible button label.
        outline:
          'border border-input bg-card shadow-xs hover:bg-secondary hover:text-secondary-foreground hover:border-foreground/40',
        secondary: 'bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80',
        ghost:
          'text-muted-foreground hover:text-foreground [&.active]:text-foreground py-2 px-4 uppercase font-mono tracking-widest text-xs',
        // Underlined foreground, not brand colour: a mid-lightness palette
        // primary fails AA on the page background (measured 2.96:1 here),
        // and an underline signals "link" without leaning on colour at all.
        link: 'text-foreground underline underline-offset-4 hover:text-muted-foreground',
        nav: 'text-muted-foreground hover:text-foreground [&.active]:text-foreground p-0 pt-2 pb-6 uppercase font-mono tracking-widest text-xs',
      },
      size: {
        clear: '',
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5',
        lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
        icon: 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export type ButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }

function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
