<script setup lang="ts">
import { computed } from 'vue'
import { useStudio } from '~/composables/useStudio'

const studio = useStudio()
const { selection, selectionKind } = studio
const names: Record<string, string> = {
  page: 'Page',
  recipient: 'Recipient',
  sender: 'Return address',
  window: 'Window',
  stamp: 'Postage',
  text: 'Text box',
  rect: 'Rectangle',
  line: 'Line',
  image: 'Picture',
}
const frame = computed(() => selection.value ? studio.frameOf(selection.value) : null)

function setAxis(axis: 'x' | 'y' | 'w' | 'h', value: number) {
  if (!selection.value || !frame.value || !Number.isFinite(value)) return
  studio.setFrame(selection.value, { ...frame.value, [axis]: value })
}

function openMenu(event: MouseEvent) {
  if (!selection.value) return
  if (studio.objectMenu.value?.id === selection.value) {
    studio.closeObjectMenu()
    return
  }
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  studio.openObjectMenu(selection.value, rect.left, rect.bottom + 4)
}
</script>

<template>
  <div class="contextbar">
    <strong class="context-name">{{ names[selectionKind] || 'Object' }}</strong>
    <div class="context-metrics">
      <label>X <input type="number" step="0.5" aria-label="Horizontal position millimeters" :value="frame ? frame.x.toFixed(1) : ''" :disabled="!frame" @change="setAxis('x', Number(($event.target as HTMLInputElement).value))"></label>
      <label>Y <input type="number" step="0.5" aria-label="Vertical position millimeters" :value="frame ? frame.y.toFixed(1) : ''" :disabled="!frame" @change="setAxis('y', Number(($event.target as HTMLInputElement).value))"></label>
      <label>W <input type="number" step="0.5" aria-label="Width millimeters" :value="frame ? frame.w.toFixed(1) : ''" :disabled="!frame" @change="setAxis('w', Number(($event.target as HTMLInputElement).value))"></label>
      <label>H <input type="number" step="0.5" aria-label="Height millimeters" :value="frame ? frame.h.toFixed(1) : ''" :disabled="!frame || selectionKind === 'line'" @change="setAxis('h', Number(($event.target as HTMLInputElement).value))"></label>
      <span class="unit">mm</span>
    </div>
    <div class="context-actions">
      <button type="button" class="button tiny" data-align-menu :disabled="!selection" :aria-expanded="!!studio.objectMenu.value" @click="openMenu">Align</button>
      <button v-if="studio.isTextId(selection)" type="button" class="button tiny" @click="selection && studio.beginEdit(selection)">Edit</button>
    </div>
  </div>
</template>
