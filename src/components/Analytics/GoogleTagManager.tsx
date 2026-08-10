import React from 'react'

import { getAnalyticsSettings, validGtmId } from '@/lib/analytics/settings'

/**
 * GTM container — renders nothing unless a GTM-XXXXXXX id is set in
 * Settings → Analytics. Two pieces, matching Google's own install
 * instructions exactly: the head snippet (as early in <head> as possible —
 * placed after ConsentDefault only so tags configured inside the container
 * later inherit the consent defaults already on the dataLayer) and the
 * <body>-start noscript fallback for JS-disabled visitors.
 */
export const GoogleTagManagerHead: React.FC = async () => {
  const settings = await getAnalyticsSettings()
  const id = validGtmId(settings?.gtmContainerId)
  if (!id) return null

  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${id}');`,
      }}
    />
  )
}

export const GoogleTagManagerNoScript: React.FC = async () => {
  const settings = await getAnalyticsSettings()
  const id = validGtmId(settings?.gtmContainerId)
  if (!id) return null

  return (
    <noscript>
      <iframe
        src={`https://www.googletagmanager.com/ns.html?id=${encodeURIComponent(id)}`}
        height="0"
        width="0"
        style={{ display: 'none', visibility: 'hidden' }}
      />
    </noscript>
  )
}
