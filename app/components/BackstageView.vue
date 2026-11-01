<script setup lang="ts">
import { ref } from 'vue'
import { useStudio } from '~/composables/useStudio'

const studio = useStudio()
const { doc, backstage, savedLabel, warnings } = studio
const fileInput = ref<HTMLInputElement | null>(null)
const hasDesktop = typeof window !== 'undefined' && !!window.envelopeDesktop

async function openProject(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    await studio.importProjectText(await file.text())
    backstage.value = null
  } catch (error) {
    studio.toast(error instanceof Error ? error.message : 'Could not open that project')
  }
}

async function openDesktop() {
  const text = await window.envelopeDesktop?.openFile()
  if (!text) return
  try {
    await studio.importProjectText(text)
    backstage.value = null
  } catch (error) {
    studio.toast(error instanceof Error ? error.message : 'Could not open that project')
  }
}
</script>

<template>
  <div class="backstage">
    <button type="button" class="bs-back" aria-label="Back" @click="backstage = null"><svg class="icon" aria-hidden="true"><use href="#i-back" /></svg></button>
    <nav aria-label="File">
      <button type="button" class="bs-link" :class="{ active: backstage === 'info' }" @click="backstage = 'info'">Info</button>
      <button type="button" class="bs-link" :class="{ active: backstage === 'print' }" @click="backstage = 'print'">Print</button>
      <button type="button" class="bs-link" :class="{ active: backstage === 'export' }" @click="backstage = 'export'">Export</button>
      <button type="button" class="bs-link" @click="backstage = null; studio.dialog.value = 'setup'">Options</button>
    </nav>
    <div class="bs-content">
      <section v-show="backstage === 'info'">
        <h1>Info</h1>
        <div class="bs-product"><strong>Envelope Studio</strong><small>Version 4.1</small></div>
        <dl class="bs-meta">
          <div><dt>Name</dt><dd>{{ doc.title }}</dd></div>
          <div><dt>Saved</dt><dd>{{ savedLabel }}</dd></div>
          <div><dt>Size</dt><dd>{{ studio.pageLabel.value }}</dd></div>
          <div><dt>Status</dt><dd>{{ warnings[0] || 'Ready' }}</dd></div>
        </dl>
        <p class="bs-note">The mail piece is stored on this PC. Export a PDF or a project file if you want a copy you can move.</p>
      </section>
      <section v-show="backstage === 'print'">
        <h1>Print</h1>
        <button type="button" class="bs-print" @click="studio.printCurrent(false)"><svg class="icon lg" aria-hidden="true"><use href="#i-print" /></svg>Print</button>
        <p class="bs-note">A window envelope prints the letter. The back is added when it has artwork, a page color, or fold guides. The preview shows each page before it is sent.</p>
        <button type="button" class="bs-action" @click="studio.printCurrent(true)">Print alignment test</button>
      </section>
      <section v-show="backstage === 'export'">
        <h1>Export</h1>
        <button type="button" class="bs-action" @click="studio.exportPdf(false)">Create PDF</button>
        <button type="button" class="bs-action" @click="studio.exportPdf(true)">Both sides</button>
        <button type="button" class="bs-action" @click="studio.exportProject()">Save project</button>
        <button type="button" class="bs-action" @click="hasDesktop ? openDesktop() : fileInput?.click()">Open project</button>
        <input ref="fileInput" class="sr-only" type="file" accept="application/json,.json" @change="openProject">
        <p class="bs-note">A project file keeps the layout, text, pictures, and postage image.</p>
      </section>
    </div>
  </div>
</template>
