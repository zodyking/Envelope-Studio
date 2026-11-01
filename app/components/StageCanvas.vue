<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { MM } from '~/lib/constants'
import { pageSize } from '~/lib/geometry'
import { useStudio } from '~/composables/useStudio'

const { doc, zoom, scale, rulers } = useStudio()
const stage = ref<HTMLElement | null>(null)
const rulerH = ref<HTMLCanvasElement | null>(null)
const rulerV = ref<HTMLCanvasElement | null>(null)

function fit() {
  const host = stage.value
  if (!host) return
  const page = pageSize(doc.value)
  const styles = getComputedStyle(host)
  const padX = (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0)
  const padY = (parseFloat(styles.paddingTop) || 0) + (parseFloat(styles.paddingBottom) || 0)
  const chrome = rulers.value ? 28 : 0
  const availW = host.clientWidth - padX - chrome - 8
  const availH = host.clientHeight - padY - chrome - 8
  const fitted = Math.min(1.35, Math.max(0.2, Math.min(availW / (page.w * MM), availH / (page.h * MM))))
  const used = zoom.value == null ? fitted : Math.min(1.6, Math.max(0.2, zoom.value))
  scale.value = Number.isFinite(used) && used > 0 ? used : 0.5
  drawRulers()
}

function paint(canvas: HTMLCanvasElement, cssW: number, cssH: number, horizontal: boolean, mmLen: number, sc: number) {
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.max(1, Math.round(cssW * dpr))
  canvas.height = Math.max(1, Math.round(cssH * dpr))
  canvas.style.width = `${cssW}px`
  canvas.style.height = `${cssH}px`
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = '#f3f2f1'
  ctx.fillRect(0, 0, cssW, cssH)
  ctx.strokeStyle = '#d2d0ce'
  ctx.beginPath()
  if (horizontal) { ctx.moveTo(0, cssH - 0.5); ctx.lineTo(cssW, cssH - 0.5) }
  else { ctx.moveTo(cssW - 0.5, 0); ctx.lineTo(cssW - 0.5, cssH) }
  ctx.stroke()
  ctx.font = '10px "Segoe UI", sans-serif'
  ctx.fillStyle = '#323130'
  ctx.strokeStyle = '#605e5c'
  const pxPerIn = 96 * sc
  const inches = mmLen / 25.4
  for (let i = 0; i <= inches + 0.001; i += 0.125) {
    const pos = i * pxPerIn
    const eighth = Math.round(i * 8)
    const major = eighth % 8 === 0
    const mid = eighth % 4 === 0
    const len = major ? 14 : mid ? 9 : 5
    ctx.beginPath()
    if (horizontal) { ctx.moveTo(Math.round(pos) + 0.5, cssH); ctx.lineTo(Math.round(pos) + 0.5, cssH - len) }
    else { ctx.moveTo(cssW, Math.round(pos) + 0.5); ctx.lineTo(cssW - len, Math.round(pos) + 0.5) }
    ctx.stroke()
    if (major) {
      const label = String(Math.round(i))
      if (horizontal) ctx.fillText(label, pos + 3, 11)
      else {
        ctx.save()
        ctx.translate(11, pos + 3)
        ctx.rotate(-Math.PI / 2)
        ctx.fillText(label, 0, 0)
        ctx.restore()
      }
    }
  }
}

function drawRulers() {
  if (!rulers.value || !rulerH.value || !rulerV.value) return
  const page = pageSize(doc.value)
  const sc = scale.value || 1
  paint(rulerH.value, Math.max(1, page.w * MM * sc), 24, true, page.w, sc)
  paint(rulerV.value, 24, Math.max(1, page.h * MM * sc), false, page.h, sc)
}

function onWheel(event: WheelEvent) {
  if (!(event.ctrlKey || event.metaKey)) return
  event.preventDefault()
  const next = (zoom.value ?? scale.value) + (event.deltaY < 0 ? 0.1 : -0.1)
  zoom.value = Math.min(1.6, Math.max(0.2, Math.round(next * 100) / 100))
}

let observer: ResizeObserver | null = null
onMounted(() => {
  fit()
  if (stage.value) {
    observer = new ResizeObserver(() => fit())
    observer.observe(stage.value)
    stage.value.addEventListener('wheel', onWheel, { passive: false })
  }
  window.addEventListener('resize', fit)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  stage.value?.removeEventListener('wheel', onWheel)
  window.removeEventListener('resize', fit)
})
watch([() => doc.value.view, () => doc.value.w, () => doc.value.h, () => doc.value.insert.sheet, zoom, rulers], () => fit())
</script>

<template>
  <div ref="stage" class="stage">
    <div class="sheet-stack">
      <div class="ruler-corner" aria-hidden="true" />
      <canvas ref="rulerH" class="ruler ruler-h" width="10" height="24" aria-hidden="true" />
      <canvas ref="rulerV" class="ruler ruler-v" width="24" height="10" aria-hidden="true" />
      <div class="stage-inner">
        <div class="page-wrapper" :style="{ width: (pageSize(doc).w * MM * scale) + 'px', height: (pageSize(doc).h * MM * scale) + 'px' }">
          <div class="paper-scale" :style="{ transform: `scale(${scale})` }">
            <MailPiece interactive />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
