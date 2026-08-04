import { describe, it, expect } from 'vitest'

import { composeReply } from '@/lib/email/composeReply'

describe('composeReply', () => {
  it('appends the signature with the RFC-style "-- " separator', () => {
    const { text } = composeReply('Thanks, shipped today.', 'Alex\nAcme Housewares')
    expect(text).toBe('Thanks, shipped today.\n\n-- \nAlex\nAcme Housewares')
  })

  it('omits the separator entirely without a signature', () => {
    const { text, html } = composeReply('Just the body.', undefined)
    expect(text).toBe('Just the body.')
    expect(html).not.toContain('-- ')
  })

  it('escapes HTML in body and signature', () => {
    const { html } = composeReply('a < b & c', '<b>Sig</b>')
    expect(html).toContain('a &lt; b &amp; c')
    expect(html).toContain('&lt;b>Sig&lt;/b>')
    expect(html).not.toContain('<b>Sig</b>')
  })
})
