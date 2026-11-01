<script setup lang="ts">
import { useStudio } from '~/composables/useStudio'

const studio = useStudio()
const { doc, selection, layers, paneOpen, warnings } = studio
</script>

<template>
  <aside class="editor" aria-label="Layers">
    <div class="editor-head">
      <div class="eyebrow">Layers</div>
      <h1>{{ studio.surfaceLabel.value }}</h1>
      <button type="button" class="pane-close" aria-label="Close layers" @click="paneOpen = false">×</button>
      <p>Text is edited on the page. This list only selects objects. Formatting stays on the Home tab.</p>
    </div>
    <div class="editor-scroll">
      <div class="layer-list">
        <button v-for="layer in layers" :key="layer.id" type="button" class="layer" :class="{ active: selection === layer.id }" @click="studio.select(layer.id)" @dblclick="studio.isTextId(layer.id) && studio.beginEdit(layer.id)">
          <span>{{ layer.name }}</span>
          <small>{{ layer.kind }}</small>
        </button>
        <p v-if="!layers.length" class="empty-copy">This side is empty. Use Insert to add text, a line, or a picture.</p>
      </div>
      <section class="form-section">
        <label class="sort-toggle">
          <input type="checkbox" :checked="doc.sortingAssist" @change="studio.edit(() => { doc.sortingAssist = ($event.target as HTMLInputElement).checked })">
          <span><strong>USPS sorting assist</strong><small>The page shows the recipient in clear uppercase. Bold, color, and the text you type are kept.</small></span>
        </label>
        <div class="sort-status" aria-live="polite">
          <span v-if="!warnings.length" class="ok">No layout warnings. USPS has not verified this address.</span>
          <span v-for="warning in warnings.slice(0, 3)" :key="warning" class="warn">{{ warning }}</span>
        </div>
        <p class="merge-line">{{ studio.batchCount.value ? studio.batchCount.value + ' recipients loaded' : 'Single envelope' }}</p>
      </section>
    </div>
    <div class="editor-bottom">Addresses cannot be deleted. Pictures, extra text, and postage can.</div>
  </aside>
</template>
