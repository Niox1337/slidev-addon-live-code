<script setup>
import MarkdownExit from 'markdown-exit'
import { computed, nextTick, ref, watch } from 'vue'
import LcIcon from './LcIcon.vue'
import { isMac, t } from './i18n.mjs'

const props = defineProps({
  text: { type: String, required: true },
  draft: { type: String, default: null },
  saving: Boolean,
  steps: { type: Array, default: () => [] },
  step: { type: Object, default: null },
  canLocate: Boolean,
  currentSlide: { type: Number, default: 0 },
})
const emit = defineEmits(['edit', 'update:draft', 'save', 'cancel', 'select-step', 'locate', 'go-slide'])
const markdown = new MarkdownExit({ html: false })
const rendered = computed(() => markdown.render(props.text))
const index = computed(() => props.steps.findIndex(step => step.id === props.step?.id))
const editing = computed(() => props.draft !== null)
const dirty = computed(() => editing.value && props.draft !== props.text)
const reader = ref()
const editor = ref()
const location = computed(() => props.step && `${props.step.file.split('/').at(-1)}:${props.step.line}`)

watch(() => props.step?.id, async () => {
  await nextTick()
  if (reader.value) reader.value.scrollTop = 0
})

watch(editing, async open => {
  if (!open) return
  await nextTick()
  editor.value?.focus()
})

function editorKeydown(event) {
  event.stopPropagation()
  if ((isMac ? event.metaKey : event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    if (!props.saving) emit('save')
  }
  else if (event.key === 'Escape') {
    event.preventDefault()
    emit('cancel')
  }
}

function moveStep(offset) {
  const target = props.steps[index.value + offset]
  if (target) emit('select-step', target.id)
}
</script>

<template>
  <section class="lc-notes" :aria-label="t('notes.title')">
    <header class="lc-notes-header">
      <h2 class="lc-notes-title">
        <LcIcon name="book" />
        {{ t('notes.title') }}
      </h2>
      <span class="lc-notes-private" :title="t('notes.private')">
        <LcIcon name="lock" />
        {{ t('notes.private') }}
      </span>
      <div class="lc-notes-actions">
        <template v-if="editing">
          <span v-if="dirty" class="lc-notes-dirty">{{ t('notes.unsaved') }}</span>
          <button type="button" class="lc-btn" :disabled="saving" @click="emit('cancel')">{{ t('notes.cancel') }}</button>
          <button type="button" class="lc-btn lc-btn-primary" :disabled="saving || !dirty" @click="emit('save')">
            {{ saving ? t('notes.saving') : t('notes.save') }}
          </button>
        </template>
        <button
          v-else
          type="button"
          class="lc-icon-btn"
          :title="t('notes.edit')"
          :aria-label="t('notes.edit')"
          @click="emit('edit')"
        >
          <LcIcon name="edit" />
        </button>
      </div>
    </header>

    <div v-if="steps.length" class="lc-steps" role="group" :aria-label="t('steps.label')">
      <button type="button" class="lc-icon-btn" :disabled="index < 1" :title="t('steps.previous')" :aria-label="t('steps.previous')" @click="moveStep(-1)">
        <LcIcon name="chevron-left" />
      </button>
      <label class="lc-steps-select">
        <span v-if="index >= 0" class="lc-steps-progress">{{ t('steps.progress', { index: index + 1, total: steps.length }) }}</span>
        <select :aria-label="t('steps.label')" :value="step?.id ?? ''" @keydown.stop @change="emit('select-step', $event.target.value)">
          <option value="">{{ t('steps.project') }}</option>
          <option v-for="item in steps" :key="item.id" :value="item.id">{{ item.label }}</option>
        </select>
        <LcIcon name="chevron-down" class="lc-steps-caret" />
      </label>
      <button
        type="button"
        class="lc-icon-btn"
        :disabled="index >= steps.length - 1"
        :title="t('steps.next')"
        :aria-label="t('steps.next')"
        @click="moveStep(1)"
      >
        <LcIcon name="chevron-right" />
      </button>
    </div>

    <div v-if="step" class="lc-step-actions">
      <button
        type="button"
        class="lc-step-location"
        :disabled="!canLocate"
        :title="t('steps.locateTitle', { location })"
        @click="emit('locate')"
      >
        <LcIcon name="target" />
        <span>{{ t('steps.locate') }}</span>
        <code>{{ location }}</code>
      </button>
      <button type="button" class="lc-btn" :disabled="step.nextSlide === currentSlide" @click="emit('go-slide', step.nextSlide)">
        {{ t('steps.goSlide', { slide: step.nextSlide }) }}
        <LcIcon name="arrow-right" />
      </button>
    </div>

    <textarea
      v-if="editing"
      ref="editor"
      class="lc-notes-editor"
      :aria-label="t('notes.editorLabel')"
      :placeholder="t('notes.placeholder')"
      :value="draft"
      :disabled="saving"
      maxlength="40000"
      spellcheck="false"
      @keydown="editorKeydown"
      @input="emit('update:draft', $event.target.value)"
    />
    <div v-else-if="text.trim()" ref="reader" class="lc-notes-body" v-html="rendered" />
    <div v-else class="lc-notes-empty">
      <p>{{ t('notes.empty') }}</p>
      <button type="button" class="lc-btn" @click="emit('edit')">
        <LcIcon name="add" />
        {{ t('notes.emptyAction') }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.lc-notes {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  height: 100%;
  background: var(--lc-bg);
  container-type: inline-size;
}

.lc-notes-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
  height: 36px;
  padding: 0 6px 0 12px;
  border-bottom: 1px solid var(--lc-border);
}

.lc-notes-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.lc-notes-title .lc-icon { color: var(--lc-text-3); }

.lc-notes-private {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--lc-text-3);
  font-size: 11px;
  white-space: nowrap;
}

.lc-notes-private .lc-icon { width: 12px; font-size: 12px; }

.lc-notes-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}

.lc-notes-actions .lc-btn { height: 24px; padding: 0 9px; font-size: 12px; }

.lc-notes-dirty {
  color: var(--lc-warning);
  font-size: 11px;
  white-space: nowrap;
}

.lc-steps {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: none;
  padding: 8px 8px 0;
}

.lc-steps-select {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  height: 28px;
  border: 1px solid var(--lc-border-strong);
  border-radius: var(--lc-radius);
  background: var(--lc-bg);
  transition: border-color 120ms;
}

.lc-steps-select:hover { border-color: var(--lc-text-3); }
.lc-steps-select:focus-within { border-color: var(--lc-accent); box-shadow: 0 0 0 3px var(--lc-accent-soft); }

.lc-steps-progress {
  flex: none;
  padding: 0 2px 0 9px;
  color: var(--lc-text-3);
  font-size: 11px;
  font-weight: 600;
}

.lc-steps-select select {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0 26px 0 6px;
  border: 0;
  outline: none;
  background: none;
  appearance: none;
  font-size: 12px;
  font-weight: 500;
  text-overflow: ellipsis;
  cursor: pointer;
}

.lc-steps-caret {
  position: absolute;
  right: 6px;
  color: var(--lc-text-3);
  pointer-events: none;
}

.lc-step-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex: none;
  padding: 8px 8px 0;
}

.lc-step-actions .lc-btn { height: 28px; font-size: 12px; }
.lc-step-actions .lc-btn .lc-icon { width: 14px; font-size: 14px; }

.lc-step-location {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 1 1 auto;
  min-width: 0;
  height: 28px;
  padding: 0 10px;
  border-radius: var(--lc-radius);
  background: var(--lc-accent-soft);
  color: var(--lc-accent);
  font-size: 12px;
  font-weight: 600;
  transition: background-color 120ms;
}

.lc-step-location:hover:not(:disabled) { background: color-mix(in srgb, var(--lc-accent) 18%, transparent); }
.lc-step-location:disabled { opacity: 0.5; }

.lc-step-location code {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: 500 12px var(--lc-mono);
  opacity: 0.85;
}

.lc-notes-body,
.lc-notes-editor,
.lc-notes-empty {
  flex: 1;
  min-height: 0;
  min-width: 0;
}

.lc-notes-body {
  overflow: auto;
  padding: 10px 14px 14px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--lc-text);
}

.lc-notes-editor {
  margin: 8px;
  padding: 10px 12px;
  resize: none;
  border: 1px solid var(--lc-border-strong);
  border-radius: var(--lc-radius);
  outline: none;
  background: var(--lc-bg);
  font: 13px/1.6 var(--lc-mono);
  transition: border-color 120ms, box-shadow 120ms;
}

.lc-notes-editor:focus { border-color: var(--lc-accent); box-shadow: 0 0 0 3px var(--lc-accent-soft); }
.lc-notes-editor::placeholder { color: var(--lc-text-3); font-family: var(--lc-font); }

.lc-notes-empty {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 14px;
}

.lc-notes-empty p { margin: 0; color: var(--lc-text-3); font-size: 12px; }
.lc-notes-empty .lc-btn { height: 26px; font-size: 12px; }

.lc-notes-body :deep(> :first-child) { margin-top: 0; }
.lc-notes-body :deep(p) { margin: 0 0 8px; }
.lc-notes-body :deep(h1),
.lc-notes-body :deep(h2),
.lc-notes-body :deep(h3) { margin: 14px 0 6px; font-size: 13px; font-weight: 650; }
.lc-notes-body :deep(ol),
.lc-notes-body :deep(ul) { margin: 0 0 8px; padding-left: 1.3em; }
.lc-notes-body :deep(ol) { list-style: decimal; }
.lc-notes-body :deep(ul) { list-style: disc; }
.lc-notes-body :deep(li + li) { margin-top: 2px; }
.lc-notes-body :deep(strong) { font-weight: 650; }
.lc-notes-body :deep(:not(pre) > code) {
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--lc-chrome-2);
  font: 12px var(--lc-mono);
}
.lc-notes-body :deep(pre) {
  margin: 8px 0;
  padding: 10px 12px;
  overflow-x: auto;
  border: 1px solid var(--lc-border);
  border-radius: var(--lc-radius);
  background: var(--lc-chrome);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font: 12.5px/1.55 var(--lc-mono);
}
.lc-notes-body :deep(pre code) { white-space: inherit; overflow-wrap: inherit; background: none; padding: 0; }

@container (max-width: 300px) {
  .lc-notes-private { display: none; }
}
</style>
