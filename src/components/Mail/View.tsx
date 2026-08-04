import type { AdminViewServerProps } from 'payload'

import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter } from '@payloadcms/ui'
import React from 'react'

import { MailClient } from './View.client'

/**
 * /admin/mail — the shop mailbox inside the admin.
 *
 * Server wrapper only: renders the default admin chrome (nav, header) around
 * the client inbox. All data flows through /next/mail, which re-checks the
 * admin role on every request — this component gates rendering, the API
 * gates data.
 */
export const MailView: React.FC<AdminViewServerProps> = ({
  initPageResult,
  params,
  searchParams,
}) => {
  const user = initPageResult?.req?.user

  return (
    <DefaultTemplate
      i18n={initPageResult.req.i18n}
      locale={initPageResult.locale}
      params={params}
      payload={initPageResult.req.payload}
      permissions={initPageResult.permissions}
      searchParams={searchParams}
      user={initPageResult.req.user || undefined}
      visibleEntities={initPageResult.visibleEntities}
    >
      <Gutter>
        {user && (user as { roles?: string[] }).roles?.includes('admin') ? (
          <MailClient />
        ) : (
          <p>You do not have access to the mailbox.</p>
        )}
      </Gutter>
    </DefaultTemplate>
  )
}
