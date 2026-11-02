import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import { alignOnPage, alignToPeer, type PageAlign, type PeerAlign } from '~/lib/align'
import type { Editor } from '@tiptap/core'
import { DEFAULT_FRAMES, ENVELOPE_SIZES, SURFACE_LABEL, textStyle, uid, windowDefaults } from '~/lib/constants'
import { addressFromRow, parseCSV } from '~/lib/csv'
import { loadDoc, normalize, saveDoc } from '~/lib/document'
import { transformHtml } from '~/lib/editor'
import { downloadBlob, downscale, fileToData } from '~/lib/files'
import { addressFrame, hasWindow, isLetter, pageSize, pagesToPrint, printPaper, resizeBox, showsAddress, writeAddressFrame } from '~/lib/geometry'
import { buildPdf } from '~/lib/pdfExport'
import { layoutWarnings, recipientPlain } from '~/lib/postal'
import { asAlign, htmlToPlain, plainToHtml, safeHex } from '~/lib/text'
import type { Box, DesignItem, FlapStyle, FoldMode, MailDoc, Role, StyleId, SurfaceId } from '~/lib/types'

export interface PrintPage {
  surface: SurfaceId
  recipientPlain: string | null
  test: boolean
}

export type PrintTarget = 'letter' | 'letterBoth' | 'envelope' | 'back' | 'envelopeBoth'

const assets = new Map<string, string>()

function intern(src: string) {
  for (const [key, value] of assets) if (value === src) return key
  const key = `a${assets.size + 1}`
  assets.set(key, src)
  return key
}

function pack(doc: MailDoc) {
  const copy = JSON.parse(JSON.stringify(doc)) as MailDoc
  const shrink = (src?: string) => (src && src.length > 180 ? `asset:${intern(src)}` : src || '')
  if (copy.stamp) copy.stamp.src = shrink(copy.stamp.src)
  for (const surface of Object.values(copy.surfaces)) {
    for (const item of surface.items) if (item.src) item.src = shrink(item.src)
  }
  return JSON.stringify(copy)
}

function hydrate(json: string) {
  const doc = JSON.parse(json) as MailDoc
  const grow = (src?: string) => (src?.startsWith('asset:') ? assets.get(src.slice(6)) || '' : src || '')
  if (doc.stamp) doc.stamp.src = grow(doc.stamp.src)
  for (const surface of Object.values(doc.surfaces)) {
    for (const item of surface.items) if (item.src?.startsWith('asset:')) item.src = grow(item.src)
  }
  return doc
}

function clipboardImage(data: DataTransfer) {
  const named = [...data.files].find(file => file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name))
  if (named) return named
  for (const item of data.items) {
    if (item.kind !== 'file' || !item.type.startsWith('image/')) continue
    const file = item.getAsFile()
    if (file) return file
  }
  return null
}

function findItem(doc: MailDoc, id: string) {
  for (const surface of Object.values(doc.surfaces)) {
    const item = surface.items.find(entry => entry.id === id)
    if (item) return item
  }
  return null
}

function textTarget(doc: MailDoc, id: string | null) {
  if (id === 'recipient' || id === 'sender') {
    const field = doc[id]
    return { html: field.html, style: field.style, setHtml: (html: string) => { field.html = html } }
  }
  const item = id ? findItem(doc, id) : null
  if (!item || item.type !== 'text') return null
  if (!item.style) item.style = textStyle()
  if (!item.html) item.html = '<p></p>'
  return { html: item.html, style: item.style, setHtml: (html: string) => { item.html = html } }
}

let studio: ReturnType<typeof buildStudio> | null = null

export function useStudio() {
  if (!studio) studio = buildStudio()
  return studio
}

function buildStudio() {
  const doc = ref<MailDoc>(loadDoc())
  const selection = ref<string | null>('recipient')
  const editingId = ref<string | null>(null)
  const ribbon = ref('home')
  const backstage = ref<string | null>(null)
  const dialog = ref<null | 'setup' | 'postage' | 'batch' | 'print'>(null)
  const zoom = ref<number | null>(null)
  const scale = ref(1)
  const rulers = ref(true)
  const paneOpen = ref(true)
  const ribbonCollapsed = ref(false)
  const toastText = ref('')
  const savedLabel = ref('Saved on this PC')
  const printJob = ref<PrintPage[]>([])
  const printTarget = ref<PrintTarget>('letter')
  const past = ref<string[]>([])
  const future = ref<string[]>([])
  const live = shallowRef<Editor | null>(null)
  const objectMenu = ref<null | { x: number; y: number; id: string }>(null)
  const rev = ref(0)
  let toastTimer = 0
  let saveTimer = 0
  let gesture = 0
  let editDirty = false
  let keysBound = false

  function toast(message: string) {
    toastText.value = message
    window.clearTimeout(toastTimer)
    toastTimer = window.setTimeout(() => { toastText.value = '' }, 3400)
  }

  function persist() {
    savedLabel.value = 'Saving…'
    window.clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => {
      try {
        saveDoc(doc.value)
        savedLabel.value = 'Saved on this PC'
      } catch {
        savedLabel.value = 'Storage full — export a project file'
      }
      const desktop = window.envelopeDesktop
      if (desktop) void desktop.saveAuto(JSON.stringify(doc.value)).catch(() => {})
    }, 280)
  }

  function snapshot() {
    if (gesture) return
    past.value.push(pack(doc.value))
    if (past.value.length > 40) past.value.shift()
    future.value = []
  }

  function keepSelection() {
    const id = selection.value
    if (!id) return
    if (id === 'recipient' || id === 'sender' || id.startsWith('window:')) return
    if (id === 'stamp') {
      if (!doc.value.stamp) selection.value = null
      return
    }
    if (!findItem(doc.value, id)) selection.value = null
  }

  function undo() {
    endEdit()
    const prev = past.value.pop()
    if (!prev) return
    future.value.push(pack(doc.value))
    doc.value = hydrate(prev)
    keepSelection()
    persist()
  }

  function redo() {
    endEdit()
    const next = future.value.pop()
    if (!next) return
    past.value.push(pack(doc.value))
    doc.value = hydrate(next)
    keepSelection()
    persist()
  }

  function beginGesture() {
    if (editingId.value) endEdit()
    snapshot()
    gesture++
  }

  function endGesture() {
    gesture = 0
    persist()
  }

  function isTextId(id: string | null) {
    if (!id) return false
    if (id === 'recipient' || id === 'sender') return true
    return findItem(doc.value, id)?.type === 'text'
  }

  function frameOf(id: string): Box {
    if (id === 'recipient' || id === 'sender') return addressFrame(doc.value, id, doc.value.view)
    if (id === 'window:recipient' || id === 'window:sender') return { ...doc.value.windows[id.slice(7) as Role] }
    if (id === 'stamp' && doc.value.stamp) return { ...doc.value.stamp.frame }
    const item = findItem(doc.value, id)
    return item ? { ...item.frame } : { x: 0, y: 0, w: 20, h: 10 }
  }

  function setFrame(id: string, box: Box, quiet = false) {
    if (!quiet) snapshot()
    if (id === 'recipient' || id === 'sender') writeAddressFrame(doc.value, id, doc.value.view, box)
    else if (id === 'window:recipient' || id === 'window:sender') doc.value.windows[id.slice(7) as Role] = { ...box }
    else if (id === 'stamp' && doc.value.stamp) Object.assign(doc.value.stamp.frame, box)
    else {
      const item = findItem(doc.value, id)
      if (item) Object.assign(item.frame, item.type === 'line' ? { ...box, h: 0 } : box)
    }
    if (!quiet) persist()
  }

  function select(id: string | null) {
    if (editingId.value && editingId.value !== id) endEdit()
    if (!id || objectMenu.value?.id !== id) objectMenu.value = null
    selection.value = id
  }

  function openObjectMenu(id: string, x: number, y: number) {
    select(id)
    const width = 240
    const height = 420
    objectMenu.value = {
      id,
      x: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - height - 8)),
    }
  }

  function closeObjectMenu() {
    objectMenu.value = null
  }

  function beginEdit(id: string) {
    if (!isTextId(id)) return
    if (editingId.value === id) return
    if (editingId.value) endEdit()
    if (id === 'recipient' || id === 'sender') {
      if (!showsAddress(doc.value, id, doc.value.view)) doc.value.view = 'envelope'
    } else {
      for (const [surface, data] of Object.entries(doc.value.surfaces) as [SurfaceId, MailDoc['surfaces'][SurfaceId]][]) {
        if (data.items.some(item => item.id === id)) doc.value.view = surface
      }
    }
    snapshot()
    editDirty = false
    selection.value = id
    editingId.value = id
    ribbon.value = 'home'
    backstage.value = null
  }

  function endEdit() {
    if (!editingId.value) return
    editingId.value = null
    live.value = null
    if (!editDirty) past.value.pop()
    editDirty = false
    persist()
  }

  function attachEditor(editor: Editor | null) {
    live.value = editor
    rev.value++
  }

  function touch() {
    rev.value++
  }

  function setHtml(id: string, html: string) {
    const target = textTarget(doc.value, id)
    if (!target || target.html === html) return
    target.setHtml(html)
    editDirty = true
    persist()
  }

  function format(command: string, value?: string) {
    const target = textTarget(doc.value, selection.value)
    if (!target) {
      toast('Select a text box first')
      return
    }
    const editor = editingId.value === selection.value ? live.value : null
    if (editor) {
      const chain = editor.chain().focus()
      if (command === 'bold') chain.toggleBold().run()
      else if (command === 'italic') chain.toggleItalic().run()
      else if (command === 'underline') chain.toggleUnderline().run()
      else if (command === 'font' && value) chain.setFontFamily(value).run()
      else if (command === 'size' && value) chain.setFontSize(`${value}pt`).run()
      else if (command === 'color' && value) chain.setColor(value).run()
      else if (command === 'align' && value) chain.setTextAlign(value).run()
      else if (command === 'bullet') chain.toggleBulletList().run()
      else if (command === 'number') chain.toggleOrderedList().run()
      else if (command === 'clear') chain.unsetAllMarks().unsetFontFamily().unsetFontSize().unsetColor().setTextAlign('left').run()
      if (command === 'lineHeight' && value) target.style.lineHeight = Math.min(2, Math.max(1, Number(value) || 1.3))
      touch()
      return
    }
    snapshot()
    if (command === 'lineHeight' && value) {
      target.style.lineHeight = Math.min(2, Math.max(1, Number(value) || 1.3))
      persist()
      return
    }
    const turningOn = command === 'bold' ? !target.style.bold : command === 'italic' ? !target.style.italic : !target.style.underline
    target.setHtml(transformHtml(target.html, (instance) => {
      const chain = instance.chain().focus().selectAll()
      if (command === 'bold') (turningOn ? chain.setBold() : chain.unsetBold()).run()
      else if (command === 'italic') (turningOn ? chain.setItalic() : chain.unsetItalic()).run()
      else if (command === 'underline') (turningOn ? chain.setUnderline() : chain.unsetUnderline()).run()
      else if (command === 'font' && value) chain.setFontFamily(value).run()
      else if (command === 'size' && value) chain.setFontSize(`${value}pt`).run()
      else if (command === 'color' && value) chain.setColor(value).run()
      else if (command === 'align' && value) chain.setTextAlign(value).run()
      else if (command === 'bullet') chain.toggleBulletList().run()
      else if (command === 'number') chain.toggleOrderedList().run()
      else if (command === 'clear') chain.unsetAllMarks().unsetFontFamily().unsetFontSize().unsetColor().setTextAlign('left').run()
    }))
    if (command === 'bold') target.style.bold = turningOn
    if (command === 'italic') target.style.italic = turningOn
    if (command === 'underline') target.style.underline = turningOn
    if (command === 'font' && value) target.style.font = value
    if (command === 'size' && value) target.style.size = Number(value) || target.style.size
    if (command === 'color' && value) target.style.color = safeHex(value)
    if (command === 'align' && value) target.style.align = asAlign(value)
    if (command === 'clear') {
      target.style.bold = false
      target.style.italic = false
      target.style.underline = false
      target.style.color = '#242424'
      target.style.align = 'left'
    }
    persist()
    touch()
  }

  const fontState = computed(() => {
    void rev.value
    const target = textTarget(doc.value, selection.value)
    if (!target) return null
    const editor = editingId.value === selection.value ? live.value : null
    if (editor) {
      const marks = editor.getAttributes('textStyle') as { fontFamily?: string; fontSize?: string; color?: string }
      const paragraph = editor.getAttributes('paragraph') as { textAlign?: string }
      return {
        font: marks.fontFamily || target.style.font,
        size: marks.fontSize ? parseFloat(marks.fontSize) : target.style.size,
        color: safeHex(marks.color || target.style.color),
        bold: editor.isActive('bold'),
        italic: editor.isActive('italic'),
        underline: editor.isActive('underline'),
        align: asAlign(paragraph.textAlign, target.style.align),
        lineHeight: target.style.lineHeight,
        bullet: editor.isActive('bulletList'),
        ordered: editor.isActive('orderedList'),
      }
    }
    return { ...target.style, bullet: false, ordered: false }
  })

  function deleteSelection() {
    const id = selection.value
    if (!id || id === 'recipient' || id === 'sender' || id.startsWith('window:')) return false
    if (id === 'stamp') {
      if (!doc.value.stamp) return false
      snapshot()
      doc.value.stamp = null
      selection.value = 'recipient'
      persist()
      toast('Postage removed from this envelope')
      return true
    }
    for (const surface of Object.values(doc.value.surfaces)) {
      const index = surface.items.findIndex(item => item.id === id)
      if (index >= 0) {
        snapshot()
        surface.items.splice(index, 1)
        selection.value = null
        persist()
        toast('Removed')
        return true
      }
    }
    return false
  }

  function moveLayer(direction: 1 | -1) {
    const surface = doc.value.surfaces[doc.value.view]
    const index = surface.items.findIndex(item => item.id === selection.value)
    const next = index + direction
    if (index < 0 || next < 0 || next >= surface.items.length) return
    snapshot()
    const [item] = surface.items.splice(index, 1)
    if (item) surface.items.splice(next, 0, item)
    persist()
  }

  function makeText(content: string, frame: Box, size: number, bold: boolean, color = '#242424'): DesignItem {
    return {
      id: uid('t'),
      type: 'text',
      frame,
      html: plainToHtml(content),
      style: textStyle({ font: doc.value.recipient.style.font, size, bold, color }),
    }
  }

  function addText() {
    snapshot()
    const page = pageSize(doc.value)
    const item = makeText('Your text', {
      x: 18,
      y: Math.min(36, page.h / 3),
      w: Math.min(120, page.w - 28),
      h: 22,
    }, 12, false)
    doc.value.surfaces[doc.value.view].items.push(item)
    selection.value = item.id
    editingId.value = item.id
    editDirty = true
    ribbon.value = 'home'
    persist()
  }

  function addShape(type: 'rect' | 'line') {
    snapshot()
    const page = pageSize(doc.value)
    const item: DesignItem = {
      id: uid(type === 'line' ? 'l' : 'r'),
      type,
      color: '#315b88',
      stroke: 0.7,
      filled: false,
      frame: type === 'line'
        ? { x: 14, y: Math.min(42, page.h - 8), w: Math.min(70, page.w - 28), h: 0 }
        : { x: 12, y: 12, w: Math.min(70, page.w - 24), h: Math.min(36, page.h - 20) },
    }
    doc.value.surfaces[doc.value.view].items.push(item)
    selection.value = item.id
    persist()
  }

  async function addImage(file: File) {
    const allowed = !file.type || /^image\/(png|jpe?g|gif|webp|bmp)$/.test(file.type)
    if (!allowed || file.size > 8_000_000) {
      toast('Choose a PNG or JPG under 8 MB')
      return
    }
    let scaled: { url: string; width: number; height: number }
    try {
      scaled = await downscale(await fileToData(file), 2200)
    } catch {
      toast('Could not read that image')
      return
    }
    snapshot()
    const aspect = scaled.width / Math.max(1, scaled.height)
    const height = 26
    const item: DesignItem = {
      id: uid('i'),
      type: 'image',
      src: scaled.url,
      name: file.name || 'Pasted image',
      frame: { x: 15, y: 13, w: Math.min(95, Math.max(16, height * aspect)), h: height },
    }
    doc.value.surfaces[doc.value.view].items.push(item)
    selection.value = item.id
    persist()
  }

  function addLetter() {
    if (doc.value.style === 'plain') {
      toast('Choose a window envelope before adding a letter')
      return
    }
    snapshot()
    const page = pageSize(doc.value, 'letter')
    const x = 19
    const w = Math.max(120, page.w - 38)
    const bodyY = Math.max(108, page.h / 3 + 16)
    const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    const items = doc.value.surfaces.letter.items
    items.push(makeText(date, { x, y: 18, w, h: 10 }, 11, false, '#60738c'))
    items.push(makeText('RE: Your correspondence', { x, y: bodyY, w, h: 12 }, 12, true))
    const body = makeText('Dear Recipient,\n\nWrite the letter here. Double-click to edit with bold, italic, lists, and color.\n\nSincerely,\nYour Name', {
      x,
      y: bodyY + 16,
      w,
      h: Math.max(48, page.h - bodyY - 34),
    }, 11, false)
    items.push(body)
    doc.value.view = 'letter'
    selection.value = body.id
    editingId.value = body.id
    editDirty = true
    ribbon.value = 'home'
    persist()
    toast('Letter added. Double-click any text to edit it.')
  }

  function applyPreset(kind: 'clear' | 'line' | 'corner' | 'frame') {
    snapshot()
    const items = doc.value.surfaces[doc.value.view].items
    if (kind === 'clear') {
      items.splice(0, items.length, ...items.filter(item => item.type === 'text' || item.type === 'image'))
      persist()
      return
    }
    const color = '#234e89'
    if (kind === 'line') items.push({ id: uid('l'), type: 'line', color, stroke: 0.7, frame: { x: 12, y: 43, w: 52, h: 0 } })
    if (kind === 'corner') {
      items.push({ id: uid('l'), type: 'line', color, stroke: 0.7, frame: { x: 11, y: 8, w: 38, h: 0 } })
      items.push({ id: uid('r'), type: 'rect', color, stroke: 0.7, filled: true, frame: { x: 11, y: 8, w: 0.7, h: 20 } })
    }
    if (kind === 'frame') {
      const page = pageSize(doc.value)
      items.push({ id: uid('r'), type: 'rect', color: '#c7d4e5', stroke: 0.6, filled: false, frame: { x: 6, y: 6, w: page.w - 12, h: page.h - 12 } })
    }
    persist()
  }

  function setSize(id: string) {
    snapshot()
    const size = ENVELOPE_SIZES.find(item => item.id === id)
    doc.value.sizeId = id
    if (size && id !== 'custom') {
      doc.value.w = size.w
      doc.value.h = size.h
    }
    persist()
  }

  function setCustom(axis: 'w' | 'h', value: number) {
    snapshot()
    doc.value.sizeId = 'custom'
    doc.value[axis] = Math.min(500, Math.max(60, value || doc.value[axis]))
    persist()
  }

  function setStyle(style: StyleId) {
    snapshot()
    const before = windowDefaults(doc.value.style)
    const after = windowDefaults(style)
    for (const role of ['recipient', 'sender'] as Role[]) {
      const current = doc.value.windows[role]
      const untouched = (['x', 'y', 'w', 'h'] as const).every(key => Math.abs(current[key] - before[role][key]) < 0.01)
      if (untouched) {
        doc.value.windows[role] = { ...after[role] }
        doc.value.windowShift[role] = { x: 0, y: 0 }
      }
    }
    doc.value.style = style
    if (style === 'plain' && isLetter(doc.value.view)) doc.value.view = 'envelope'
    selection.value = 'recipient'
    persist()
  }

  function setView(surface: SurfaceId) {
    if (isLetter(surface) && doc.value.style === 'plain') {
      toast('Choose a window envelope to design the letter')
      return
    }
    endEdit()
    doc.value.view = surface
    selection.value = surface === 'back' || surface === 'letterBack' ? null : 'recipient'
    persist()
  }

  function setBg(color: string) {
    doc.value.surfaces[doc.value.view].bg = safeHex(color)
    persist()
  }

  function setFold(mode: FoldMode) {
    doc.value.foldGuides = mode
    persist()
  }

  function setFlap(style: FlapStyle) {
    if (doc.value.view !== 'back') {
      endEdit()
      doc.value.view = 'back'
      selection.value = null
    }
    doc.value.flap = style
    persist()
  }

  function setShape(patch: Partial<Pick<DesignItem, 'color' | 'stroke' | 'filled'>>) {
    const item = selection.value ? findItem(doc.value, selection.value) : null
    if (!item || (item.type !== 'rect' && item.type !== 'line')) return
    snapshot()
    Object.assign(item, patch)
    persist()
  }

  function placeStamp(src: string, name: string, w: number, h: number, dpi = 600) {
    snapshot()
    doc.value.stamp = {
      src,
      name,
      dpi,
      frame: { x: Math.max(4, doc.value.w - w - 9), y: 8, w, h },
    }
    doc.value.view = 'envelope'
    selection.value = 'stamp'
    dialog.value = null
    persist()
    toast(`Stamp placed at ${w.toFixed(1)} × ${h.toFixed(1)} mm`)
  }

  function resetSelection() {
    const id = selection.value
    if (!id) return
    snapshot()
    if (id === 'recipient' || id === 'sender') {
      if (hasWindow(doc.value, id)) {
        doc.value.windows[id] = { ...windowDefaults(doc.value.style)[id] }
        doc.value.windowShift[id] = { x: 0, y: 0 }
      } else doc.value[id].frame = { ...DEFAULT_FRAMES[id] }
    } else if (id.startsWith('window:')) {
      const role = id.slice(7) as Role
      doc.value.windows[role] = { ...windowDefaults(doc.value.style)[role] }
      doc.value.windowShift[role] = { x: 0, y: 0 }
    } else if (id === 'stamp' && doc.value.stamp) {
      doc.value.stamp.frame = { ...DEFAULT_FRAMES.stamp, w: doc.value.stamp.frame.w, h: doc.value.stamp.frame.h }
    }
    persist()
    toast('Position restored')
  }

  function mailingAddresses() {
    const rows = parseCSV(doc.value.batchText)
    if (doc.value.batchEnabled && rows.length) return rows.map(addressFromRow)
    return [htmlToPlain(doc.value.recipient.html)]
  }

  function setPageRule(width: number, height: number) {
    const root = document.documentElement
    root.style.setProperty('--print-page-w', `${width}mm`)
    root.style.setProperty('--print-page-h', `${height}mm`)
  }

  const PRINT_TARGETS: Record<PrintTarget, SurfaceId[]> = {
    letter: ['letter'],
    letterBoth: ['letter', 'letterBack'],
    envelope: ['envelope'],
    back: ['back'],
    envelopeBoth: ['envelope', 'back'],
  }

  function defaultPrintTarget(): PrintTarget {
    if (doc.value.style === 'plain') return doc.value.view === 'back' ? 'back' : 'envelope'
    return pagesToPrint(doc.value).length > 1 ? 'letterBoth' : 'letter'
  }

  function printSurfaces(target: PrintTarget): SurfaceId[] | null {
    const surfaces = PRINT_TARGETS[target]
    if (surfaces.some(isLetter) && doc.value.style === 'plain') {
      toast('Choose a window envelope before printing a letter')
      return null
    }
    return surfaces
  }

  function setPrintTarget(target: PrintTarget) {
    const surfaces = printSurfaces(target)
    if (!surfaces) return
    printTarget.value = target
    const page = printPaper(doc.value, surfaces[0]!)
    setPageRule(page.widthMm, page.heightMm)
    const people = mailingAddresses()
    printJob.value = people.flatMap(person => surfaces.map(surface => ({ surface, recipientPlain: person, test: false })))
  }

  async function printCurrent(test = false) {
    const windowed = doc.value.style !== 'plain'
    const target = test ? (windowed ? 'letter' : 'envelope') : defaultPrintTarget()
    const surfaces = printSurfaces(target)
    if (!surfaces) return
    printTarget.value = target
    const people = test ? [''] : mailingAddresses()
    if (!test && people.some(item => !item.trim())) {
      toast('Enter a recipient address')
      return
    }
    if (!test && doc.value.stamp && people.length > 1 && surfaces.includes('envelope')) {
      toast('One purchased stamp cannot be printed on every envelope')
      return
    }
    endEdit()
    const page = printPaper(doc.value, surfaces[0] ?? 'letter')
    setPageRule(page.widthMm, page.heightMm)
    printJob.value = people.flatMap(person => surfaces.map(surface => ({
      surface,
      recipientPlain: test ? null : person,
      test,
    })))
    await nextTick()
    await new Promise(resolve => requestAnimationFrame(() => resolve(null)))
    dialog.value = 'print'
  }

  async function exportPdf(pair: boolean | PrintTarget = false) {
    const windowed = doc.value.style !== 'plain'
    const target: PrintTarget = typeof pair === 'string'
      ? pair
      : pair
        ? (windowed ? 'letterBoth' : 'envelopeBoth')
        : defaultPrintTarget()
    const surfaces = printSurfaces(target)
    if (!surfaces) return
    const people = mailingAddresses()
    if (people.some(item => !item.trim())) {
      toast('Enter a recipient address')
      return
    }
    if (doc.value.stamp && people.length > 1 && surfaces.includes('envelope')) {
      toast('One purchased stamp cannot be copied across a mailing list')
      return
    }
    try {
      const bytes = await buildPdf(doc.value, surfaces, people)
      downloadBlob(`envelope-${surfaces.join('-')}.pdf`, new Blob([bytes.slice()], { type: 'application/pdf' }))
      toast(`Saved ${people.length * surfaces.length} PDF page${people.length * surfaces.length === 1 ? '' : 's'}`)
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not build the PDF')
    }
  }

  function exportProject() {
    const json = JSON.stringify(doc.value, null, 2)
    const desktop = window.envelopeDesktop
    if (desktop) {
      void desktop.saveFile(`${doc.value.title || 'envelope'}.json`, json).then(saved => {
        if (saved) toast('Project saved')
      })
      return
    }
    downloadBlob(`${doc.value.title || 'envelope'}.json`, new Blob([json], { type: 'application/json' }))
    toast('Project downloaded')
  }

  async function importProjectText(text: string) {
    const next = normalize(JSON.parse(text) as MailDoc)
    if (!next?.recipient?.html || !next.sender?.html) throw new Error('That file is not an Envelope Studio project')
    snapshot()
    doc.value = next
    selection.value = 'recipient'
    editingId.value = null
    persist()
    toast('Project opened')
  }

  async function loadDesktop() {
    const desktop = window.envelopeDesktop
    if (!desktop) return
    try {
      const text = await desktop.loadAuto()
      if (!text) return
      const next = normalize(JSON.parse(text) as MailDoc)
      if (next) {
        doc.value = next
        savedLabel.value = 'Saved on this PC'
      }
    } catch { /* keep the browser copy */ }
  }

  function applyBatch(text: string, enabled: boolean) {
    const rows = parseCSV(text)
    snapshot()
    doc.value.batchText = text
    doc.value.batchEnabled = enabled && rows.length > 0
    dialog.value = null
    persist()
    toast(doc.value.batchEnabled ? `${rows.length} recipients ready` : 'Mailing list saved')
  }

  function clearBatch() {
    snapshot()
    doc.value.batchText = ''
    doc.value.batchEnabled = false
    persist()
    toast('Mailing list cleared')
  }

  function edit(run: () => void) {
    snapshot()
    run()
    persist()
  }

  function nudge(dx: number, dy: number) {
    const id = selection.value
    if (!id) return
    const frame = frameOf(id)
    if (!gesture) snapshot()
    setFrame(id, { ...frame, x: Math.round((frame.x + dx) * 4) / 4, y: Math.round((frame.y + dy) * 4) / 4 }, true)
    persist()
  }

  function pastedTextBox(content: string) {
    snapshot()
    const page = pageSize(doc.value)
    const lines = content.replace(/\r\n/g, '\n').split('\n')
    const longest = lines.reduce((max, line) => Math.max(max, line.trim().length), 1)
    const width = Math.min(page.w - 24, Math.max(48, Math.min(140, longest * 2.4 + 4)))
    const charsPerLine = Math.max(8, Math.floor((width - 2) / 2.4))
    const wrapped = lines.reduce((count, line) => count + Math.max(1, Math.ceil(Math.max(line.length, 1) / charsPerLine)), 0)
    const lineMm = 12 * (25.4 / 72) * 1.3
    const height = Math.min(page.h - 16, Math.max(lineMm + 1, wrapped * lineMm + 1))
    const count = doc.value.surfaces[doc.value.view].items.length
    const item = makeText(content, {
      x: Math.min(page.w - width - 8, 16 + (count % 6) * 5),
      y: Math.min(page.h - height - 8, 22 + (count % 6) * 5),
      w: width,
      h: height,
    }, 12, false)
    doc.value.surfaces[doc.value.view].items.push(item)
    selection.value = item.id
    editingId.value = null
    persist()
  }

  function insertClipboardText(text: string) {
    const target = textTarget(doc.value, selection.value)
    if (!target) return false
    snapshot()
    const current = htmlToPlain(target.html).trim()
    const replace = !current || current === 'Your text' || current === 'Text'
    target.setHtml(replace ? plainToHtml(text) : `${target.html}${plainToHtml(text)}`)
    persist()
    return true
  }

  function onPaste(event: ClipboardEvent) {
    if (dialog.value || backstage.value) return
    const host = event.target instanceof Element ? event.target : null
    if (host?.closest('input, textarea, select')) return
    const data = event.clipboardData
    if (!data) return
    const image = clipboardImage(data)
    if (image) {
      event.preventDefault()
      event.stopPropagation()
      if (editingId.value) endEdit()
      void addImage(image)
      return
    }
    const text = data.getData('text/plain')
    if (!text.trim()) return
    if (text.length > 50_000) {
      event.preventDefault()
      toast('That clipboard text is too long')
      return
    }
    if (host?.closest('.ProseMirror')) return
    event.preventDefault()
    if (!insertClipboardText(text)) pastedTextBox(text)
  }

  function onKey(event: KeyboardEvent) {
    const typing = document.activeElement?.matches('input, textarea, select, [contenteditable="true"]')
    const inEditor = !!document.activeElement?.closest('.ProseMirror')
    if (event.key === 'Escape') {
      if (objectMenu.value) { objectMenu.value = null; return }
      if (dialog.value) { dialog.value = null; return }
      if (backstage.value) { backstage.value = null; return }
      if (editingId.value) { endEdit(); return }
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault()
      persist()
      toast('Saved on this PC')
      return
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') {
      event.preventDefault()
      void printCurrent(false)
      return
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      if (inEditor) return
      event.preventDefault()
      if (event.shiftKey) redo()
      else undo()
      return
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
      if (inEditor) return
      event.preventDefault()
      redo()
      return
    }
    if ((event.ctrlKey || event.metaKey) && event.key === '0') {
      event.preventDefault()
      zoom.value = null
      return
    }
    if ((event.ctrlKey || event.metaKey) && event.key === 'F1') {
      event.preventDefault()
      ribbonCollapsed.value = !ribbonCollapsed.value
      return
    }
    if (inEditor || typing) return
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (deleteSelection()) event.preventDefault()
      return
    }
    const step = event.shiftKey ? 0.25 : 1
    const arrow: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }
    const delta = arrow[event.key]
    if (!delta || !selection.value) return
    event.preventDefault()
    nudge(delta[0], delta[1])
  }

  if (typeof window !== 'undefined' && !keysBound) {
    keysBound = true
    window.addEventListener('keydown', onKey)
    window.addEventListener('paste', onPaste, true)
    window.addEventListener('afterprint', () => {
      printJob.value = []
      if (dialog.value === 'print') dialog.value = null
    })
    try {
      const pref = JSON.parse(localStorage.getItem('envelope-office-ui') || '{}') as { rulersOff?: boolean; paneOff?: boolean; ribbonCollapsed?: boolean }
      if (pref.rulersOff) rulers.value = false
      if (pref.paneOff) paneOpen.value = false
      if (pref.ribbonCollapsed) ribbonCollapsed.value = true
    } catch { /* defaults */ }
  }

  watch([rulers, paneOpen, ribbonCollapsed], () => {
    localStorage.setItem('envelope-office-ui', JSON.stringify({
      rulersOff: !rulers.value,
      paneOff: !paneOpen.value,
      ribbonCollapsed: ribbonCollapsed.value,
    }))
  })

  function surfaceObjects(except?: string | null) {
    const surface = doc.value.view
    const rows: { id: string; name: string; frame: Box }[] = []
    const push = (id: string, name: string) => {
      if (id !== except) rows.push({ id, name, frame: frameOf(id) })
    }
    if (surface === 'envelope' && doc.value.stamp) push('stamp', doc.value.stamp.name || 'Postage')
    for (const role of ['recipient', 'sender'] as Role[]) {
      if (showsAddress(doc.value, role, surface)) push(role, role === 'recipient' ? 'Recipient' : 'Return address')
      if (surface === 'envelope' && hasWindow(doc.value, role)) push(`window:${role}`, `${role === 'recipient' ? 'Recipient' : 'Return'} window`)
    }
    for (const item of doc.value.surfaces[surface].items) {
      const preview = item.type === 'text' ? htmlToPlain(item.html || '').replace(/\s+/g, ' ').trim() : ''
      const name = item.type === 'image'
        ? (item.name || 'Picture')
        : item.type === 'text'
          ? (preview.slice(0, 28) || 'Text box')
          : item.type === 'line'
            ? 'Line'
            : 'Rectangle'
      push(item.id, name)
    }
    return rows
  }

  function alignSelection(how: PageAlign) {
    const id = selection.value
    if (!id) return
    const frame = frameOf(id)
    setFrame(id, alignOnPage(frame, pageSize(doc.value), how))
    objectMenu.value = null
  }

  function alignSelectionTo(targetId: string, how: PeerAlign) {
    const id = selection.value
    if (!id || id === targetId) return
    setFrame(id, alignToPeer(frameOf(id), frameOf(targetId), how))
    objectMenu.value = null
  }

  const warnings = computed(() => layoutWarnings(doc.value))
  const selectionKind = computed(() => {
    const id = selection.value
    if (!id) return 'page'
    if (id === 'recipient') return 'recipient'
    if (id === 'sender') return 'sender'
    if (id.startsWith('window:')) return 'window'
    if (id === 'stamp') return 'stamp'
    return findItem(doc.value, id)?.type || 'page'
  })

  const layers = computed(() => {
    const surface = doc.value.view
    const rows: { id: string; name: string; kind: string }[] = []
    if (surface === 'envelope' && doc.value.stamp) rows.push({ id: 'stamp', name: doc.value.stamp.name || 'Postage', kind: 'stamp' })
    for (const role of ['recipient', 'sender'] as Role[]) {
      if (showsAddress(doc.value, role, surface)) rows.push({ id: role, name: role === 'recipient' ? 'Recipient' : 'Return address', kind: 'text' })
      if (surface === 'envelope' && hasWindow(doc.value, role)) rows.push({ id: `window:${role}`, name: `${role === 'recipient' ? 'Recipient' : 'Return'} window`, kind: 'window' })
    }
    for (const item of [...doc.value.surfaces[surface].items].reverse()) {
      const preview = item.type === 'text' ? htmlToPlain(item.html || '').replace(/\s+/g, ' ').trim() : ''
      const name = item.type === 'text'
        ? (preview.slice(0, 42) || 'Text box')
        : item.type === 'image'
          ? (item.name || 'Picture')
          : item.type === 'line'
            ? 'Line'
            : 'Rectangle'
      rows.push({ id: item.id, name, kind: item.type })
    }
    return rows
  })

  return {
    doc,
    selection,
    editingId,
    objectMenu,
    ribbon,
    backstage,
    dialog,
    zoom,
    scale,
    rulers,
    paneOpen,
    ribbonCollapsed,
    toastText,
    savedLabel,
    printJob,
    printTarget,
    setPrintTarget,
    fontState,
    warnings,
    selectionKind,
    layers,
    canUndo: computed(() => past.value.length > 0),
    canRedo: computed(() => future.value.length > 0),
    surfaceLabel: computed(() => SURFACE_LABEL[doc.value.view]),
    pageLabel: computed(() => {
      const page = pageSize(doc.value)
      const name = doc.value.view === 'letter' || doc.value.view === 'letterBack'
        ? (doc.value.insert.sheet === 'a4' ? 'A4' : 'US Letter')
        : (ENVELOPE_SIZES.find(item => item.id === doc.value.sizeId)?.name || 'Custom')
      return `${name} · ${(page.w / 25.4).toFixed(2)} × ${(page.h / 25.4).toFixed(2)} in`
    }),
    batchCount: computed(() => doc.value.batchEnabled ? parseCSV(doc.value.batchText).length : 0),
    toast,
    persist,
    undo,
    redo,
    beginGesture,
    endGesture,
    frameOf,
    setFrame,
    select,
    openObjectMenu,
    closeObjectMenu,
    surfaceObjects,
    alignSelection,
    alignSelectionTo,
    beginEdit,
    endEdit,
    attachEditor,
    touch,
    setHtml,
    format,
    isTextId,
    deleteSelection,
    moveLayer,
    addText,
    addShape,
    addImage,
    addLetter,
    applyPreset,
    setSize,
    setCustom,
    setStyle,
    setView,
    setBg,
    setFold,
    setFlap,
    setShape,
    placeStamp,
    resetSelection,
    printCurrent,
    exportPdf,
    exportProject,
    importProjectText,
    loadDesktop,
    applyBatch,
    clearBatch,
    nudge,
    edit,
    resizeBy(start: Box, dx: number, dy: number, dir: string, id: string) {
      const minH = findItem(doc.value, id)?.type === 'line' ? 0 : 4
      setFrame(id, resizeBox(start, dx, dy, dir, minH), true)
    },
    recipientPreview(override?: string | null) {
      return recipientPlain(doc.value, override)
    },
  }
}

export type Studio = ReturnType<typeof useStudio>
