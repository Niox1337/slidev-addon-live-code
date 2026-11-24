<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import LcIcon from './LcIcon.vue'
import { sourceLocation } from './file-language.mjs'
import { keys, t } from './i18n.mjs'

const props = defineProps({
  output: { type: Array, default: () => [] },
  phase: { type: String, default: 'ready' },
  exitCode: { type: Number, default: null },
  duration: { type: Number, default: null },
  interactive: Boolean,
  awaitingInput: Boolean,
  audience: Boolean,
  zoom: { type: Number, default: 1 },
  resolveLocation: { type: Function, default: null },
  submit: { type: Function, default: null },
})
const emit = defineEmits(['clear', 'reveal'])
const body = ref()
const command = ref('')
const sending = ref(false)
const input = ref()

const tones = {
  ready: ['neutral', null],
  compiling: ['busy', 'loading'],
  running: ['busy', 'loading'],
  finished: ['success', 'pass-filled'],
  stopped: ['neutral', 'debug-stop'],
  'compile-error': ['danger', 'error'],
  error: ['danger', 'error'],
}
const tone = computed(() => tones[props.phase] ?? tones.ready)
const busy = computed(() => ['compiling', 'running'].includes(props.phase))
const meta = computed(() => {
  const parts = []
  if (props.duration !== null && !busy.value) {
    parts.push(props.duration < 1000 ? `${props.duration} ms` : `${(props.duration / 1000).toFixed(1)} s`)
  }
  if (props.exitCode !== null && props.exitCode !== 0) parts.push(t('output.exit', { code: props.exitCode }))
  return parts.join(' · ')
})

const pieces = computed(() => props.output.map(chunk => {
  if (props.audience || !props.resolveLocation || !['out', 'err'].includes(chunk.stream)) {
    return { stream: chunk.stream, parts: [{ text: chunk.text }] }
  }
  const parts = []
  let last = 0
  for (const match of chunk.text.matchAll(sourceLocation)) {
    const target = props.resolveLocation(match[1])
    if (!target) continue
    if (match.index > last) parts.push({ text: chunk.text.slice(last, match.index) })
    parts.push({ text: match[0], file: target, line: Number(match[2]) })
    last = match.index + match[0].length
  }
  if (last < chunk.text.length) parts.push({ text: chunk.text.slice(last) })
  return { stream: chunk.stream, parts }
}))

let stick = true
function trackScroll() {
  const element = body.value
  stick = element.scrollHeight - element.scrollTop - element.clientHeight < 24
}

watch(() => [props.output, props.output.at(-1)?.text.length], async () => {
  if (props.output.length === 0) stick = true
  await nextTick()
  if (stick && body.value) body.value.scrollTop = body.value.scrollHeight
}, { deep: false })

watch(() => props.awaitingInput, async waiting => {
  if (!waiting || props.audience) return
  await nextTick()
  input.value?.focus()
})

async function send() {
  const draft = command.value
  const line = draft.trim()
  if (!line || !props.awaitingInput || sending.value || !props.submit) return
  sending.value = true
  try {
    if (await props.submit(line) && command.value === draft) command.value = ''
  }
  finally {
    sending.value = false
  }
}
</script>

<template>
  <section class="lc-output" :class="{ 'is-audience': audience }" :style="{ '--lc-zoom': zoom }" :aria-label="t('output.title')">
    <header class="lc-output-header">
      <slot name="title">
        <h2 class="lc-output-title">
          <LcIcon v-if="!audience" name="output" />
          {{ t('output.title') }}
        </h2>
      </slot>
      <span v-if="phase !== 'ready'" class="lc-badge" :data-tone="tone[0]" role="status">
        <LcIcon v-if="tone[1]" :name="tone[1]" :spin="busy" />
        {{ t(`phase.${phase}`) }}
      </span>
      <span v-if="meta" class="lc-output-meta">{{ meta }}</span>
      <button
        v-if="!audience"
        type="button"
        class="lc-icon-btn lc-output-clear"
        :disabled="busy || (!output.length && phase === 'ready')"
        :title="t('output.clear')"
        :aria-label="t('output.clear')"
        @click="emit('clear')"
      >
        <LcIcon name="clear-all" />
      </button>
    </header>

    <div ref="body" class="lc-output-body" @scroll.passive="trackScroll">
      <pre v-if="output.length" class="lc-output-text" :class="{ 'is-waiting': awaitingInput }"><template v-for="(chunk, index) in pieces" :key="index"><span :class="`lc-stream-${chunk.stream}`"><template v-for="(part, partIndex) in chunk.parts" :key="partIndex"><button
        v-if="part.file"
        type="button"
        class="lc-output-link"
        :title="t('output.openLocation', { location: part.text })"
        @click="emit('reveal', { file: part.file, line: part.line })"
      >{{ part.text }}</button><template v-else>{{ part.text }}</template></template></span></template></pre>
      <p v-else-if="audience" class="lc-output-empty">{{ t('output.emptyAudience') }}</p>
      <p v-else class="lc-output-empty">{{ t('output.empty', { keys: keys.run }) }}</p>
    </div>

    <form
      v-if="!audience && interactive && phase === 'running'"
      class="lc-output-input"
      :class="{ 'is-ready': awaitingInput }"
      @submit.prevent="send"
    >
      <span class="lc-output-prompt" aria-hidden="true">›</span>
      <input
        ref="input"
        v-model="command"
        :aria-label="t('output.inputLabel')"
        :placeholder="awaitingInput ? t('output.inputWaiting') : t('output.inputIdle')"
        maxlength="256"
        autocomplete="off"
        spellcheck="false"
        @keydown.stop
      >
      <button type="submit" class="lc-btn lc-btn-primary" :disabled="sending || !awaitingInput || !command.trim()">
        {{ t('output.send') }}
      </button>
    </form>
  </section>
</template>

<style scoped>
.lc-output {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  height: 100%;
  background: var(--lc-bg);
}

.lc-output-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
  height: 36px;
  padding: 0 6px 0 12px;
  border-bottom: 1px solid var(--lc-border);
}

.lc-output-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--lc-text);
}

.lc-output-title .lc-icon { color: var(--lc-text-3); }

.lc-output-meta {
  color: var(--lc-text-3);
  font-size: 12px;
  white-space: nowrap;
}

.lc-output-clear { margin-left: auto; }

.lc-output-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 10px 14px 12px;
}

.lc-output-text {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font: 13px/1.6 var(--lc-mono);
  color: var(--lc-text);
  background: none;
}

.lc-stream-err { color: var(--lc-danger); }
.lc-stream-system { color: var(--lc-text-3); font-style: italic; }
.lc-stream-input { color: var(--lc-accent); font-weight: 600; }

.lc-output-text.is-waiting::after {
  content: "";
  display: inline-block;
  width: 0.6em;
  height: 1.15em;
  margin-left: 1px;
  vertical-align: text-bottom;
  background: var(--lc-accent);
  animation: lc-caret 1.1s steps(1) infinite;
}

@keyframes lc-caret { 50% { opacity: 0; } }

.lc-output-link {
  color: var(--lc-accent);
  text-decoration: underline;
  text-decoration-color: color-mix(in srgb, var(--lc-accent) 40%, transparent);
  text-underline-offset: 3px;
  font: inherit;
}

.lc-output-link:hover { text-decoration-color: currentColor; }

.lc-output-empty {
  margin: 0;
  color: var(--lc-text-3);
  font-size: 12px;
}

.lc-output-input {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
  margin: 0 10px 10px;
  padding: 3px 3px 3px 10px;
  border: 1px solid var(--lc-border-strong);
  border-radius: var(--lc-radius);
  background: var(--lc-bg);
  transition: border-color 120ms, box-shadow 120ms;
}

.lc-output-input.is-ready {
  border-color: var(--lc-accent);
  box-shadow: 0 0 0 3px var(--lc-accent-soft);
}

.lc-output-prompt {
  color: var(--lc-accent);
  font: 600 14px/1 var(--lc-mono);
}

.lc-output-input input {
  flex: 1;
  min-width: 0;
  height: 26px;
  border: 0;
  outline: none;
  background: none;
  font: 13px var(--lc-mono);
}

.lc-output-input input::placeholder { color: var(--lc-text-3); font-family: var(--lc-font); }
.lc-output-input .lc-btn { height: 26px; }

.is-audience .lc-output-header {
  height: auto;
  min-height: 52px;
  padding: 10px 20px;
  gap: 12px;
}

.is-audience .lc-output-title { font-size: calc(15px * var(--lc-zoom)); }
.is-audience .lc-badge { height: calc(26px * var(--lc-zoom)); padding: 0 calc(10px * var(--lc-zoom)); font-size: calc(14px * var(--lc-zoom)); }
.is-audience .lc-output-meta { font-size: calc(14px * var(--lc-zoom)); }
.is-audience .lc-output-body { padding: 16px 20px 20px; }
.is-audience .lc-output-text { font-size: calc(18px * var(--lc-zoom)); line-height: 1.55; }
.is-audience .lc-output-empty { font-size: calc(15px * var(--lc-zoom)); }
</style>
