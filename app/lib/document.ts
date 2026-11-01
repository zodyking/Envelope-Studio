import { DEFAULT_FRAMES, DEFAULT_WINDOWS, ENVELOPE_SIZES, LEGACY_KEY, STORAGE_KEY, textStyle, uid } from './constants'
import { escapeHtml, plainToHtml, safeHex } from './text'
import type { Align, Box, DesignItem, FlapStyle, FoldMode, MailDoc, Role, StyleId, SurfaceId, TextStyle } from './types'

const SURFACES: SurfaceId[] = ['envelope', 'back', 'letter', 'letterBack']

function blankSurfaces(): MailDoc['surfaces'] {
  return {
    envelope: { bg: '#ffffff', items: [] },
    back: { bg: '#ffffff', items: [] },
    letter: { bg: '#ffffff', items: [] },
    letterBack: { bg: '#ffffff', items: [] },
  }
}

export function createDefault(): MailDoc {
  return {
    version: 4,
    title: 'Envelope 1',
    sizeId: '10',
    w: 241.3,
    h: 104.775,
    style: 'plain',
    sortingAssist: true,
    foldGuides: 'front',
    flap: 'commercial',
    cal: { x: 0, y: 0 },
    insert: { sheet: 'letter', panel: 0, left: 0, top: 0 },
    windows: {
      recipient: { ...DEFAULT_WINDOWS.recipient },
      sender: { ...DEFAULT_WINDOWS.sender },
    },
    windowShift: { recipient: { x: 0, y: 0 }, sender: { x: 0, y: 0 } },
    recipient: {
      html: plainToHtml('JANE SMITH\n123 MAIN STREET\nBROOKLYN NY 11201'),
      style: textStyle({ size: 12 }),
      frame: { ...DEFAULT_FRAMES.recipient },
    },
    sender: {
      html: plainToHtml('YOUR NAME\n123 RETURN STREET\nBROOKLYN NY 11201'),
      style: textStyle({ size: 9.5 }),
      frame: { ...DEFAULT_FRAMES.sender },
    },
    surfaces: blankSurfaces(),
    stamp: null,
    batchText: '',
    batchEnabled: false,
    view: 'envelope',
  }
}

function box(value: Partial<Box> | undefined, fallback: Box): Box {
  return {
    x: Number.isFinite(Number(value?.x)) ? Number(value?.x) : fallback.x,
    y: Number.isFinite(Number(value?.y)) ? Number(value?.y) : fallback.y,
    w: Number.isFinite(Number(value?.w)) ? Number(value?.w) : fallback.w,
    h: Number.isFinite(Number(value?.h)) ? Number(value?.h) : fallback.h,
  }
}

function styleOf(value: Partial<TextStyle> | undefined, fallback: TextStyle): TextStyle {
  const align: Align = value?.align === 'center' || value?.align === 'right' ? value.align : fallback.align
  return textStyle({
    ...fallback,
    ...value,
    align,
    size: Number(value?.size) || fallback.size,
    color: safeHex(value?.color, fallback.color),
    font: value?.font || fallback.font,
    lineHeight: Number(value?.lineHeight) || fallback.lineHeight,
  })
}

function surfaceId(value: unknown): SurfaceId {
  if (value === 'back' || value === 'letter' || value === 'letterBack' || value === 'envelope') return value
  if (value === 'insert') return 'letter'
  if (value === 'insertBack') return 'letterBack'
  return 'envelope'
}

export function normalize(raw: Partial<MailDoc> | null | undefined): MailDoc | null {
  if (!raw || typeof raw !== 'object') return null
  const base = createDefault()
  const size = ENVELOPE_SIZES.find(item => item.id === raw.sizeId)
  const style: StyleId = raw.style === 'single' || raw.style === 'double' ? raw.style : 'plain'
  const fold: FoldMode = raw.foldGuides === 'back' || raw.foldGuides === 'none' ? raw.foldGuides : 'front'
  const flap: FlapStyle = raw.flap === 'square' || raw.flap === 'pointed' || raw.flap === 'contour' ? raw.flap : 'commercial'
  const surfaces = blankSurfaces()
  for (const id of SURFACES) {
    const incoming = raw.surfaces?.[id]
    surfaces[id] = {
      bg: safeHex(incoming?.bg, '#ffffff'),
      items: Array.isArray(incoming?.items) ? incoming.items.map(normalizeItem).filter((item): item is DesignItem => !!item) : [],
    }
  }
  return {
    ...base,
    ...raw,
    version: 4,
    title: raw.title || base.title,
    sizeId: size?.id || 'custom',
    w: Number(raw.w) || size?.w || base.w,
    h: Number(raw.h) || size?.h || base.h,
    style,
    sortingAssist: raw.sortingAssist !== false,
    foldGuides: fold,
    flap,
    cal: { x: Number(raw.cal?.x) || 0, y: Number(raw.cal?.y) || 0 },
    insert: {
      sheet: raw.insert?.sheet === 'a4' ? 'a4' : 'letter',
      panel: raw.insert?.panel === 1 || raw.insert?.panel === 2 ? raw.insert.panel : 0,
      left: Number(raw.insert?.left) || 0,
      top: Number(raw.insert?.top) || 0,
    },
    windows: {
      recipient: box(raw.windows?.recipient, base.windows.recipient),
      sender: box(raw.windows?.sender, base.windows.sender),
    },
    windowShift: {
      recipient: { x: Number(raw.windowShift?.recipient?.x) || 0, y: Number(raw.windowShift?.recipient?.y) || 0 },
      sender: { x: Number(raw.windowShift?.sender?.x) || 0, y: Number(raw.windowShift?.sender?.y) || 0 },
    },
    recipient: {
      html: raw.recipient?.html || base.recipient.html,
      style: styleOf(raw.recipient?.style, base.recipient.style),
      frame: box(raw.recipient?.frame, base.recipient.frame),
    },
    sender: {
      html: raw.sender?.html || base.sender.html,
      style: styleOf(raw.sender?.style, base.sender.style),
      frame: box(raw.sender?.frame, base.sender.frame),
    },
    surfaces,
    stamp: raw.stamp?.src
      ? {
          src: raw.stamp.src,
          name: raw.stamp.name || 'Postage',
          dpi: Number(raw.stamp.dpi) || 600,
          frame: box(raw.stamp.frame, DEFAULT_FRAMES.stamp),
        }
      : null,
    batchText: raw.batchText || '',
    batchEnabled: !!raw.batchEnabled,
    view: surfaceId(raw.view),
  }
}

function normalizeItem(raw: Partial<DesignItem>): DesignItem | null {
  if (!raw || (raw.type !== 'text' && raw.type !== 'rect' && raw.type !== 'line' && raw.type !== 'image')) return null
  return {
    id: raw.id || uid(),
    type: raw.type,
    frame: box(raw.frame, { x: 12, y: 12, w: 40, h: raw.type === 'line' ? 0 : 16 }),
    html: raw.html,
    style: raw.style ? styleOf(raw.style, textStyle()) : undefined,
    color: raw.color ? safeHex(raw.color, '#315b88') : undefined,
    stroke: Number(raw.stroke) || undefined,
    filled: !!raw.filled,
    src: raw.src,
    name: raw.name,
  }
}

interface LegacyLine {
  bold?: boolean
  italic?: boolean
  size?: number
  color?: string
  align?: Align
  lineHeight?: number
}

function legacyHtml(text: string, font: string, size: number, bold: boolean, lines?: Record<string, LegacyLine>) {
  return String(text || '').split(/\n/).map((line, index) => {
    const lineStyle = lines?.[index] || lines?.[String(index)]
    const useSize = lineStyle?.size || size
    const useBold = lineStyle?.bold ?? (index === 0 ? bold : false)
    const italic = !!lineStyle?.italic
    const color = safeHex(lineStyle?.color, '#242424')
    const align = lineStyle?.align === 'center' || lineStyle?.align === 'right' ? lineStyle.align : 'left'
    const css = `font-family:${font};font-size:${useSize}pt;font-weight:${useBold ? 700 : 400};font-style:${italic ? 'italic' : 'normal'};color:${color}`
    return `<p style="text-align:${align}"><span style="${css}">${escapeHtml(line) || '<br>'}</span></p>`
  }).join('')
}

function legacyDesign(items: unknown, font: string): DesignItem[] {
  if (!Array.isArray(items)) return []
  return items.flatMap((raw) => {
    const item = raw as Record<string, unknown>
    const type = item.type === 'logo' ? 'image' : item.type
    if (type !== 'text' && type !== 'rect' && type !== 'line' && type !== 'image') return []
    const rect = (item.rect || {}) as Partial<Box>
    const design: DesignItem = {
      id: String(item.id || uid()),
      type,
      frame: box(rect, { x: 14, y: 20, w: 50, h: type === 'line' ? 0 : 18 }),
      color: safeHex(String(item.color || '#315b88')),
      stroke: Number(item.stroke) || 0.7,
      filled: !!item.filled,
      src: typeof item.src === 'string' ? item.src : undefined,
      name: type === 'image' ? 'Picture' : undefined,
    }
    if (type === 'text') {
      design.style = textStyle({
        font: String(item.font || font),
        size: Number(item.fontSize) || 12,
        color: safeHex(String(item.color || '#242424')),
        bold: !!item.bold,
        italic: !!item.italic,
      })
      design.html = plainToHtml(String(item.text || 'Text'))
    }
    return [design]
  })
}

export function migrateV3(raw: Record<string, unknown>): MailDoc {
  const doc = createDefault()
  const font = String(raw.font || 'Arial')
  const sizeId = String(raw.size || '10')
  const known = ENVELOPE_SIZES.find(item => item.id === sizeId)
  doc.sizeId = known?.id || 'custom'
  doc.w = Number(raw.w) || known?.w || doc.w
  doc.h = Number(raw.h) || known?.h || doc.h
  const style = String(raw.style || 'plain')
  doc.style = style === 'single' || style === 'double' ? style : 'plain'
  doc.sortingAssist = raw.sortingAssist !== false
  const fold = String(raw.foldGuides || 'front')
  doc.foldGuides = fold === 'back' || fold === 'none' ? fold : 'front'
  const cal = (raw.cal || {}) as { x?: number; y?: number }
  doc.cal = { x: Number(cal.x) || 0, y: Number(cal.y) || 0 }
  const insert = (raw.insert || {}) as { sheet?: string; panel?: number; left?: number; top?: number }
  doc.insert = {
    sheet: insert.sheet === 'a4' ? 'a4' : 'letter',
    panel: insert.panel === 1 || insert.panel === 2 ? insert.panel : 0,
    left: Number(insert.left) || 0,
    top: Number(insert.top) || 0,
  }
  const windows = (raw.windows || {}) as Record<string, Partial<Box>>
  const shift = (raw.windowShift || {}) as Record<string, { x?: number; y?: number }>
  const rect = (raw.rect || {}) as Record<string, Partial<Box>>
  for (const role of ['recipient', 'sender'] as Role[]) {
    doc.windows[role] = box(windows[role], DEFAULT_WINDOWS[role])
    doc.windowShift[role] = { x: Number(shift[role]?.x) || 0, y: Number(shift[role]?.y) || 0 }
    doc[role].frame = box(rect[role], DEFAULT_FRAMES[role])
  }
  const lineStyles = (raw.lineStyles || {}) as Record<string, Record<string, LegacyLine>>
  doc.recipient.html = legacyHtml(String(raw.recipient || ''), font, Number(raw.recipientFont) || 12, !!raw.recipientBold, lineStyles.recipient)
  doc.recipient.style = textStyle({ font, size: Number(raw.recipientFont) || 12, bold: !!raw.recipientBold })
  doc.sender.html = legacyHtml(String(raw.sender || ''), font, Number(raw.senderFont) || 9.5, !!raw.senderBold, lineStyles.sender)
  doc.sender.style = textStyle({ font, size: Number(raw.senderFont) || 9.5, bold: !!raw.senderBold })
  const bg = (raw.surfaceBg || {}) as Record<string, string>
  doc.surfaces.envelope = { bg: safeHex(bg.envelope, '#ffffff'), items: legacyDesign(raw.design, font) }
  doc.surfaces.back = { bg: safeHex(bg.back, '#ffffff'), items: legacyDesign(raw.backDesign, font) }
  doc.surfaces.letter = { bg: safeHex(bg.insert, '#ffffff'), items: legacyDesign(raw.insertDesign, font) }
  doc.surfaces.letterBack = { bg: safeHex(bg.insertBack, '#ffffff'), items: legacyDesign(raw.insertBackDesign, font) }
  const extras = Array.isArray(raw.extra) ? raw.extra : []
  for (const extra of extras) {
    const item = extra as { id?: string; text?: string; fontSize?: number; bold?: boolean; rect?: Partial<Box> }
    doc.surfaces.envelope.items.push({
      id: item.id || uid('t'),
      type: 'text',
      frame: box(item.rect, { x: 42, y: 34, w: 90, h: 22 }),
      html: plainToHtml(String(item.text || '')),
      style: textStyle({ font, size: Number(item.fontSize) || 10, bold: !!item.bold }),
    })
  }
  if (typeof raw.stampData === 'string' && raw.stampData) {
    doc.stamp = {
      src: raw.stampData,
      name: String(raw.stampName || 'Postage'),
      dpi: Number(raw.pdfDpi) || 600,
      frame: {
        ...box(rect.stamp, DEFAULT_FRAMES.stamp),
        w: Number(raw.stampW) || 35,
        h: Number(raw.stampH) || 25,
      },
    }
  }
  doc.batchText = String(raw.batchText || '')
  doc.batchEnabled = !!raw.batchEnabled
  doc.view = surfaceId(raw.view)
  return doc
}

export function loadDoc(): MailDoc {
  if (typeof localStorage === 'undefined') return createDefault()
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const doc = normalize(JSON.parse(saved) as MailDoc)
      if (doc) return doc
    }
  } catch { /* start fresh or migrate */ }
  try {
    const legacy = localStorage.getItem(LEGACY_KEY)
    if (legacy) return migrateV3(JSON.parse(legacy) as Record<string, unknown>)
  } catch { /* default */ }
  return createDefault()
}

export function saveDoc(doc: MailDoc) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(doc))
}
