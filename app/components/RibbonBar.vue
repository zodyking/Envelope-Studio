<script setup lang="ts">
import { computed, ref } from 'vue'
import { ENVELOPE_SIZES, FONT_SIZES, FONTS } from '~/lib/constants'
import { FLAP_STYLES, flapPath } from '~/lib/flaps'
import { useStudio } from '~/composables/useStudio'

const studio = useStudio()
const { doc, ribbon, ribbonCollapsed, fontState, rulers, paneOpen } = studio
const imageInput = ref<HTMLInputElement | null>(null)

const shape = computed(() => {
  const id = studio.selection.value
  if (!id) return null
  for (const surface of Object.values(doc.value.surfaces)) {
    const item = surface.items.find(entry => entry.id === id)
    if (item && (item.type === 'rect' || item.type === 'line')) return item
  }
  return null
})

function show(name: string) {
  if (ribbon.value === name && !ribbonCollapsed.value && !studio.backstage.value) {
    ribbonCollapsed.value = true
    return
  }
  ribbonCollapsed.value = false
  ribbon.value = name
  studio.backstage.value = null
}

async function onImage(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) await studio.addImage(file)
}
</script>

<template>
  <div class="ribbon-host">
    <div class="ribbon-tabs" role="tablist" aria-label="Ribbon">
      <button type="button" class="file-tab" :class="{ 'is-open': studio.backstage.value }" @click="studio.backstage.value = studio.backstage.value ? null : 'info'">File</button>
      <button v-for="tab in [['home', 'Home'], ['insert', 'Insert'], ['design', 'Design'], ['layout', 'Layout'], ['mailings', 'Mailings'], ['view', 'View'], ['help', 'Help']]" :key="tab[0]" type="button" class="ribbon-tab" :class="{ active: ribbon === tab[0] && !studio.backstage.value }" role="tab" :aria-selected="ribbon === tab[0]" @click="show(tab[0])">{{ tab[1] }}</button>
      <button type="button" class="ribbon-collapse" :aria-label="ribbonCollapsed ? 'Expand the Ribbon' : 'Collapse the Ribbon'" @click="ribbonCollapsed = !ribbonCollapsed"><svg class="icon" aria-hidden="true"><use href="#i-chevron" /></svg></button>
    </div>
    <div class="ribbon">
      <div v-show="ribbon === 'home'" class="ribbon-panel active">
        <div class="ribbon-group">
          <div class="ribbon-controls">
            <button type="button" class="rb-sm" title="Undo (Ctrl+Z)" :disabled="!studio.canUndo.value" @click="studio.undo()"><svg class="icon" aria-hidden="true"><use href="#i-undo" /></svg>Undo</button>
            <button type="button" class="rb-sm" title="Redo (Ctrl+Y)" :disabled="!studio.canRedo.value" @click="studio.redo()"><svg class="icon" aria-hidden="true"><use href="#i-redo" /></svg>Redo</button>
          </div>
          <div class="ribbon-caption">Clipboard</div>
        </div>
        <div v-if="fontState" class="ribbon-group">
          <div class="ribbon-controls">
            <div class="rb-col">
              <div class="rb-row">
                <select class="rb-select" aria-label="Font" :value="fontState.font" @change="studio.format('font', ($event.target as HTMLSelectElement).value)">
                  <option v-for="font in FONTS" :key="font" :value="font">{{ font }}</option>
                </select>
                <select class="rb-size" aria-label="Font size" :value="fontState.size" @change="studio.format('size', ($event.target as HTMLSelectElement).value)">
                  <option v-for="size in FONT_SIZES" :key="size" :value="size">{{ size }}</option>
                </select>
                <input class="rb-size" aria-label="Line spacing" type="number" min="1" max="2" step="0.05" :value="fontState.lineHeight" title="Line spacing" @change="studio.format('lineHeight', ($event.target as HTMLInputElement).value)">
              </div>
              <div class="rb-row">
                <button type="button" class="rb-toggle" :class="{ 'is-on': fontState.bold }" title="Bold" @mousedown.prevent @click="studio.format('bold')"><b>B</b></button>
                <button type="button" class="rb-toggle" :class="{ 'is-on': fontState.italic }" title="Italic" @mousedown.prevent @click="studio.format('italic')"><i>I</i></button>
                <button type="button" class="rb-toggle" :class="{ 'is-on': fontState.underline }" title="Underline" @mousedown.prevent @click="studio.format('underline')"><u>U</u></button>
                <label class="color-field" title="Font color">A<input type="color" :value="fontState.color" aria-label="Font color" @input="studio.format('color', ($event.target as HTMLInputElement).value)"></label>
                <button type="button" class="rb-toggle" :class="{ 'is-on': fontState.align === 'left' }" title="Align left" @mousedown.prevent @click="studio.format('align', 'left')">L</button>
                <button type="button" class="rb-toggle" :class="{ 'is-on': fontState.align === 'center' }" title="Align center" @mousedown.prevent @click="studio.format('align', 'center')">C</button>
                <button type="button" class="rb-toggle" :class="{ 'is-on': fontState.align === 'right' }" title="Align right" @mousedown.prevent @click="studio.format('align', 'right')">R</button>
                <button type="button" class="rb-toggle" :class="{ 'is-on': fontState.bullet }" title="Bullets" @mousedown.prevent @click="studio.format('bullet')">•</button>
                <button type="button" class="rb-toggle" :class="{ 'is-on': fontState.ordered }" title="Numbering" @mousedown.prevent @click="studio.format('number')">1.</button>
                <button type="button" class="rb-sm" @mousedown.prevent @click="studio.format('clear')">Clear</button>
              </div>
            </div>
          </div>
          <div class="ribbon-caption">Font</div>
        </div>
        <div v-else-if="shape" class="ribbon-group">
          <div class="ribbon-controls">
            <label class="color-field">Ink<input type="color" :value="shape.color || '#315b88'" aria-label="Shape color" @input="studio.setShape({ color: ($event.target as HTMLInputElement).value })"></label>
            <label class="mini-field">Stroke<input type="number" min="0.2" max="4" step="0.1" :value="shape.stroke || 0.7" aria-label="Stroke millimeters" @change="studio.setShape({ stroke: Number(($event.target as HTMLInputElement).value) })"></label>
            <label v-if="shape.type === 'rect'" class="rb-toggle"><input type="checkbox" :checked="shape.filled" @change="studio.setShape({ filled: ($event.target as HTMLInputElement).checked })">Fill</label>
          </div>
          <div class="ribbon-caption">Shape</div>
        </div>
        <div v-else class="ribbon-group">
          <div class="ribbon-controls"><p class="ribbon-hint">Select a text box to format it. Double-click text on the page to edit.</p></div>
          <div class="ribbon-caption">Font</div>
        </div>
        <div class="ribbon-group">
          <div class="ribbon-controls rb-col">
            <button type="button" class="rb-sm" @click="studio.beginEdit('recipient')">Edit recipient</button>
            <button type="button" class="rb-sm" @click="studio.beginEdit('sender')">Edit return address</button>
          </div>
          <div class="ribbon-caption">Editing</div>
        </div>
      </div>

      <div v-show="ribbon === 'insert'" class="ribbon-panel active">
        <div class="ribbon-group">
          <div class="ribbon-controls">
            <button type="button" class="rb-lg" @click="studio.addText()"><svg class="icon lg" aria-hidden="true"><use href="#i-text" /></svg><span>Text Box</span></button>
            <button type="button" class="rb-lg" @click="studio.addLetter()"><svg class="icon lg" aria-hidden="true"><use href="#i-letter" /></svg><span>Letter</span></button>
          </div>
          <div class="ribbon-caption">Text</div>
        </div>
        <div class="ribbon-group">
          <div class="ribbon-controls">
            <button type="button" class="rb-lg" @click="studio.addShape('rect')"><svg class="icon lg" aria-hidden="true"><use href="#i-shape" /></svg><span>Rectangle</span></button>
            <button type="button" class="rb-lg" @click="studio.addShape('line')"><svg class="icon lg" aria-hidden="true"><use href="#i-line" /></svg><span>Line</span></button>
            <button type="button" class="rb-lg" @click="imageInput?.click()"><svg class="icon lg" aria-hidden="true"><use href="#i-image" /></svg><span>Pictures</span></button>
            <input ref="imageInput" class="sr-only" type="file" accept="image/png,image/jpeg" @change="onImage">
          </div>
          <div class="ribbon-caption">Illustrations</div>
        </div>
      </div>

      <div v-show="ribbon === 'design'" class="ribbon-panel active">
        <div class="ribbon-group">
          <div class="ribbon-controls gallery" role="group" aria-label="Envelope style">
            <button type="button" class="gallery-item" :class="{ active: doc.style === 'plain' }" @click="studio.setStyle('plain')"><span>Regular</span></button>
            <button type="button" class="gallery-item" :class="{ active: doc.style === 'single' }" @click="studio.setStyle('single')"><span>One window</span></button>
            <button type="button" class="gallery-item" :class="{ active: doc.style === 'double' }" @click="studio.setStyle('double')"><span>Two windows</span></button>
          </div>
          <div class="ribbon-caption">Envelope</div>
        </div>
        <div class="ribbon-group">
          <div class="ribbon-controls">
            <button type="button" class="rb-sm" @click="studio.applyPreset('line')">Accent line</button>
            <button type="button" class="rb-sm" @click="studio.applyPreset('corner')">Corner</button>
            <button type="button" class="rb-sm" @click="studio.applyPreset('frame')">Border</button>
            <button type="button" class="rb-sm" @click="studio.applyPreset('clear')">Clear lines</button>
          </div>
          <div class="ribbon-caption">Artwork</div>
        </div>
        <div class="ribbon-group">
          <div class="ribbon-controls">
            <label class="bg-field">Page color<input type="color" :value="doc.surfaces[doc.view].bg" aria-label="Page color" @input="studio.setBg(($event.target as HTMLInputElement).value)"></label>
          </div>
          <div class="ribbon-caption">Page background</div>
        </div>
      </div>

      <div v-show="ribbon === 'layout'" class="ribbon-panel active">
        <div class="ribbon-group">
          <div class="ribbon-controls">
            <div class="rb-col">
              <select class="rb-select" aria-label="Envelope size" :value="doc.sizeId" @change="studio.setSize(($event.target as HTMLSelectElement).value)">
                <option v-for="size in ENVELOPE_SIZES" :key="size.id" :value="size.id">{{ size.name }} · {{ (size.w / 25.4).toFixed(2) }} × {{ (size.h / 25.4).toFixed(2) }} in</option>
              </select>
              <div v-if="doc.sizeId === 'custom'" class="rb-row">
                <label class="mini-field">W<input :value="doc.w" type="number" min="60" max="500" step="0.1" aria-label="Width millimeters" @change="studio.setCustom('w', Number(($event.target as HTMLInputElement).value))"></label>
                <label class="mini-field">H<input :value="doc.h" type="number" min="60" max="500" step="0.1" aria-label="Height millimeters" @change="studio.setCustom('h', Number(($event.target as HTMLInputElement).value))"></label>
              </div>
            </div>
            <button type="button" class="rb-sm" @click="studio.dialog.value = 'setup'">Page Setup</button>
          </div>
          <div class="ribbon-caption">Page setup</div>
        </div>
        <div class="ribbon-group">
          <div class="ribbon-controls gallery" role="group" aria-label="Back flap style">
            <button v-for="flap in FLAP_STYLES" :key="flap.id" type="button" class="gallery-item flap-item" :class="{ active: (doc.flap || 'commercial') === flap.id }" :aria-pressed="(doc.flap || 'commercial') === flap.id" @click="studio.setFlap(flap.id)">
              <svg class="flap-thumb" viewBox="0 0 48 22" aria-hidden="true">
                <path :d="flapPath(48, 22, flap.id)" />
              </svg>
              <span>{{ flap.name }}</span>
            </button>
          </div>
          <div class="ribbon-caption">Back flap</div>
        </div>
        <div v-if="doc.style !== 'plain'" class="ribbon-group">
          <div class="ribbon-controls">
            <div>
              <div class="fold-title">Fold guides</div>
              <div class="fold-radio" role="radiogroup" aria-label="Fold guides">
                <label><input type="radio" name="foldMode" value="front" :checked="doc.foldGuides === 'front'" @change="studio.setFold('front')">Front</label>
                <label><input type="radio" name="foldMode" value="back" :checked="doc.foldGuides === 'back'" @change="studio.setFold('back')">Back</label>
                <label><input type="radio" name="foldMode" value="none" :checked="doc.foldGuides === 'none'" @change="studio.setFold('none')">Off</label>
              </div>
            </div>
          </div>
          <div class="ribbon-caption">Letter fold</div>
        </div>
      </div>

      <div v-show="ribbon === 'mailings'" class="ribbon-panel active">
        <div class="ribbon-group">
          <div class="ribbon-controls">
            <button type="button" class="rb-lg" @click="studio.dialog.value = 'postage'"><svg class="icon lg" aria-hidden="true"><use href="#i-stamp" /></svg><span>Postage</span></button>
          </div>
          <div class="ribbon-caption">Create</div>
        </div>
        <div class="ribbon-group">
          <div class="ribbon-controls">
            <button type="button" class="rb-lg" @click="studio.dialog.value = 'batch'"><svg class="icon lg" aria-hidden="true"><use href="#i-people" /></svg><span>Recipients</span></button>
            <button type="button" class="rb-sm" @click="studio.clearBatch()">Clear list</button>
          </div>
          <div class="ribbon-caption">Mail merge</div>
        </div>
        <div class="ribbon-group">
          <div class="ribbon-controls">
            <button type="button" class="rb-lg" @click="studio.printCurrent(false)"><svg class="icon lg" aria-hidden="true"><use href="#i-print" /></svg><span>Print</span></button>
          </div>
          <div class="ribbon-caption">Finish</div>
        </div>
      </div>

      <div v-show="ribbon === 'view'" class="ribbon-panel active">
        <div class="ribbon-group">
          <div class="ribbon-controls">
            <button type="button" class="view-btn" :class="{ active: doc.view === 'envelope' }" @click="studio.setView('envelope')">Front</button>
            <button type="button" class="view-btn" :class="{ active: doc.view === 'back' }" @click="studio.setView('back')">Back</button>
            <button type="button" class="view-btn" :class="{ active: doc.view === 'letter' }" :disabled="doc.style === 'plain'" @click="studio.setView('letter')">Letter</button>
            <button type="button" class="view-btn" :class="{ active: doc.view === 'letterBack' }" :disabled="doc.style === 'plain'" @click="studio.setView('letterBack')">Letter back</button>
          </div>
          <div class="ribbon-caption">Views</div>
        </div>
        <div class="ribbon-group">
          <div class="ribbon-controls">
            <button type="button" class="rb-sm" :class="{ 'is-on': rulers }" @click="rulers = !rulers">Ruler</button>
            <button type="button" class="rb-sm" :class="{ 'is-on': paneOpen }" @click="paneOpen = !paneOpen">Layers</button>
          </div>
          <div class="ribbon-caption">Show</div>
        </div>
        <div class="ribbon-group">
          <div class="ribbon-controls"><button type="button" class="rb-sm" @click="studio.zoom.value = null">Fit page</button></div>
          <div class="ribbon-caption">Zoom</div>
        </div>
      </div>

      <div v-show="ribbon === 'help'" class="ribbon-panel active">
        <div class="help-strip">
          <p><strong>Edit</strong>Double-click text on the page. The Home tab formats the selection, or the whole box if you are not typing.</p>
          <p><strong>Move</strong>Drag an object, or use the arrow keys. Shift+arrow nudges 0.25 mm. Drag the handles to resize.</p>
          <p><strong>Postage</strong>Mailings, Postage. Barcode keeps the code and the lines under it. Whole stamp joins the mark beside it. The page header is ignored.</p>
          <p><strong>Addresses</strong>The recipient and return address are one field. Edit them on the envelope or on the letter and both views stay in step.</p>
          <p><strong>Back flap</strong>On Layout, pick Commercial, Square, Pointed, or Contour. The outline is the seal flap only. It is not printed.</p>
          <p><strong>Print</strong>The preview shows each page, then the app sends it at actual size with no header or footer. Ctrl+S saves. Ctrl+Z undoes.</p>
        </div>
      </div>
    </div>
  </div>
</template>
