import type { Box, MailDoc, Role, SurfaceId } from './types'

export function pageSize(doc: MailDoc, surface: SurfaceId = doc.view): Box {
  if (surface === 'letter' || surface === 'letterBack') {
    return doc.insert.sheet === 'a4'
      ? { x: 0, y: 0, w: 210, h: 297 }
      : { x: 0, y: 0, w: 215.9, h: 279.4 }
  }
  return { x: 0, y: 0, w: doc.w, h: doc.h }
}

export function isLetter(surface: SurfaceId) {
  return surface === 'letter' || surface === 'letterBack'
}

export interface PrintPaper {
  id: 'Letter' | 'A4' | 'custom'
  name: string
  widthMm: number
  heightMm: number
  landscape: boolean
  widthMicrons: number
  heightMicrons: number
}

/** The physical sheet. Letter and A4 use the printer's real paper, at the same size as the page in the studio. */
export function printPaper(doc: MailDoc, surface: SurfaceId): PrintPaper {
  const size = pageSize(doc, surface)
  if (isLetter(surface)) {
    if (doc.insert.sheet === 'a4') {
      return { id: 'A4', name: 'A4', widthMm: 210, heightMm: 297, landscape: false, widthMicrons: 210000, heightMicrons: 297000 }
    }
    return { id: 'Letter', name: 'US Letter', widthMm: 215.9, heightMm: 279.4, landscape: false, widthMicrons: 215900, heightMicrons: 279400 }
  }
  return {
    id: 'custom',
    name: 'Envelope',
    widthMm: size.w,
    heightMm: size.h,
    landscape: false,
    widthMicrons: Math.round(size.w * 1000),
    heightMicrons: Math.round(size.h * 1000),
  }
}

/** A window envelope prints the letter. The back is included only when it carries ink. */
export function letterBackNeeded(doc: MailDoc) {
  if (doc.foldGuides === 'back') return true
  const back = doc.surfaces.letterBack
  if (back.items.length > 0) return true
  const bg = back.bg.trim().toLowerCase()
  return bg !== '#ffffff' && bg !== '#fff' && bg !== 'white'
}

export function pagesToPrint(doc: MailDoc): SurfaceId[] {
  if (doc.style === 'plain') return [doc.view]
  return letterBackNeeded(doc) ? ['letter', 'letterBack'] : ['letter']
}

export function hasWindow(doc: MailDoc, role: Role) {
  return doc.style === 'double' || (doc.style === 'single' && role === 'recipient')
}

const INSERT_CLEARANCE = 2

function roundMm(value: number) {
  return Math.round(value * 100) / 100
}

export interface FoldCrease {
  y: number
  label: string
}

export interface LetterFold {
  face: number
  side: number
  seat: number
  creases: FoldCrease[]
  fitsHeight: boolean
  fitsWidth: boolean
  windowsFit: boolean
}

/** Two creases that make the sheet fit the envelope, with the top face outside and right-side up. */
export function letterFold(doc: MailDoc): LetterFold {
  const letter = pageSize(doc, 'letter')
  const third = letter.h / 3
  const room = doc.h - INSERT_CLEARANCE
  // Equal thirds whenever they fit. Only a short envelope forces a taller outside panel.
  const face = roundMm(third <= room ? third : Math.min(letter.h, Math.max(third, room)))
  const creases: FoldCrease[] = []
  if (letter.h - face > 0.4) {
    const bottom = roundMm((face + letter.h) / 2)
    creases.push({ y: bottom, label: `1  Fold the bottom up at ${bottom.toFixed(2)} mm` })
    creases.push({ y: face, label: `2  Fold the top back at ${face.toFixed(2)} mm, print facing out` })
  }
  const side = roundMm((doc.w - letter.w) / 2)
  const slack = roundMm(doc.h - face)
  const windows = (['recipient', 'sender'] as Role[]).filter(role => hasWindow(doc, role)).map(role => doc.windows[role])
  const centered = roundMm(Math.max(0, slack / 2))
  let seat = slack < 0 ? 0 : centered
  let windowsFit = true
  if (windows.length) {
    const top = Math.min(...windows.map(box => box.y))
    const bottom = Math.max(...windows.map(box => box.y + box.h))
    const spanFits = bottom - top <= face + 0.05
    const targets = spanFits ? windows : [windows[0]!]
    const bandTop = Math.min(...targets.map(box => box.y))
    const bandBottom = Math.max(...targets.map(box => box.y + box.h))
    if (slack >= -0.05) {
      const low = Math.max(0, roundMm(bandBottom - face))
      const high = Math.min(Math.max(0, slack), bandTop)
      if (low <= high + 0.05) seat = roundMm(Math.min(high, Math.max(low, centered)))
      else windowsFit = false
    }
    if (!spanFits) windowsFit = false
    if (windows.some(box => box.y < seat - 0.05 || box.y + box.h > seat + face + 0.05)) windowsFit = false
    if (windows.some(box => box.x < side - 0.05 || box.x + box.w > side + letter.w + 0.05)) windowsFit = false
  }
  return {
    face,
    side,
    seat,
    creases,
    fitsHeight: face <= doc.h + 0.05,
    fitsWidth: letter.w <= doc.w + 0.05,
    windowsFit,
  }
}

/** The address field on screen. A windowed address is the same field on the envelope and the letter. */
export function showsAddress(doc: MailDoc, role: Role, surface: SurfaceId) {
  if (surface === 'letter') return hasWindow(doc, role)
  if (surface === 'envelope') return true
  return false
}

/** Ink. A windowed address is printed on the letter, where it shows through the window. */
export function printsAddress(doc: MailDoc, role: Role, surface: SurfaceId) {
  if (surface === 'letter') return hasWindow(doc, role)
  if (surface === 'envelope') return !hasWindow(doc, role)
  return false
}

export function addressFrame(doc: MailDoc, role: Role, surface: SurfaceId): Box {
  if (!hasWindow(doc, role)) return { ...doc[role].frame }
  const box = doc.windows[role]
  const shift = doc.windowShift[role]
  const inner: Box = {
    x: box.x + 4 + shift.x,
    y: box.y + 4 + shift.y,
    w: Math.max(8, box.w - 8),
    h: Math.max(6, box.h - 8),
  }
  if (surface === 'letter') {
    const fold = letterFold(doc)
    return {
      x: inner.x - fold.side,
      y: inner.y - fold.seat,
      w: inner.w,
      h: inner.h,
    }
  }
  return inner
}

function placeWindowFromInner(doc: MailDoc, role: Role, inner: Box) {
  doc.windows[role] = {
    x: inner.x - 4,
    y: inner.y - 4,
    w: Math.max(12, inner.w + 8),
    h: Math.max(10, inner.h + 8),
  }
  doc.windowShift[role] = { x: 0, y: 0 }
}

export function writeAddressFrame(doc: MailDoc, role: Role, surface: SurfaceId, next: Box) {
  if (!hasWindow(doc, role)) {
    doc[role].frame = { ...next }
    return
  }
  if (surface === 'letter') {
    const fold = letterFold(doc)
    placeWindowFromInner(doc, role, {
      x: next.x + fold.side,
      y: next.y + fold.seat,
      w: next.w,
      h: next.h,
    })
    return
  }
  placeWindowFromInner(doc, role, next)
}

export function intersects(a: Box, b: Box) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

export function resizeBox(start: Box, dx: number, dy: number, dir: string, minH = 4): Box {
  let { x, y, w, h } = start
  if (dir.includes('e')) w += dx
  if (dir.includes('s')) h += dy
  if (dir.includes('w')) {
    x += dx
    w -= dx
  }
  if (dir.includes('n')) {
    y += dy
    h -= dy
  }
  return {
    x,
    y,
    w: Math.max(6, Math.round(w * 4) / 4),
    h: Math.max(minH, Math.round(h * 4) / 4),
  }
}

export function cssBox(box: Box) {
  return {
    left: `${box.x}mm`,
    top: `${box.y}mm`,
    width: `${box.w}mm`,
    height: `${box.h}mm`,
  }
}
