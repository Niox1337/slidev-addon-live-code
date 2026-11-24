<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import LcIcon from './LcIcon.vue'
import { t } from './i18n.mjs'

const props = defineProps({
  projects: { type: Array, required: true },
  project: { type: String, required: true },
  busy: Boolean,
  recent: { type: Array, default: () => [] },
})
const emit = defineEmits(['select'])
const open = ref(false)
const search = ref()
const list = ref()
const query = ref('')
const active = ref(0)
let returnFocus

function score(word, text) {
  const lower = text.toLowerCase()
  const indices = []
  let total = 0
  let previous = -2
  let position = 0
  for (let index = 0; index < lower.length && position < word.length; index += 1) {
    if (lower[index] !== word[position]) continue
    indices.push(index)
    total += index === previous + 1 ? 5 : 1
    if (index === 0 || /[\s/._-]/.test(lower[index - 1]) || /[A-Z]/.test(text[index])) total += 3
    previous = index
    position += 1
  }
  return position === word.length ? { total, indices } : null
}

const items = computed(() => props.projects
  .filter(project => !props.busy || project.id === props.project)
  .flatMap(({ id, label, files }) => files.map(file => ({
    id: `${id}/${file}`,
    project: id,
    file,
    name: file.split('/').at(-1),
    path: `${label} / ${file}`,
  }))))

const results = computed(() => {
  const words = query.value.toLowerCase().trim().split(/\s+/).filter(Boolean)
  if (!words.length) {
    const order = new Map(props.recent.map((id, index) => [id, index]))
    return items.value
      .map(item => ({ ...item, nameHits: [], pathHits: [], recent: order.has(item.id) }))
      .sort((first, second) => (order.get(first.id) ?? Infinity) - (order.get(second.id) ?? Infinity)
        || first.path.localeCompare(second.path, undefined, { numeric: true }))
  }
  const found = []
  for (const item of items.value) {
    let total = 0
    const nameHits = new Set()
    const pathHits = new Set()
    let matched = true
    for (const word of words) {
      const byName = score(word, item.name)
      if (byName) {
        total += byName.total * 2
        byName.indices.forEach(index => nameHits.add(index))
        continue
      }
      const byPath = score(word, item.path)
      if (!byPath) {
        matched = false
        break
      }
      total += byPath.total
      byPath.indices.forEach(index => pathHits.add(index))
    }
    if (matched) found.push({ ...item, total, nameHits: [...nameHits], pathHits: [...pathHits], recent: false })
  }
  return found.sort((first, second) => second.total - first.total || first.path.localeCompare(second.path))
})

const recentCount = computed(() => results.value.filter(item => item.recent).length)

function segments(text, hits) {
  if (!hits.length) return [{ text, hit: false }]
  const set = new Set(hits)
  const parts = []
  for (const [index, char] of [...text].entries()) {
    const hit = set.has(index)
    const last = parts.at(-1)
    if (last?.hit === hit) last.text += char
    else parts.push({ text: char, hit })
  }
  return parts
}

watch(query, () => { active.value = 0 })

async function show() {
  if (open.value) return
  returnFocus = document.activeElement
  query.value = ''
  active.value = 0
  open.value = true
  await nextTick()
  search.value?.focus()
}

function close(restore = true) {
  if (!open.value) return
  open.value = false
  if (restore) returnFocus?.focus?.()
}

function choose(item) {
  if (!item) return
  close(false)
  emit('select', { project: item.project, file: item.file })
}

async function move(direction) {
  const count = results.value.length
  if (!count) return
  active.value = (active.value + direction + count) % count
  await nextTick()
  list.value?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
}

function onKeydown(event) {
  event.stopPropagation()
  if (event.key === 'ArrowDown') move(1)
  else if (event.key === 'ArrowUp') move(-1)
  else if (event.key === 'Enter') choose(results.value[active.value])
  else if (event.key === 'Escape') close()
  else return
  event.preventDefault()
}

defineExpose({ show, close, isOpen: () => open.value })
</script>

<template>
  <Transition name="lc-quick">
    <div v-if="open" class="lc-quick-scrim" @pointerdown.self="close()">
      <div class="lc-quick" role="dialog" :aria-label="t('quick.label')">
        <div class="lc-quick-search">
          <LcIcon name="search" />
          <input
            ref="search"
            v-model="query"
            role="combobox"
            :aria-label="t('quick.placeholder')"
            aria-controls="lc-quick-results"
            aria-expanded="true"
            aria-autocomplete="list"
            :aria-activedescendant="results.length ? `lc-quick-${active}` : undefined"
            :placeholder="t('quick.placeholder')"
            autocomplete="off"
            spellcheck="false"
            @keydown="onKeydown"
          >
        </div>
        <div id="lc-quick-results" ref="list" class="lc-quick-results" role="listbox" :aria-label="t('quick.results')">
          <template v-for="(item, index) in results" :key="item.id">
            <div v-if="!query.trim() && recentCount && (index === 0 || index === recentCount)" class="lc-quick-group" role="presentation">
              {{ index === 0 ? t('quick.recent') : t('quick.all') }}
            </div>
            <div
              :id="`lc-quick-${index}`"
              class="lc-quick-item"
              role="option"
              :aria-selected="index === active"
              @pointermove="active = index"
              @click="choose(item)"
            >
              <LcIcon name="file-code" />
              <span class="lc-quick-name"><template v-for="(part, partIndex) in segments(item.name, item.nameHits)" :key="partIndex"><mark v-if="part.hit">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template></span>
              <span class="lc-quick-path"><template v-for="(part, partIndex) in segments(item.path, item.pathHits)" :key="partIndex"><mark v-if="part.hit">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template></span>
            </div>
          </template>
          <p v-if="!results.length" class="lc-quick-empty" role="status">{{ t('quick.empty') }}</p>
        </div>
        <footer class="lc-quick-footer">
          <span><kbd class="lc-kbd">↑</kbd><kbd class="lc-kbd">↓</kbd> {{ t('quick.navigate') }}</span>
          <span><kbd class="lc-kbd">↩</kbd> {{ t('quick.open') }}</span>
          <span><kbd class="lc-kbd">Esc</kbd> {{ t('quick.close') }}</span>
          <span v-if="busy" class="lc-quick-busy">{{ t('quick.busy') }}</span>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.lc-quick-scrim {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 52px 16px 16px;
  background: rgb(10 14 22 / 0.18);
}

.lc-quick {
  display: flex;
  flex-direction: column;
  width: min(560px, 100%);
  max-height: min(460px, 100%);
  overflow: hidden;
  border: 1px solid var(--lc-border-strong);
  border-radius: var(--lc-radius-lg);
  background: var(--lc-bg);
  box-shadow: var(--lc-shadow-pop);
}

.lc-quick-search {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
  height: 46px;
  padding: 0 14px;
  border-bottom: 1px solid var(--lc-border);
  color: var(--lc-text-3);
}

.lc-quick-search input {
  flex: 1;
  min-width: 0;
  height: 100%;
  border: 0;
  outline: none;
  background: none;
  color: var(--lc-text);
  font-size: 14px;
}

.lc-quick-search input::placeholder { color: var(--lc-text-3); }

.lc-quick-results {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 6px;
}

.lc-quick-group {
  padding: 8px 8px 4px;
  color: var(--lc-text-3);
  font-size: 11px;
  font-weight: 600;
}

.lc-quick-item {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 8px;
  border-radius: var(--lc-radius);
  white-space: nowrap;
  cursor: pointer;
}

.lc-quick-item .lc-icon { color: var(--lc-accent); }
.lc-quick-item[aria-selected="true"] { background: var(--lc-accent-soft); }

.lc-quick-name {
  flex: none;
  max-width: 55%;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 500;
  color: var(--lc-text);
}

.lc-quick-path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--lc-text-3);
  font-size: 12px;
}

.lc-quick-item mark {
  background: none;
  color: var(--lc-accent);
  font-weight: 700;
}

.lc-quick-empty {
  margin: 0;
  padding: 18px 10px;
  color: var(--lc-text-3);
  text-align: center;
}

.lc-quick-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 14px;
  flex: none;
  padding: 8px 14px;
  border-top: 1px solid var(--lc-border);
  background: var(--lc-chrome);
  color: var(--lc-text-3);
  font-size: 11px;
}

.lc-quick-footer span { display: inline-flex; align-items: center; gap: 3px; }
.lc-quick-busy { margin-left: auto; color: var(--lc-warning); }

.lc-quick-enter-active { transition: opacity 140ms var(--lc-ease); }
.lc-quick-enter-active .lc-quick { transition: transform 180ms var(--lc-ease), opacity 140ms var(--lc-ease); }
.lc-quick-leave-active { transition: opacity 90ms; }
.lc-quick-enter-from { opacity: 0; }
.lc-quick-enter-from .lc-quick { transform: translateY(-6px) scale(0.985); opacity: 0; }
.lc-quick-leave-to { opacity: 0; }
</style>
