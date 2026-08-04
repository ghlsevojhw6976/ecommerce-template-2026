import type { Company, Page } from '@/payload-types'

import { buildPlaceholders, resolvePlaceholders } from './companyPlaceholders'

/**
 * FAQPage structured data from a policy page's lexical content.
 *
 * Google dropped FAQ rich results for ordinary sites in 2023, so this earns
 * no SERP treatment — it exists for machine comprehension: answer engines
 * consume Q&A pairs far more reliably when they are explicit. Cheap because
 * it derives from the SAME seeded content the visitor reads, with the same
 * {{company.*}} placeholder resolution, so the schema can never answer
 * differently than the page.
 *
 * Extraction contract: an h2/h3 heading is a question; every paragraph until
 * the next heading is its answer. That is exactly how the FAQ seed is
 * structured.
 */

type LexicalNode = {
  type?: string
  tag?: string
  text?: string
  children?: LexicalNode[]
  [key: string]: unknown
}

const textOf = (node: LexicalNode): string => {
  if (typeof node.text === 'string') return node.text
  return (node.children ?? []).map(textOf).join('')
}

/** Depth-first walk collecting heading/paragraph sequence in document order. */
const collectSequence = (value: unknown, out: { kind: 'q' | 'a'; text: string }[]): void => {
  if (Array.isArray(value)) {
    for (const item of value) collectSequence(item, out)
    return
  }
  if (!value || typeof value !== 'object') return

  const node = value as LexicalNode
  if (node.type === 'heading' && (node.tag === 'h2' || node.tag === 'h3')) {
    const text = textOf(node).trim()
    if (text) out.push({ kind: 'q', text })
    return
  }
  if (node.type === 'paragraph' || node.type === 'list') {
    const text = textOf(node).trim()
    if (text) out.push({ kind: 'a', text })
    return
  }

  for (const child of Object.values(node)) {
    if (child && typeof child === 'object') collectSequence(child, out)
  }
}

export const faqJsonLd = (page: Page, company: Partial<Company>): object | null => {
  const sequence: { kind: 'q' | 'a'; text: string }[] = []
  collectSequence(page.layout, sequence)

  const map = buildPlaceholders(company)
  const questions: { question: string; answer: string }[] = []
  let current: { question: string; answer: string } | null = null

  for (const item of sequence) {
    if (item.kind === 'q') {
      if (current?.answer) questions.push(current)
      current = { question: resolvePlaceholders(item.text, map), answer: '' }
    } else if (current) {
      const resolved = resolvePlaceholders(item.text, map)
      current.answer = current.answer ? `${current.answer} ${resolved}` : resolved
    }
  }
  if (current?.answer) questions.push(current)

  // A page with one heading isn't an FAQ — don't emit a hollow block.
  if (questions.length < 2) return null

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: questions.map((qa) => ({
      '@type': 'Question',
      name: qa.question,
      acceptedAnswer: { '@type': 'Answer', text: qa.answer },
    })),
  }
}
