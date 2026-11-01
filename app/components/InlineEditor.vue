<script setup lang="ts">
import { onBeforeUnmount } from 'vue'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { createExtensions } from '~/lib/editor'
import { useStudio } from '~/composables/useStudio'

const props = defineProps<{ itemId: string; html: string }>()
const studio = useStudio()

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
  <EditorContent :editor="editor" class="inline-editor" @pointerdown.stop @keydown.stop="onKey" />
</template>
