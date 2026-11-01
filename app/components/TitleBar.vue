<script setup lang="ts">
import { computed, ref } from 'vue'
import { useStudio } from '~/composables/useStudio'

const studio = useStudio()
const { doc, savedLabel, backstage } = studio
const query = ref('')
const open = ref(false)
const hi = ref(0)

const commands = computed(() => [
  ['Print', 'Open the print page', () => { backstage.value = 'print' }],
  ['Quick print', 'Print the letter for a window envelope', () => studio.printCurrent(false)],
  ['Alignment test', 'Print a 50 mm test sheet', () => studio.printCurrent(true)],
  ['Create PDF', 'Save this side as a PDF', () => studio.exportPdf(false)],
  ['Both sides', 'Save the front and back', () => studio.exportPdf(true)],
  ['Page setup', 'Windows, paper, and printer offset', () => { studio.dialog.value = 'setup' }],
  ['Postage', 'Extract and place a stamp', () => { studio.dialog.value = 'postage' }],
  ['Text box', 'Insert editable text', () => studio.addText()],
  ['Letter', 'Insert a letter template', () => studio.addLetter()],
  ['Rectangle', 'Insert a rectangle', () => studio.addShape('rect')],
  ['Line', 'Insert a line', () => studio.addShape('line')],
  ['Recipients', 'Import a mailing list', () => { studio.dialog.value = 'batch' }],
  ['Save project', 'Download or save the project file', () => studio.exportProject()],
  ['Fit page', 'Fit the page in the window', () => { studio.zoom.value = null }],
  ['Help', 'Shortcuts and printing', () => { studio.ribbonCollapsed.value = false; studio.ribbon.value = 'help' }],
] as [string, string, () => void][])

const results = computed(() => {
  const q = query.value.trim().toLowerCase()
  return commands.value.filter(item => !q || item[0].toLowerCase().includes(q) || item[1].toLowerCase().includes(q)).slice(0, 8)
})

function closeSearch() {
  window.setTimeout(() => { open.value = false }, 160)
}

function run(index: number) {
  results.value[index]?.[2]()
  open.value = false
  query.value = ''
}
</script>

<template>
  <header class="titlebar">
    <div class="title-left">
      <span class="app-mark" title="Envelope Studio"><svg class="icon" aria-hidden="true"><use href="#i-env" /></svg></span>
      <div class="qat" aria-label="Quick Access Toolbar">
        <button type="button" class="qat-btn" title="Save (Ctrl+S)" aria-label="Save" @click="studio.persist(); studio.toast('Saved on this PC')"><svg class="icon" aria-hidden="true"><use href="#i-save" /></svg></button>
        <button type="button" class="qat-btn" title="Undo" aria-label="Undo" @click="studio.undo()"><svg class="icon" aria-hidden="true"><use href="#i-undo" /></svg></button>
        <button type="button" class="qat-btn" title="Redo" aria-label="Redo" @click="studio.redo()"><svg class="icon" aria-hidden="true"><use href="#i-redo" /></svg></button>
        <button type="button" class="qat-btn" title="Print" aria-label="Print" @click="studio.printCurrent(false)"><svg class="icon" aria-hidden="true"><use href="#i-print" /></svg></button>
        <button type="button" class="qat-btn" title="Page setup" aria-label="Page setup" @click="studio.dialog.value = 'setup'"><svg class="icon" aria-hidden="true"><use href="#i-gear" /></svg></button>
      </div>
      <span id="saveIndicator">{{ savedLabel }}</span>
    </div>
    <div class="title-center">
      <input class="doc-title" aria-label="Document name" :value="doc.title" @change="studio.edit(() => { doc.title = ($event.target as HTMLInputElement).value || 'Envelope 1' })">
      <span class="doc-app"> - Envelope</span>
    </div>
    <div class="title-right">
      <label class="tellme">
        <svg class="icon" aria-hidden="true"><use href="#i-search" /></svg>
        <input v-model="query" type="search" placeholder="Search" aria-label="Search commands" autocomplete="off" @focus="open = true; hi = 0" @input="open = true; hi = 0" @blur="closeSearch" @keydown.down.prevent="hi = Math.min(results.length - 1, hi + 1)" @keydown.up.prevent="hi = Math.max(0, hi - 1)" @keydown.enter.prevent="run(hi)" @keydown.escape.stop="open = false">
      </label>
      <div v-if="open" class="tellme-results" role="listbox">
        <button v-for="(item, index) in results" :key="item[0]" type="button" role="option" :aria-selected="index === hi" @mousedown.prevent @click="run(index)"><strong>{{ item[0] }}</strong><span>{{ item[1] }}</span></button>
        <div v-if="!results.length" class="empty">No commands found.</div>
      </div>
    </div>
  </header>
</template>
