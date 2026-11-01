<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useStudio } from '~/composables/useStudio'
import type { Role } from '~/lib/types'

const studio = useStudio()
const { doc } = studio
const profileName = ref('')
const profiles = ref<Record<string, { x: number; y: number }>>({})
const KEY = 'envelope-studio-v3-printers'
const fileInput = ref<HTMLInputElement | null>(null)

onMounted(() => {
  try { profiles.value = JSON.parse(localStorage.getItem(KEY) || '{}') } catch { profiles.value = {} }
})

function roles(): Role[] {
  if (doc.value.style === 'double') return ['recipient', 'sender']
  if (doc.value.style === 'single') return ['recipient']
  return []
}

function saveProfile() {
  const name = profileName.value.trim()
  if (!name) { studio.toast('Name this printer setup'); return }
  profiles.value = { ...profiles.value, [name]: { ...doc.value.cal } }
  localStorage.setItem(KEY, JSON.stringify(profiles.value))
  studio.toast('Printer setup saved')
}

function loadProfile(name: string) {
  const profile = profiles.value[name]
  if (!profile) return
  studio.edit(() => { doc.value.cal = { ...profile } })
  studio.toast('Printer setup loaded')
}

async function restore(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try { await studio.importProjectText(await file.text()); studio.dialog.value = null }
  catch (error) { studio.toast(error instanceof Error ? error.message : 'Could not read that project') }
}
</script>

<template>
  <div class="overlay open" @mousedown.self="studio.dialog.value = null">
    <div class="drawer" role="dialog" aria-modal="true" aria-labelledby="setupTitle">
      <div class="drawer-head">
        <h2 id="setupTitle">Page setup</h2>
        <button type="button" class="close" aria-label="Close" @click="studio.dialog.value = null">×</button>
      </div>
      <div class="drawer-body">
        <section v-if="roles().length" class="drawer-section">
          <h3>Window measurements</h3>
          <p>One set of measurements, shared with the window on the page. Values are millimeters from the top-left of the envelope.</p>
          <template v-for="role in roles()" :key="role">
            <h3>{{ role === 'recipient' ? 'Recipient window' : 'Return window' }}</h3>
            <div class="settings-grid">
              <label v-for="field in [['x', 'Left'], ['y', 'Top'], ['w', 'Width'], ['h', 'Height']]" :key="field[0]">
                {{ field[1] }}
                <input type="number" step="0.25" :value="doc.windows[role][field[0] as 'x']" @change="studio.edit(() => { doc.windows[role][field[0] as 'x'] = Number(($event.target as HTMLInputElement).value) })">
              </label>
            </div>
          </template>
        </section>
        <section v-if="doc.style !== 'plain'" class="drawer-section">
          <h3>Folded letter</h3>
          <div class="settings-grid">
            <label>Paper
              <select :value="doc.insert.sheet" @change="studio.edit(() => { doc.insert.sheet = ($event.target as HTMLSelectElement).value === 'a4' ? 'a4' : 'letter' })">
                <option value="letter">US Letter</option>
                <option value="a4">A4</option>
              </select>
            </label>
            <label>Address panel
              <select :value="doc.insert.panel" @change="studio.edit(() => { doc.insert.panel = Number(($event.target as HTMLSelectElement).value) as 0 | 1 | 2 })">
                <option value="0">Top third</option>
                <option value="1">Middle third</option>
                <option value="2">Bottom third</option>
              </select>
            </label>
            <label>Sheet left offset mm<input type="number" step="0.5" :value="doc.insert.left" @change="studio.edit(() => { doc.insert.left = Number(($event.target as HTMLInputElement).value) || 0 })"></label>
            <label>Sheet top offset mm<input type="number" step="0.5" :value="doc.insert.top" @change="studio.edit(() => { doc.insert.top = Number(($event.target as HTMLInputElement).value) || 0 })"></label>
          </div>
        </section>
        <section class="drawer-section">
          <h3>Printer alignment</h3>
          <p>Print a test, measure how far the ink moved, then correct it here. If the print is 3 mm too far right, set horizontal correction to −3.</p>
          <div class="settings-grid">
            <label>Horizontal mm<input type="number" step="0.25" :value="doc.cal.x" @change="studio.edit(() => { doc.cal.x = Number(($event.target as HTMLInputElement).value) || 0 })"></label>
            <label>Vertical mm<input type="number" step="0.25" :value="doc.cal.y" @change="studio.edit(() => { doc.cal.y = Number(($event.target as HTMLInputElement).value) || 0 })"></label>
          </div>
          <div class="grid-two">
            <button type="button" class="button" @click="studio.printCurrent(true)">Print 50 mm test</button>
            <button type="button" class="button" @click="studio.edit(() => { doc.cal = { x: 0, y: 0 } })">Reset corrections</button>
          </div>
          <label class="input-label">Save this correction for a printer</label>
          <input v-model="profileName" placeholder="Example: Brother, manual feed">
          <button type="button" class="button full" @click="saveProfile">Save printer setup</button>
          <label class="input-label">Load a printer setup</label>
          <select @change="loadProfile(($event.target as HTMLSelectElement).value)">
            <option value="">Choose saved profile…</option>
            <option v-for="name in Object.keys(profiles)" :key="name" :value="name">{{ name }}</option>
          </select>
        </section>
        <section class="drawer-section">
          <h3>Backup</h3>
          <button type="button" class="button" @click="studio.exportProject()">Save project</button>
          <button type="button" class="button" @click="fileInput?.click()">Open project</button>
          <input ref="fileInput" class="sr-only" type="file" accept="application/json,.json" @change="restore">
        </section>
      </div>
    </div>
  </div>
</template>
