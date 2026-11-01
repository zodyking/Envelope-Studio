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

export function showsAddress(doc: MailDoc, role: Role, surface: SurfaceId) {
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
    const page = pageSize(doc, 'letter')
    const panel = page.h / 3
    return {
      x: inner.x - doc.insert.left,
      y: inner.y - doc.insert.top + panel * doc.insert.panel,
      w: inner.w,
      h: inner.h,
    }
  }
  return inner
}

export function writeAddressFrame(doc: MailDoc, role: Role, surface: SurfaceId, next: Box) {
  if (!hasWindow(doc, role)) {
    doc[role].frame = { ...next }
    return
  }
  if (surface !== 'letter') {
    doc.windows[role] = { ...next }
    return
  }
  const page = pageSize(doc, 'letter')
  const panel = page.h / 3
  const inner = {
    x: next.x + doc.insert.left,
    y: next.y + doc.insert.top - panel * doc.insert.panel,
    w: next.w,
    h: next.h,
  }
  doc.windows[role] = {
    x: inner.x - 4,
    y: inner.y - 4,
    w: Math.max(12, inner.w + 8),
    h: Math.max(10, inner.h + 8),
  }
  doc.windowShift[role] = { x: 0, y: 0 }
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
