import type { NormBox } from './types'

function smooth(values: Float64Array) {
  const copy = Float64Array.from(values)
  for (let i = 1; i < values.length - 1; i++) values[i] = ((copy[i - 1] ?? 0) + (copy[i] ?? 0) + (copy[i + 1] ?? 0)) / 3
}

function contentSpans(density: Float64Array, minGap: number, maxInk: number) {
  const spans: { a: number; b: number }[] = []
  let start = -1
  let lowRun = 0
  let lastInk = -1
  for (let i = 0; i < density.length; i++) {
    if ((density[i] ?? 0) > maxInk) {
      if (start < 0) start = i
      lastInk = i
      lowRun = 0
    } else if (start >= 0) {
      lowRun++
      if (lowRun >= minGap) {
        spans.push({ a: start, b: lastInk + 1 })
        start = -1
        lowRun = 0
      }
    }
  }
  if (start >= 0 && lastInk >= start) spans.push({ a: start, b: lastInk + 1 })
  return spans
}

function trim(mask: Uint8Array, width: number, x0: number, y0: number, x1: number, y1: number) {
  let minX = x1
  let minY = y1
  let maxX = -1
  let maxY = -1
  const step = 1
  for (let y = y0; y < y1; y += step) {
    const row = y * width
    for (let x = x0; x < x1; x += step) {
      if (!mask[row + x]) continue
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0) return null
  return { x0: minX, y0: minY, x1: maxX + 1, y1: maxY + 1 }
}

function overlaps(a: NormBox, b: NormBox) {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
  const inter = x * y
  const union = a.w * a.h + b.w * b.h - inter
  return union > 0 && inter / union > 0.45
}

/**
 * Find stamp-sized regions on a rendered page.
 * Boxes are fractions of the page (0–1), top-left origin.
 * Gutters wider than 4.5 mm split a sheet. Smaller gaps inside one indicium stay together.
 */
export function detectStampBoxes(
  width: number,
  height: number,
  data: Uint8ClampedArray,
  pageWmm: number,
  pageHmm: number,
): NormBox[] {
  if (!width || !height || pageWmm <= 0 || pageHmm <= 0) return []
  const mask = new Uint8Array(width * height)
  for (let p = 0, i = 0; p < mask.length; p++, i += 4) {
    const r = data[i] ?? 255
    const g = data[i + 1] ?? 255
    const b = data[i + 2] ?? 255
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const paper = min > 236 && max - min < 22
    mask[p] = paper ? 0 : 1
  }

  const pxPerMmX = width / pageWmm
  const pxPerMmY = height / pageHmm
  const gapX = Math.max(2, Math.round(4.5 * pxPerMmX))
  const gapY = Math.max(2, Math.round(4.5 * pxPerMmY))
  const row = new Float64Array(height)
  for (let y = 0; y < height; y++) {
    let count = 0
    const off = y * width
    for (let x = 0; x < width; x++) count += mask[off + x] ?? 0
    row[y] = count / width
  }
  smooth(row)
  const bands = contentSpans(row, gapY, 0.012)
  const boxes: NormBox[] = []

  for (const band of bands) {
    const col = new Float64Array(width)
    const rows = Math.max(1, band.b - band.a)
    for (let y = band.a; y < band.b; y++) {
      const off = y * width
      for (let x = 0; x < width; x++) col[x] = (col[x] ?? 0) + (mask[off + x] ?? 0)
    }
    for (let x = 0; x < width; x++) col[x] = (col[x] ?? 0) / rows
    smooth(col)
    for (const cell of contentSpans(col, gapX, 0.012)) {
      const ink = trim(mask, width, cell.a, band.a, cell.b, band.b)
      if (!ink) continue
      const padX = 1.2 * pxPerMmX
      const padY = 1.2 * pxPerMmY
      const x0 = Math.max(0, ink.x0 - padX)
      const y0 = Math.max(0, ink.y0 - padY)
      const x1 = Math.min(width, ink.x1 + padX)
      const y1 = Math.min(height, ink.y1 + padY)
      const wMM = (x1 - x0) / pxPerMmX
      const hMM = (y1 - y0) / pxPerMmY
      if (wMM < 14 || hMM < 14 || wMM > 100 || hMM > 70) continue
      const aspect = wMM / hMM
      if (aspect < 0.35 || aspect > 3.2) continue
      boxes.push({
        x: x0 / width,
        y: y0 / height,
        w: (x1 - x0) / width,
        h: (y1 - y0) / height,
      })
    }
  }

  const unique: NormBox[] = []
  for (const box of boxes) {
    if (!unique.some(other => overlaps(other, box))) unique.push(box)
  }
  return unique
}
