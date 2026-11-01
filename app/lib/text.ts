import type { Align, TextStyle } from './types'

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function plainToHtml(text: string) {
  const lines = String(text ?? '').split(/\r?\n/)
  if (!lines.length) return '<p></p>'
  return lines.map(line => `<p>${escapeHtml(line) || '<br>'}</p>`).join('')
}

export function htmlToPlain(html: string) {
  if (typeof document === 'undefined') {
    return String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim()
  }
  const root = document.createElement('div')
  root.innerHTML = html || ''
  const blocks = [...root.querySelectorAll('p, li, h1, h2, h3')]
  if (!blocks.length) return (root.textContent || '').replace(/\u00a0/g, ' ')
  return blocks.map(el => (el.textContent || '').replace(/\u00a0/g, ' ')).join('\n')
}

export function postalPlain(text: string) {
  return String(text || '')
    .split(/\r?\n/)
    .map(line => line.trim().replace(/\s+/g, ' ').replace(/[.,]/g, '').toUpperCase())
    .join('\n')
    .trim()
}

function postalText(value: string) {
  return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').replace(/[.,]/g, '').toUpperCase()
}

export function postalHtml(html: string) {
  if (typeof document === 'undefined') return plainToHtml(postalPlain(htmlToPlain(html)))
  const root = document.createElement('div')
  root.innerHTML = html || ''
  const blocks = [...root.querySelectorAll('p, li, h1, h2, h3')]
  const targets: ParentNode[] = blocks.length ? blocks : [root]
  for (const block of targets) {
    const nodes: Text[] = []
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) nodes.push(walker.currentNode as Text)
    for (const node of nodes) node.data = postalText(node.data)
    const filled = nodes.filter(node => node.data.length)
    if (!filled.length) continue
    filled[0]!.data = filled[0]!.data.replace(/^\s+/, '')
    const last = filled[filled.length - 1]!
    last.data = last.data.replace(/\s+$/, '')
  }
  return root.innerHTML || '<p></p>'
}

export function isEmptyHtml(html: string) {
  return !htmlToPlain(html).trim()
}

const ALIGNS = new Set<Align>(['left', 'center', 'right'])

export function asAlign(value: string | null | undefined, fallback: Align = 'left'): Align {
  return ALIGNS.has(value as Align) ? value as Align : fallback
}

export function textCss(style: TextStyle): Record<string, string> {
  return {
    fontFamily: style.font,
    fontSize: `${style.size}pt`,
    color: style.color,
    textAlign: style.align,
    lineHeight: String(style.lineHeight),
    fontWeight: style.bold ? '700' : '400',
    fontStyle: style.italic ? 'italic' : 'normal',
    textDecoration: style.underline ? 'underline' : 'none',
  }
}

export function safeHex(color: string | undefined, fallback = '#242424') {
  return /^#[0-9a-f]{6}$/i.test(String(color || '')) ? String(color) : fallback
}
