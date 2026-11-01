<script setup lang="ts">
import { computed, ref } from 'vue'
import { CSV_TEMPLATE, addressFromRow, parseCSV } from '~/lib/csv'
import { downloadBlob } from '~/lib/files'
import { useStudio } from '~/composables/useStudio'

const studio = useStudio()
const text = ref(studio.doc.value.batchText)
const enabled = ref(studio.doc.value.batchEnabled)
const rows = computed(() => parseCSV(text.value))
const preview = computed(() => rows.value[0] ? addressFromRow(rows.value[0]).replace(/\n/g, ', ') : '')

function downloadExample() {
  downloadBlob('envelope-recipients.csv', new Blob([CSV_TEMPLATE], { type: 'text/csv' }))
}

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) text.value = await file.text()
}
</script>

<template>
  <div class="overlay open" @mousedown.self="studio.dialog.value = null">
    <div class="drawer" role="dialog" aria-modal="true" aria-labelledby="batchTitle">
      <div class="drawer-head">
        <h2 id="batchTitle">Recipients</h2>
        <button type="button" class="close" aria-label="Close" @click="studio.dialog.value = null">×</button>
      </div>
      <div class="drawer-body">
        <section class="drawer-section">
          <h3>Mailing list</h3>
          <p>Use columns name, address1, address2, city, state, zip. The list stays on this PC. One postage image cannot be repeated for every row.</p>
          <div class="grid-two">
            <label class="button">Choose CSV<input class="sr-only" type="file" accept=".csv,text/csv" @change="onFile"></label>
            <button type="button" class="button" @click="downloadExample">Download example</button>
          </div>
          <label class="input-label" for="batchContent">Or paste CSV</label>
          <textarea id="batchContent" v-model="text" rows="8" spellcheck="false" />
          <div class="note-card">{{ rows.length ? `${rows.length} recipient${rows.length === 1 ? '' : 's'}. First: ${preview}` : 'No recipients yet.' }}</div>
          <label class="option-card">
            <input v-model="enabled" type="checkbox">
            <span><strong>Use this list when printing</strong><small>Each person gets a page. The letter and artwork stay the same.</small></span>
          </label>
          <button type="button" class="button primary full" @click="studio.applyBatch(text, enabled)">Apply mailing list</button>
        </section>
      </div>
    </div>
  </div>
</template>
