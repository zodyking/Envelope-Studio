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
