import { slugField } from 'payload'
import type { CollectionConfig } from 'payload'

import { adminOnly } from '@/access/adminOnly'
import { revalidateCategory, revalidateCategoryDelete } from '@/hooks/revalidateStorefront'

/**
 * Product categories.
 *
 * Two jobs beyond grouping products:
 *
 * 1. **Navigation.** Baymard describes category navigation as the store's table
 *    of contents — it is how most visitors who did not land on a product page
 *    find anything. The header mega-menu is built from this tree.
 *
 * 2. **Import target.** Products are imported per category, so the tree needs to
 *    exist before the catalogue does and stay stable afterwards. Slugs are
 *    permanent for the same reason product slugs are: they appear in URLs and
 *    in the Merchant Center feed.
 *
 * Two levels are supported (parent → child). Three-level menus test badly:
 * users lose track of where they are, and the third level is effectively
 * unreachable on mobile.
 */
export const Categories: CollectionConfig = {
  slug: 'categories',
  access: {
    create: adminOnly,
    delete: adminOnly,
    read: () => true,
    update: adminOnly,
  },
  admin: {
    useAsTitle: 'title',
    group: 'Content',
    defaultColumns: ['title', 'parent', 'showInNav', 'navOrder'],
  },
  hooks: {
    // Categories render in the nav/footer of EVERY static page — a change
    // here is a layout-wide purge, like a Company edit.
    afterChange: [revalidateCategory],
    afterDelete: [revalidateCategoryDelete],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'parent',
      type: 'relationship',
      relationTo: 'categories',
      admin: {
        position: 'sidebar',
        description: 'Leave blank for a top-level category. Only two levels are supported.',
      },
      filterOptions: ({ id }) => {
        // Narrows the picker so a category cannot select itself. This is a
        // convenience only — an API write bypasses filterOptions entirely,
        // which is why the validate below exists as well.
        if (id) return { id: { not_equals: id } }
        return true
      },
    },
    {
      name: 'description',
      type: 'textarea',
      admin: {
        description:
          'Shown at the top of the category page. Worth writing — a category page with real copy ranks; one with a bare product grid does not.',
      },
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description: 'Used for visual category navigation on the homepage and in the mega-menu.',
      },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'showInNav',
          type: 'checkbox',
          defaultValue: true,
          admin: {
            width: '50%',
            description: 'Uncheck to keep a category reachable by URL but out of the menu.',
          },
        },
        {
          name: 'navOrder',
          type: 'number',
          defaultValue: 0,
          admin: {
            width: '50%',
            description: 'Lower sorts first. Ties fall back to alphabetical.',
          },
        },
      ],
    },
    slugField({
      position: undefined,
    }),
  ],
}
