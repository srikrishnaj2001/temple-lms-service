import { parse, type HTMLElement, type Node } from 'node-html-parser'

/**
 * Extract chunker-friendly structured text from arbitrary book HTML.
 *
 * Both reading-library upload paths on templeinfo.org (Google Doc URL and
 * PDF-via-Replit) ultimately serve HTML from /api/books/:id/html-content.
 * The DOM shape differs between the two (CSS classes, wrapper divs), so
 * this extractor is deliberately class-agnostic and leans on semantic tags.
 *
 * Output rules:
 *   - h1..h6                 -> "# text\n\n" .. "###### text\n\n" (chunker splits on headings)
 *   - p                      -> "text\n\n"
 *   - li                     -> "- text\n"  (grouped under their ul/ol)
 *   - table                  -> markdown-ish pipe rows (one line each), surrounded by blank lines
 *                              (chunker treats contiguous | lines as atomic)
 *   - img[alt]               -> "[Image: alt]\n" so the image's semantic value survives embedding
 *   - a[href]                -> link text only (href dropped — the LMS reader is the canonical UI)
 *   - style/script/noscript  -> dropped
 *   - everything else        -> inline text collected into whatever block it sits inside
 *
 * The output is Markdown-ish on purpose: the existing structural chunker
 * (packages/core/src/chunking/chunker.ts) recognises headings, tables, and
 * bulleted lists in that shape and never splits mid-table or mid-list.
 */
export function htmlToStructuredText(html: string): string {
  if (!html || typeof html !== 'string') return ''
  const root = parse(html, {
    lowerCaseTagName: true,
    comment: false,
    voidTag: { tags: ['img', 'br', 'hr', 'input', 'meta', 'link'], closingSlash: true },
    blockTextElements: {
      script: false,
      noscript: false,
      style: false,
      pre: true,
    },
  })

  const parts: string[] = []
  walk(root, parts)
  // Collapse 3+ blank lines to 2 so the chunker sees clean paragraph breaks.
  return parts.join('').replace(/\n{3,}/g, '\n\n').trim()
}

function walk(node: Node, out: string[]): void {
  if (!node) return
  // Text node — append its collapsed-whitespace text.
  if (node.nodeType === 3) {
    const raw = (node as unknown as { rawText?: string }).rawText ?? ''
    const text = decodeAndCollapse(raw)
    if (text) out.push(text)
    return
  }
  if (node.nodeType !== 1) return
  const el = node as HTMLElement
  const tag = el.tagName?.toLowerCase() ?? ''

  if (SKIP.has(tag)) return

  if (/^h[1-6]$/.test(tag)) {
    const level = Number(tag[1])
    const text = plainText(el)
    if (text) {
      out.push('\n\n' + '#'.repeat(level) + ' ' + text + '\n\n')
    }
    return
  }

  if (tag === 'p' || tag === 'div' || tag === 'section' || tag === 'article') {
    // Divs/sections are wrappers in the real HTML — recurse. Only paragraphs
    // emit their own hard break so we don't fragment chunks unnecessarily.
    const before = out.length
    for (const child of el.childNodes) walk(child, out)
    if (tag === 'p' && out.length > before) out.push('\n\n')
    return
  }

  if (tag === 'li') {
    const text = plainText(el)
    if (text) out.push('- ' + text + '\n')
    return
  }

  if (tag === 'ul' || tag === 'ol') {
    out.push('\n')
    for (const child of el.childNodes) walk(child, out)
    out.push('\n')
    return
  }

  if (tag === 'table') {
    out.push('\n')
    const rows = el.querySelectorAll('tr')
    for (const row of rows) {
      const cells = row.querySelectorAll('th, td').map((c) => plainText(c).replace(/\|/g, '\\|'))
      if (cells.length) out.push('| ' + cells.join(' | ') + ' |\n')
    }
    out.push('\n')
    return
  }

  if (tag === 'img') {
    const alt = (el.getAttribute('alt') ?? '').trim()
    if (alt) out.push('[Image: ' + alt + ']\n')
    return
  }

  if (tag === 'br') {
    out.push('\n')
    return
  }

  if (tag === 'a') {
    for (const child of el.childNodes) walk(child, out)
    return
  }

  // Inline / unknown element — recurse into children.
  for (const child of el.childNodes) walk(child, out)
}

function plainText(el: HTMLElement): string {
  const parts: string[] = []
  for (const child of el.childNodes) collectText(child, parts)
  return parts.join('').replace(/\s+/g, ' ').trim()
}

function collectText(node: Node, out: string[]): void {
  if (node.nodeType === 3) {
    out.push(decodeAndCollapse((node as unknown as { rawText?: string }).rawText ?? ''))
    return
  }
  if (node.nodeType !== 1) return
  const el = node as HTMLElement
  const tag = el.tagName?.toLowerCase() ?? ''
  if (SKIP.has(tag)) return
  if (tag === 'br') {
    out.push(' ')
    return
  }
  if (tag === 'img') {
    const alt = (el.getAttribute('alt') ?? '').trim()
    if (alt) out.push(' [Image: ' + alt + '] ')
    return
  }
  for (const child of el.childNodes) collectText(child, out)
}

function decodeAndCollapse(raw: string): string {
  if (!raw) return ''
  const decoded = raw
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)))
  // Collapse runs of whitespace but keep single spaces/newlines meaningful.
  return decoded.replace(/[ \t]+/g, ' ')
}

const SKIP = new Set(['style', 'script', 'noscript', 'head', 'meta', 'link', 'title', 'iframe', 'embed', 'object', 'form', 'input', 'button', 'textarea', 'select'])
