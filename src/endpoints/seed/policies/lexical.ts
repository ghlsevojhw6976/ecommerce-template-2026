/**
 * Minimal Lexical builders.
 *
 * Policy documents are long, and hand-writing Lexical JSON for them would be
 * unreadable and unmaintainable — the copy is the thing that matters here, so
 * it should be legible in the source. These helpers keep the policy files
 * looking like prose.
 */

type TextNode = {
  detail: number
  format: number
  mode: 'normal'
  style: string
  text: string
  type: 'text'
  version: 1
}

const textNode = (text: string, format = 0): TextNode => ({
  detail: 0,
  format,
  mode: 'normal',
  style: '',
  text,
  type: 'text',
  version: 1,
})

/** Inline bold, written as **bold** in the source copy. */
const inline = (text: string): TextNode[] => {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean)
  return parts.map((part) =>
    part.startsWith('**') && part.endsWith('**')
      ? textNode(part.slice(2, -2), 1)
      : textNode(part),
  )
}

export const p = (text: string) => ({
  children: inline(text),
  direction: 'ltr' as const,
  format: '' as const,
  indent: 0,
  textFormat: 0,
  type: 'paragraph' as const,
  version: 1,
})

export const h = (tag: 'h2' | 'h3', text: string) => ({
  children: inline(text),
  direction: 'ltr' as const,
  format: '' as const,
  indent: 0,
  tag,
  type: 'heading' as const,
  version: 1,
})

export const ul = (items: string[]) => ({
  children: items.map((item, i) => ({
    children: inline(item),
    direction: 'ltr' as const,
    format: '' as const,
    indent: 0,
    type: 'listitem' as const,
    value: i + 1,
    version: 1,
  })),
  direction: 'ltr' as const,
  format: '' as const,
  indent: 0,
  listType: 'bullet' as const,
  start: 1,
  tag: 'ul' as const,
  type: 'list' as const,
  version: 1,
})

export const doc = (children: unknown[]) => ({
  root: {
    children,
    direction: 'ltr' as const,
    format: '' as const,
    indent: 0,
    type: 'root' as const,
    version: 1,
  },
})

/** Wraps a document into the Content block the Pages layout expects. */
export const contentBlock = (children: unknown[]) => ({
  blockType: 'content' as const,
  columns: [
    {
      size: 'full' as const,
      richText: doc(children),
      enableLink: false,
    },
  ],
})
