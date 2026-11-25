<script setup>
import * as monaco from 'monaco-editor/editor/editor.api.js'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { languageOfFile } from './file-language.mjs'
import { t } from './i18n.mjs'

const props = defineProps({
  file: { type: String, required: true },
  original: { type: String, required: true },
  code: { type: String, required: true },
  language: { type: String, default: null },
})
const emit = defineEmits(['close'])
const container = ref()
const split = ref(false)
let diffEditor
let originalModel
let currentModel
let resizeObserver
let themeObserver

function currentTheme() {
  return document.documentElement.classList.contains('dark') ? 'lc-dark' : 'lc-light'
}

function sideBySide() {
  split.value = (container.value?.offsetWidth ?? 0) >= 720
  return split.value
}

function setModels() {
  const language = languageOfFile(props.file, props.language).monaco
  const previous = [originalModel, currentModel]
  originalModel = monaco.editor.createModel(props.original, language)
  currentModel = monaco.editor.createModel(props.code, language)
  diffEditor.setModel({ original: originalModel, modified: currentModel })
  for (const model of previous) model?.dispose()
}

onMounted(() => {
  diffEditor = monaco.editor.createDiffEditor(container.value, {
    theme: currentTheme(),
    readOnly: true,
    originalEditable: false,
    automaticLayout: true,
    renderSideBySide: sideBySide(),
    useInlineViewWhenSpaceIsLimited: false,
    renderOverviewRuler: false,
    ignoreTrimWhitespace: false,
    fontSize: 14,
    lineHeight: 22,
    fontFamily: 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace',
    lineNumbersMinChars: 3,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    folding: false,
    glyphMargin: false,
    stickyScroll: { enabled: false },
    contextmenu: false,
    padding: { top: 8, bottom: 16 },
    scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10, useShadows: false },
    ariaLabel: t('diff.label', { file: props.file }),
  })
  setModels()
  resizeObserver = new ResizeObserver(() => diffEditor.updateOptions({ renderSideBySide: sideBySide() }))
  resizeObserver.observe(container.value)
  themeObserver = new MutationObserver(() => monaco.editor.setTheme(currentTheme()))
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  diffEditor.getModifiedEditor().focus()
})

watch(() => props.file, setModels)
watch(() => [props.original, props.code], ([original, code]) => {
  if (originalModel.getValue() !== original) originalModel.setValue(original)
  if (currentModel.getValue() !== code) currentModel.setValue(code)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  themeObserver?.disconnect()
  diffEditor?.dispose()
  originalModel?.dispose()
  currentModel?.dispose()
})
</script>

<template>
  <div class="lc-diff" @keydown.esc.stop="emit('close')">
    <div v-if="split" class="lc-diff-legend" aria-hidden="true">
      <span>{{ t('diff.original') }}</span>
      <span>{{ t('diff.current') }}</span>
    </div>
    <div ref="container" class="lc-diff-editor" />
  </div>
</template>

<style scoped>
.lc-diff {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.lc-diff-legend {
  display: grid;
  grid-template-columns: 1fr 1fr;
  flex: none;
  padding: 4px 12px;
  border-bottom: 1px solid var(--lc-border);
  color: var(--lc-text-3);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.lc-diff-editor {
  flex: 1;
  min-height: 0;
}
</style>
