import { getCachedGlobal } from '@/utilities/getGlobals'

import './index.css'
import { HeaderClient } from './index.client'
import { AnnouncementBar } from './AnnouncementBar'
import { BrandLogo } from '@/components/BrandLogo'
import { getNavCategories } from '@/utilities/getNavCategories'
import { companyName, getCompany } from '@/utilities/getCompany'

export async function Header() {
  const [header, categories, company] = await Promise.all([
    getCachedGlobal('header', 1)(),
    getNavCategories(),
    getCompany(),
  ])

  return (
    <>
      <AnnouncementBar />
      {/* BrandLogo is an async server component and the header shell is a client
          component (it needs usePathname). Rendering the logo here and passing
          it through as a slot keeps company data on the server — the
          alternative is shipping the whole Company global to the browser just
          to pick an image URL. */}
      <HeaderClient
        categories={categories}
        header={header}
        logo={<BrandLogo />}
        storeName={companyName(company)}
      />
    </>
  )
}
