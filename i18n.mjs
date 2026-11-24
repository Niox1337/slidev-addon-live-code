import { computed, ref } from 'vue'
import { normaliseLocale, translate } from './messages.mjs'

export const browserLocale = normaliseLocale(globalThis.navigator?.language) ?? 'en'
export const serverLocale = ref(null)
export const locale = computed(() => serverLocale.value ?? browserLocale)
export const isMac = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? '')
export const keys = {
  run: isMac ? '⌘↩' : 'Ctrl+Enter',
  stop: isMac ? '⌘.' : 'Ctrl+.',
  open: isMac ? '⌘P' : 'Ctrl+P',
  explorer: isMac ? '⌘B' : 'Ctrl+B',
  panel: isMac ? '⌘J' : 'Ctrl+J',
  save: isMac ? '⌘S' : 'Ctrl+S',
  terminal: 'Ctrl+`',
}

export function t(key, params) {
  return translate(locale.value, key, params)
}
