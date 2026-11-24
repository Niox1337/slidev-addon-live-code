import { matchFile, optionalString, shorten, stringList } from './shared.mjs'

const cDiagnostic = /^(?:\.\/)?(.+?\.[ch]):(\d+):(\d+): (?:fatal )?(error|warning): (.*)$/
const cRuntime = /^(?:\.\/)?(.+?\.[ch]):(\d+):(\d+): runtime error: (.*)$/
const sanitizerHeadline = /ERROR: (?:Address|Undefined)Sanitizer: (.*)$/
const sanitizerFrame = /^\s*#\d+ 0x[0-9a-f]+ in \S+ (\S+\.[ch]):(\d+)(?::(\d+))?/
const unbuffered = `#include <stdio.h>
__attribute__((constructor)) static void live_code_unbuffered(void) { setvbuf(stdout, NULL, _IONBF, 0); }
`

function parseC(text, { files }) {
  const result = []
  for (const line of text.split('\n')) {
    const match = cDiagnostic.exec(line)
    const file = match && matchFile(match[1], files)
    if (!file) continue
    result.push({
      file,
      line: Number(match[2]),
      column: Number(match[3]),
      severity: match[4],
      message: shorten(match[5].replace(/\s*\[-W[^\]]*\]$/, '')),
    })
  }
  return result
}

function parseCRuntime(text, { files }) {
  const lines = text.split('\n')
  const result = []
  const seen = new Set()
  const add = item => {
    const key = `${item.file}:${item.line}:${item.message}`
    if (!seen.has(key)) result.push(item)
    seen.add(key)
  }
  for (const line of lines) {
    const match = cRuntime.exec(line)
    const file = match && matchFile(match[1], files)
    if (file) add({ file, line: Number(match[2]), column: Number(match[3]), severity: 'error', message: shorten(match[4]) })
  }
  const headlineIndex = lines.findIndex(line => sanitizerHeadline.test(line))
  if (headlineIndex < 0) return result
  const headline = sanitizerHeadline.exec(lines[headlineIndex])[1]
  for (const line of lines.slice(headlineIndex)) {
    const match = sanitizerFrame.exec(line)
    const file = match && matchFile(match[1], files)
    if (file) {
      const message = shorten(headline.replace(/ on (?:unknown )?address.*$/, '').replace(/ at pc .*$/, ''))
      if (!result.some(item => item.file === file && item.line === Number(match[2]))) {
        add({ file, line: Number(match[2]), column: Number(match[3] ?? 1), severity: 'error', message })
      }
      break
    }
  }
  return result
}

export default {
  id: 'c',
  label: 'C',
  extensions: ['.c', '.h'],
  editor: {
    language: 'c',
    optimize: ['monaco-editor/languages/definitions/cpp/register.js'],
    setup: () => import('monaco-editor/languages/definitions/cpp/register.js'),
  },
  toolchain: 'cc',
  validate: options => optionalString(options.compiler) && stringList(options.flags) && stringList(options.link)
    && (options.sanitize === undefined || typeof options.sanitize === 'boolean'),
  sourcesValid: names => names.some(name => name.endsWith('.c')),
  template(path) {
    if (!path.endsWith('.h')) return ''
    const guard = path.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^(?=\d)/, '_')
    return `#ifndef ${guard}\n#define ${guard}\n\n\n\n#endif\n`
  },
  async prepare({ options, names, writeFile, resolve }) {
    const helper = '.live-code-unbuffered.c'
    const program = resolve('.live-code-program')
    await writeFile(helper, unbuffered)
    const sanitize = options.sanitize === false ? [] : ['-fsanitize=address,undefined', '-fno-omit-frame-pointer']
    return {
      compile: [options.compiler ?? 'cc', [
        ...(options.flags ?? ['-std=c17', '-Wall', '-Wextra', '-g', '-O0']),
        ...sanitize,
        '-fdiagnostics-color=never',
        '-I.',
        '-o', program,
        ...names.filter(name => name.endsWith('.c')).map(name => `./${name}`),
        helper,
        ...(options.link ?? ['-lm']),
      ]],
      run: [program, []],
      env: { ASAN_OPTIONS: 'detect_leaks=0:abort_on_error=0:print_legend=0:dump_registers=0', UBSAN_OPTIONS: 'print_stacktrace=1' },
    }
  },
  compileDiagnostics: parseC,
  runtimeDiagnostics: parseCRuntime,
}
