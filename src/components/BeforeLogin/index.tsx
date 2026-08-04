import React from 'react'

export const BeforeLogin: React.FC = () => {
  return (
    <div>
      <p>
        <b>Welcome to your dashboard!</b>
        {' This is where site admins will log in to manage your store. Customers will need to '}
        {/* Relative on purpose: the storefront login is always same-origin,
            which retired the PAYLOAD_PUBLIC_SERVER_URL env var. */}
        <a href="/login">log in to the site instead</a>
        {' to access their user account, order history, and more.'}
      </p>
    </div>
  )
}
