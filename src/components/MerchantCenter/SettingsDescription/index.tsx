import React from 'react'

export const SettingsDescription: React.FC = () => (
  <div style={{ color: 'var(--theme-elevation-600)', marginBottom: 'var(--base)' }}>
    <p style={{ margin: 0 }}>
      Controls how products are published to Google Merchant Center via the{' '}
      <strong>Merchant API v1</strong>.
    </p>
    <p style={{ margin: '0.35rem 0 0' }}>
      Affiliate products are permanently excluded — Google forbids promoting affiliate links in
      Shopping, and feeding one risks account-level enforcement against the whole catalogue.
    </p>
  </div>
)
