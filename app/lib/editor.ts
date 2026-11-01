import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyleKit } from '@tiptap/extension-text-style'
import { Editor } from '@tiptap/vue-3'

export function createExtensions() {
  return [
    StarterKit.configure({
      heading: false,
      code: false,
      codeBlock: false,
      blockquote: false,
      horizontalRule: false,
      link: false,
    }),
    TextStyleKit.configure({
      backgroundColor: false,
      lineHeight: false,
    }),
    TextAlign.configure({
      types: ['paragraph', 'listItem'],
    }),
  ]
}

export function transformHtml(html: string, run: (editor: Editor) => void) {
  const host = document.createElement('div')
  const editor = new Editor({
    element: host,
    content: html || '<p></p>',
    extensions: createExtensions(),
  })
  run(editor)
  const next = editor.getHTML()
  editor.destroy()
  host.remove()
  return next
}
