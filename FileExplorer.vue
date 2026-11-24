<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue'
import LcIcon from './LcIcon.vue'
import { languageLabel } from './file-language.mjs'
import { t } from './i18n.mjs'

const props = defineProps({
  projects: { type: Array, required: true },
  project: { type: String, required: true },
  file: { type: String, required: true },
  busy: Boolean,
})
const emit = defineEmits(['select', 'create', 'delete', 'rename'])
const expanded = reactive(new Set())
const tree = ref()
const cursor = ref('')
const draft = ref(null)
const pendingFocus = ref('')
const renaming = ref(null)
const segment = /^[A-Za-z0-9_$][\w$.-]*$/

const roots = computed(() => props.projects.map(project => {
  const modified = new Set(project.modified ?? [])
  const created = new Set(project.created ?? [])
  const root = { key: project.id, label: project.label, project: project.id, path: '', children: new Map(), modified: modified.size > 0 }

  function insert(path, leaf) {
    const parts = path.split('/')
    let parent = root
    for (const [index, name] of parts.entries()) {
      const isFile = leaf && index === parts.length - 1
      const nodePath = parts.slice(0, index + 1).join('/')
      if (!parent.children.has(name)) {
        parent.children.set(name, {
          key: `${parent.key}/${name}`,
          label: name,
          project: project.id,
          path: nodePath,
          file: isFile ? path : null,
          children: isFile ? null : new Map(),
          modified: isFile && modified.has(path),
          created: isFile ? created.has(path) : true,
        })
      }
      parent = parent.children.get(name)
      if (!isFile && !created.has(path) && leaf) parent.created = false
    }
  }

  for (const folder of project.folders ?? []) insert(folder, false)
  for (const file of project.files ?? []) insert(file, true)
  return root
}))

const rows = computed(() => {
  const result = []

  function visit(node, depth, parent) {
    result.push({ node, depth, parent })
    if (!node.children || !expanded.has(node.key)) return
    const children = [...node.children.values()]
    children.sort((first, second) => Number(Boolean(second.children)) - Number(Boolean(first.children))
      || first.label.localeCompare(second.label, undefined, { numeric: true }))
    for (const child of children) visit(child, depth + 1, node.key)
  }

  for (const root of roots.value) visit(root, 0, null)
  if (draft.value) {
    const index = result.findIndex(row => row.node.key === draft.value.parentKey)
    if (index >= 0) result.splice(index + 1, 0, { draft: true, depth: result[index].depth + 1, parent: draft.value.parentKey })
  }
  return result
})

watch(rows, async list => {
  if (!pendingFocus.value || !list.some(row => row.node?.key === pendingFocus.value)) return
  const key = pendingFocus.value
  pendingFocus.value = ''
  await moveTo(key)
})

const projectById = computed(() => new Map(props.projects.map(project => [project.id, project])))

const currentKey = computed(() => `${props.project}/${props.file}`)
const activeKey = computed(() => rows.value.some(row => row.node?.key === cursor.value) ? cursor.value : currentKey.value)

watch(() => [props.project, props.file], ([project, file]) => {
  let key = project
  expanded.add(key)
  for (const part of file.split('/').slice(0, -1)) {
    key += `/${part}`
    expanded.add(key)
  }
  cursor.value = `${project}/${file}`
}, { immediate: true })

function findNode(key) {
  return rows.value.find(row => row.node?.key === key)?.node
}

function targetFolder() {
  const node = findNode(activeKey.value)
  if (!node) return findNode(props.project)
  if (node.children) return node
  const parentKey = node.key.slice(0, node.key.lastIndexOf('/'))
  return findNode(parentKey) ?? findNode(node.project)
}

async function startDraft(kind) {
  renaming.value = null
  const folder = targetFolder()
  if (!folder) return
  expanded.add(folder.key)
  draft.value = { kind, project: folder.project, parentPath: folder.path, parentKey: folder.key, name: '', error: '' }
  await nextTick()
  tree.value?.querySelector('.lc-draft-input')?.focus()
}

function draftPath() {
  const { kind, project, parentPath, name } = draft.value
  const extensions = projectById.value.get(project)?.extensions ?? []
  let relative = name.trim().replace(/^\/+|\/+$/g, '')
  if (!relative) return { error: t('explorer.errorEmpty') }
  if (relative.length > 160 || !relative.split('/').every(part => segment.test(part))) return { error: t('explorer.errorName') }
  if (kind === 'file' && extensions.length) {
    const last = relative.split('/').at(-1)
    if (!last.includes('.')) relative += extensions[0]
    else if (!extensions.some(extension => last.endsWith(extension) && last.length > extension.length)) {
      const language = languageLabel(projectById.value.get(project)?.language) ?? ''
      return { error: t('explorer.errorExtension', { language, extensions: extensions.join(' / ') }) }
    }
  }
  const path = parentPath ? `${parentPath}/${relative}` : relative
  const info = projectById.value.get(project)
  const taken = [...(info?.files ?? []), ...(info?.folders ?? [])]
  if (taken.some(item => item === path || item.startsWith(`${path}/`) || (kind === 'file' && path.startsWith(`${item}/`) && info.files.includes(item)))) {
    return { error: t('explorer.errorExists') }
  }
  return { path }
}

function validateDraft() {
  if (!draft.value) return
  draft.value.error = draft.value.name.trim() ? draftPath().error ?? '' : ''
}

async function commitDraft() {
  if (!draft.value) return
  const result = draftPath()
  if (result.error) {
    draft.value.error = result.error
    return
  }
  const { kind, project } = draft.value
  draft.value = null
  const key = `${project}/${result.path}`
  let parent = project
  for (const part of result.path.split('/').slice(0, kind === 'folder' ? undefined : -1)) {
    parent += `/${part}`
    expanded.add(parent)
  }
  emit('create', { kind, project, path: result.path })
  if (kind === 'folder') {
    cursor.value = key
    pendingFocus.value = key
  }
}

async function cancelDraft(refocus = true) {
  if (!draft.value) return
  const key = draft.value.parentKey
  draft.value = null
  if (refocus) await moveTo(key)
}

function onDraftBlur() {
  if (!draft.value) return
  if (!draft.value.name.trim() || draftPath().error) cancelDraft(false)
  else commitDraft()
}

function onDraftKeydown(event) {
  event.stopPropagation()
  if (event.key === 'Enter') {
    event.preventDefault()
    commitDraft()
  }
  else if (event.key === 'Escape') {
    event.preventDefault()
    cancelDraft()
  }
}

function canRename(node) {
  return Boolean(node.path)
}

function canDelete(node) {
  return canRename(node) && node.created
}

function parentOf(path) {
  return path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
}

async function startRename(node) {
  if (!canRename(node)) return
  draft.value = null
  cursor.value = node.key
  renaming.value = { key: node.key, project: node.project, path: node.path, folder: Boolean(node.children), name: node.label, error: '' }
  await nextTick()
  const input = tree.value?.querySelector('.lc-rename-input')
  if (!input) return
  input.focus()
  const dot = node.children ? -1 : node.label.lastIndexOf('.')
  input.setSelectionRange(0, dot > 0 ? dot : node.label.length)
}

function renameTarget() {
  const { project, path, folder } = renaming.value
  const info = projectById.value.get(project)
  const extensions = info?.extensions ?? []
  let name = renaming.value.name.trim()
  if (!name) return { error: t('explorer.errorEmpty') }
  if (name.length > 120 || !segment.test(name)) return { error: t('explorer.errorName') }
  if (!folder) {
    if (!name.includes('.')) name += extensions.find(extension => path.endsWith(extension)) ?? extensions[0] ?? ''
    else if (extensions.length && !extensions.some(extension => name.endsWith(extension) && name.length > extension.length)) {
      return { error: t('explorer.errorExtension', { language: languageLabel(info?.language) ?? '', extensions: extensions.join(' / ') }) }
    }
  }
  const parent = parentOf(path)
  const target = parent ? `${parent}/${name}` : name
  if (target === path) return { same: true }
  const taken = [...(info?.files ?? []), ...(info?.folders ?? [])]
    .filter(item => item !== path && !item.startsWith(`${path}/`))
  if (taken.some(item => item === target || item.startsWith(`${target}/`))) return { error: t('explorer.errorExists') }
  return { path: target }
}

function validateRename() {
  if (renaming.value) renaming.value.error = renameTarget().error ?? ''
}

async function commitRename() {
  if (!renaming.value) return
  const result = renameTarget()
  if (result.error) {
    renaming.value.error = result.error
    return
  }
  const { project, path, folder, key } = renaming.value
  renaming.value = null
  if (result.same) return moveTo(key)
  const nextKey = `${project}/${result.path}`
  if (folder) {
    for (const item of [...expanded]) {
      if (item === key || item.startsWith(`${key}/`)) {
        expanded.delete(item)
        expanded.add(`${nextKey}${item.slice(key.length)}`)
      }
    }
  }
  cursor.value = nextKey
  pendingFocus.value = nextKey
  emit('rename', { project, from: path, to: result.path, folder })
}

async function cancelRename() {
  if (!renaming.value) return
  const { key } = renaming.value
  renaming.value = null
  await moveTo(key)
}

function onRenameKeydown(event) {
  event.stopPropagation()
  if (event.key === 'Enter') {
    event.preventDefault()
    commitRename()
  }
  else if (event.key === 'Escape') {
    event.preventDefault()
    cancelRename()
  }
}

function onRenameBlur() {
  if (!renaming.value) return
  if (renameTarget().error) renaming.value = null
  else commitRename()
}

function remove(node) {
  if (!canDelete(node)) return
  emit('delete', { project: node.project, path: node.path, name: node.label, folder: Boolean(node.children) })
}

function isDisabled(node) {
  return !node.children && props.busy && node.project !== props.project
}

function activate(node) {
  cursor.value = node.key
  if (!node.children) {
    if (!isDisabled(node)) emit('select', { project: node.project, file: node.file })
    return
  }
  if (expanded.has(node.key)) expanded.delete(node.key)
  else expanded.add(node.key)
}

async function moveTo(key) {
  cursor.value = key
  await nextTick()
  tree.value?.querySelector(`[data-key="${CSS.escape(key)}"]`)?.focus()
}

function onKeydown(event) {
  const list = rows.value
  const index = list.findIndex(row => row.node?.key === activeKey.value)
  const row = list[index]
  if (!row || row.draft) return
  const step = offset => {
    let next = index + offset
    while (list[next]?.draft) next += offset
    return list[next]
  }
  const handled = {
    ArrowDown: () => step(1) && moveTo(step(1).node.key),
    ArrowUp: () => step(-1) && moveTo(step(-1).node.key),
    Home: () => moveTo(list[0].node.key),
    End: () => moveTo(list.findLast(item => !item.draft).node.key),
    ArrowRight: () => {
      if (!row.node.children) return
      if (!expanded.has(row.node.key)) expanded.add(row.node.key)
      else if (step(1)?.parent === row.node.key) moveTo(step(1).node.key)
    },
    ArrowLeft: () => {
      if (row.node.children && expanded.has(row.node.key)) expanded.delete(row.node.key)
      else if (row.parent) moveTo(row.parent)
    },
    Enter: () => activate(row.node),
    ' ': () => activate(row.node),
    Delete: () => remove(row.node),
    F2: () => startRename(row.node),
    Backspace: () => (event.metaKey || event.ctrlKey) && remove(row.node),
  }[event.key]
  if (!handled) return
  event.preventDefault()
  event.stopPropagation()
  handled()
}

function collapseAll() {
  expanded.clear()
  cursor.value = props.project
}
</script>

<template>
  <nav id="lc-file-explorer" class="lc-explorer" :aria-label="t('explorer.title')">
    <header class="lc-explorer-header">
      <h2>{{ t('explorer.title') }}</h2>
      <div class="lc-explorer-actions">
        <button type="button" class="lc-icon-btn" :title="t('explorer.newFile')" :aria-label="t('explorer.newFile')" @click="startDraft('file')">
          <LcIcon name="new-file" />
        </button>
        <button type="button" class="lc-icon-btn" :title="t('explorer.newFolder')" :aria-label="t('explorer.newFolder')" @click="startDraft('folder')">
          <LcIcon name="new-folder" />
        </button>
        <button type="button" class="lc-icon-btn" :title="t('explorer.collapse')" :aria-label="t('explorer.collapse')" @click="collapseAll">
          <LcIcon name="collapse-all" />
        </button>
      </div>
    </header>
    <div ref="tree" class="lc-tree" role="tree" :aria-label="t('explorer.title')" @keydown="onKeydown">
      <template v-for="{ node, depth, draft: isDraft } in rows" :key="isDraft ? '\u0000draft' : node.key">
      <div v-if="isDraft" class="lc-tree-row is-draft" :style="{ '--depth': depth }" role="none">
        <span v-for="level in depth" :key="level" class="lc-tree-guide" aria-hidden="true" />
        <span class="lc-tree-twisty" aria-hidden="true" />
        <LcIcon class="lc-tree-icon" :class="{ 'is-file': draft.kind === 'file' }" :name="draft.kind === 'file' ? 'file-code' : 'folder'" />
        <div class="lc-draft">
          <input
            v-model="draft.name"
            class="lc-draft-input"
            :class="{ 'is-invalid': draft.error }"
            type="text"
            spellcheck="false"
            autocomplete="off"
            :aria-label="draft.kind === 'file' ? t('explorer.fileName') : t('explorer.folderName')"
            :placeholder="draft.kind === 'file'
              ? t('explorer.filePlaceholder', { extension: projectById.get(draft.project)?.extensions?.[0] ?? '' })
              : t('explorer.folderPlaceholder')"
            :aria-invalid="Boolean(draft.error)"
            :aria-describedby="draft.error ? 'lc-draft-message' : undefined"
            @input="validateDraft"
            @keydown="onDraftKeydown"
            @blur="onDraftBlur"
          >
          <p v-if="draft.error" id="lc-draft-message" class="lc-draft-message" role="alert">{{ draft.error }}</p>
        </div>
      </div>
      <div
        v-else
        :key="node.key"
        :data-key="node.key"
        role="treeitem"
        class="lc-tree-row"
        :class="{
          'is-root': depth === 0,
          'is-current': node.key === currentKey,
          'is-disabled': isDisabled(node),
          'is-renaming': renaming?.key === node.key,
        }"
        :style="{ '--depth': depth }"
        :tabindex="node.key === activeKey ? 0 : -1"
        :aria-level="depth + 1"
        :aria-expanded="node.children ? expanded.has(node.key) : undefined"
        :aria-selected="node.key === currentKey"
        :aria-disabled="isDisabled(node) || undefined"
        :title="node.file ? `${node.file}${isDisabled(node) ? `\n${t('quick.busy')}` : ''}` : node.label"
        @click="activate(node)"
        @focus="cursor = node.key"
      >
        <span v-for="level in depth" :key="level" class="lc-tree-guide" aria-hidden="true" />
        <LcIcon
          v-if="node.children"
          class="lc-tree-twisty"
          :name="expanded.has(node.key) ? 'chevron-down' : 'chevron-right'"
        />
        <span v-else class="lc-tree-twisty" aria-hidden="true" />
        <LcIcon
          class="lc-tree-icon"
          :class="{ 'is-file': node.file }"
          :name="node.file ? 'file-code' : expanded.has(node.key) ? 'folder-opened' : 'folder'"
        />
        <div v-if="renaming?.key === node.key" class="lc-draft" @click.stop>
          <input
            v-model="renaming.name"
            class="lc-draft-input lc-rename-input"
            :class="{ 'is-invalid': renaming.error }"
            type="text"
            spellcheck="false"
            autocomplete="off"
            :aria-label="t('explorer.renameLabel', { name: node.label })"
            :aria-invalid="Boolean(renaming.error)"
            :aria-describedby="renaming.error ? 'lc-rename-message' : undefined"
            @input="validateRename"
            @keydown="onRenameKeydown"
            @blur="onRenameBlur"
          >
          <p v-if="renaming.error" id="lc-rename-message" class="lc-draft-message" role="alert">{{ renaming.error }}</p>
        </div>
        <span v-else class="lc-tree-label">{{ node.label }}</span>
        <span v-if="node.modified" class="lc-tree-modified" :title="t('tabs.modified')">
          <span class="lc-sr-only">{{ t('tabs.modified') }}</span>
        </span>
        <span v-else-if="node.file && node.created && renaming?.key !== node.key" class="lc-tree-created" :title="t('explorer.created')">
          {{ t('explorer.created') }}
        </span>
        <button
          v-if="canRename(node) && renaming?.key !== node.key"
          type="button"
          class="lc-tree-action"
          tabindex="-1"
          :title="`${t('explorer.rename')} (F2)`"
          :aria-label="`${t('explorer.rename')} ${node.label}`"
          @click.stop="startRename(node)"
        >
          <LcIcon name="edit" />
        </button>
        <button
          v-if="canDelete(node) && renaming?.key !== node.key"
          type="button"
          class="lc-tree-action"
          tabindex="-1"
          :title="t('explorer.delete')"
          :aria-label="`${t('explorer.delete')} ${node.label}`"
          @click.stop="remove(node)"
        >
          <LcIcon name="trash" />
        </button>
      </div>
      </template>
    </div>
  </nav>
</template>

<style scoped>
.lc-explorer {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--lc-chrome);
  border-right: 1px solid var(--lc-border);
}

.lc-explorer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: none;
  height: 36px;
  padding: 0 4px 0 12px;
}

.lc-explorer-header h2 {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--lc-text-2);
}

.lc-explorer-actions { display: flex; gap: 2px; opacity: 0; transition: opacity 120ms; }
.lc-explorer-header .lc-icon-btn { width: 24px; height: 24px; }
.lc-explorer:hover .lc-explorer-actions,
.lc-explorer:focus-within .lc-explorer-actions { opacity: 1; }

.lc-tree {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 0 6px 10px;
}

.lc-tree-row {
  display: flex;
  align-items: center;
  height: 26px;
  padding-right: 8px;
  border-radius: 5px;
  color: var(--lc-text-2);
  font-size: 13px;
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
}

.lc-tree-row:hover { background: var(--lc-hover); color: var(--lc-text); }
.lc-tree-row:focus-visible { outline: 2px solid var(--lc-accent); outline-offset: -2px; }
.lc-tree-row.is-root { color: var(--lc-text); font-weight: 600; }

.lc-tree-row.is-current {
  background: var(--lc-accent-soft);
  color: var(--lc-text);
}

.lc-tree-row.is-disabled { opacity: 0.45; cursor: not-allowed; }

.lc-tree-guide {
  flex: none;
  align-self: stretch;
  width: 12px;
  margin-left: 7px;
  border-left: 1px solid var(--lc-border);
}

.lc-tree-row:first-child .lc-tree-guide { border-color: transparent; }

.lc-tree-twisty {
  width: 16px;
  margin-left: 2px;
  color: var(--lc-text-3);
}

.lc-tree-icon {
  margin: 0 6px 0 2px;
  color: var(--lc-text-3);
}

.lc-tree-icon.is-file { color: var(--lc-accent); }

.lc-tree-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lc-tree-modified {
  flex: none;
  width: 7px;
  height: 7px;
  margin-left: 6px;
  border-radius: 50%;
  background: var(--lc-warning);
}

.lc-tree-created {
  flex: none;
  margin-left: 6px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--lc-success);
}

.lc-tree-action {
  display: none;
  flex: none;
  place-items: center;
  width: 20px;
  height: 20px;
  margin: 0 -4px 0 4px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--lc-text-3);
  cursor: pointer;
}

.lc-tree-row:hover .lc-tree-action,
.lc-tree-row:focus-visible .lc-tree-action { display: grid; }
.lc-tree-action:hover { background: var(--lc-hover); color: var(--lc-danger); }

.lc-tree-row.is-renaming { height: auto; min-height: 26px; align-items: flex-start; padding-top: 2px; }
.lc-tree-row.is-renaming .lc-tree-twisty,
.lc-tree-row.is-renaming .lc-tree-icon { margin-top: 3px; }
.lc-tree-row.is-draft { height: auto; min-height: 26px; align-items: flex-start; padding-top: 2px; cursor: default; }
.lc-tree-row.is-draft:hover { background: transparent; }
.lc-tree-row.is-draft .lc-tree-twisty,
.lc-tree-row.is-draft .lc-tree-icon { margin-top: 3px; }

.lc-draft { flex: 1; min-width: 0; position: relative; }

.lc-draft-input {
  box-sizing: border-box;
  width: 100%;
  height: 22px;
  padding: 0 6px;
  border: 1px solid var(--lc-accent);
  border-radius: 4px;
  outline: none;
  background: var(--lc-bg);
  color: var(--lc-text);
  font: inherit;
  font-size: 13px;
}

.lc-draft-input.is-invalid { border-color: var(--lc-danger); }

.lc-draft-message {
  margin: 4px 0 6px;
  font-size: 11px;
  line-height: 1.4;
  white-space: normal;
  color: var(--lc-danger);
}

.lc-draft-input::placeholder { color: var(--lc-text-3); }
</style>
