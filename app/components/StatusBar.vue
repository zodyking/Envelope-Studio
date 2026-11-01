<script setup lang="ts">
import { computed } from 'vue'
import { useStudio } from '~/composables/useStudio'

const studio = useStudio()
const { doc, warnings, scale, zoom, rulers } = studio
const percent = computed(() => Math.round(scale.value * 100))

function bump(delta: number) {
  zoom.value = Math.min(1.6, Math.max(0.2, Math.round(((zoom.value ?? scale.value) + delta) * 100) / 100))
}
</script>

<template>
  <footer class="statusbar">
    <div class="status-left">
      <span class="ready" :class="{ 'has-warning': warnings.length }" :title="warnings.join('; ')">
        <span class="ready-dot" /> {{ warnings[0] || 'Ready' }}
      </span>
      <span class="status-sep" aria-hidden="true" />
      <span>{{ studio.pageLabel.value }}</span>
    </div>
    <div class="status-right">
      <div class="status-views" aria-label="Views">
        <button type="button" class="view-btn" :class="{ active: doc.view === 'envelope' }" @click="studio.setView('envelope')">Front</button>
        <button type="button" class="view-btn" :class="{ active: doc.view === 'back' }" @click="studio.setView('back')">Back</button>
        <button type="button" class="view-btn" :class="{ active: doc.view === 'letter' }" :disabled="doc.style === 'plain'" @click="studio.setView('letter')">Letter</button>
        <button type="button" class="view-btn" :class="{ active: doc.view === 'letterBack' }" :disabled="doc.style === 'plain'" @click="studio.setView('letterBack')">Letter back</button>
      </div>
      <span class="status-sep" aria-hidden="true" />
      <button type="button" class="zoom-btn" aria-label="Zoom out" @click="bump(-0.1)">−</button>
      <input class="zoom-range" type="range" min="20" max="160" :value="percent" aria-label="Zoom" @input="zoom = Number(($event.target as HTMLInputElement).value) / 100">
      <button type="button" class="zoom-btn" aria-label="Zoom in" @click="bump(0.1)">+</button>
      <button type="button" class="zoom-readout" @click="zoom = null">{{ percent }}%</button>
      <button type="button" class="view-btn" :class="{ active: rulers }" @click="rulers = !rulers">Ruler</button>
    </div>
  </footer>
</template>
