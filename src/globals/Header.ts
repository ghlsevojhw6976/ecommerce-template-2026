import type { GlobalConfig } from 'payload'

import { adminOnly } from '@/access/adminOnly'
import { link } from '@/fields/link'
import { revalidateEverything } from '@/hooks/revalidateStorefront'

export const Header: GlobalConfig = {
  slug: 'header',
  hooks: {
    afterChange: [revalidateEverything],
  },
  access: {
    read: () => true,
    update: adminOnly,
  },
  fields: [
    {
      name: 'navItems',
      type: 'array',
      fields: [
        link({
          appearances: false,
        }),
      ],
      maxRows: 6,
    },
  ],
}
