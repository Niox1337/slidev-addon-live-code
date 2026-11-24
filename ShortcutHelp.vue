<script setup>
import { computed, nextTick, ref } from 'vue'
import LcIcon from './LcIcon.vue'
import { isMac, keys, t } from './i18n.mjs'

const open = ref(false)
const dialog = ref()
let returnFocus

const groups = computed(() => [
  {
    title: t('help.groupRun'),
    items: [
      [keys.run, t('help.run')],
      [keys.stop, t('help.stop')],
    ],
  },
  {
    title: t('help.groupNavigate'),
    items: [
      [keys.open, t('help.open')],
      [keys.explorer, t('help.explorer')],
      [keys.panel, t('help.panel')],
      [keys.terminal, t('help.terminal')],
    ],
  },
  {
    title: t('help.groupEdit'),
    items: [
      [keys.save, t('help.save')],
      [isMac ? '⌘F' : 'Ctrl+F', t('help.find')],
      [isMac ? '⌘Z' : 'Ctrl+Z', t('help.undo')],
      ['F2', t('help.rename')],
      [isMac ? '⌘⌫' : 'Delete', t('help.delete')],
    ],
  },
  {
    title: t('help.groupTerminal'),
    items: [
      [keys.terminalSearch, t('help.terminalSearch')],
      ['Ctrl+C', t('help.interrupt')],
    ],
  },
  {
    title: t('help.groupGeneral'),
    items: [
      [keys.help, t('help.help')],
      ['Esc', t('help.escape')],
    ],
  },
])

async function show() {
  if (open.value) return
  returnFocus = document.activeElement
  open.value = true
  await nextTick()
  dialog.value?.focus()
}

function close() {
  if (!open.value) return
  open.value = false
  returnFocus?.focus?.()
}

function toggle() {
  if (open.value) close()
  else show()
}

defineExpose({ show, close, toggle, isOpen: () => open.value })
</script>

<template>
  <Transition name="lc-help">
    <div v-if="open" class="lc-help-scrim" @pointerdown.self="close">
      <div
        ref="dialog"
        class="lc-help"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lc-help-title"
        tabindex="-1"
        @keydown.esc.stop.prevent="close"
      >
        <header class="lc-help-header">
          <LcIcon name="keyboard" />
          <h2 id="lc-help-title">{{ t('help.title') }}</h2>
          <button type="button" class="lc-icon-btn" :title="t('help.close')" :aria-label="t('help.close')" @click="close">
            <LcIcon name="close" />
          </button>
        </header>
        <div class="lc-help-body">
          <section v-for="group in groups" :key="group.title" class="lc-help-group">
            <h3>{{ group.title }}</h3>
            <dl>
              <div v-for="[key, label] in group.items" :key="label" class="lc-help-row">
                <dt>{{ label }}</dt>
                <dd><kbd class="lc-kbd">{{ key }}</kbd></dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.lc-help-scrim {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 52px 16px 16px;
  background: rgb(10 14 22 / 0.18);
}

.lc-help {
  display: flex;
  flex-direction: column;
  width: min(620px, 100%);
  max-height: 100%;
  overflow: hidden;
  border: 1px solid var(--lc-border-strong);
  border-radius: var(--lc-radius-lg);
  background: var(--lc-bg);
  box-shadow: var(--lc-shadow-pop);
  outline: none;
}

.lc-help-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
  height: 44px;
  padding: 0 8px 0 14px;
  border-bottom: 1px solid var(--lc-border);
  color: var(--lc-text-3);
}

.lc-help-header h2 {
  flex: 1;
  margin: 0;
  color: var(--lc-text);
  font-size: 13px;
  font-weight: 600;
}

.lc-help-body {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 6px 24px;
  overflow: auto;
  padding: 10px 16px 16px;
}

.lc-help-group h3 {
  margin: 8px 0 4px;
  color: var(--lc-text-3);
  font-size: 11px;
  font-weight: 600;
}

.lc-help-group dl { margin: 0; }

.lc-help-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 28px;
  border-bottom: 1px solid var(--lc-border);
}

.lc-help-row:last-child { border-bottom: 0; }

.lc-help-row dt {
  color: var(--lc-text);
  font-size: 12px;
}

.lc-help-row dd {
  flex: none;
  margin: 0;
}

.lc-help-enter-active { transition: opacity 140ms var(--lc-ease); }
.lc-help-enter-active .lc-help { transition: transform 180ms var(--lc-ease), opacity 140ms var(--lc-ease); }
.lc-help-leave-active { transition: opacity 90ms; }
.lc-help-enter-from { opacity: 0; }
.lc-help-enter-from .lc-help { transform: translateY(-6px) scale(0.985); opacity: 0; }
.lc-help-leave-to { opacity: 0; }

@media (prefers-reduced-motion: reduce) {
  .lc-help-enter-active, .lc-help-enter-active .lc-help, .lc-help-leave-active { transition: none; }
}
</style>
