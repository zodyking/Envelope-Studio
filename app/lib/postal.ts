import { hasWindow, intersects, letterFold } from './geometry'
import { htmlToPlain, postalPlain } from './text'
import type { Box, MailDoc, Role } from './types'

function luminance(hex: string) {
  const h = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : '242424'
  const channels = [0, 2, 4].map(index => parseInt(h.slice(index, index + 2), 16) / 255)
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!
}

export function recipientPlain(doc: MailDoc, override?: string | null) {
  const source = override ?? htmlToPlain(doc.recipient.html)
  return doc.sortingAssist ? postalPlain(source) : source
}

export function layoutWarnings(doc: MailDoc, recipient = recipientPlain(doc)) {
  const warnings: string[] = []
  const lines = recipient.split('\n').map(line => line.trim()).filter(Boolean)
  if (!lines.length) warnings.push('Enter a recipient address')
  else if (doc.sortingAssist) {
    if (lines.length < 3) warnings.push('Include recipient, street, and city/state/ZIP lines')
    const last = lines.at(-1) || ''
    if (!/\b\d{5}(?:-\d{4})?\b/.test(last)) warnings.push('The last line needs a 5-digit ZIP or ZIP+4')
    if (!/\b[A-Z]{2} +\d{5}(?:-\d{4})?\b/.test(last)) warnings.push('Use CITY ST ZIP on the last line')
    if (lines.some(line => line.length > 50)) warnings.push('An address line is longer than 50 characters')
  }
  if (!htmlToPlain(doc.sender.html).trim()) warnings.push('Enter a return address')
  if (doc.recipient.style.size < 8 || luminance(doc.recipient.style.color) > 0.62) {
    warnings.push('Recipient text may be too small or too light for USPS machines')
  }

  const clear: Box = { x: doc.w - 120.65, y: doc.h - 15.875, w: 120.65, h: 15.875 }
  for (const role of ['sender', 'recipient'] as Role[]) {
    if (hasWindow(doc, role)) {
      const win = doc.windows[role]
      if (intersects(win, clear) && win.y + win.h > clear.y + 3.175) warnings.push(`${role} window enters the lower-right sorting zone`)
      continue
    }
    if (intersects(doc[role].frame, clear)) warnings.push(`${role} text reaches the lower-right sorting zone`)
  }
  if (doc.stamp && intersects(doc.stamp.frame, clear)) warnings.push('Postage reaches the lower-right sorting zone')
  for (const item of doc.surfaces.envelope.items) {
    if (intersects(item.frame, clear)) {
      warnings.push('Artwork enters the lower-right sorting zone')
      break
    }
  }

  if (doc.style !== 'plain') {
    const fold = letterFold(doc)
    if (!fold.fitsHeight) warnings.push('A folded letter is taller than this envelope')
    if (!fold.fitsWidth) warnings.push('The letter is wider than the envelope')
    if (!fold.windowsFit) warnings.push('A window sits outside the folded letter')
  }
  return [...new Set(warnings)]
}
