<script setup>
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import LcIcon from './LcIcon.vue'
import { sourceLocation } from './file-language.mjs'
import { browserLocale, isMac, keys, t } from './i18n.mjs'

const props = defineProps({
  endpoint: { type: String, required: true },
  project: { type: String, required: true },
  projectLabel: { type: String, default: '' },
  active: Boolean,
  audience: Boolean,
  resolveLocation: { type: Function, default: null },
})
const emit = defineEmits(['reveal'])

const palettes = {
  light: {
    black: '#1b1f27', red: '#c22d29', green: '#1d7f46', yellow: '#8a5a00',
    blue: '#2a62d6', magenta: '#a03ab4', cyan: '#0b7684', white: '#626a7c',
    brightBlack: '#4a5263', brightRed: '#d23434', brightGreen: '#23964f', brightYellow: '#a35f00',
    brightBlue: '#3a74e8', brightMagenta: '#b24cc6', brightCyan: '#13899a', brightWhite: '#1b1f27',
  },
  dark: {
    black: '#3b4049', red: '#f2716c', green: '#5cc98b', yellow: '#e2a645',
    blue: '#7ea6f6', magenta: '#d08ae8', cyan: '#5fc4d0', white: '#b0b6c2',
    brightBlack: '#8f96a3', brightRed: '#ff8f8a', brightGreen: '#7ee0a6', brightYellow: '#f2c26b',
    brightBlue: '#9dbcff', brightMagenta: '#e3a6f5', brightCyan: '#82dbe5', brightWhite: '#e5e8ed',
  },
}

const searchColors = {
  light: { matchBackground: '#f5dfa6', activeMatchBackground: '#e9b44c', matchOverviewRuler: '#d9a032', activeMatchColorOverviewRuler: '#b87800' },
  dark: { matchBackground: '#5a4a24', activeMatchBackground: '#8f6d1f', matchOverviewRuler: '#c9952c', activeMatchColorOverviewRuler: '#f2c26b' },
}

const host = ref()
const state = ref('connecting')
const searchOpen = ref(false)
const searchInput = ref()
const search = reactive({ term: '', caseSensitive: false, regex: false, index: -1, count: 0 })
let terminal
let fit
let finder
let source
let resizeObserver
let themeObserver
let resizeTimer
let pending = ''
let sending = false
let restarting = false
let remote = null

function post(project, action) {
  return fetch(props.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Live-Code-Locale': browserLocale },
    body: JSON.stringify({ ...action, project }),
  }).then(response => response.ok, () => false)
}

function theme() {
  const style = getComputedStyle(host.value)
  const value = name => style.getPropertyValue(name).trim()
  const dark = document.documentElement.classList.contains('dark')
  return {
    ...palettes[dark ? 'dark' : 'light'],
    background: value(props.audience ? '--lc-chrome' : '--lc-bg'),
    foreground: value('--lc-text'),
    cursor: value('--lc-accent'),
    cursorAccent: value(props.audience ? '--lc-chrome' : '--lc-bg'),
    selectionBackground: value('--lc-selection'),
  }
}

function measure() {
  if (!terminal || !host.value?.offsetWidth || !host.value.offsetHeight) return false
  if (props.audience) {
    mirrorSize()
    return false
  }
  fit.fit()
  return true
}

function mirrorSize(size) {
  if (size?.cols && size?.rows) remote = { cols: size.cols, rows: size.rows }
  if (!remote || !host.value?.offsetWidth) return
  for (let pass = 0; pass < 2; pass += 1) {
    const proposed = fit.proposeDimensions()
    if (!proposed) return
    const scale = Math.min(proposed.cols / remote.cols, proposed.rows / remote.rows)
    const fontSize = Math.max(8, Math.min(28, Math.floor(terminal.options.fontSize * scale * 2) / 2))
    if (fontSize === terminal.options.fontSize) break
    terminal.options.fontSize = fontSize
  }
  if (terminal.cols !== remote.cols || terminal.rows !== remote.rows) terminal.resize(remote.cols, remote.rows)
}

function start(project) {
  measure()
  state.value = 'connecting'
  return post(project, { type: 'terminal-start', cols: terminal.cols, rows: terminal.rows })
}

async function flushInput() {
  if (sending || !pending) return
  sending = true
  const data = pending
  pending = ''
  await post(props.project, { type: 'terminal-input', data })
  sending = false
  flushInput()
}

function receive(project, event) {
  const message = JSON.parse(event.data)
  if (message.type === 'none') {
    if (!props.audience && state.value !== 'exited') start(project)
  }
  else if (message.type === 'replay') {
    terminal.reset()
    if (props.audience) mirrorSize(message)
    terminal.write(message.data)
    state.value = 'running'
    if (measure()) post(project, { type: 'terminal-resize', cols: terminal.cols, rows: terminal.rows })
  }
  else if (message.type === 'start') {
    terminal.reset()
    if (props.audience) mirrorSize(message)
    state.value = 'running'
  }
  else if (message.type === 'resize') {
    if (props.audience) mirrorSize(message)
  }
  else if (message.type === 'output') {
    state.value = 'running'
    terminal.write(message.data)
  }
  else if (message.type === 'exit') {
    if (restarting) {
      restarting = false
      start(project)
      return
    }
    state.value = 'exited'
    const key = props.audience ? 'terminal.exitedAudience' : 'terminal.exited'
    terminal.write(`\r\n\x1B[2m${t(key, { code: message.code ?? '?' })}\x1B[0m\r\n`)
  }
}

function connect() {
  source?.close()
  pending = ''
  restarting = false
  state.value = 'connecting'
  terminal.reset()
  const project = props.project
  source = new EventSource(`${props.endpoint}/terminal?project=${encodeURIComponent(project)}`)
  source.onmessage = event => receive(project, event)
}

function restart() {
  if (state.value === 'running') {
    restarting = true
    post(props.project, { type: 'terminal-kill' })
  }
  else start(props.project)
  terminal.focus()
}

function kill() {
  post(props.project, { type: 'terminal-kill' })
  terminal.focus()
}

function clear() {
  terminal.clear()
  terminal.focus()
}

function focus() {
  terminal?.focus()
}

function isDark() {
  return document.documentElement.classList.contains('dark')
}

function find(backwards = false, incremental = false) {
  if (!finder) return
  if (!search.term) {
    finder.clearDecorations()
    search.index = -1
    search.count = 0
    return
  }
  const options = {
    caseSensitive: search.caseSensitive,
    regex: search.regex,
    incremental,
    decorations: searchColors[isDark() ? 'dark' : 'light'],
  }
  try {
    if (backwards) finder.findPrevious(search.term, options)
    else finder.findNext(search.term, options)
  }
  catch {
    search.index = -1
    search.count = 0
  }
}

async function openSearch() {
  if (props.audience) return
  searchOpen.value = true
  const selection = terminal.getSelection()
  if (selection && !selection.includes('\n')) search.term = selection
  await nextTick()
  searchInput.value?.select()
  if (search.term) find(false, true)
}

function closeSearch() {
  searchOpen.value = false
  finder?.clearDecorations()
  search.index = -1
  search.count = 0
  terminal.focus()
}

function toggleSearchOption(name) {
  search[name] = !search[name]
  find(false, true)
  searchInput.value?.focus()
}

function isSearchKey(event) {
  if (event.key.toLowerCase() !== 'f' || event.altKey) return false
  return isMac ? event.metaKey && !event.ctrlKey && !event.shiftKey : event.ctrlKey && event.shiftKey && !event.metaKey
}

function lineCells(y) {
  const line = terminal.buffer.active.getLine(y - 1)
  if (!line) return null
  let text = ''
  const columns = []
  for (let x = 0; x < line.length; x += 1) {
    const cell = line.getCell(x)
    if (!cell || cell.getWidth() === 0) continue
    const chars = cell.getChars() || ' '
    text += chars
    for (let index = 0; index < chars.length; index += 1) columns.push(x)
  }
  return { text, columns }
}

function provideLinks(y, callback) {
  const line = props.resolveLocation ? lineCells(y) : null
  if (!line) return callback(undefined)
  const links = []
  for (const match of line.text.matchAll(sourceLocation)) {
    const file = props.resolveLocation(match[1])
    if (!file) continue
    const label = t('output.openLocation', { location: match[0] })
    links.push({
      range: {
        start: { x: line.columns[match.index] + 1, y },
        end: { x: line.columns[match.index + match[0].length - 1] + 1, y },
      },
      text: match[0],
      decorations: { pointerCursor: true, underline: true },
      activate: () => emit('reveal', { file, line: Number(match[2]) }),
      hover: () => { host.value.title = label },
      leave: () => { host.value.title = '' },
    })
  }
  callback(links.length ? links : undefined)
}

onMounted(() => {
  const style = getComputedStyle(host.value)
  terminal = new Terminal({
    fontFamily: style.getPropertyValue('--lc-terminal-font').trim().replace(/\s+/g, ' ') || 'monospace',
    fontSize: 13,
    lineHeight: 1.25,
    cursorBlink: !props.audience,
    disableStdin: props.audience,
    scrollback: 5000,
    allowProposedApi: false,
    macOptionIsMeta: true,
    theme: theme(),
  })
  fit = new FitAddon()
  terminal.loadAddon(fit)
  if (!props.audience) {
    finder = new SearchAddon()
    terminal.loadAddon(finder)
    finder.onDidChangeResults(({ resultIndex, resultCount }) => {
      search.index = resultIndex
      search.count = resultCount
    })
    terminal.loadAddon(new WebLinksAddon((event, uri) => {
      if (event.button === 0) window.open(uri, '_blank', 'noopener')
    }))
    terminal.registerLinkProvider({ provideLinks })
    terminal.attachCustomKeyEventHandler(event => {
      if (event.type !== 'keydown' || !isSearchKey(event)) return true
      event.preventDefault()
      openSearch()
      return false
    })
  }
  terminal.open(host.value)
  terminal.onData(data => {
    if (props.audience) return
    if (state.value === 'exited') {
      if (data === '\r') start(props.project)
      return
    }
    if (state.value !== 'running') return
    pending += data
    flushInput()
  })
  terminal.onResize(({ cols, rows }) => {
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => {
      if (!props.audience && state.value === 'running') post(props.project, { type: 'terminal-resize', cols, rows })
    }, 120)
  })
  resizeObserver = new ResizeObserver(() => measure())
  resizeObserver.observe(host.value)
  themeObserver = new MutationObserver(() => {
    terminal.options.theme = theme()
    if (searchOpen.value && search.term) find(false, true)
  })
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  connect()
  if (props.active && !props.audience) nextTick(focus)
})

watch(() => props.project, () => {
  if (terminal) connect()
})

watch(() => props.active, async active => {
  if (!active || props.audience) return
  await nextTick()
  measure()
  focus()
})

onBeforeUnmount(() => {
  clearTimeout(resizeTimer)
  source?.close()
  resizeObserver?.disconnect()
  themeObserver?.disconnect()
  terminal?.dispose()
})

defineExpose({ focus, openSearch })
</script>

<template>
  <section class="lc-terminal" :class="{ 'is-audience': audience }" :aria-label="t('terminal.label', { project: projectLabel })">
    <header class="lc-terminal-header">
      <slot name="title">
        <h2 class="lc-terminal-title">
          <LcIcon v-if="!audience" name="terminal" />
          {{ t('terminal.title') }}
        </h2>
      </slot>
      <span v-if="!audience" class="lc-terminal-project" :title="t('terminal.workspace')">
        <LcIcon name="folder" />
        {{ projectLabel }}
      </span>
      <span v-if="state === 'connecting'" class="lc-terminal-meta" role="status">{{ t('terminal.connecting') }}</span>
      <div v-if="!audience" class="lc-terminal-actions">
        <button
          type="button"
          class="lc-icon-btn"
          :aria-pressed="searchOpen"
          :title="`${t('terminal.search')} (${keys.terminalSearch})`"
          :aria-label="t('terminal.search')"
          @click="searchOpen ? closeSearch() : openSearch()"
        >
          <LcIcon name="search" />
        </button>
        <button type="button" class="lc-icon-btn" :title="t('terminal.clear')" :aria-label="t('terminal.clear')" @click="clear">
          <LcIcon name="clear-all" />
        </button>
        <button type="button" class="lc-icon-btn" :title="t('terminal.restart')" :aria-label="t('terminal.restart')" @click="restart">
          <LcIcon name="debug-restart" />
        </button>
        <button
          type="button"
          class="lc-icon-btn"
          :disabled="state !== 'running'"
          :title="t('terminal.kill')"
          :aria-label="t('terminal.kill')"
          @click="kill"
        >
          <LcIcon name="trash" />
        </button>
      </div>
    </header>
    <div class="lc-terminal-stage">
      <form v-if="searchOpen" class="lc-terminal-search" role="search" @submit.prevent="find(false)">
        <input
          ref="searchInput"
          v-model="search.term"
          type="text"
          :placeholder="t('terminal.searchPlaceholder')"
          :aria-label="t('terminal.search')"
          autocomplete="off"
          spellcheck="false"
          @input="find(false, true)"
          @keydown.stop
          @keydown.enter.exact.prevent="find(false)"
          @keydown.shift.enter.prevent="find(true)"
          @keydown.esc.prevent="closeSearch"
        >
        <button
          type="button"
          class="lc-icon-btn lc-terminal-search-option"
          :aria-pressed="search.caseSensitive"
          :title="t('terminal.searchCase')"
          :aria-label="t('terminal.searchCase')"
          @click="toggleSearchOption('caseSensitive')"
        >
          <LcIcon name="case-sensitive" />
        </button>
        <button
          type="button"
          class="lc-icon-btn lc-terminal-search-option"
          :aria-pressed="search.regex"
          :title="t('terminal.searchRegex')"
          :aria-label="t('terminal.searchRegex')"
          @click="toggleSearchOption('regex')"
        >
          <LcIcon name="regex" />
        </button>
        <span class="lc-terminal-search-count" role="status">
          <template v-if="search.term && search.count > 0">{{ t('terminal.searchCount', { index: search.index + 1, count: search.count }) }}</template>
          <template v-else-if="search.term">{{ t('terminal.searchNone') }}</template>
        </span>
        <button type="button" class="lc-icon-btn" :disabled="!search.count" :title="t('terminal.searchPrevious')" :aria-label="t('terminal.searchPrevious')" @click="find(true)">
          <LcIcon name="arrow-up" />
        </button>
        <button type="button" class="lc-icon-btn" :disabled="!search.count" :title="t('terminal.searchNext')" :aria-label="t('terminal.searchNext')" @click="find(false)">
          <LcIcon name="arrow-down" />
        </button>
        <button type="button" class="lc-icon-btn" :title="t('terminal.searchClose')" :aria-label="t('terminal.searchClose')" @click="closeSearch">
          <LcIcon name="close" />
        </button>
      </form>
      <div ref="host" class="lc-terminal-body" />
    </div>
  </section>
</template>

<style scoped>
.lc-terminal {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  height: 100%;
  background: var(--lc-bg);
}

.lc-terminal-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
  height: 36px;
  padding: 0 6px 0 12px;
  border-bottom: 1px solid var(--lc-border);
}

.lc-terminal-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--lc-text);
}

.lc-terminal-title .lc-icon { color: var(--lc-text-3); }

.lc-terminal-project {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  overflow: hidden;
  color: var(--lc-text-3);
  font-size: 12px;
  white-space: nowrap;
  text-overflow: ellipsis;
  cursor: help;
}

.lc-terminal-meta {
  color: var(--lc-text-3);
  font-size: 12px;
  white-space: nowrap;
}

.lc-terminal-actions {
  display: flex;
  flex: none;
  gap: 2px;
  margin-left: auto;
}

.lc-terminal.is-audience { background: var(--lc-chrome); }

@container lc-panel (max-width: 400px) {
  .lc-terminal-project { display: none; }
}

.lc-terminal-stage {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.lc-terminal-search {
  position: absolute;
  top: 6px;
  right: 14px;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 2px;
  max-width: calc(100% - 28px);
  padding: 3px 4px 3px 8px;
  border: 1px solid var(--lc-border-strong);
  border-radius: var(--lc-radius);
  background: var(--lc-chrome);
  box-shadow: 0 6px 18px rgb(0 0 0 / 14%);
}

.lc-terminal-search input {
  flex: 1 1 160px;
  min-width: 60px;
  height: 24px;
  border: 0;
  outline: none;
  background: none;
  color: var(--lc-text);
  font: 12px var(--lc-mono);
}

.lc-terminal-search input::placeholder { color: var(--lc-text-3); font-family: var(--lc-font); }

.lc-terminal-search-option[aria-pressed="true"] {
  background: var(--lc-accent-soft);
  color: var(--lc-accent);
}

.lc-terminal-search-count {
  min-width: 4.5em;
  padding: 0 4px;
  color: var(--lc-text-3);
  font-size: 11px;
  white-space: nowrap;
  text-align: center;
}

.lc-terminal-actions .lc-icon-btn[aria-pressed="true"] { color: var(--lc-accent); }

@container lc-panel (max-width: 360px) {
  .lc-terminal-search-option, .lc-terminal-search-count { display: none; }
}

.lc-terminal-body {
  flex: 1;
  min-height: 0;
  padding: 6px 4px 4px 12px;
  overflow: hidden;
}

.lc-terminal-body :deep(.xterm) { height: 100%; }
.lc-terminal-body :deep(.xterm-viewport) { background: transparent !important; }
.lc-terminal-body :deep(.xterm-viewport)::-webkit-scrollbar { width: 10px; }
.lc-terminal-body :deep(.xterm-viewport)::-webkit-scrollbar-thumb {
  border: 3px solid transparent;
  border-radius: 999px;
  background: var(--lc-border-strong) padding-box;
}
</style>
