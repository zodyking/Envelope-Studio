<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useStudio } from '~/composables/useStudio'
import type { PeerAlign } from '~/lib/align'

const studio = useStudio()
const { objectMenu, selection } = studio
const peerId = ref<string | null>(null)
const peers = computed(() => objectMenu.value ? studio.surfaceObjects(objectMenu.value.id) : [])
const removable = computed(() => {
  const id = objectMenu.value?.id
  return !!id && id !== 'recipient' && id !== 'sender' && !id.startsWith('window:')
})

const pageAlign = [
  ['center', 'Center on page'],
  ['centerX', 'Center horizontally'],
  ['centerY', 'Center vertically'],
  ['left', 'Align left'],
  ['right', 'Align right'],
  ['top', 'Align top'],
  ['bottom', 'Align bottom'],
] as const

const peerAlign: { id: PeerAlign; label: string }[] = [
  { id: 'left', label: 'Left edges' },
  { id: 'centerX', label: 'Centers' },
  { id: 'right', label: 'Right edges' },
  { id: 'top', label: 'Tops' },
  { id: 'centerY', label: 'Middles' },
  { id: 'bottom', label: 'Bottoms' },
]

function onPointer(event: PointerEvent) {
  const target = event.target
  if (target instanceof Element && target.closest('.obj-menu, [data-align-menu]')) return
  studio.closeObjectMenu()
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') studio.closeObjectMenu()
}

onMounted(() => {
  window.addEventListener('pointerdown', onPointer, true)
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onPointer, true)
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div
    v-if="objectMenu"
    class="obj-menu"
    role="menu"
    :style="{ left: objectMenu.x + 'px', top: objectMenu.y + 'px' }"
    @pointerdown.stop
  >
    <p class="menu-label">Align to page</p>
    <button v-for="item in pageAlign" :key="item[0]" type="button" role="menuitem" @click="studio.alignSelection(item[0])">{{ item[1] }}</button>
    <template v-if="peers.length">
      <p class="menu-label">Align with</p>
      <div v-for="peer in peers" :key="peer.id" class="menu-peer" @mouseenter="peerId = peer.id" @focusin="peerId = peer.id">
        <button type="button" class="peer-name" :aria-expanded="peerId === peer.id" @click="peerId = peerId === peer.id ? null : peer.id">
          {{ peer.name }}
        </button>
        <div v-if="peerId === peer.id" class="obj-menu flyout" role="menu">
          <button v-for="edge in peerAlign" :key="edge.id" type="button" role="menuitem" @click="studio.alignSelectionTo(peer.id, edge.id)">{{ edge.label }}</button>
        </div>
      </div>
    </template>
    <p class="menu-label">Arrange</p>
    <button v-if="selection && studio.isTextId(selection)" type="button" role="menuitem" @click="studio.beginEdit(selection); studio.closeObjectMenu()">Edit text</button>
    <button type="button" role="menuitem" :disabled="!removable" @click="studio.moveLayer(1); studio.closeObjectMenu()">Bring forward</button>
    <button type="button" role="menuitem" :disabled="!removable" @click="studio.moveLayer(-1); studio.closeObjectMenu()">Send backward</button>
    <button type="button" role="menuitem" @click="studio.resetSelection(); studio.closeObjectMenu()">Reset position</button>
    <button type="button" class="danger" role="menuitem" :disabled="!removable" @click="studio.deleteSelection(); studio.closeObjectMenu()">Delete</button>
  </div>
</template>
