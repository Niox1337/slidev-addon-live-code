<script setup>
import { computed } from 'vue'

const glyphs = {
  'add': 0xEA60,
  'arrow-right': 0xEA9C,
  'book': 0xEAA4,
  'check': 0xEAB2,
  'chevron-down': 0xEAB4,
  'chevron-left': 0xEAB5,
  'chevron-right': 0xEAB6,
  'circle-filled': 0xEA71,
  'clear-all': 0xEABF,
  'close': 0xEA76,
  'code': 0xEAC4,
  'collapse-all': 0xEAC5,
  'debug-restart': 0xEAD2,
  'debug-stop': 0xEAD7,
  'discard': 0xEAE2,
  'edit': 0xEA73,
  'error': 0xEA87,
  'file-code': 0xEAE9,
  'folder': 0xEA83,
  'folder-opened': 0xEAF7,
  'info': 0xEA74,
  'layout-panel': 0xEBF2,
  'layout-panel-off': 0xEC01,
  'layout-sidebar-left': 0xEBF3,
  'layout-sidebar-left-off': 0xEC02,
  'loading': 0xEB19,
  'new-file': 0xEA7F,
  'new-folder': 0xEA80,
  'output': 0xEB9D,
  'lock': 0xEA75,
  'pass-filled': 0xEBB3,
  'play': 0xEB2C,
  'remove': 0xEB3B,
  'search': 0xEA6D,
  'trash': 0xEA81,
  'target': 0xEBF8,
  'terminal': 0xEA85,
  'warning': 0xEA6C,
}

const props = defineProps({
  name: { type: String, required: true },
  spin: Boolean,
})
const glyph = computed(() => String.fromCodePoint(glyphs[props.name] ?? glyphs.info))
</script>

<template>
  <span class="lc-icon" :class="{ 'lc-icon-spin': spin }" aria-hidden="true">{{ glyph }}</span>
</template>
