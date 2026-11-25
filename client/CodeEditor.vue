<script setup>
import * as monaco from 'monaco-editor/editor/editor.api.js'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'
import 'monaco-editor/editor/contrib/find/browser/findController.js'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { enableCompletion, loadCompletion } from './completion.mjs'
import { createLanguageModel, prepareEditorLanguage } from './editor-languages.mjs'
import { languageOfFile } from './file-language.mjs'
import { lineChanges } from './line-diff.mjs'
import { t } from './i18n.mjs'

const props = defineProps({
  file: { type: String, required: true },
  code: { type: String, required: true },
  line: { type: Number, required: true },
  jump: { type: Number, default: 0 },
  sync: { type: Number, default: 0 },
  readonly: Boolean,
  focus: { type: Object, default: null },
  diagnostics: { type: Array, default: () => [] },
  zoom: { type: Number, default: 1 },
  original: { type: String, default: null },
  language: { type: String, default: null },
})
const emit = defineEmits(['edit', 'scroll', 'cursor', 'run', 'focus'])
const container = ref()
const models = new Map()
const views = new Map()
let editor
let currentFile
let replacing = false
let scrollTimer
let focusTimer
let flashTimer
let themeObserver
let focusDecorations
let flashDecorations
let problemDecorations
let diffDecorations
let diffTimer

const presenterFont = { fontSize: 14, lineHeight: 22 }

function defineThemes() {
  const shared = [
    { token: 'comment', fontStyle: 'italic' },
    { token: 'comment.doc', fontStyle: 'italic' },
  ]
  monaco.editor.defineTheme('lc-light', {
    base: 'vs',
    inherit: true,
    rules: [
      ...shared,
      { token: '', foreground: '1b1f27' },
      { token: 'keyword', foreground: '7c3aed' },
      { token: 'string', foreground: '0f7b45' },
      { token: 'comment', foreground: '667085' },
      { token: 'number', foreground: 'b45309' },
      { token: 'type', foreground: '0e7490' },
      { token: 'annotation', foreground: '9a5a00' },
      { token: 'delimiter', foreground: '4a5263' },
      { token: 'operator', foreground: '4a5263' },
    ],
    colors: {
      'editor.background': '#ffffff',
      'editor.foreground': '#1b1f27',
      'editorLineNumber.foreground': '#9aa1ae',
      'editorLineNumber.activeForeground': '#1b1f27',
      'editor.lineHighlightBackground': '#f4f6f9',
      'editor.lineHighlightBorder': '#00000000',
      'editor.selectionBackground': '#cfe0ff',
      'editor.inactiveSelectionBackground': '#e3ecfb',
      'editorCursor.foreground': '#2a62d6',
      'editorIndentGuide.background1': '#eceef2',
      'editorIndentGuide.activeBackground1': '#cdd2da',
      'editorWhitespace.foreground': '#d5d9e0',
      'editorError.foreground': '#c22d29',
      'editorWarning.foreground': '#a35f00',
      'scrollbarSlider.background': '#1b1f2724',
      'scrollbarSlider.hoverBackground': '#1b1f273d',
      'scrollbarSlider.activeBackground': '#1b1f2752',
      'editorWidget.background': '#ffffff',
      'editorWidget.border': '#cdd2da',
      'focusBorder': '#2a62d6',
    },
  })
  monaco.editor.defineTheme('lc-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      ...shared,
      { token: '', foreground: 'e5e8ed' },
      { token: 'keyword', foreground: 'c4a7ff' },
      { token: 'string', foreground: '86dfa9' },
      { token: 'comment', foreground: '8f96a3' },
      { token: 'number', foreground: 'f5b06b' },
      { token: 'type', foreground: '6fd3e3' },
      { token: 'annotation', foreground: 'e2c26b' },
      { token: 'delimiter', foreground: 'b0b6c2' },
      { token: 'operator', foreground: 'b0b6c2' },
    ],
    colors: {
      'editor.background': '#1b1d22',
      'editor.foreground': '#e5e8ed',
      'editorLineNumber.foreground': '#5d6470',
      'editorLineNumber.activeForeground': '#e5e8ed',
      'editor.lineHighlightBackground': '#22252b',
      'editor.lineHighlightBorder': '#00000000',
      'editor.selectionBackground': '#264a7d',
      'editor.inactiveSelectionBackground': '#22385c',
      'editorCursor.foreground': '#7ea6f6',
      'editorIndentGuide.background1': '#262a31',
      'editorIndentGuide.activeBackground1': '#3b4049',
      'editorError.foreground': '#f2716c',
      'editorWarning.foreground': '#e2a645',
      'scrollbarSlider.background': '#ffffff1f',
      'scrollbarSlider.hoverBackground': '#ffffff33',
      'scrollbarSlider.activeBackground': '#ffffff47',
      'editorWidget.background': '#1f2228',
      'editorWidget.border': '#3b4049',
      'focusBorder': '#7ea6f6',
    },
  })
}

function currentTheme() {
  return document.documentElement.classList.contains('dark') ? 'lc-dark' : 'lc-light'
}

function fontOptions() {
  if (!props.readonly) return presenterFont
  const fontSize = Math.round(20 * props.zoom)
  return { fontSize, lineHeight: Math.round(fontSize * 1.6) }
}

function editorLabel() {
  const { label, id } = languageOfFile(props.file, props.language)
  return id === 'plaintext' ? t('editor.labelAny') : t('editor.label', { language: label })
}

function fileModel() {
  const language = languageOfFile(props.file, props.language)
  if (!props.readonly) enableCompletion(language.id)
  if (!models.has(props.file)) models.set(props.file, createLanguageModel(props.code, language))
  return models.get(props.file)
}

function applyText(model, text) {
  const previous = model.getValue()
  if (previous === text) return null
  const limit = Math.min(previous.length, text.length)
  let start = 0
  while (start < limit && previous.charCodeAt(start) === text.charCodeAt(start)) start += 1
  let previousEnd = previous.length
  let nextEnd = text.length
  while (previousEnd > start && nextEnd > start && previous.charCodeAt(previousEnd - 1) === text.charCodeAt(nextEnd - 1)) {
    previousEnd -= 1
    nextEnd -= 1
  }
  const from = model.getPositionAt(start)
  const to = model.getPositionAt(previousEnd)
  const inserted = text.slice(start, nextEnd)
  model.pushEditOperations([], [{
    range: new monaco.Range(from.lineNumber, from.column, to.lineNumber, to.column),
    text: inserted,
  }], () => null)
  const lastLine = from.lineNumber + (inserted.match(/\n/g)?.length ?? 0)
  return [from.lineNumber, lastLine]
}

function flash(range) {
  if (!range || !props.readonly) return
  clearTimeout(flashTimer)
  flashDecorations.set([{
    range: new monaco.Range(range[0], 1, range[1], 1),
    options: { isWholeLine: true, className: 'lc-changed-line' },
  }])
  flashTimer = setTimeout(() => flashDecorations.clear(), 1700)
}

function renderFocus() {
  if (!props.readonly || !editor) return
  const focus = props.focus
  if (!focus) {
    focusDecorations.clear()
    return
  }
  const model = editor.getModel()
  const start = Math.min(focus.start, model.getLineCount())
  const end = Math.min(focus.end, model.getLineCount())
  focusDecorations.set([{
    range: new monaco.Range(start, 1, end, 1),
    options: {
      isWholeLine: true,
      className: end > start ? 'lc-focus-selection' : 'lc-focus-line',
      linesDecorationsClassName: 'lc-focus-gutter',
    },
  }])
}

function audienceScroll() {
  const model = editor.getModel()
  const count = model.getLineCount()
  let top = editor.getTopForLineNumber(Math.min(props.line, count))
  const focus = props.focus
  if (focus) {
    const height = editor.getLayoutInfo().height
    const lineHeight = editor.getOption(monaco.editor.EditorOption.lineHeight)
    const focusTop = editor.getTopForLineNumber(Math.min(focus.start, count))
    const focusBottom = editor.getTopForLineNumber(Math.min(focus.end, count)) + lineHeight
    if (focusTop < top || focusBottom > top + height) top = Math.max(0, (focusTop + focusBottom - height) / 2)
  }
  if (Math.abs(editor.getScrollTop() - top) > 1) editor.setScrollTop(top, monaco.editor.ScrollType.Immediate)
}

function renderProblems() {
  if (!editor) return
  for (const model of models.values()) monaco.editor.setModelMarkers(model, 'live-code', [])
  const model = editor.getModel()
  const items = props.diagnostics.filter(item => item.line <= model.getLineCount())
  monaco.editor.setModelMarkers(model, 'live-code', items.map(item => ({
    severity: item.severity === 'warning' ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Error,
    message: item.message,
    startLineNumber: item.line,
    startColumn: Math.min(item.column, model.getLineMaxColumn(item.line)),
    endLineNumber: item.line,
    endColumn: model.getLineMaxColumn(item.line),
  })))
  problemDecorations.set(items.map(item => {
    const kind = item.severity === 'warning' ? 'warning' : 'error'
    return {
      range: new monaco.Range(item.line, 1, item.line, model.getLineMaxColumn(item.line)),
      options: {
        isWholeLine: true,
        className: `lc-${kind}-line`,
        after: { content: item.message, inlineClassName: `lc-inline-${kind}` },
      },
    }
  }))
}

const diffClasses = {
  added: 'lc-diff-added',
  modified: 'lc-diff-modified',
  deleted: 'lc-diff-deleted',
}

function renderDiff() {
  if (!editor || props.readonly) return
  if (props.original === null) {
    diffDecorations.clear()
    return
  }
  const model = editor.getModel()
  const lastLine = model.getLineCount()
  const style = getComputedStyle(container.value)
  const colors = {
    added: style.getPropertyValue('--lc-success').trim(),
    modified: style.getPropertyValue('--lc-accent').trim(),
    deleted: style.getPropertyValue('--lc-danger').trim(),
  }
  diffDecorations.set(lineChanges(props.original, model.getValue()).map(change => ({
    range: new monaco.Range(Math.min(change.start, lastLine), 1, Math.min(change.end, lastLine), 1),
    options: {
      isWholeLine: true,
      linesDecorationsClassName: `${diffClasses[change.kind]}${change.kind === 'deleted' && !change.after ? ' is-top' : ''}`,
      overviewRuler: { color: colors[change.kind], position: monaco.editor.OverviewRulerLane.Left },
    },
  })))
}

function scheduleDiff() {
  clearTimeout(diffTimer)
  diffTimer = setTimeout(renderDiff, 120)
}

function sync(moveCursor = false) {
  if (!editor) return
  replacing = true
  const model = fileModel()
  const fileChanged = currentFile !== props.file
  if (fileChanged) {
    if (currentFile && !props.readonly) views.set(currentFile, editor.saveViewState())
    if (editor.getModel() !== model) editor.setModel(model)
    currentFile = props.file
  }
  const changed = applyText(model, props.code)
  if (!fileChanged) flash(changed)
  const line = Math.min(props.line, model.getLineCount())
  if (!props.readonly) {
    const rememberedView = views.get(props.file)
    if (moveCursor || (fileChanged && !rememberedView)) editor.setPosition({ lineNumber: line, column: 1 })
    else if (fileChanged) editor.restoreViewState(rememberedView)
  }
  if (!props.readonly && (moveCursor || fileChanged)) {
    editor.setScrollTop(Math.max(0, editor.getTopForLineNumber(line) - 8), monaco.editor.ScrollType.Immediate)
  }
  replacing = false
  if (fileChanged) renderProblems()
  scheduleDiff()
  if (props.readonly) {
    renderFocus()
    audienceScroll()
  }
  else emit('cursor', editor.getPosition())
}

function firstLine() {
  return editor.getVisibleRanges()[0]?.startLineNumber ?? 1
}

function emitFocus() {
  clearTimeout(focusTimer)
  focusTimer = setTimeout(() => {
    const selection = editor.getSelection()
    if (!selection) return
    let end = selection.endLineNumber
    if (end > selection.startLineNumber && selection.endColumn === 1) end -= 1
    emit('focus', { start: selection.startLineNumber, end })
  }, 110)
}

let unmounted = false

onMounted(async () => {
  await Promise.all([
    prepareEditorLanguage(languageOfFile(props.file, props.language).id),
    props.readonly ? null : loadCompletion(),
  ])
  if (unmounted) return
  globalThis.MonacoEnvironment ??= { getWorker: () => new EditorWorker() }
  defineThemes()
  editor = monaco.editor.create(container.value, {
    model: fileModel(),
    theme: currentTheme(),
    readOnly: props.readonly,
    domReadOnly: props.readonly,
    ariaLabel: editorLabel(),
    automaticLayout: true,
    ...fontOptions(),
    fontFamily: 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace',
    fontLigatures: false,
    lineNumbersMinChars: 3,
    lineDecorationsWidth: props.readonly ? 14 : 10,
    padding: { top: props.readonly ? 16 : 8, bottom: 16 },
    minimap: { enabled: false },
    renderLineHighlight: props.readonly ? 'none' : 'line',
    renderValidationDecorations: 'on',
    scrollBeyondLastLine: false,
    smoothScrolling: true,
    cursorBlinking: 'smooth',
    cursorSmoothCaretAnimation: 'on',
    roundedSelection: true,
    wordWrap: 'on',
    tabSize: 4,
    wrappingIndent: 'indent',
    folding: false,
    glyphMargin: false,
    scrollBeyondLastColumn: 0,
    overviewRulerLanes: props.readonly ? 0 : 2,
    overviewRulerBorder: false,
    hideCursorInOverviewRuler: true,
    guides: { indentation: true, highlightActiveIndentation: !props.readonly },
    stickyScroll: { enabled: false },
    occurrencesHighlight: props.readonly ? 'off' : 'singleFile',
    selectionHighlight: !props.readonly,
    matchBrackets: props.readonly ? 'never' : 'near',
    contextmenu: !props.readonly,
    fixedOverflowWidgets: true,
    scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10, useShadows: false },
    wordBasedSuggestions: 'off',
    quickSuggestions: props.readonly ? false : { other: 'on', comments: 'off', strings: 'off' },
    suggestOnTriggerCharacters: !props.readonly,
    suggest: { showStatusBar: false, preview: false, snippetsPreventQuickSuggestions: false },
  })
  focusDecorations = editor.createDecorationsCollection()
  flashDecorations = editor.createDecorationsCollection()
  problemDecorations = editor.createDecorationsCollection()
  diffDecorations = editor.createDecorationsCollection()
  themeObserver = new MutationObserver(() => monaco.editor.setTheme(currentTheme()))
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  sync(props.jump > 0)
  renderProblems()
  if (props.readonly) return

  editor.onDidChangeCursorPosition(({ position }) => emit('cursor', position))
  editor.onDidChangeCursorSelection(() => {
    if (!replacing) emitFocus()
  })
  editor.onDidChangeModelContent(() => {
    if (!replacing) emit('edit', editor.getValue(), firstLine())
    scheduleDiff()
  })
  editor.onDidScrollChange(({ scrollTopChanged, heightChanged, scrollHeightChanged }) => {
    if (replacing || !scrollTopChanged || heightChanged || scrollHeightChanged) return
    clearTimeout(scrollTimer)
    scrollTimer = setTimeout(() => emit('scroll', firstLine()), 80)
  })
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => emit('run'))
  editor.focus()
})

watch(() => [props.file, props.jump], ([file, jump], [previousFile, previousJump]) => {
  clearTimeout(scrollTimer)
  if (editor && file !== previousFile) editor.updateOptions({ ariaLabel: editorLabel() })
  sync(jump !== previousJump)
})
watch(() => props.sync, () => {
  if (!editor || props.readonly) return
  replacing = true
  applyText(editor.getModel(), props.code)
  replacing = false
  renderProblems()
  scheduleDiff()
})
watch(() => props.original, scheduleDiff)
watch(() => [props.code, props.line], () => {
  if (props.readonly) sync()
})
watch(() => props.focus, () => {
  if (!editor || !props.readonly) return
  renderFocus()
  audienceScroll()
}, { deep: true })
watch(() => props.diagnostics, renderProblems, { deep: true })
watch(() => props.zoom, () => {
  if (!editor || !props.readonly) return
  editor.updateOptions(fontOptions())
  audienceScroll()
})

defineExpose({ focus: () => editor?.focus() })

onBeforeUnmount(() => {
  unmounted = true
  clearTimeout(scrollTimer)
  clearTimeout(focusTimer)
  clearTimeout(flashTimer)
  clearTimeout(diffTimer)
  themeObserver?.disconnect()
  editor?.dispose()
  for (const model of models.values()) model.dispose()
})
</script>

<template>
  <div ref="container" class="code-editor" :class="{ 'is-readonly': readonly }" />
</template>

<style scoped>
.code-editor {
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.code-editor.is-readonly :deep(.cursors-layer) { display: none; }
</style>
