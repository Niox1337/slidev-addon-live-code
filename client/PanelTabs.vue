<script setup>
import LcIcon from './LcIcon.vue'
import { keys, t } from './i18n.mjs'

defineProps({
  modelValue: { type: String, required: true },
})
const emit = defineEmits(['update:modelValue'])

const tabs = [
  { id: 'output', icon: 'output', label: () => t('output.title'), hint: () => '' },
  { id: 'terminal', icon: 'terminal', label: () => t('terminal.title'), hint: () => ` (${keys.terminal})` },
]

function move(event, index) {
  const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]
  emit('update:modelValue', next.id)
  event.currentTarget.parentElement.querySelector(`[data-tab="${next.id}"]`)?.focus()
}
</script>

<template>
  <div class="lc-panel-tabs" role="tablist" :aria-label="t('panel.tabs')">
    <button
      v-for="(tab, index) in tabs"
      :key="tab.id"
      type="button"
      role="tab"
      class="lc-panel-tab"
      :data-tab="tab.id"
      :aria-selected="modelValue === tab.id"
      :tabindex="modelValue === tab.id ? 0 : -1"
      :title="`${tab.label()}${tab.hint()}`"
      :aria-label="tab.label()"
      @click="emit('update:modelValue', tab.id)"
      @keydown.left.right.stop.prevent="move($event, index)"
    >
      <LcIcon :name="tab.icon" />
      <span class="lc-panel-tab-label">{{ tab.label() }}</span>
    </button>
  </div>
</template>

<style scoped>
.lc-panel-tabs {
  display: flex;
  flex: none;
  align-self: stretch;
  gap: 2px;
  margin-left: -6px;
}

.lc-panel-tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  border: 0;
  background: none;
  color: var(--lc-text-3);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.lc-panel-tab:hover { color: var(--lc-text-2); }

.lc-panel-tab[aria-selected="true"] { color: var(--lc-text); }

.lc-panel-tab[aria-selected="true"]::after {
  content: "";
  position: absolute;
  right: 8px;
  bottom: -1px;
  left: 8px;
  height: 2px;
  border-radius: 2px 2px 0 0;
  background: var(--lc-accent);
}

.lc-panel-tab:focus-visible {
  outline: 2px solid var(--lc-accent);
  outline-offset: -4px;
  border-radius: var(--lc-radius);
}

.lc-panel-tab .lc-icon { color: inherit; }

@container lc-panel (max-width: 260px) {
  .lc-panel-tab-label { display: none; }
}
</style>
