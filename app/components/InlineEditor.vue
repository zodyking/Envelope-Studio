<script setup lang="ts">
import { computed, onBeforeUnmount } from 'vue'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { createExtensions } from '~/lib/editor'
import { textCss } from '~/lib/text'
import { useStudio } from '~/composables/useStudio'
import type { TextStyle } from '~/lib/types'

const props = defineProps<{ itemId: string; html: string }>()
const studio = useStudio()

const boxStyle = computed(() => textCss(styleOf(props.itemId)))

function styleOf(id: string): TextStyle {
  const current = studio.doc.value
  if (id === 'recipient' || id === 'sender') return current[id].style
  for (const surface of Object.values(current.surfaces)) {
    const item = surface.items.find(entry => entry.id === id)
    if (item?.style) return item.style
  }
  return current.recipient.style
}

const editor = useEditor({
  content: props.html || '<p></p>',
  extensions: createExtensions(),
  editorProps: {
    attributes: {
      class: 'mail-editor',
      spellcheck: 'true',
      'aria-label': 'Text box',
    },
  },
  onCreate: ({ editor: instance }) => {
    studio.attachEditor(instance)
    instance.commands.focus('end')
  },
  onUpdate: ({ editor: instance }) => {
    studio.setHtml(props.itemId, instance.getHTML())
  },
  onSelectionUpdate: () => studio.touch(),
})

onBeforeUnmount(() => {
  if (studio.editingId.value === props.itemId) studio.attachEditor(null)
})

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    studio.endEdit()
  }
}
</script>

<template>
  <EditorContent :editor="editor" class="inline-editor" :style="boxStyle" @pointerdown.stop @keydown.stop="onKey" />
</template>
