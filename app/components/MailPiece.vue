<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { MM } from '~/lib/constants'
import { flapPath } from '~/lib/flaps'
import { cssBox, hasWindow, isLetter, pageSize, showsAddress } from '~/lib/geometry'
import { isEmptyHtml, plainToHtml, textCss } from '~/lib/text'
import { useStudio } from '~/composables/useStudio'
import type { Box, Role, SurfaceId } from '~/lib/types'

const props = withDefaults(defineProps<{
  surface?: SurfaceId
  interactive?: boolean
  recipientPlain?: string | null
  printMode?: boolean
}>(), {
  surface: undefined,
  interactive: false,
  printMode: false,
  recipientPlain: undefined,
})

const studio = useStudio()
const { doc, selection, editingId, scale } = studio
const surface = computed(() => props.surface || doc.value.view)
const page = computed(() => pageSize(doc.value, surface.value))
const items = computed(() => doc.value.surfaces[surface.value].items)
const drag = ref<null | { id: string; mode: 'move' | 'resize'; dir: string; frame: Box; mx: number; my: number }>(null)
const handles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const roles: Role[] = ['sender', 'recipient']

const flap = computed(() => {
  if (surface.value !== 'back' || props.printMode) return ''
  return flapPath(page.value.w, page.value.h, doc.value.flap || 'commercial')
})

const folds = computed(() => {
  if (!isLetter(surface.value)) return []
  const expected = surface.value === 'letter' ? 'front' : 'back'
  if (doc.value.foldGuides !== expected) return []
  return [
    { y: page.value.h / 3, label: '1  Align the bottom edge here' },
    { y: page.value.h * 2 / 3, label: '2  Align the top edge here' },
  ]
})

function roleHtml(role: Role) {
  if (role === 'recipient' && (props.recipientPlain != null || (doc.value.sortingAssist && editingId.value !== 'recipient'))) {
    return plainToHtml(studio.recipientPreview(props.recipientPlain ?? null))
  }
  return doc.value[role].html
}

function empty(html: string) {
  return isEmptyHtml(html)
}

function selected(id: string) {
  return props.interactive && selection.value === id
}

function start(event: PointerEvent, id: string, mode: 'move' | 'resize', dir = '') {
  if (!props.interactive || event.button !== 0) return
  if (mode === 'move' && editingId.value === id) return
  event.preventDefault()
  event.stopPropagation()
  studio.select(id)
  studio.beginGesture()
  drag.value = { id, mode, dir, frame: studio.frameOf(id), mx: event.clientX, my: event.clientY }
}

function onMove(event: PointerEvent) {
  const current = drag.value
  if (!current) return
  const dx = (event.clientX - current.mx) / (scale.value * MM)
  const dy = (event.clientY - current.my) / (scale.value * MM)
  const snap = (value: number) => Math.round(value * 4) / 4
  if (current.mode === 'move') {
    studio.setFrame(current.id, {
      ...current.frame,
      x: snap(current.frame.x + dx),
      y: snap(current.frame.y + dy),
    }, true)
  } else {
    studio.resizeBy(current.frame, snap(dx), snap(dy), current.dir, current.id)
  }
}

function onUp() {
  if (!drag.value) return
  drag.value = null
  studio.endGesture()
}

function onPaper(event: PointerEvent) {
  if (!props.interactive || event.target !== event.currentTarget) return
  studio.endEdit()
  studio.select(null)
}

function edit(id: string) {
  if (props.interactive) studio.beginEdit(id)
}

onMounted(() => {
  if (!props.interactive) return
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
})
onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
})
</script>

<template>
  <div
    class="paper"
    :class="{ 'is-print': printMode, 'is-letter': surface === 'letter' || surface === 'letterBack' }"
    :style="{ width: page.w + 'mm', height: page.h + 'mm', background: doc.surfaces[surface].bg }"
    @pointerdown="onPaper"
  >
    <div v-if="surface === 'envelope'" class="safety-outline" />
    <svg v-if="flap" class="flap-guides" :viewBox="`0 0 ${page.w} ${page.h}`" aria-hidden="true">
      <path :d="flap" />
    </svg>
    <div v-if="surface === 'letter' || surface === 'letterBack'" class="side-badge">{{ surface === 'letter' ? 'Letter' : 'Letter back' }}</div>
    <div v-for="fold in folds" :key="fold.y" class="fold-guide" :style="{ top: fold.y + 'mm' }"><small>{{ fold.label }}</small></div>

    <div
      v-for="role in roles"
      v-show="surface === 'envelope' && hasWindow(doc, role)"
      :key="'win-' + role"
      class="window-shape"
      :class="{ selected: selected('window:' + role) }"
      :style="cssBox(doc.windows[role])"
      :tabindex="interactive ? 0 : undefined"
      @pointerdown="start($event, 'window:' + role, 'move')"
    >
      <template v-if="selected('window:' + role)">
        <i v-for="handle in handles" :key="handle" class="handle" :class="handle" @pointerdown="start($event, 'window:' + role, 'resize', handle)" />
      </template>
    </div>

    <div
      v-for="item in items"
      :key="item.id"
      class="obj"
      :class="['is-' + item.type, { selected: selected(item.id), filled: item.filled }]"
      :style="{ ...cssBox(item.frame), '--ink': item.color || '#315b88', '--stroke': (item.stroke || 0.7) + 'mm' }"
      :tabindex="interactive ? 0 : undefined"
      :aria-label="item.type"
      @pointerdown="start($event, item.id, 'move')"
      @dblclick.stop="item.type === 'text' ? edit(item.id) : undefined"
    >
      <img v-if="item.type === 'image' && item.src" :src="item.src" alt="" draggable="false">
      <div v-else-if="item.type === 'line'" class="line-rule" />
      <template v-else-if="item.type === 'text'">
        <InlineEditor v-if="interactive && editingId === item.id" :item-id="item.id" :html="item.html || '<p></p>'" />
        <div v-else class="mail-text" :class="{ placeholder: empty(item.html || '') }" :style="textCss(item.style || doc.recipient.style)" v-html="item.html || '<p>Text</p>'" />
        <button v-if="interactive && editingId === item.id" type="button" class="move-grip" @pointerdown="start($event, item.id, 'move')">Move</button>
      </template>
      <template v-if="selected(item.id)">
        <i v-for="handle in (item.type === 'line' ? ['w', 'e'] : handles)" :key="handle" class="handle" :class="handle" @pointerdown="start($event, item.id, 'resize', handle)" />
      </template>
      <button v-if="interactive && selected(item.id)" type="button" class="canvas-delete" aria-label="Delete" @pointerdown.stop @click.stop="studio.deleteSelection()">×</button>
    </div>

    <div
      v-for="role in roles"
      v-show="showsAddress(doc, role, surface)"
      :key="role"
      class="obj is-text address"
      :class="{ selected: selected(role), 'through-window': hasWindow(doc, role) }"
      :style="cssBox(studio.frameOf(role))"
      :tabindex="interactive ? 0 : undefined"
      :aria-label="role === 'recipient' ? 'Recipient' : 'Return address'"
      @pointerdown="start($event, role, 'move')"
      @dblclick.stop="edit(role)"
    >
      <InlineEditor v-if="interactive && editingId === role" :item-id="role" :html="doc[role].html" />
      <div v-else class="mail-text" :class="{ placeholder: empty(roleHtml(role)) }" :style="textCss(doc[role].style)" v-html="roleHtml(role)" />
      <button v-if="interactive && editingId === role" type="button" class="move-grip" @pointerdown="start($event, role, 'move')">Move</button>
      <template v-if="selected(role)">
        <i v-for="handle in handles" :key="handle" class="handle" :class="handle" @pointerdown="start($event, role, 'resize', handle)" />
      </template>
    </div>

    <div
      v-if="surface === 'envelope' && doc.stamp"
      class="obj is-image stamp"
      :class="{ selected: selected('stamp') }"
      :style="cssBox(doc.stamp.frame)"
      :tabindex="interactive ? 0 : undefined"
      aria-label="Postage"
      @pointerdown="start($event, 'stamp', 'move')"
    >
      <img :src="doc.stamp.src" alt="Postage" draggable="false">
      <template v-if="selected('stamp')">
        <i v-for="handle in handles" :key="handle" class="handle" :class="handle" @pointerdown="start($event, 'stamp', 'resize', handle)" />
      </template>
      <button v-if="interactive && selected('stamp')" type="button" class="canvas-delete" aria-label="Remove postage" @pointerdown.stop @click.stop="studio.deleteSelection()">×</button>
    </div>
    <button v-else-if="surface === 'envelope' && interactive" type="button" class="postage-placeholder" @click="studio.dialog.value = 'postage'">Postage</button>
    <div v-else-if="surface === 'envelope'" class="postage-placeholder static">Postage</div>
  </div>
</template>
