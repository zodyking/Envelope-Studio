<script setup lang="ts">
import { computed, nextTick, ref, shallowRef } from 'vue'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import { fileToData, loadImage } from '~/lib/files'
import { cropPreview, extractStamp, findStamps, openPdfBytes, pageMillimeters, renderPdfPage } from '~/lib/pdfio'
import { stampOffers } from '~/lib/stampDetect'
import { useStudio } from '~/composables/useStudio'
import type { NormBox } from '~/lib/types'

interface Offer {
  id: string
  kind: 'barcode' | 'whole'
  label: string
  box: NormBox
  thumb: string
  w: number
  h: number
}

const studio = useStudio()
const status = ref('Import a stamp sheet PDF, or a single PNG or JPG.')
const pdf = shallowRef<PDFDocumentProxy | null>(null)
const page = shallowRef<PDFPageProxy | null>(null)
const preview = ref<HTMLCanvasElement | null>(null)
const sheet = ref<HTMLElement | null>(null)
const pageCount = ref(1)
const pageIndex = ref(1)
const dpi = ref(600)
const pageMm = ref({ w: 0, h: 0 })
const offers = ref<Offer[]>([])
const selectedId = ref('')
const manual = ref<NormBox | null>(null)
const gesture = ref<null | { mode: 'draw' | 'move' | 'resize'; dir: string; x: number; y: number; box: NormBox }>(null)
const fileName = ref('')
const handles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

const cropMm = computed(() => {
  const box = manual.value
  if (!box || !pageMm.value.w) return ''
  return `${(box.w * pageMm.value.w).toFixed(1)} × ${(box.h * pageMm.value.h).toFixed(1)} mm`
})

const cropName = computed(() => offers.value.find(offer => offer.id === selectedId.value)?.label || 'Custom')

async function onPdf(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (file.size > 25_000_000) { status.value = 'That PDF is larger than 25 MB.'; return }
  status.value = 'Opening PDF…'
  fileName.value = file.name
  try {
    pdf.value = await openPdfBytes(await file.arrayBuffer())
    pageCount.value = pdf.value.numPages
    await nextTick()
    await showPage(1)
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'Could not open that PDF'
  }
}

async function showPage(index: number) {
  if (!pdf.value || !preview.value) return
  pageIndex.value = index
  status.value = `Rendering page ${index}…`
  const next = await pdf.value.getPage(index)
  page.value = next
  const rendered = await renderPdfPage(next, 760)
  const canvas = preview.value
  canvas.width = rendered.canvas.width
  canvas.height = rendered.canvas.height
  canvas.getContext('2d')?.drawImage(rendered.canvas, 0, 0)
  pageMm.value = pageMillimeters(rendered.widthPt, rendered.heightPt)
  const found = stampOffers(findStamps(canvas, pageMm.value.w, pageMm.value.h), pageMm.value.w, pageMm.value.h)
  offers.value = found.map(offer => ({
    ...offer,
    thumb: cropPreview(canvas, offer.box),
    w: pageMm.value.w * offer.box.w,
    h: pageMm.value.h * offer.box.h,
  }))
  const first = offers.value.find(offer => offer.kind === 'barcode') ?? offers.value[0]
  selectedId.value = first?.id ?? ''
  manual.value = first ? { ...first.box } : null
  status.value = offers.value.length
    ? 'The header is left out. Choose Barcode or Whole stamp, or drag the crop to adjust it.'
    : 'No stamp was found. Drag a rectangle around one complete stamp.'
}

function normPoint(event: PointerEvent) {
  const bounds = sheet.value?.getBoundingClientRect()
  if (!bounds?.width || !bounds.height) return { x: 0, y: 0 }
  return {
    x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
    y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)),
  }
}

function clampBox(box: NormBox): NormBox {
  let { x, y, w, h } = box
  if (w < 0) { x += w; w = -w }
  if (h < 0) { y += h; h = -h }
  w = Math.max(0.008, w)
  h = Math.max(0.008, h)
  x = Math.min(1 - w, Math.max(0, x))
  y = Math.min(1 - h, Math.max(0, y))
  return { x, y, w, h }
}

function resizeNorm(start: NormBox, dx: number, dy: number, dir: string): NormBox {
  let { x, y, w, h } = start
  if (dir.includes('e')) w += dx
  if (dir.includes('s')) h += dy
  if (dir.includes('w')) { x += dx; w -= dx }
  if (dir.includes('n')) { y += dy; h -= dy }
  return clampBox({ x, y, w, h })
}

function down(event: PointerEvent) {
  if (event.button !== 0) return
  const target = event.target as HTMLElement
  if (target.closest('.pdf-handle')) return
  const point = normPoint(event)
  if (target.closest('.pdf-crop') && manual.value) {
    gesture.value = { mode: 'move', dir: '', x: point.x, y: point.y, box: { ...manual.value } }
  } else {
    gesture.value = { mode: 'draw', dir: '', x: point.x, y: point.y, box: { ...point, w: 0, h: 0 } }
    manual.value = { ...point, w: 0, h: 0 }
    selectedId.value = ''
  }
  sheet.value?.setPointerCapture(event.pointerId)
}

function startResize(event: PointerEvent, dir: string) {
  if (!manual.value) return
  const point = normPoint(event)
  gesture.value = { mode: 'resize', dir, x: point.x, y: point.y, box: { ...manual.value } }
  sheet.value?.setPointerCapture(event.pointerId)
}

function move(event: PointerEvent) {
  const current = gesture.value
  if (!current) return
  const point = normPoint(event)
  const dx = point.x - current.x
  const dy = point.y - current.y
  if (current.mode !== 'draw' && Math.abs(dx) + Math.abs(dy) > 0.001) selectedId.value = ''
  if (current.mode === 'draw') {
    manual.value = clampBox({
      x: Math.min(point.x, current.x),
      y: Math.min(point.y, current.y),
      w: Math.abs(point.x - current.x),
      h: Math.abs(point.y - current.y),
    })
  } else if (current.mode === 'move') {
    manual.value = clampBox({ ...current.box, x: current.box.x + dx, y: current.box.y + dy })
  } else {
    manual.value = resizeNorm(current.box, dx, dy, current.dir)
  }
}

function up() {
  const drawn = gesture.value?.mode === 'draw'
  gesture.value = null
  if (drawn && manual.value && (manual.value.w < 0.012 || manual.value.h < 0.012)) {
    const fallback = offers.value.find(item => item.kind === 'barcode') ?? offers.value[0]
    if (fallback) choose(fallback)
  }
}

function choose(offer: Offer) {
  selectedId.value = offer.id
  manual.value = { ...offer.box }
}

async function place() {
  if (!page.value || !manual.value || manual.value.w < 0.01 || manual.value.h < 0.01) {
    studio.toast('Select one stamp first')
    return
  }
  status.value = `Extracting at ${dpi.value} DPI…`
  try {
    const result = await extractStamp(page.value, manual.value, dpi.value)
    if (result.wMM > 102 || result.hMM > 80 || result.wMM < 8 || result.hMM < 6) {
      status.value = 'Crop one stamp, including the barcode and the lines under it. Leave the page header out.'
      return
    }
    studio.placeStamp(result.url, `${fileName.value || 'Stamp'} · page ${pageIndex.value}`, +result.wMM.toFixed(2), +result.hMM.toFixed(2), dpi.value)
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'Could not extract the stamp'
  }
}

async function onImage(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!/^image\/(png|jpeg)$/.test(file.type) || file.size > 8_000_000) {
    studio.toast('Use a PNG or JPG under 8 MB')
    return
  }
  const src = await fileToData(file)
  const image = await loadImage(src)
  const width = Math.min(80, Math.max(18, image.naturalWidth / 300 * 25.4))
  const height = width * image.naturalHeight / Math.max(1, image.naturalWidth)
  studio.placeStamp(src, file.name, +width.toFixed(2), +height.toFixed(2), 300)
}
</script>

<template>
  <div class="overlay open" @mousedown.self="studio.dialog.value = null">
    <div class="drawer wide" role="dialog" aria-modal="true" aria-labelledby="postageTitle">
      <div class="drawer-head">
        <h2 id="postageTitle">Postage</h2>
        <button type="button" class="close" aria-label="Close" @click="studio.dialog.value = null">×</button>
      </div>
      <div class="drawer-body">
        <section class="drawer-section">
          <div class="note-card orange-note"><strong>Use one real, unused indicium.</strong> A paid stamp is unique. Do not place the same image on more than one envelope.</div>
          <div class="grid-two">
            <label class="button">Import stamp PDF<input class="sr-only" type="file" accept="application/pdf,.pdf" @change="onPdf"></label>
            <label class="button">Import PNG or JPG<input class="sr-only" type="file" accept="image/png,image/jpeg" @change="onImage"></label>
          </div>
          <p><a class="text-link" href="https://www.orangemailer.co/" target="_blank" rel="noopener noreferrer">Open Orange Mailer</a> to buy a test stamp, then bring the PDF back here.</p>
        </section>
        <section v-if="pdf" class="drawer-section">
          <p id="pdfStatus" role="status">{{ status }}</p>
          <div class="pdf-import-toolbar">
            <label>Page
              <select :value="pageIndex" aria-label="Page" @change="showPage(Number(($event.target as HTMLSelectElement).value))">
                <option v-for="index in pageCount" :key="index" :value="index">{{ index }} of {{ pageCount }}</option>
              </select>
            </label>
            <label>Resolution
              <select v-model.number="dpi" aria-label="Resolution">
                <option :value="300">300 DPI</option>
                <option :value="450">450 DPI</option>
                <option :value="600">600 DPI</option>
              </select>
            </label>
          </div>
          <div v-if="offers.length" class="stamp-offers" role="radiogroup" aria-label="Stamp crop">
            <button v-for="offer in offers" :key="offer.id" type="button" class="stamp-offer" :class="{ active: selectedId === offer.id }" :aria-pressed="selectedId === offer.id" @click="choose(offer)">
              <img :src="offer.thumb" alt="">
              <strong>{{ offer.label }}</strong>
              <span>{{ offer.w.toFixed(1) }} × {{ offer.h.toFixed(1) }} mm</span>
            </button>
          </div>
          <div class="pdf-stage">
            <div ref="sheet" class="pdf-sheet" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up">
              <canvas ref="preview" />
              <div v-if="manual && manual.w > 0.004 && manual.h > 0.004" class="pdf-crop" :style="{ left: (manual.x * 100) + '%', top: (manual.y * 100) + '%', width: (manual.w * 100) + '%', height: (manual.h * 100) + '%' }">
                <span>{{ cropName }} · {{ cropMm }}</span>
                <i v-for="dir in handles" :key="dir" class="pdf-handle" :class="dir" @pointerdown.stop="startResize($event, dir)" />
              </div>
            </div>
          </div>
          <p v-if="cropMm" class="soft-small">Drag inside the crop to move it. Drag a handle to resize. Drag the page to draw a new one.</p>
          <button type="button" class="button primary full" @click="place">Place on envelope</button>
        </section>
        <p v-else class="soft-small">{{ status }}</p>
      </div>
    </div>
  </div>
</template>
