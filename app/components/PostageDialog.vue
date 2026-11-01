<script setup lang="ts">
import { nextTick, ref, shallowRef } from 'vue'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import { fileToData, loadImage } from '~/lib/files'
import { cropPreview, extractStamp, findStamps, openPdfBytes, pageMillimeters, renderPdfPage } from '~/lib/pdfio'
import { useStudio } from '~/composables/useStudio'
import type { NormBox } from '~/lib/types'

const studio = useStudio()
const status = ref('Import a stamp sheet PDF, or a single PNG or JPG.')
const pdf = shallowRef<PDFDocumentProxy | null>(null)
const page = shallowRef<PDFPageProxy | null>(null)
const preview = ref<HTMLCanvasElement | null>(null)
const outer = ref<HTMLElement | null>(null)
const pageCount = ref(1)
const pageIndex = ref(1)
const dpi = ref(600)
const pageMm = ref({ w: 0, h: 0 })
const picks = ref<{ box: NormBox; thumb: string; w: number; h: number }[]>([])
const manual = ref<NormBox | null>(null)
const drag = ref<{ x: number; y: number } | null>(null)
const fileName = ref('')

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
  const boxes = findStamps(canvas, pageMm.value.w, pageMm.value.h)
  picks.value = boxes.map(box => ({
    box,
    thumb: cropPreview(canvas, box),
    w: pageMm.value.w * box.w,
    h: pageMm.value.h * box.h,
  }))
  manual.value = picks.value[0]?.box ? { ...picks.value[0].box } : null
  status.value = picks.value.length
    ? `Found ${picks.value.length} stamp-sized region${picks.value.length === 1 ? '' : 's'}. Pick one, or drag to correct the crop.`
    : 'No stamp-sized region was found. Drag a rectangle around one complete stamp.'
}

function point(event: PointerEvent) {
  const bounds = outer.value?.getBoundingClientRect()
  if (!bounds) return { x: 0, y: 0 }
  return {
    x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
    y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)),
  }
}

function down(event: PointerEvent) {
  const start = point(event)
  drag.value = start
  manual.value = { ...start, w: 0, h: 0 }
  outer.value?.setPointerCapture(event.pointerId)
}
function move(event: PointerEvent) {
  if (!drag.value) return
  const next = point(event)
  manual.value = {
    x: Math.min(next.x, drag.value.x),
    y: Math.min(next.y, drag.value.y),
    w: Math.abs(next.x - drag.value.x),
    h: Math.abs(next.y - drag.value.y),
  }
}
function up() { drag.value = null }

function choose(index: number) {
  const pick = picks.value[index]
  if (pick) manual.value = { ...pick.box }
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
      status.value = 'Crop a single stamp, including its barcode and border, not a whole sheet or an addressed label.'
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
              <select :value="pageIndex" @change="showPage(Number(($event.target as HTMLSelectElement).value))">
                <option v-for="index in pageCount" :key="index" :value="index">{{ index }} of {{ pageCount }}</option>
              </select>
            </label>
            <label>Resolution
              <select v-model.number="dpi">
                <option :value="300">300 DPI</option>
                <option :value="450">450 DPI</option>
                <option :value="600">600 DPI</option>
              </select>
            </label>
          </div>
          <div v-if="picks.length" class="stamp-picks">
            <button v-for="(pick, index) in picks" :key="index" type="button" class="stamp-pick" :class="{ active: manual && Math.abs(manual.x - pick.box.x) < 0.002 && Math.abs(manual.y - pick.box.y) < 0.002 }" @click="choose(index)">
              <img :src="pick.thumb" alt="">
              <span>{{ pick.w.toFixed(1) }} × {{ pick.h.toFixed(1) }} mm</span>
            </button>
          </div>
          <div ref="outer" class="pdf-preview-outer" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up">
            <canvas ref="preview" />
            <div v-if="manual" class="pdf-crop" :style="{ left: (manual.x * 100) + '%', top: (manual.y * 100) + '%', width: (manual.w * 100) + '%', height: (manual.h * 100) + '%' }" />
          </div>
          <p v-if="manual && pageMm.w" class="soft-small">Crop {{ (manual.w * pageMm.w).toFixed(1) }} × {{ (manual.h * pageMm.h).toFixed(1) }} mm. The stamp is placed at that physical size.</p>
          <button type="button" class="button primary full" @click="place">Place selected stamp</button>
        </section>
        <p v-else class="soft-small">{{ status }} A sheet is split on the white gaps between stamps. Each candidate keeps a small quiet zone so the barcode is not clipped.</p>
      </div>
    </div>
  </div>
</template>
