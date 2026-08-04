/**
 * Compose a Mail-view reply: the admin's text plus the configured signature,
 * in both plain-text and minimal-HTML forms. Pure so the escaping and
 * signature rules are unit-testable — a reply is a human writing, not a
 * campaign, so the HTML stays a single pre-wrap block.
 */

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;')

export const composeReply = (
  body: string,
  signature?: string | null,
): { text: string; html: string } => {
  const trimmedBody = body.trim()
  const trimmedSignature = signature?.trim()

  const text = trimmedSignature ? `${trimmedBody}\n\n-- \n${trimmedSignature}` : trimmedBody

  const html = `<div style="font-family:Georgia,serif;font-size:15px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(trimmedBody)}${
    trimmedSignature
      ? `\n\n<span style="color:#6b6b66;">-- \n${escapeHtml(trimmedSignature)}</span>`
      : ''
  }</div>`

  return { text, html }
}
