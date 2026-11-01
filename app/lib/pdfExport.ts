import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib'
import { PT } from './constants'
import { addressFrame, isLetter, pageSize, printsAddress } from './geometry'
import { htmlToPlain, plainToHtml, postalHtml, postalPlain, safeHex } from './text'
import type { Align, Box, MailDoc, Role, SurfaceId, TextStyle } from './types'

interface Run {
  text: string
  font: string
  size: number
  color: string
  bold: boolean
  italic: boolean
  underline: boolean
}

interface Block {
  align: Align
  runs: Run[]
}

function runStyle(style: TextStyle): Omit<Run, 'text'> {
  return {
    font: style.font,
    size: style.size,
    color: safeHex(style.color),
    bold: style.bold,
    italic: style.italic,
    underline: style.underline,
  }
}

function toHex(color: string) {
  if (/^#[0-9a-f]{6}$/i.test(color)) return color
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (!match) return safeHex(color)
  return `#${[match[1], match[2], match[3]].map(part => Number(part).toString(16).padStart(2, '0')).join('')}`
}

function walk(node: Node, style: Omit<Run, 'text'>, runs: Run[]) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = (node.textContent || '').replace(/\u00a0/g, ' ')
    if (text) runs.push({ text, ...style })
    return
  }
  if (!(node instanceof HTMLElement)) return
  if (node.tagName === 'BR') {
    runs.push({ text: '\n', ...style })
    return
  }
  const next = { ...style }
  const tag = node.tagName
  if (tag === 'STRONG' || tag === 'B') next.bold = true
  if (tag === 'EM' || tag === 'I') next.italic = true
  if (tag === 'U') next.underline = true
  if (node.style.fontSize) next.size = parseFloat(node.style.fontSize) || next.size
  if (node.style.color) next.color = toHex(node.style.color)
  if (node.style.fontFamily) next.font = node.style.fontFamily.split(',')[0]?.replace(/['"]/g, '').trim() || next.font
  if (node.style.fontWeight === 'bold' || Number(node.style.fontWeight) >= 600) next.bold = true
  if (node.style.fontStyle === 'italic') next.italic = true
  const decoration = `${node.style.textDecoration} ${node.style.textDecorationLine}`
  if (decoration.includes('underline')) next.underline = true
  node.childNodes.forEach(child => walk(child, next, runs))
}

function blocksFromHtml(html: string, defaults: TextStyle): Block[] {
  const root = document.createElement('div')
  root.innerHTML = html || '<p></p>'
  const children = [...root.children] as HTMLElement[]
  const source = children.length ? children : [root as HTMLElement]
  return source.map((element) => {
    const align: Align = element.style.textAlign === 'center' || element.style.textAlign === 'right'
      ? element.style.textAlign
      : defaults.align
    const runs: Run[] = []
    walk(element, runStyle(defaults), runs)
    if (element.tagName === 'LI') {
      const ordered = element.parentElement?.tagName === 'OL'
      const index = element.parentElement ? [...element.parentElement.children].indexOf(element) + 1 : 1
      const prefix = ordered ? `${index}. ` : '• '
      if (runs[0]) runs[0] = { ...runs[0], text: prefix + runs[0].text }
      else runs.push({ text: prefix, ...runStyle(defaults) })
    }
    return { align, runs }
  })
}

let measureContext: CanvasRenderingContext2D | null = null

function textWidth(text: string, run: Omit<Run, 'text'>) {
  if (!measureContext) {
    const canvas = document.createElement('canvas')
    measureContext = canvas.getContext('2d')
  }
  if (!measureContext) return text.length * run.size * 0.5
  measureContext.font = `${run.italic ? 'italic ' : ''}${run.bold ? '700 ' : '400 '}${run.size}pt ${run.font || 'Arial'}`
  return measureContext.measureText(text).width * 25.4 / 96
}

function wrapBlock(block: Block, width: number) {
  const lines: Run[][] = [[]]
  const push = (run: Run) => lines[lines.length - 1]?.push(run)
  for (const run of block.runs) {
    const chunks = run.text.split('\n')
    chunks.forEach((chunk, index) => {
      if (index > 0) lines.push([])
      for (const token of chunk.split(/(\s+)/)) {
        if (!token) continue
        const piece: Run = { ...run, text: token }
        const current = lines[lines.length - 1] || []
        const used = current.reduce((sum, item) => sum + textWidth(item.text, item), 0)
        if (token.trim() && used > 0 && used + textWidth(token, piece) > width) lines.push([piece])
        else push(piece)
      }
    })
  }
  return lines.filter(line => line.some(piece => piece.text.length))
}

interface Drawn {
  text: string
  x: number
  y: number
  run: Run
}

function layoutHtml(html: string, style: TextStyle, frame: Box) {
  const drawn: Drawn[] = []
  let y = frame.y
  const limit = frame.y + frame.h
  for (const block of blocksFromHtml(html, style)) {
    for (const line of wrapBlock(block, Math.max(8, frame.w))) {
      const size = Math.max(style.size, ...line.map(piece => piece.size))
      const step = size * 25.4 / 72 * style.lineHeight
      if (y + size * 25.4 / 72 > limit + 0.4) return drawn
      const width = line.reduce((sum, piece) => sum + textWidth(piece.text, piece), 0)
      let x = frame.x
      if (block.align === 'center') x += (frame.w - width) / 2
      if (block.align === 'right') x += frame.w - width
      const baseline = y + size * 25.4 / 72 * 0.82
      for (const piece of line) {
        if (piece.text.trim() || piece.text === ' ') drawn.push({ text: piece.text, x, y: baseline, run: piece })
        x += textWidth(piece.text, piece)
      }
      y += step
    }
  }
  return drawn
}

function hexRgb(color: string) {
  const hex = safeHex(color).slice(1)
  return rgb(
    parseInt(hex.slice(0, 2), 16) / 255,
    parseInt(hex.slice(2, 4), 16) / 255,
    parseInt(hex.slice(4, 6), 16) / 255,
  )
}

function standardFont(run: Omit<Run, 'text'>) {
  const serif = /georgia|cambria|times/i.test(run.font)
  const mono = /courier/i.test(run.font)
  if (mono) {
    if (run.bold && run.italic) return StandardFonts.CourierBoldOblique
    if (run.bold) return StandardFonts.CourierBold
    if (run.italic) return StandardFonts.CourierOblique
    return StandardFonts.Courier
  }
  if (serif) {
    if (run.bold && run.italic) return StandardFonts.TimesRomanBoldItalic
    if (run.bold) return StandardFonts.TimesRomanBold
    if (run.italic) return StandardFonts.TimesRomanItalic
    return StandardFonts.TimesRoman
  }
  if (run.bold && run.italic) return StandardFonts.HelveticaBoldOblique
  if (run.bold) return StandardFonts.HelveticaBold
  if (run.italic) return StandardFonts.HelveticaOblique
  return StandardFonts.Helvetica
}

function dataBytes(src: string) {
  const comma = src.indexOf(',')
  const binary = atob(src.slice(comma + 1))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return { bytes, jpeg: /image\/jpe?g/i.test(src.slice(0, comma)) }
}

function fieldHtml(doc: MailDoc, role: Role, recipientPlain: string | null) {
  if (role !== 'recipient') return doc.sender.html
  const own = htmlToPlain(doc.recipient.html)
  const foreign = recipientPlain != null && recipientPlain !== own
  if (foreign) return plainToHtml(doc.sortingAssist ? postalPlain(recipientPlain) : recipientPlain)
  if (doc.sortingAssist) return postalHtml(doc.recipient.html)
  return doc.recipient.html
}

async function drawPage(pdf: PDFDocument, fonts: Map<string, PDFFont>, doc: MailDoc, surface: SurfaceId, recipientPlainText: string | null) {
  const pageBox = pageSize(doc, surface)
  const page = pdf.addPage([pageBox.w * PT, pageBox.h * PT])
  const bg = safeHex(doc.surfaces[surface].bg)
  page.drawRectangle({ x: 0, y: 0, width: pageBox.w * PT, height: pageBox.h * PT, color: hexRgb(bg) })
  const ox = doc.cal.x
  const oy = doc.cal.y
  const fontFor = async (run: Omit<Run, 'text'>) => {
    const key = standardFont(run)
    const cached = fonts.get(key)
    if (cached) return cached
    const embedded = await pdf.embedFont(key)
    fonts.set(key, embedded)
    return embedded
  }
  const drawRuns = async (html: string, style: TextStyle, frame: Box) => {
    for (const piece of layoutHtml(html, style, frame)) {
      const font = await fontFor(piece.run)
      const x = (piece.x + ox) * PT
      const y = (pageBox.h - piece.y - oy) * PT
      page.drawText(piece.text, { x, y, size: piece.run.size, font, color: hexRgb(piece.run.color) })
      if (piece.run.underline) {
        const width = textWidth(piece.text, piece.run) * PT
        page.drawLine({
          start: { x, y: y - 1.1 },
          end: { x: x + width, y: y - 1.1 },
          thickness: 0.6,
          color: hexRgb(piece.run.color),
        })
      }
    }
  }

  for (const item of doc.surfaces[surface].items) {
    const frame = item.frame
    if ((item.type === 'image') && item.src) {
      const { bytes, jpeg } = dataBytes(item.src)
      const image = jpeg ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes)
      page.drawImage(image, {
        x: (frame.x + ox) * PT,
        y: (pageBox.h - frame.y - frame.h - oy) * PT,
        width: frame.w * PT,
        height: frame.h * PT,
      })
    } else if (item.type === 'line' || item.type === 'rect') {
      const color = hexRgb(item.color || '#315b88')
      const thickness = Math.max(0.4, (item.stroke || 0.7) * PT)
      if (item.type === 'line') {
        const y = (pageBox.h - frame.y - oy) * PT
        page.drawLine({
          start: { x: (frame.x + ox) * PT, y },
          end: { x: (frame.x + frame.w + ox) * PT, y },
          thickness,
          color,
        })
      } else if (item.filled) {
        page.drawRectangle({
          x: (frame.x + ox) * PT,
          y: (pageBox.h - frame.y - frame.h - oy) * PT,
          width: frame.w * PT,
          height: frame.h * PT,
          color,
        })
      } else {
        page.drawRectangle({
          x: (frame.x + ox) * PT,
          y: (pageBox.h - frame.y - frame.h - oy) * PT,
          width: frame.w * PT,
          height: frame.h * PT,
          borderColor: color,
          borderWidth: thickness,
        })
      }
    } else if (item.type === 'text') {
      await drawRuns(item.html || '', item.style || textFallback(), frame)
    }
  }

  for (const role of ['sender', 'recipient'] as Role[]) {
    if (!printsAddress(doc, role, surface)) continue
    await drawRuns(fieldHtml(doc, role, recipientPlainText), doc[role].style, addressFrame(doc, role, surface))
  }

  if (surface === 'envelope' && doc.stamp?.src) {
    const frame = doc.stamp.frame
    const { bytes, jpeg } = dataBytes(doc.stamp.src)
    const image = jpeg ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes)
    page.drawImage(image, {
      x: (frame.x + ox) * PT,
      y: (pageBox.h - frame.y - frame.h - oy) * PT,
      width: frame.w * PT,
      height: frame.h * PT,
    })
  }

  if (isLetter(surface) && doc.foldGuides === (surface === 'letter' ? 'front' : 'back')) {
    const [first, second] = [pageBox.h / 3, pageBox.h * 2 / 3]
    for (const yMm of [first, second]) {
      const y = (pageBox.h - yMm) * PT
      page.drawLine({
        start: { x: 0, y },
        end: { x: pageBox.w * PT, y },
        thickness: 0.6,
        color: rgb(0.42, 0.55, 0.72),
        dashArray: [2, 3],
      })
    }
  }
}

function textFallback(): TextStyle {
  return { font: 'Arial', size: 12, color: '#242424', align: 'left', bold: false, italic: false, underline: false, lineHeight: 1.3 }
}

export async function buildPdf(doc: MailDoc, surfaces: SurfaceId[], recipients: string[]) {
  const pdf = await PDFDocument.create()
  const fonts = new Map<string, PDFFont>()
  for (const recipient of recipients) {
    for (const surface of surfaces) await drawPage(pdf, fonts, doc, surface, recipient)
  }
  return pdf.save()
}
