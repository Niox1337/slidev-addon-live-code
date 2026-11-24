<script setup>
import { useNav } from '@slidev/client'
import { lockShortcuts } from '@slidev/client/state/storage.ts'
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import LcIcon from './client/LcIcon.vue'
import { languageLabel, languageOfFile } from './client/file-language.mjs'
import { browserLocale, isMac, keys, locale, serverLocale, t } from './client/i18n.mjs'
import './client/theme.css'

const { isPresenter, isPlaying, isPrintMode, isEmbedded, currentSlideNo, queryClicks, go } = useNav()
const hot = import.meta.hot
const enabled = computed(() => Boolean(hot) && !isPrintMode.value && !isEmbedded.value && (isPresenter.value || isPlaying.value))
const lazy = loader => (import.meta.env.DEV ? defineAsyncComponent(loader) : null)
const CodeEditor = lazy(() => import('./client/CodeEditor.vue'))
const PresenterNotes = lazy(() => import('./client/PresenterNotes.vue'))
const FileExplorer = lazy(() => import('./client/FileExplorer.vue'))
const QuickOpen = lazy(() => import('./client/QuickOpen.vue'))
const OutputPanel = lazy(() => import('./client/OutputPanel.vue'))
const TerminalPanel = lazy(() => import('./client/TerminalPanel.vue'))
const PanelTabs = lazy(() => import('./client/PanelTabs.vue'))
const DiffView = lazy(() => import('./client/DiffView.vue'))
const ShortcutHelp = lazy(() => import('./client/ShortcutHelp.vue'))

const publicEndpoint = `${import.meta.env.BASE_URL}__slidev_live_code`
const storageKey = 'slidev-live-code:layout'
const languageKey = 'slidev-live-code:language'
const dockPresets = [38, 50, 62]
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

function readStored(key) {
  try {
    return localStorage.getItem(key)
  }
  catch {
    return null
  }
}

function readLayout() {
  try {
    return JSON.parse(localStorage.getItem(storageKey)) ?? {}
  }
  catch {
    return {}
  }
}

const saved = readLayout()
const layout = reactive({
  dockSize: clamp(Number(saved.dockSize) || 50, 30, 70),
  explorerOpen: saved.explorerOpen ?? true,
  panelOpen: saved.panelOpen ?? true,
  panelSize: clamp(Number(saved.panelSize) || 40, 18, 75),
  notesSize: clamp(Number(saved.notesSize) || 50, 25, 75),
  panelTab: saved.panelTab === 'terminal' ? 'terminal' : 'output',
})
const terminalMounted = ref(layout.panelTab === 'terminal')
const terminalPanel = ref()
const currentProjectLabel = computed(() => screen.value?.projects?.find(project => project.id === screen.value.project)?.label ?? '')
const savedTabs = Array.isArray(saved.tabs) ? saved.tabs : []

const screen = shallowRef()
const copyStatus = ref('')
let copyTimer
const error = ref('')
const deleteToast = shallowRef(null)
const pendingDeletes = ref(0)
const connectionLost = ref(false)
const noteDrafts = reactive(new Map())
const savingNotes = ref(false)
const tabs = ref([])
const recent = ref([])
const caret = ref()
const dockMounted = ref(false)
const dockOpen = ref(false)
const stackedDock = ref(false)
const dragging = ref('')
const dockFocused = ref(false)
const savedFlash = ref(false)
const diffOpen = ref(false)
let savedTimer
const quickOpen = ref()
const shortcutHelp = ref()
const tabStrip = ref()
const launcher = ref()
const launcherTarget = shallowRef()
const mainArea = ref()
const panelArea = ref()
let dockMedia
let followedSlide
let failures = 0
let polling = false
let queue = Promise.resolve()

const lang = computed(() => (locale.value === 'zh' ? 'zh-CN' : 'en'))
const busy = computed(() => ['compiling', 'running'].includes(screen.value?.phase))
const visible = computed(() => enabled.value && Boolean(screen.value?.visible))
const fileId = computed(() => screen.value && `${screen.value.project}/${screen.value.file}`)
const currentProject = computed(() => screen.value?.projects?.find(project => project.id === screen.value.project))
const deckLanguage = ref(readStored(languageKey))
const fileLanguage = computed(() => languageOfFile(screen.value?.file).label)
const labelKey = key => (deckLanguage.value ? t(key, { language: deckLanguage.value }) : t(`${key}Any`))
const isModified = computed(() => Boolean(currentProject.value?.modified?.includes(screen.value.file)))
const showDiff = computed(() => diffOpen.value && isModified.value && typeof screen.value?.original === 'string')
const modifiedIds = computed(() => new Set((screen.value?.projects ?? [])
  .flatMap(project => (project.modified ?? []).map(file => `${project.id}/${file}`))))
const fileDiagnostics = computed(() => (screen.value?.diagnostics ?? []).filter(item => item.file === screen.value.file))
const problemCounts = computed(() => {
  const items = screen.value?.diagnostics ?? []
  const warnings = items.filter(item => item.severity === 'warning').length
  return { errors: items.length - warnings, warnings }
})
const fileFocus = computed(() => (screen.value?.focus?.file === screen.value?.file ? screen.value.focus : null))
const pathParts = computed(() => screen.value?.file.split('/') ?? [])
const zoom = computed(() => screen.value?.zoom ?? 1)
const showAudienceTerminal = computed(() => screen.value?.panel === 'terminal')
const showAudienceOutput = computed(() => screen.value?.phase !== 'ready' || Boolean(screen.value?.output?.length))
const sharedPanel = computed(() => (layout.panelOpen && layout.panelTab === 'terminal' ? 'terminal' : 'output'))
const notesKey = computed(() => {
  const step = screen.value?.noteStep
  return step ? `steps/${step.id}` : screen.value?.project
})
const notesDraft = computed(() => noteDrafts.get(notesKey.value) ?? null)
const saveStatus = computed(() => {
  const state = screen.value?.autosave
  if (state?.error) return { tone: 'danger', icon: 'warning', label: t('status.saveFailed') }
  if (state?.pending) return { tone: 'pending', icon: 'circle-filled', label: t('status.pending') }
  if (state?.savedAt) {
    const time = new Date(state.savedAt).toLocaleTimeString(lang.value, { hour: '2-digit', minute: '2-digit' })
    return { tone: 'saved', icon: 'check', label: t('status.savedAt', { time }) }
  }
  return { tone: 'idle', icon: 'check', label: t('status.saved') }
})

function saveLayout() {
  try {
    localStorage.setItem(storageKey, JSON.stringify({
      ...layout,
      tabs: tabs.value.map(({ project, file }) => ({ project, file })),
    }))
  }
  catch {}
}

function update(data) {
  if (!screen.value || data.revision > screen.value.revision) screen.value = data
  if (data.locale) serverLocale.value = data.locale
  if (data.projects) rememberLanguage(data.projects)
}

function copyWithTextarea(code) {
  const focused = document.activeElement
  const textarea = document.createElement('textarea')
  textarea.value = code
  textarea.readOnly = true
  textarea.tabIndex = -1
  Object.assign(textarea.style, { position: 'fixed', inset: '0 auto auto 0', opacity: '0', fontSize: '16px' })
  document.body.append(textarea)
  try {
    textarea.select()
    textarea.setSelectionRange(0, textarea.value.length)
    return document.execCommand('copy')
  }
  catch {
    return false
  }
  finally {
    textarea.remove()
    focused?.focus?.({ preventScroll: true })
  }
}

async function copyAudienceFile() {
  if (!visible.value) return
  const file = fileId.value
  const code = screen.value.code
  let copied = true
  try {
    await navigator.clipboard.writeText(code)
  }
  catch {
    copied = copyWithTextarea(code)
  }
  if (!visible.value || file !== fileId.value) return
  clearTimeout(copyTimer)
  copyStatus.value = copied ? 'audience.copied' : 'audience.copyFailed'
  copyTimer = setTimeout(() => { copyStatus.value = '' }, 1500)
}

function downloadAudienceProject() {
  if (!visible.value) return
  const link = document.createElement('a')
  link.href = `${publicEndpoint}/download?${new URLSearchParams({ project: screen.value.project })}`
  link.download = ''
  link.hidden = true
  document.body.append(link)
  link.click()
  link.remove()
}

function rememberLanguage(projects) {
  const labels = new Set(projects.map(project => languageLabel(project.language)))
  const label = labels.size === 1 ? [...labels][0] : null
  if (label === deckLanguage.value) return
  deckLanguage.value = label
  try {
    if (label) localStorage.setItem(languageKey, label)
    else localStorage.removeItem(languageKey)
  }
  catch {}
}

async function request(action) {
  const endpoint = isPresenter.value ? `${publicEndpoint}/presenter` : publicEndpoint
  const headers = { 'X-Live-Code-Locale': browserLocale }
  const response = await fetch(endpoint, action
    ? { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(action) }
    : { headers })
  if (!response.headers.get('Content-Type')?.includes('application/json')) throw new Error(t('error.devServer'))
  const data = await response.json()
  if (!response.ok) throw new Error(data.error)
  update(data)
}

function send(type, values = {}, { silent = false } = {}) {
  queue = queue.then(async () => {
    try {
      await request({ type, ...values })
      if (!silent) error.value = ''
      return true
    }
    catch (problem) {
      if (!silent) error.value = problem.message || t('error.action')
      return false
    }
  })
  return queue
}

async function poll() {
  if (polling) return
  polling = true
  try {
    await request()
    failures = 0
    connectionLost.value = false
  }
  catch (problem) {
    failures += 1
    if (failures >= 3) connectionLost.value = true
    else if (!screen.value) error.value = problem.message
  }
  finally {
    polling = false
  }
}

function edit(code, line) {
  const { project, file } = screen.value
  send('edit', { project, file, code, line })
}

function scroll(line) {
  if (!dockOpen.value) return
  const { project, file } = screen.value
  send('scroll', { project, file, line }, { silent: true })
}

function shareFocus({ start, end }) {
  const { project, file } = screen.value
  send('focus', { project, file, start, end }, { silent: true })
}

function showOutput() {
  layout.panelOpen = true
  layout.panelTab = 'output'
}

function run() {
  if (busy.value || connectionLost.value) return
  showOutput()
  send('run')
}

function stop() {
  if (busy.value) send('stop')
}

function openFile(item) {
  if (`${item.project}/${item.file}` === fileId.value) return send('view', { visible: true })
  return send('select', { project: item.project, file: item.file })
}

function resolveLocation(name) {
  const files = currentProject.value?.files ?? []
  if (files.includes(name)) return name
  const matches = name.includes('/')
    ? files.filter(file => name.endsWith(`/${file}`))
    : files.filter(file => file.split('/').at(-1) === name)
  return matches.length === 1 ? matches[0] : null
}

function reveal({ file, line }) {
  send('reveal', { project: screen.value.project, file, line })
}

async function submitInput(line) {
  return send('input', { line })
}

async function closeTab(tab) {
  const index = tabs.value.indexOf(tab)
  if (index < 0 || tabs.value.length === 1) return
  if (tab.id === fileId.value) {
    const next = tabs.value[index + 1] ?? tabs.value[index - 1]
    if (!await send('select', { project: next.project, file: next.file, share: false })) return
  }
  tabs.value = tabs.value.filter(item => item.id !== tab.id)
}

function createEntry({ kind, project, path }) {
  return send(kind === 'folder' ? 'create-folder' : 'create-file', { project, path })
}

async function deleteEntry({ project, path, name }) {
  pendingDeletes.value += 1
  const deleted = await send('delete', { project, path })
  pendingDeletes.value -= 1
  if (deleted) deleteToast.value = { project, name }
}

function undoDelete() {
  if (!deleteToast.value || pendingDeletes.value) return
  const { project } = deleteToast.value
  deleteToast.value = null
  return send('undo-delete', { project })
}

async function renameEntry({ project, from, to }) {
  const before = tabs.value
  const moved = file => (file === from || file.startsWith(`${from}/`) ? `${to}${file.slice(from.length)}` : file)
  const label = screen.value.projects?.find(item => item.id === project)?.label ?? project
  tabs.value = tabs.value.map(tab => {
    if (tab.project !== project || moved(tab.file) === tab.file) return tab
    const file = moved(tab.file)
    return { ...tab, id: `${project}/${file}`, file, name: file.split('/').at(-1), title: `${label} / ${file}` }
  })
  if (!await send('rename', { project, from, to })) tabs.value = before
}

function addTab(project, file) {
  const id = `${project}/${file}`
  if (tabs.value.some(tab => tab.id === id)) return
  const label = screen.value.projects?.find(item => item.id === project)?.label ?? project
  tabs.value.push({ id, project, file, name: file.split('/').at(-1), title: `${label} / ${file}` })
}

function restoreTabs() {
  const projects = new Map((screen.value.projects ?? []).map(project => [project.id, project]))
  for (const { project, file } of savedTabs) {
    if (projects.get(project)?.files.includes(file)) addTab(project, file)
  }
}

async function saveNotes() {
  const { project, noteStep } = screen.value
  const key = notesKey.value
  const text = notesDraft.value
  savingNotes.value = true
  try {
    if (await send('save-notes', { project, text, step: noteStep?.id })) noteDrafts.delete(key)
  }
  finally {
    savingNotes.value = false
  }
}

let connectTimer
let connected = false

async function connect() {
  clearTimeout(connectTimer)
  try {
    await request()
  }
  catch (problem) {
    error.value = problem.message || t('error.devServer')
    connectTimer = setTimeout(connect, 2000)
    return false
  }
  error.value = ''
  if (isPresenter.value && !connected) {
    connected = true
    restoreTabs()
    if (visible.value) {
      dockMounted.value = true
      dockOpen.value = true
    }
  }
  return true
}

async function openDock() {
  if (!screen.value && !await connect()) return
  dockMounted.value = true
  dockOpen.value = true
  const slide = currentSlideNo.value
  send('view', { visible: true, slide: followedSlide === slide ? undefined : slide })
  followedSlide = slide
}

async function closeDock() {
  if (!await send('view', { visible: false })) return
  dockOpen.value = false
  await nextTick()
  launcher.value?.focus()
}

async function goToSlide(slide) {
  if (slide === currentSlideNo.value) await send('view', { visible: false })
  else await go(slide)
}

function setZoom(value) {
  send('zoom', { value })
}

function startDrag(event, name, onMove) {
  if (event.button !== 0) return
  const handle = event.currentTarget
  handle.setPointerCapture(event.pointerId)
  dragging.value = name
  const move = moveEvent => onMove(moveEvent)
  const end = () => {
    dragging.value = ''
    handle.removeEventListener('pointermove', move)
    handle.removeEventListener('pointerup', end)
    handle.removeEventListener('pointercancel', end)
  }
  handle.addEventListener('pointermove', move)
  handle.addEventListener('pointerup', end)
  handle.addEventListener('pointercancel', end)
}

function dragDock(event) {
  startDrag(event, 'dock', moveEvent => {
    const fraction = stackedDock.value ? moveEvent.clientY / window.innerHeight : moveEvent.clientX / window.innerWidth
    layout.dockSize = Math.round(clamp((1 - fraction) * 100, 30, 70))
  })
}

function cycleDock() {
  const next = dockPresets.find(size => size > layout.dockSize + 1) ?? dockPresets[0]
  layout.dockSize = next
}

function dragPanel(event) {
  startDrag(event, 'panel', moveEvent => {
    const rect = mainArea.value.getBoundingClientRect()
    const size = stackedDock.value
      ? (rect.right - moveEvent.clientX) / rect.width
      : (rect.bottom - moveEvent.clientY) / rect.height
    layout.panelSize = Math.round(clamp(size * 100, 18, 75))
  })
}

function dragNotes(event) {
  startDrag(event, 'notes', moveEvent => {
    const rect = panelArea.value.getBoundingClientRect()
    const size = stackedDock.value
      ? (rect.bottom - moveEvent.clientY) / rect.height
      : (rect.right - moveEvent.clientX) / rect.width
    layout.notesSize = Math.round(clamp(size * 100, 25, 75))
  })
}

function nudge(key, amount, min, max) {
  layout[key] = clamp(layout[key] + amount, min, max)
}

async function saveCode() {
  if (await send('save-code')) flashSaved()
}

function flashSaved() {
  savedFlash.value = false
  clearTimeout(savedTimer)
  requestAnimationFrame(() => {
    savedFlash.value = true
    savedTimer = setTimeout(() => { savedFlash.value = false }, 1600)
  })
}

function onDockFocusOut(event) {
  if (!event.currentTarget.contains(event.relatedTarget)) dockFocused.value = false
}

function isTextField(target) {
  return target instanceof HTMLElement && target.matches('input, textarea, select') && !target.closest('.monaco-editor')
}

function isTypingTarget(target) {
  return target instanceof HTMLElement
    && Boolean(target.closest('input, textarea, select, [contenteditable="true"], .monaco-editor, .xterm'))
}

async function toggleTerminal() {
  if (layout.panelOpen && layout.panelTab === 'terminal') {
    layout.panelOpen = false
    return
  }
  layout.panelOpen = true
  layout.panelTab = 'terminal'
  await nextTick()
  terminalPanel.value?.focus()
}

function onKeydown(event) {
  if (dockOpen.value && event.key === 'Escape') deleteToast.value = null
  if (dockOpen.value && event.ctrlKey && !event.metaKey && !event.altKey && event.code === 'Backquote') {
    event.preventDefault()
    event.stopPropagation()
    toggleTerminal()
    return
  }
  if (dockOpen.value && event.key === '?' && !event.metaKey && !event.ctrlKey && !event.altKey && !isTypingTarget(event.target)) {
    event.preventDefault()
    event.stopPropagation()
    shortcutHelp.value?.toggle()
    return
  }
  if (!dockOpen.value || event.altKey || !(isMac ? event.metaKey : event.ctrlKey)) return
  const key = event.key.toLowerCase()
  const inField = isTextField(event.target)
  if (key === 's') {
    event.preventDefault()
    if (!event.target?.closest?.('.lc-notes-editor')) saveCode()
    return
  }
  const actions = {
    'p': () => quickOpen.value?.show(),
    'enter': inField ? null : run,
    '.': inField ? null : stop,
    'b': inField ? null : () => { layout.explorerOpen = !layout.explorerOpen },
    'j': inField ? null : () => { layout.panelOpen = !layout.panelOpen },
  }
  const action = !event.shiftKey && actions[key]
  if (!action) return
  event.preventDefault()
  event.stopPropagation()
  action()
}

watch(() => [layout.dockSize, layout.explorerOpen, layout.panelOpen, layout.panelSize, layout.notesSize, layout.panelTab, tabs.value.length], saveLayout)

watch(() => layout.panelTab, tab => {
  if (tab === 'terminal') terminalMounted.value = true
})

watch(() => [sharedPanel.value, screen.value?.panel], ([wanted, shown]) => {
  if (isPresenter.value && shown && wanted !== shown) send('panel', { value: wanted }, { silent: true })
})

watch([dockOpen, () => layout.dockSize], ([open, size], _, onCleanup) => {
  if (!open) return
  document.body.style.setProperty('--slidev-live-code-dock-size', `${size}%`)
  onCleanup(() => document.body.style.removeProperty('--slidev-live-code-dock-size'))
})

watch(dragging, (name, _, onCleanup) => {
  if (!name) return
  document.body.classList.add('lc-dragging')
  onCleanup(() => document.body.classList.remove('lc-dragging'))
})

watch([currentSlideNo, queryClicks], ([slide], [previousSlide]) => {
  if (!isPresenter.value || !dockOpen.value) return
  send('view', { visible: false, slide: slide === previousSlide ? undefined : slide })
  if (slide !== previousSlide) followedSlide = slide
})

watch(() => screen.value?.projects, projects => {
  if (!projects) return
  const present = new Set(projects.flatMap(project => project.files.map(file => `${project.id}/${file}`)))
  if (tabs.value.some(tab => !present.has(tab.id))) tabs.value = tabs.value.filter(tab => present.has(tab.id))
})

watch(fileId, () => {
  diffOpen.value = false
})

watch(fileId, async id => {
  if (!isPresenter.value || !id) return
  addTab(screen.value.project, screen.value.file)
  recent.value = [id, ...recent.value.filter(item => item !== id)].slice(0, 12)
  await nextTick()
  tabStrip.value?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
})

watch(() => dockOpen.value && dockFocused.value, (locked, _, onCleanup) => {
  if (locked) onCleanup(lockShortcuts())
})

watch(visible, (shown, _, onCleanup) => {
  if (shown && !isPresenter.value) onCleanup(lockShortcuts())
})

watch([fileId, visible], () => {
  clearTimeout(copyTimer)
  copyStatus.value = ''
})

watch(dockOpen, (open, _, onCleanup) => {
  if (!open || !isPresenter.value) return
  const timer = setInterval(poll, 160)
  onCleanup(() => clearInterval(timer))
})

watch(deleteToast, (toast, _, onCleanup) => {
  if (!toast) return
  const timer = setTimeout(() => { deleteToast.value = null }, 8000)
  onCleanup(() => clearTimeout(timer))
})

onMounted(async () => {
  if (!enabled.value) return
  if (isPresenter.value) {
    launcherTarget.value = document.querySelector('.slidev-presenter .grid-section.bottom') ?? document.body
    dockMedia = window.matchMedia('(max-width: 980px)')
    stackedDock.value = dockMedia.matches
    dockMedia.addEventListener('change', updateOrientation)
    window.addEventListener('keydown', onKeydown, true)
  }
  else hot.on('slidev:live-code', update)
  await connect()
})

function updateOrientation() {
  stackedDock.value = dockMedia.matches
}

onBeforeUnmount(() => {
  clearTimeout(connectTimer)
  clearTimeout(savedTimer)
  clearTimeout(copyTimer)
  dockMedia?.removeEventListener('change', updateOrientation)
  window.removeEventListener('keydown', onKeydown, true)
  hot?.off('slidev:live-code', update)
})
</script>

<template>
  <Teleport v-if="enabled && isPresenter && launcherTarget" :to="launcherTarget">
    <button
      v-if="!dockOpen"
      ref="launcher"
      class="lc-launch"
      :class="{ 'is-offline': !screen && error }"
      type="button"
      :title="!screen && error ? `${error}\n${labelKey('launch.title')}` : labelKey('launch.title')"
      @click="openDock"
    >
      <LcIcon :name="!screen && error ? 'warning' : 'code'" />
      <span>{{ labelKey('launch.label') }}</span>
    </button>
  </Teleport>

  <Teleport v-if="enabled && isPresenter" to="body">
    <section
      v-if="dockMounted && screen"
      v-show="dockOpen"
      class="lc-root lc-dock"
      :class="{ 'dock-open': dockOpen, 'dock-stacked': stackedDock, 'is-live': visible, 'is-dragging': dragging }"
      :lang="lang"
      :aria-label="labelKey('dock.label')"
      :style="{ '--lc-panel-size': `${layout.panelSize}%`, '--lc-notes-size': `${layout.notesSize}%` }"
      @focusin="dockFocused = true"
      @focusout="onDockFocusOut"
    >
      <div
        class="lc-dock-sash"
        role="separator"
        tabindex="0"
        :title="t('dock.resize')"
        :aria-label="t('dock.resize')"
        :aria-orientation="stackedDock ? 'horizontal' : 'vertical'"
        aria-valuemin="30"
        aria-valuemax="70"
        :aria-valuenow="layout.dockSize"
        @pointerdown.prevent="dragDock"
        @dblclick="cycleDock"
        @keydown.left.up.stop.prevent="nudge('dockSize', 3, 30, 70)"
        @keydown.right.down.stop.prevent="nudge('dockSize', -3, 30, 70)"
      />

      <header class="lc-titlebar">
        <button
          type="button"
          class="lc-icon-btn"
          aria-controls="lc-file-explorer"
          :aria-expanded="layout.explorerOpen"
          :title="`${t('explorer.toggle')} (${keys.explorer})`"
          :aria-label="t('explorer.toggle')"
          @click="layout.explorerOpen = !layout.explorerOpen"
        >
          <LcIcon :name="layout.explorerOpen ? 'layout-sidebar-left' : 'layout-sidebar-left-off'" />
        </button>
        <button type="button" class="lc-search" :title="`${t('search.title')} (${keys.open})`" @click="quickOpen?.show()">
          <LcIcon name="search" />
          <span class="lc-search-label">{{ t('search.placeholder') }}</span>
          <kbd class="lc-kbd">{{ keys.open }}</kbd>
        </button>

        <div class="lc-titlebar-end">
          <button
            v-if="busy"
            type="button"
            class="lc-btn lc-btn-danger lc-run"
            :title="`${t('run.stopTitle')} (${keys.stop})`"
            @click="stop"
          >
            <LcIcon name="debug-stop" />
            <span class="lc-run-label">{{ t('run.stop') }}</span>
          </button>
          <button
            v-else
            type="button"
            class="lc-btn lc-btn-primary lc-run"
            :disabled="connectionLost"
            :title="`${t('run.runTitle')} (${keys.run})`"
            @click="run"
          >
            <LcIcon name="play" />
            <span class="lc-run-label">{{ t('run.run') }}</span>
          </button>

          <div class="lc-segmented" role="group" :aria-label="t('audience.group')">
            <button type="button" :aria-pressed="!visible" :disabled="connectionLost" @click="send('view', { visible: false })">
              {{ t('audience.slides') }}
            </button>
            <button type="button" :aria-pressed="visible" :disabled="connectionLost" @click="send('view', { visible: true })">
              <span class="lc-live-dot" aria-hidden="true" />
              {{ t('audience.code') }}
            </button>
          </div>

          <div class="lc-zoom" role="group" :aria-label="t('audience.zoom')">
            <button type="button" class="lc-icon-btn" :disabled="zoom <= 0.7" :title="t('audience.zoomOut')" :aria-label="t('audience.zoomOut')" @click="setZoom(zoom - 0.1)">
              <LcIcon name="remove" />
            </button>
            <button type="button" class="lc-zoom-value" :title="t('audience.zoomReset')" @click="setZoom(1)">
              {{ Math.round(zoom * 100) }}%
            </button>
            <button type="button" class="lc-icon-btn" :disabled="zoom >= 2.5" :title="t('audience.zoomIn')" :aria-label="t('audience.zoomIn')" @click="setZoom(zoom + 0.1)">
              <LcIcon name="add" />
            </button>
          </div>

          <button type="button" class="lc-icon-btn" :title="t('dock.close')" :aria-label="t('dock.close')" @click="closeDock">
            <LcIcon name="close" />
          </button>
        </div>
      </header>

      <div v-if="connectionLost" class="lc-banner" data-tone="warning" role="alert">
        <LcIcon name="loading" spin />
        <span>{{ t('error.connection') }}</span>
      </div>
      <div v-else-if="error" class="lc-banner" data-tone="danger" role="alert">
        <LcIcon name="error" />
        <span>{{ error }}</span>
        <button type="button" class="lc-icon-btn" :title="t('error.dismiss')" :aria-label="t('error.dismiss')" @click="error = ''">
          <LcIcon name="close" />
        </button>
      </div>

      <div class="lc-workbench">
        <FileExplorer
          v-show="layout.explorerOpen"
          class="lc-workbench-explorer"
          :projects="screen.projects"
          :project="screen.project"
          :file="screen.file"
          :busy="busy"
          @select="openFile"
          @create="createEntry"
          @delete="deleteEntry"
          @rename="renameEntry"
        />

        <div ref="mainArea" class="lc-main">
          <div class="lc-editor-group">
            <nav ref="tabStrip" class="lc-tabs" :aria-label="t('tabs.label')">
              <div
                v-for="tab in tabs"
                :key="tab.id"
                class="lc-tab"
                :class="{ 'is-active': tab.id === fileId, 'is-modified': modifiedIds.has(tab.id) }"
                @auxclick.prevent="$event.button === 1 && closeTab(tab)"
              >
                <button
                  type="button"
                  class="lc-tab-main"
                  :title="tab.title"
                  :aria-current="tab.id === fileId ? 'true' : undefined"
                  :disabled="busy && tab.project !== screen.project"
                  @click="openFile(tab)"
                >
                  <LcIcon name="file-code" />
                  <span>{{ tab.name }}</span>
                </button>
                <button
                  v-if="tabs.length > 1"
                  type="button"
                  class="lc-tab-close"
                  :title="t('tabs.close', { name: tab.name })"
                  :aria-label="t('tabs.close', { name: tab.name })"
                  :disabled="busy && tab.id === fileId"
                  @click="closeTab(tab)"
                >
                  <LcIcon name="close" />
                </button>
                <span v-else-if="modifiedIds.has(tab.id)" class="lc-tab-dot" :title="t('tabs.modified')" />
              </div>
            </nav>

            <div class="lc-breadcrumb">
              <span class="lc-crumb lc-crumb-project">{{ screen.label }}</span>
              <template v-for="(part, index) in pathParts" :key="index">
                <LcIcon name="chevron-right" class="lc-crumb-sep" />
                <span class="lc-crumb" :class="{ 'is-file': index === pathParts.length - 1 }">{{ part }}</span>
              </template>
              <button
                v-if="isModified"
                type="button"
                class="lc-crumb-action"
                :aria-pressed="showDiff"
                :title="showDiff ? t('diff.closeTitle') : t('diff.openTitle')"
                @click="diffOpen = !showDiff"
              >
                <LcIcon name="diff" />
                {{ showDiff ? t('diff.close') : t('diff.open') }}
              </button>
              <button v-if="isModified" type="button" class="lc-crumb-action lc-crumb-action-next" :title="t('file.resetTitle')" @click="send('reset', { project: screen.project, file: screen.file })">
                <LcIcon name="discard" />
                {{ t('file.reset') }}
              </button>
            </div>

            <DiffView
              v-if="showDiff"
              class="lc-editor"
              :file="screen.file"
              :original="screen.original"
              :code="screen.code"
              @close="diffOpen = false"
            />
            <CodeEditor
              v-show="!showDiff"
              class="lc-editor"
              :file="fileId"
              :original="screen.original ?? null"
              :code="screen.code"
              :line="screen.line"
              :jump="screen.jump ?? 0"
              :sync="screen.sync ?? 0"
              :diagnostics="fileDiagnostics"
              @edit="edit"
              @scroll="scroll"
              @cursor="caret = $event"
              @focus="shareFocus"
              @run="run"
            />
          </div>

          <div
            v-show="layout.panelOpen"
            class="lc-sash lc-sash-panel"
            role="separator"
            tabindex="0"
            :aria-label="t('panel.resize')"
            :aria-orientation="stackedDock ? 'vertical' : 'horizontal'"
            aria-valuemin="18"
            aria-valuemax="75"
            :aria-valuenow="layout.panelSize"
            @pointerdown.prevent="dragPanel"
            @keydown.up.left.stop.prevent="nudge('panelSize', 3, 18, 75)"
            @keydown.down.right.stop.prevent="nudge('panelSize', -3, 18, 75)"
          />

          <div v-show="layout.panelOpen" id="lc-panel" ref="panelArea" class="lc-panel">
            <div class="lc-panel-output">
              <OutputPanel
                v-show="layout.panelTab === 'output'"
                :output="screen.output"
                :phase="screen.phase"
                :exit-code="screen.exitCode"
                :duration="screen.duration"
                :interactive="screen.interactive"
                :awaiting-input="screen.awaitingInput"
                :resolve-location="resolveLocation"
                :submit="submitInput"
                @clear="send('clear')"
                @reveal="reveal"
              >
                <template #title>
                  <PanelTabs v-model="layout.panelTab" />
                </template>
              </OutputPanel>
              <TerminalPanel
                v-if="terminalMounted"
                v-show="layout.panelTab === 'terminal'"
                ref="terminalPanel"
                :endpoint="`${publicEndpoint}/presenter`"
                :project="screen.project"
                :project-label="currentProjectLabel"
                :active="dockOpen && layout.panelOpen && layout.panelTab === 'terminal'"
                :resolve-location="resolveLocation"
                @reveal="reveal"
              >
                <template #title>
                  <PanelTabs v-model="layout.panelTab" />
                </template>
              </TerminalPanel>
            </div>
            <div
              class="lc-sash lc-sash-notes"
              role="separator"
              tabindex="0"
              :aria-label="t('panel.split')"
              :aria-orientation="stackedDock ? 'horizontal' : 'vertical'"
              aria-valuemin="25"
              aria-valuemax="75"
              :aria-valuenow="layout.notesSize"
              @pointerdown.prevent="dragNotes"
              @keydown.left.up.stop.prevent="nudge('notesSize', 3, 25, 75)"
              @keydown.right.down.stop.prevent="nudge('notesSize', -3, 25, 75)"
            />
            <PresenterNotes
              class="lc-panel-notes"
              :text="screen.notes ?? ''"
              :draft="notesDraft"
              :saving="savingNotes"
              :steps="screen.steps ?? []"
              :step="screen.noteStep"
              :can-locate="!busy || screen.noteStep?.project === screen.project"
              :current-slide="currentSlideNo"
              @edit="noteDrafts.set(notesKey, screen.notes ?? '')"
              @update:draft="noteDrafts.set(notesKey, $event)"
              @cancel="noteDrafts.delete(notesKey)"
              @save="saveNotes"
              @select-step="send('select-note', { id: $event })"
              @locate="send('locate-step')"
              @go-slide="goToSlide"
            />
          </div>
        </div>
      </div>

      <footer class="lc-statusbar">
        <button
          type="button"
          class="lc-status-item"
          aria-controls="lc-panel"
          :aria-expanded="layout.panelOpen"
          :title="`${layout.panelOpen ? t('panel.hide') : t('panel.show')} (${keys.panel})`"
          @click="layout.panelOpen = !layout.panelOpen"
        >
          <LcIcon :name="layout.panelOpen ? 'layout-panel' : 'layout-panel-off'" />
        </button>
        <span class="lc-status-item lc-status-audience" role="status">
          <span class="lc-status-dot" aria-hidden="true" />
          {{ visible ? t('audience.live') : t('audience.idle') }}
        </span>
        <button
          v-if="problemCounts.errors || problemCounts.warnings"
          type="button"
          class="lc-status-item"
          :title="t('status.problems', { count: problemCounts.errors + problemCounts.warnings })"
          @click="showOutput"
        >
          <LcIcon name="error" />{{ problemCounts.errors }}
          <LcIcon name="warning" />{{ problemCounts.warnings }}
        </button>
        <span v-if="connectionLost" class="lc-status-item lc-status-offline">{{ t('status.offline') }}</span>
        <button
          v-else
          type="button"
          class="lc-status-item lc-status-saved lc-status-end"
          :class="{ 'is-flash': savedFlash }"
          :data-tone="saveStatus.tone"
          :title="t('status.savedTitle', { key: keys.save })"
          @click="saveCode"
        >
          <LcIcon :name="saveStatus.icon" />{{ saveStatus.label }}
        </button>
        <span v-if="caret" class="lc-status-item" :class="{ 'lc-status-end': connectionLost }">{{ t('status.position', { line: caret.lineNumber, column: caret.column }) }}</span>
        <span class="lc-status-item" :class="{ 'lc-status-end': connectionLost && !caret }">{{ fileLanguage }}</span>
        <button
          type="button"
          class="lc-status-item"
          :title="`${t('help.title')} (${keys.help})`"
          :aria-label="t('help.title')"
          @click="shortcutHelp?.toggle()"
        >
          <LcIcon name="keyboard" />
        </button>
      </footer>

      <div class="lc-delete-toast" :class="{ 'is-visible': deleteToast }">
        <span role="status">{{ deleteToast ? t('explorer.deleted', { name: deleteToast.name }) : '' }}</span>
        <button v-if="deleteToast" type="button" class="lc-btn" :disabled="pendingDeletes > 0" @click="undoDelete">
          {{ t('explorer.undoDelete') }}
        </button>
      </div>

      <ShortcutHelp ref="shortcutHelp" />
      <QuickOpen ref="quickOpen" :projects="screen.projects" :project="screen.project" :busy="busy" :recent="recent" @select="openFile" />
    </section>
  </Teleport>

  <Teleport v-if="enabled && !isPresenter" to="body">
    <Transition name="lc-fade">
      <section
        v-if="visible && screen"
        class="lc-root lc-audience"
        :class="{ 'has-output': showAudienceOutput || showAudienceTerminal }"
        :lang="lang"
        :style="{ '--lc-zoom': zoom }"
        :aria-label="screen.label"
      >
        <header class="lc-audience-header">
          <div class="lc-audience-path">
            <LcIcon name="file-code" />
            <span class="lc-audience-project" :title="screen.label">{{ screen.label }}</span>
            <LcIcon name="chevron-right" class="lc-audience-sep" />
            <span class="lc-audience-file" :title="screen.file">{{ screen.file }}</span>
          </div>
          <div class="lc-audience-actions">
            <button type="button" class="lc-btn lc-audience-action" @click="copyAudienceFile">
              <LcIcon :name="copyStatus === 'audience.copied' ? 'check' : 'copy'" />
              {{ t(copyStatus || 'audience.copy') }}
            </button>
            <button type="button" class="lc-btn lc-audience-action" @click="downloadAudienceProject">
              <LcIcon name="desktop-download" />
              {{ t('audience.download') }}
            </button>
          </div>
          <span class="lc-sr-only" role="status">{{ copyStatus ? t(copyStatus) : '' }}</span>
        </header>
        <div class="lc-audience-body">
          <CodeEditor
            class="lc-audience-editor"
            :file="fileId"
            :code="screen.code"
            :line="screen.line"
            :jump="screen.jump ?? 0"
            :focus="fileFocus"
            :diagnostics="fileDiagnostics"
            :zoom="zoom"
            readonly
          />
          <Transition name="lc-slide">
            <TerminalPanel
              v-if="showAudienceTerminal"
              key="terminal"
              class="lc-audience-output"
              :endpoint="publicEndpoint"
              :project="screen.project"
              :project-label="screen.label"
              audience
            />
            <OutputPanel
              v-else-if="showAudienceOutput"
              key="output"
              class="lc-audience-output"
              :output="screen.output"
              :phase="screen.phase"
              :exit-code="screen.exitCode"
              :duration="screen.duration"
              :awaiting-input="screen.awaitingInput"
              :zoom="zoom"
              audience
            />
          </Transition>
        </div>
      </section>
    </Transition>
  </Teleport>
</template>

<style scoped>
.lc-launch {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  align-self: center;
  height: 30px;
  margin: 4px 8px;
  padding: 0 11px 0 9px;
  border: 1px solid color-mix(in srgb, currentColor 22%, transparent);
  border-radius: 7px;
  background: transparent;
  color: inherit;
  font: 500 13px/1 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 120ms, border-color 120ms;
}

.lc-launch:hover:not(:disabled) {
  background: color-mix(in srgb, currentColor 8%, transparent);
  border-color: color-mix(in srgb, currentColor 35%, transparent);
}

.lc-launch:focus-visible { outline: 2px solid #2a62d6; outline-offset: 2px; }
.lc-launch.is-offline { border-color: color-mix(in srgb, #d23434 55%, transparent); }
.lc-launch.is-offline .lc-icon { color: #d23434; }

.lc-dock {
  position: fixed;
  inset: 0 0 0 auto;
  z-index: 0;
  display: flex;
  flex-direction: column;
  width: var(--slidev-live-code-dock-size, 50%);
  background: var(--lc-bg);
  border-left: 1px solid var(--lc-border-strong);
  container: dock / inline-size;
}

.lc-dock.is-dragging { user-select: none; }

.lc-delete-toast {
  position: absolute;
  inset-inline-end: 12px;
  bottom: 36px;
  z-index: 6;
}

.lc-delete-toast.is-visible {
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: calc(100% - 24px);
  padding: 6px 8px 6px 12px;
  border: 1px solid var(--lc-border);
  border-radius: var(--lc-radius);
  background: var(--lc-chrome);
  box-shadow: var(--lc-shadow-pop);
  color: var(--lc-text-2);
  overflow-wrap: anywhere;
}

:global(body.lc-dragging) { cursor: col-resize; }
:global(body.lc-dragging iframe) { pointer-events: none; }

:global(body:has(.lc-dock.dock-open) #app) {
  position: relative;
  z-index: 1;
  width: calc(100% - var(--slidev-live-code-dock-size, 50%));
}

:global(body:has(.lc-dock.dock-open:not(.dock-stacked)) .slidev-presenter .grid-container) {
  --live-code-native-notes-width: min(var(--slidev-presenter-notes-width), 49%);
}

:global(body:has(.lc-dock.dock-open:not(.dock-stacked)) .slidev-presenter :is(.layout2, .layout3)) {
  grid-template-columns: var(--live-code-native-notes-width) minmax(0, 1fr);
}

@media (min-aspect-ratio: 1/1) {
  :global(body:has(.lc-dock.dock-open:not(.dock-stacked)) .slidev-presenter .grid-container.layout1) {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr) var(--live-code-native-notes-width);
  }
}

:global(body:has(.lc-dock.dock-open:not(.dock-stacked)) .slidev-presenter .notes-vertical-resizer) {
  right: var(--live-code-native-notes-width);
}

:global(body:has(.lc-dock.dock-open:not(.dock-stacked)) .slidev-presenter .notes-vertical-resizer-left) {
  left: var(--live-code-native-notes-width);
}

.lc-dock.dock-stacked {
  inset: auto 0 0;
  width: 100%;
  height: var(--slidev-live-code-dock-size, 50%);
  border-left: 0;
  border-top: 1px solid var(--lc-border-strong);
}

:global(body:has(.lc-dock.dock-open.dock-stacked) #app) {
  width: 100%;
  height: calc(100% - var(--slidev-live-code-dock-size, 50%));
}

:global(body:has(.lc-dock.dock-open.dock-stacked) .slidev-presenter .grid-container) {
  --live-code-native-notes-height: min(var(--slidev-presenter-notes-row-size), 38%);
}

:global(body:has(.lc-dock.dock-open.dock-stacked) .slidev-presenter :is(.layout2, .layout3)) {
  grid-template-rows: minmax(0, var(--live-code-native-notes-height)) minmax(0, 1fr) min-content;
}

@media (aspect-ratio > 3/5) {
  :global(body:has(.lc-dock.dock-open.dock-stacked) .slidev-presenter .grid-container.layout1) {
    grid-template-rows: minmax(0, 1fr) minmax(0, var(--live-code-native-notes-height)) min-content;
  }
}

.lc-dock-sash {
  position: absolute;
  inset: 0 auto 0 -3px;
  z-index: 30;
  width: 7px;
  cursor: col-resize;
  touch-action: none;
}

.lc-dock-sash::after,
.lc-sash::after {
  content: "";
  position: absolute;
  background: var(--lc-accent);
  opacity: 0;
  transition: opacity 120ms 0ms;
}

.lc-dock-sash::after { inset: 0 2px; }
.lc-dock-sash:hover::after,
.lc-sash:hover::after { opacity: 1; transition-delay: 250ms; }
.lc-dock-sash:focus-visible,
.lc-sash:focus-visible { outline: none; }
.lc-dock-sash:focus-visible::after,
.lc-sash:focus-visible::after,
.lc-dock.is-dragging .lc-dock-sash::after { opacity: 1; transition-delay: 0ms; }

.dock-stacked .lc-dock-sash { inset: -3px 0 auto; width: 100%; height: 7px; cursor: row-resize; }
.dock-stacked .lc-dock-sash::after { inset: 2px 0; }

.lc-titlebar {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: none;
  height: 44px;
  padding: 0 8px;
  background: var(--lc-chrome);
  border-bottom: 1px solid var(--lc-border);
}

.lc-search {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1 1 220px;
  min-width: 0;
  max-width: 300px;
  height: 28px;
  padding: 0 4px 0 9px;
  border: 1px solid var(--lc-border) !important;
  border-radius: var(--lc-radius);
  background: var(--lc-bg) !important;
  color: var(--lc-text-3);
  transition: border-color 120ms;
}

.lc-search:hover { border-color: var(--lc-border-strong) !important; }

.lc-search-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lc-titlebar-end {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.lc-run { min-width: 72px; }
.lc-run .lc-icon { width: 14px; font-size: 14px; }

.lc-segmented {
  display: inline-flex;
  padding: 2px;
  border-radius: 8px;
  background: var(--lc-chrome-2);
}

.lc-segmented button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 10px;
  border-radius: 6px;
  color: var(--lc-text-2);
  font-weight: 500;
  white-space: nowrap;
  transition: background-color 140ms, color 140ms, box-shadow 140ms;
}

.lc-segmented button:hover:not([aria-pressed="true"]):not(:disabled) { color: var(--lc-text); }
.lc-segmented button:disabled { opacity: 0.5; }

.lc-segmented button[aria-pressed="true"] {
  background: var(--lc-bg);
  color: var(--lc-text);
  box-shadow: var(--lc-shadow-thumb);
}

.lc-live-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--lc-text-3);
  opacity: 0.6;
  transition: background-color 140ms, opacity 140ms;
}

.is-live .lc-live-dot {
  background: var(--lc-live);
  opacity: 1;
  box-shadow: 0 0 0 0 color-mix(in srgb, var(--lc-live) 45%, transparent);
  animation: lc-live-pulse 2.4s var(--lc-ease) infinite;
}

@keyframes lc-live-pulse {
  0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--lc-live) 45%, transparent); }
  70%, 100% { box-shadow: 0 0 0 5px color-mix(in srgb, var(--lc-live) 0%, transparent); }
}

.lc-zoom {
  display: inline-flex;
  align-items: center;
}

.lc-zoom .lc-icon-btn { width: 24px; height: 28px; }

.lc-zoom-value {
  min-width: 42px;
  height: 24px;
  padding: 0 2px;
  border-radius: 5px;
  color: var(--lc-text-2);
  font-size: 12px;
  font-weight: 500;
}

.lc-zoom-value:hover { background: var(--lc-hover); color: var(--lc-text); }

.lc-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
  min-height: 34px;
  padding: 4px 6px 4px 12px;
  border-bottom: 1px solid var(--lc-border);
  font-size: 12px;
}

.lc-banner span:not(.lc-icon) { flex: 1; }
.lc-banner .lc-icon-btn { width: 24px; height: 24px; color: inherit; }
.lc-banner[data-tone="danger"] { background: var(--lc-danger-soft); color: var(--lc-danger); }
.lc-banner[data-tone="warning"] { background: var(--lc-warning-soft); color: var(--lc-warning); }

.lc-workbench {
  display: flex;
  flex: 1;
  min-height: 0;
}

.lc-workbench-explorer {
  flex: 0 0 200px;
}

.lc-main {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.lc-editor-group {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  flex: 1;
  min-width: 0;
  min-height: 0;
  background: var(--lc-bg);
}

.lc-tabs {
  display: flex;
  height: 36px;
  overflow: auto hidden;
  scrollbar-width: none;
  background: var(--lc-chrome);
  border-bottom: 1px solid var(--lc-border);
}

.lc-tab {
  position: relative;
  display: flex;
  align-items: center;
  flex: none;
  margin-bottom: -1px;
  padding-right: 4px;
  border-right: 1px solid var(--lc-border);
  color: var(--lc-text-3);
  transition: color 120ms, background-color 120ms;
}

.lc-tab:hover { color: var(--lc-text-2); background: var(--lc-hover); }

.lc-tab.is-active {
  background: var(--lc-bg);
  color: var(--lc-text);
  box-shadow: inset 0 2px 0 var(--lc-accent);
}

.lc-tab-main {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 100%;
  padding: 0 4px 0 12px;
  white-space: nowrap;
}

.lc-tab-main:disabled { opacity: 0.5; }
.lc-tab-main span { max-width: 22ch; overflow: hidden; text-overflow: ellipsis; }
.lc-tab-main .lc-icon { color: var(--lc-accent); font-size: 15px; }
.lc-tab-main:focus-visible { outline-offset: -4px; border-radius: 6px; }

.lc-tab-close {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  color: var(--lc-text-3);
  opacity: 0;
  transition: opacity 100ms, background-color 100ms;
}

.lc-tab-close .lc-icon { width: 14px; font-size: 14px; }
.lc-tab:hover .lc-tab-close,
.lc-tab.is-active .lc-tab-close,
.lc-tab-close:focus-visible { opacity: 1; }
.lc-tab-close:hover:not(:disabled) { background: var(--lc-pressed); color: var(--lc-text); }

.lc-tab.is-modified:not(:hover) .lc-tab-close { opacity: 1; }
.lc-tab.is-modified:not(:hover) .lc-tab-close .lc-icon { font-size: 0; }
.lc-tab.is-modified:not(:hover) .lc-tab-close .lc-icon::before {
  content: "";
  display: block;
  width: 8px;
  height: 8px;
  margin: auto;
  border-radius: 50%;
  background: currentColor;
}

.lc-tab-dot {
  width: 8px;
  height: 8px;
  margin: 0 6px;
  border-radius: 50%;
  background: var(--lc-text-3);
}

.lc-breadcrumb {
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
  height: 28px;
  padding: 0 6px 0 14px;
  color: var(--lc-text-3);
  font-size: 12px;
  white-space: nowrap;
}

.lc-crumb { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.lc-crumb-project { flex: 0 1 auto; max-width: 40%; }
.lc-crumb.is-file { color: var(--lc-text); }
.lc-crumb-sep { width: 14px; font-size: 14px; opacity: 0.7; }

.lc-crumb-action {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: none;
  height: 22px;
  margin-left: auto;
  padding: 0 8px;
  border-radius: 5px;
  color: var(--lc-text-2);
  font-size: 12px;
  font-weight: 500;
}

.lc-crumb-action-next { margin-left: 0; }
.lc-crumb-action[aria-pressed="true"] { background: var(--lc-accent-soft); color: var(--lc-accent); }
.lc-crumb-action .lc-icon { width: 14px; font-size: 14px; }
.lc-crumb-action:hover { background: var(--lc-hover); color: var(--lc-text); }

.lc-editor { min-height: 0; }

.lc-sash {
  position: relative;
  flex: none;
  z-index: 5;
  height: 1px;
  background: var(--lc-border);
  cursor: row-resize;
  touch-action: none;
}

.lc-sash::before {
  content: "";
  position: absolute;
  inset: -3px 0;
}

.lc-sash::after { inset: -1px 0; }

.lc-sash-notes {
  width: 1px;
  height: auto;
  cursor: col-resize;
}

.lc-sash-notes::before { inset: 0 -3px; }
.lc-sash-notes::after { inset: 0 -1px; }

.lc-panel {
  display: flex;
  flex: 0 0 var(--lc-panel-size, 40%);
  min-height: 0;
  min-width: 0;
}

.lc-panel-output { display: flex; flex: 1 1 0; flex-direction: column; min-width: 0; min-height: 0; container: lc-panel / inline-size; }
.lc-panel-output > * { flex: 1 1 0; min-height: 0; }
.lc-panel-notes { flex: 0 0 var(--lc-notes-size, 50%); min-width: 0; }

.dock-stacked .lc-main { flex-direction: row; }
.dock-stacked .lc-sash-panel { width: 1px; height: auto; cursor: col-resize; }
.dock-stacked .lc-sash-panel::before { inset: 0 -3px; }
.dock-stacked .lc-sash-panel::after { inset: 0 -1px; }
.dock-stacked .lc-panel { flex-direction: column; }
.dock-stacked .lc-sash-notes { width: auto; height: 1px; cursor: row-resize; }
.dock-stacked .lc-sash-notes::before { inset: -3px 0; }
.dock-stacked .lc-sash-notes::after { inset: -1px 0; }

.lc-statusbar {
  display: flex;
  align-items: center;
  flex: none;
  height: 24px;
  padding: 0 4px;
  background: var(--lc-chrome);
  border-top: 1px solid var(--lc-border);
  color: var(--lc-text-2);
  font-size: 12px;
  transition: background-color 200ms, color 200ms, border-color 200ms;
}

.lc-status-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 100%;
  padding: 0 7px;
  white-space: nowrap;
}

.lc-status-item .lc-icon { width: 14px; font-size: 14px; }
button.lc-status-item:hover { background: var(--lc-hover); }
.lc-status-end { margin-left: auto; }

.lc-status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--lc-text-3);
}

.lc-status-offline { color: var(--lc-warning); font-weight: 600; }

.lc-status-saved {
  border-radius: 4px;
  transition: background-color 200ms, color 200ms;
}

.lc-status-saved[data-tone="pending"] .lc-icon { width: 10px; font-size: 10px; }
.lc-status-saved[data-tone="danger"] { color: var(--lc-danger); font-weight: 600; }
.is-live .lc-status-saved[data-tone="danger"] { color: inherit; }

.lc-status-saved.is-flash {
  background: var(--lc-accent-fill);
  color: var(--lc-on-accent);
  transition-duration: 0ms;
}

.is-live .lc-status-saved.is-flash { background: rgb(255 255 255 / 0.22); color: inherit; }

.is-live .lc-statusbar {
  background: var(--lc-live);
  border-top-color: var(--lc-live);
  color: var(--lc-on-live);
}

.is-live .lc-status-audience { font-weight: 600; }
.is-live .lc-status-dot { background: currentColor; }
.is-live button.lc-status-item:hover { background: rgb(255 255 255 / 0.14); }
.is-live .lc-status-offline { color: inherit; }

@container dock (max-width: 640px) {
  .lc-search-label,
  .lc-search .lc-kbd { display: none; }
  .lc-search { flex: none; width: 28px; padding: 0; justify-content: center; border-color: transparent !important; background: transparent !important; }
  .lc-search:hover { background: var(--lc-hover) !important; }
  .lc-workbench-explorer { flex-basis: 168px; }
}

@container dock (max-width: 520px) {
  .lc-run-label { display: none; }
  .lc-run { min-width: 0; width: 32px; padding: 0; }
  .lc-zoom-value { display: none; }
  .lc-status-audience { max-width: 40%; overflow: hidden; text-overflow: ellipsis; }
}

.lc-audience {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  background: var(--lc-bg);
}

.lc-audience-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: calc(6px * var(--lc-zoom)) calc(10px * var(--lc-zoom));
  flex: none;
  min-height: calc(56px * var(--lc-zoom));
  padding: calc(6px * var(--lc-zoom)) 28px;
  background: var(--lc-chrome);
  border-bottom: 1px solid var(--lc-border);
  font-size: calc(17px * var(--lc-zoom));
}

.lc-audience-header .lc-icon {
  width: calc(20px * var(--lc-zoom));
  font-size: calc(20px * var(--lc-zoom));
  color: var(--lc-accent);
}

.lc-audience-path,
.lc-audience-actions {
  display: flex;
  align-items: center;
  gap: calc(10px * var(--lc-zoom));
}

.lc-audience-path {
  flex: 1 1 calc(140px * var(--lc-zoom));
  min-width: 0;
}

.lc-audience-project { color: var(--lc-text-2); font-weight: 500; }
.lc-audience-header .lc-audience-sep { color: var(--lc-text-3); width: calc(16px * var(--lc-zoom)); font-size: calc(16px * var(--lc-zoom)); }
.lc-audience-file { color: var(--lc-text); font: 600 1em var(--lc-mono); }

.lc-audience-project,
.lc-audience-file {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lc-audience-actions {
  flex-wrap: wrap;
  justify-content: flex-end;
  max-width: 100%;
  margin-inline-start: auto;
}

.lc-audience-action {
  gap: calc(6px * var(--lc-zoom));
  min-width: 0;
  min-height: calc(32px * var(--lc-zoom));
  height: auto;
  padding: calc(4px * var(--lc-zoom)) calc(10px * var(--lc-zoom));
  color: var(--lc-text-2);
  font-size: calc(14px * var(--lc-zoom));
  white-space: normal;
}

.lc-audience-action .lc-icon {
  width: calc(16px * var(--lc-zoom));
  font-size: calc(16px * var(--lc-zoom));
  color: inherit;
}

.lc-audience-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  flex: 1;
  min-height: 0;
  transition: grid-template-columns 320ms var(--lc-ease);
}

.lc-audience.has-output .lc-audience-body { grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr); }

.lc-audience-editor { min-height: 0; }

.lc-audience-output {
  border-left: 1px solid var(--lc-border);
  background: var(--lc-chrome) !important;
}

@media (max-aspect-ratio: 1/1) {
  .lc-audience.has-output .lc-audience-body {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1.6fr) minmax(0, 1fr);
  }
  .lc-audience-output { border-left: 0; border-top: 1px solid var(--lc-border); }
}

.lc-fade-enter-active { transition: opacity 180ms var(--lc-ease); }
.lc-fade-leave-active { transition: opacity 120ms ease-in; }
.lc-fade-enter-from,
.lc-fade-leave-to { opacity: 0; }

.lc-slide-enter-active { transition: opacity 260ms var(--lc-ease), transform 320ms var(--lc-ease); }
.lc-slide-enter-from { opacity: 0; transform: translateX(24px); }
</style>
