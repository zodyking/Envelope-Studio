<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ENVELOPE_SIZES, SURFACE_LABEL } from '~/lib/constants'
import { pageSize, printPaper } from '~/lib/geometry'
import { useStudio } from '~/composables/useStudio'
import type { PrintPage } from '~/composables/useStudio'

const studio = useStudio()
const { doc, printJob, dialog } = studio
const stage = ref<HTMLElement | null>(null)
const scale = ref(0.45)
const printers = ref<{ name: string; displayName: string }[]>([])
const printer = ref('')
const copies = ref(1)
const sides = ref<'simplex' | 'shortEdge' | 'longEdge'>('simplex')
const colorMode = ref<'color' | 'gray'>('color')
const collate = ref(true)
const pageMode = ref<'all' | 'range'>('all')
const rangeFrom = ref(1)
const rangeTo = ref(1)
const busy = ref(false)
const status = ref('')
const desktop = typeof window !== 'undefined' && !!window.envelopeDesktop?.printDocument
let observer: ResizeObserver | null = null

const paper = computed(() => printPaper(doc.value, printJob.value[0]?.surface || 'letter'))
const paperName = computed(() => {
  if (paper.value.id !== 'custom') return paper.value.name
  return ENVELOPE_SIZES.find(item => item.id === doc.value.sizeId)?.name || 'Custom paper'
})
const pageCount = computed(() => printJob.value.length)
const sizeLine = computed(() => {
  const inches = `${(paper.value.widthMm / 25.4).toFixed(2)} × ${(paper.value.heightMm / 25.4).toFixed(2)} in`
  return `${paper.value.widthMm.toFixed(1)} × ${paper.value.heightMm.toFixed(1)} mm · ${inches}`
})

function fit() {
  const width = stage.value?.clientWidth || 640
  const pagePx = paper.value.widthMm * 3.7795275591
  scale.value = Math.min(1, Math.max(0.2, (width - 48) / pagePx))
}

function sheetStyle(item: PrintPage) {
  const size = pageSize(doc.value, item.surface)
  return {
    width: `${size.w}mm`,
    height: `${size.h}mm`,
    background: doc.value.surfaces[item.surface].bg,
    transform: `scale(${scale.value})`,
  }
}

function frameStyle(item: PrintPage) {
  const size = pageSize(doc.value, item.surface)
  return {
    width: `${size.w * scale.value}mm`,
    height: `${size.h * scale.value}mm`,
  }
}

function close() {
  dialog.value = null
  printJob.value = []
}

async function send() {
  if (busy.value) return
  const count = Math.max(1, Math.min(99, Math.round(Number(copies.value) || 1)))
  copies.value = count
  const from = Math.max(1, Math.min(pageCount.value, Math.round(Number(rangeFrom.value) || 1)))
  const to = Math.max(from, Math.min(pageCount.value, Math.round(Number(rangeTo.value) || from)))
  rangeFrom.value = from
  rangeTo.value = to
  if (!desktop) {
    window.print()
    return
  }
  busy.value = true
  status.value = ''
  try {
    const result = await window.envelopeDesktop!.printDocument({
      deviceName: printer.value,
      copies: count,
      paper: paper.value.id,
      widthMicrons: paper.value.widthMicrons,
      heightMicrons: paper.value.heightMicrons,
      landscape: paper.value.landscape,
      duplexMode: sides.value,
      color: colorMode.value === 'color',
      collate: collate.value,
      pageRanges: pageMode.value === 'range' ? [{ from: from - 1, to: to - 1 }] : undefined,
    })
    if (!result.success) {
      status.value = result.failureReason === 'Print job canceled'
        ? 'Printing was canceled.'
        : (result.failureReason || 'The printer did not accept the page.')
      return
    }
    studio.toast('Sent to the printer')
    close()
  } catch {
    status.value = 'The printer did not accept the page.'
  } finally {
    busy.value = false
  }
}

onMounted(async () => {
  fit()
  if (stage.value && typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => fit())
    observer.observe(stage.value)
  }
  if (!desktop) return
  try {
    printers.value = await window.envelopeDesktop!.listPrinters()
    printer.value = printers.value[0]?.name || ''
    rangeTo.value = pageCount.value
    if (!printers.value.length) status.value = 'No printer is installed.'
  } catch {
    status.value = 'The printer list could not be read.'
  }
})

onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <div class="overlay" @mousedown.self="close">
    <div class="drawer print-desk" role="dialog" aria-modal="true" aria-labelledby="print-title">
      <header class="drawer-head">
        <h2 id="print-title">Print</h2>
        <button type="button" class="close" aria-label="Close" @click="close">×</button>
      </header>
      <div class="print-desk-body">
        <div ref="stage" class="print-stage">
          <figure v-for="(item, index) in printJob" :key="index" class="print-figure">
            <div class="print-frame" :style="frameStyle(item)">
              <div class="print-page" :style="sheetStyle(item)">
                <div class="print-shift" :style="{ transform: `translate(${doc.cal.x}mm, ${doc.cal.y}mm)` }">
                  <MailPiece v-if="!item.test" print-mode :surface="item.surface" :recipient-plain="item.recipientPlain" />
                  <div v-else class="test-sheet">
                    <div class="test-mark" style="left:10mm;top:10mm;width:50mm;height:0.3mm" />
                    <div class="test-mark" style="left:10mm;top:10mm;width:0.3mm;height:50mm" />
                    <p>50 mm reference. This sheet is only for alignment.</p>
                  </div>
                </div>
              </div>
            </div>
            <figcaption>{{ item.test ? 'Alignment test' : SURFACE_LABEL[item.surface] }}</figcaption>
          </figure>
        </div>
        <aside class="print-side">
          <label class="input-label" for="print-printer">Printer</label>
          <select v-if="desktop" id="print-printer" v-model="printer" :disabled="!printers.length || busy">
            <option v-for="item in printers" :key="item.name" :value="item.name">{{ item.displayName }}</option>
          </select>
          <p v-else id="print-printer" class="print-system">Your browser’s print dialog will open from here.</p>
          <template v-if="desktop">
            <label class="input-label" for="print-copies">Copies</label>
            <input id="print-copies" v-model.number="copies" type="number" min="1" max="99" :disabled="busy">
            <label class="input-label" for="print-sides">Sides</label>
            <select id="print-sides" v-model="sides" :disabled="busy">
              <option value="simplex">One-sided</option>
              <option value="longEdge">Both sides, flip on the long edge</option>
              <option value="shortEdge">Both sides, flip on the short edge</option>
            </select>
            <label class="input-label" for="print-color">Color</label>
            <select id="print-color" v-model="colorMode" :disabled="busy">
              <option value="color">Color</option>
              <option value="gray">Black and white</option>
            </select>
            <label class="print-check" for="print-collate"><input id="print-collate" v-model="collate" type="checkbox" :disabled="busy">Collate copies</label>
            <label class="input-label" for="print-pages">Pages</label>
            <select id="print-pages" v-model="pageMode" :disabled="busy || pageCount < 2">
              <option value="all">All pages</option>
              <option value="range">Page range</option>
            </select>
            <div v-if="pageMode === 'range'" class="print-range">
              <input v-model.number="rangeFrom" type="number" min="1" :max="pageCount" aria-label="First page" :disabled="busy">
              <span>to</span>
              <input v-model.number="rangeTo" type="number" min="1" :max="pageCount" aria-label="Last page" :disabled="busy">
            </div>
          </template>
          <div class="print-paper">
            <strong>{{ paperName }}</strong>
            <span>{{ sizeLine }}</span>
          </div>
          <p class="print-meta">{{ pageCount }} page{{ pageCount === 1 ? '' : 's' }}. Same sheet as the page in the studio, at 100%, with no header or footer.</p>
          <p v-if="status" class="print-status" role="status">{{ status }}</p>
          <button type="button" class="button primary full" :disabled="busy || (desktop && !printer)" @click="send">{{ busy ? 'Printing…' : 'Print' }}</button>
          <button type="button" class="button full" :disabled="busy" @click="close">Cancel</button>
        </aside>
      </div>
    </div>
  </div>
</template>
