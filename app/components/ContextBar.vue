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
const removable = computed(() => !!selection.value && selection.value !== 'recipient' && selection.value !== 'sender' && !selection.value.startsWith('window:'))

function setAxis(axis: 'x' | 'y' | 'w' | 'h', value: number) {
  if (!selection.value || !frame.value || !Number.isFinite(value)) return
  studio.setFrame(selection.value, { ...frame.value, [axis]: value })
}
</script>

<template>
  <div class="contextbar">
    <div class="context-left">
      <span class="selection-icon" aria-hidden="true"><svg class="icon" aria-hidden="true"><use href="#i-env" /></svg></span>
      <div>
        <strong>{{ names[selectionKind] || 'Object' }}</strong>
        <span>{{ studio.isTextId(selection) ? 'Double-click to edit. Drag handles to resize.' : 'Drag to move. Arrow keys nudge.' }}</span>
      </div>
    </div>
    <div class="context-right">
      <label>X <input type="number" step="0.5" aria-label="Horizontal position millimeters" :value="frame ? frame.x.toFixed(1) : ''" :disabled="!frame" @change="setAxis('x', Number(($event.target as HTMLInputElement).value))"></label>
      <label>Y <input type="number" step="0.5" aria-label="Vertical position millimeters" :value="frame ? frame.y.toFixed(1) : ''" :disabled="!frame" @change="setAxis('y', Number(($event.target as HTMLInputElement).value))"></label>
      <label>W <input type="number" step="0.5" aria-label="Width millimeters" :value="frame ? frame.w.toFixed(1) : ''" :disabled="!frame" @change="setAxis('w', Number(($event.target as HTMLInputElement).value))"></label>
      <label>H <input type="number" step="0.5" aria-label="Height millimeters" :value="frame ? frame.h.toFixed(1) : ''" :disabled="!frame || selectionKind === 'line'" @change="setAxis('h', Number(($event.target as HTMLInputElement).value))"></label>
      <span class="unit">mm</span>
      <button v-if="studio.isTextId(selection)" type="button" class="button tiny" @click="selection && studio.beginEdit(selection)">Edit text</button>
      <button type="button" class="button tiny" :disabled="!selection" @click="studio.resetSelection()">Reset</button>
      <button type="button" class="button tiny" :disabled="!removable" @click="studio.moveLayer(1)">Forward</button>
      <button type="button" class="button tiny" :disabled="!removable" @click="studio.moveLayer(-1)">Backward</button>
      <button type="button" class="button tiny danger" :disabled="!removable" @click="studio.deleteSelection()">Delete</button>
    </div>
  </div>
</template>
