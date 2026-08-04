'use client'

import { Button } from '@/components/ui/button'
import clsx from 'clsx'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

type Props = {
  className?: string
}

export const AccountNav: React.FC<Props> = ({ className }) => {
  const pathname = usePathname()

  return (
    <div className={clsx(className)}>
      <ul className="flex flex-col gap-2">
        <li>
          <Button
            asChild
            variant="link"
            className={clsx('text-muted-foreground no-underline hover:text-foreground hover:underline', {
              'text-foreground underline': pathname === '/account',
            })}
          >
            <Link href="/account">Account settings</Link>
          </Button>
        </li>

        <li>
          <Button
            asChild
            variant="link"
            className={clsx('text-muted-foreground no-underline hover:text-foreground hover:underline', {
              'text-foreground underline': pathname === '/account/addresses',
            })}
          >
            <Link href="/account/addresses">Addresses</Link>
          </Button>
        </li>

        <li>
          <Button
            asChild
            variant="link"
            className={clsx('text-muted-foreground no-underline hover:text-foreground hover:underline', {
              'text-foreground underline': pathname === '/orders' || pathname.includes('/orders'),
            })}
          >
            <Link href="/orders">Orders</Link>
          </Button>
        </li>
      </ul>

      <hr className="w-full border-border" />

      <Button
        asChild
        variant="link"
        className="text-muted-foreground no-underline hover:text-foreground hover:underline"
      >
        <Link href="/logout">Log out</Link>
      </Button>
    </div>
  )
}
