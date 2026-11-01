import type { PDFPageProxy } from 'pdfjs-dist'
import { detectStampBoxes } from './stampDetect'
import type { NormBox } from './types'

let loading: Promise<typeof import('pdfjs-dist')> | null = null

export function loadPdfjs() {
  if (!loading) {
    loading = (async () => {
      const pdfjs = await import('pdfjs-dist')
      const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default
      return pdfjs
    })()
  }
  return loading
}

export async function openPdfBytes(data: ArrayBuffer) {
  const pdfjs = await loadPdfjs()
  return pdfjs.getDocument({ data: new Uint8Array(data) }).promise
}

export async function renderPdfPage(page: PDFPageProxy, maxWidth = 900) {
  const base = page.getViewport({ scale: 1 })
  const scale = Math.min(2.2, maxWidth / base.width)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) throw new Error('Could not prepare the PDF preview')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvas, viewport, background: '#ffffff' }).promise
  return { canvas, widthPt: base.width, heightPt: base.height }
}

export function pageMillimeters(widthPt: number, heightPt: number) {
  return { w: widthPt / 72 * 25.4, h: heightPt / 72 * 25.4 }
}

export function findStamps(canvas: HTMLCanvasElement, pageWmm: number, pageHmm: number) {
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return []
  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  return detectStampBoxes(canvas.width, canvas.height, image.data, pageWmm, pageHmm)
}

export function cropPreview(canvas: HTMLCanvasElement, box: NormBox) {
  const x = Math.round(box.x * canvas.width)
  const y = Math.round(box.y * canvas.height)
  const w = Math.max(1, Math.round(box.w * canvas.width))
  const h = Math.max(1, Math.round(box.h * canvas.height))
  const thumb = document.createElement('canvas')
  const scale = Math.min(1, 240 / w, 160 / h)
  thumb.width = Math.max(1, Math.round(w * scale))
  thumb.height = Math.max(1, Math.round(h * scale))
  const context = thumb.getContext('2d')
  if (!context) return ''
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, thumb.width, thumb.height)
  context.drawImage(canvas, x, y, w, h, 0, 0, thumb.width, thumb.height)
  return thumb.toDataURL('image/png')
}

export async function extractStamp(page: PDFPageProxy, box: NormBox, dpi: number) {
  const base = page.getViewport({ scale: 1 })
  const wMM = base.width / 72 * 25.4 * box.w
  const hMM = base.height / 72 * 25.4 * box.h
  const full = page.getViewport({ scale: dpi / 72 })
  const cx = Math.round(full.width * box.x)
  const cy = Math.round(full.height * box.y)
  const cw = Math.max(1, Math.round(full.width * box.w))
  const ch = Math.max(1, Math.round(full.height * box.h))
  if (cw * ch > 14_000_000) throw new Error('That region is too large at this resolution. Choose 300 DPI or a tighter crop.')
  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) throw new Error('Could not extract the stamp')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, cw, ch)
  await page.render({
    canvas,
    viewport: full,
    transform: [1, 0, 0, 1, -cx, -cy],
    background: '#ffffff',
  }).promise
  return { url: canvas.toDataURL('image/png'), wMM, hMM }
}
