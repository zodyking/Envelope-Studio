<script setup lang="ts">
import { onMounted } from 'vue'
import { pageSize } from '~/lib/geometry'
import { useStudio } from '~/composables/useStudio'
import type { PrintPage } from '~/composables/useStudio'

const studio = useStudio()
const { doc, backstage, paneOpen, ribbonCollapsed, rulers, dialog, printJob, toastText } = studio

onMounted(() => { void studio.loadDesktop() })

function sheetStyle(page: PrintPage) {
  const size = pageSize(doc.value, page.surface)
  return {
    width: `${size.w}mm`,
    height: `${size.h}mm`,
    background: doc.value.surfaces[page.surface].bg,
  }
}
</script>

<template>
  <SvgSprite />
  <div class="app" :class="{ 'backstage-open': backstage, 'pane-collapsed': !paneOpen, 'ribbon-collapsed': ribbonCollapsed, 'rulers-off': !rulers }">
    <TitleBar />
    <RibbonBar />
    <div class="app-body">
      <BackstageView v-if="backstage" />
      <div class="layout">
        <PropertiesPane />
        <main class="main">
          <div class="doc-caption">
            <h2>{{ studio.surfaceLabel.value }}</h2>
            <p>Double-click text to edit it. Drag to move. Drag the handles to resize.</p>
          </div>
          <StageCanvas />
          <ContextBar />
        </main>
      </div>
    </div>
    <StatusBar />
    <SetupDialog v-if="dialog === 'setup'" />
    <PostageDialog v-if="dialog === 'postage'" />
    <BatchDialog v-if="dialog === 'batch'" />
    <PrintDialog v-if="dialog === 'print'" />
    <div v-if="toastText" class="toast visible" role="status">{{ toastText }}</div>
  </div>
  <div id="printHost" aria-hidden="true">
    <div v-for="(page, index) in printJob" :key="index" class="print-sheet" :style="sheetStyle(page)">
      <div class="print-shift" :style="{ transform: `translate(${doc.cal.x}mm, ${doc.cal.y}mm)` }">
        <MailPiece v-if="!page.test" print-mode :surface="page.surface" :recipient-plain="page.recipientPlain" />
        <div v-else class="test-sheet">
          <div class="test-mark" style="left:10mm;top:10mm;width:50mm;height:0.3mm" />
          <div class="test-mark" style="left:10mm;top:10mm;width:0.3mm;height:50mm" />
          <p>50 mm reference. Print at 100%. This sheet is only for alignment.</p>
        </div>
      </div>
    </div>
  </div>
</template>
