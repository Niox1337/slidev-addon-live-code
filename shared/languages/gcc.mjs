import { matchFile, optionalString, shorten, stringList } from './shared.mjs'

const sanitizerHeadline = /ERROR: (?:Address|Undefined)Sanitizer: (.*)$/
const exceptionHeadline = /^(?:terminate called after throwing\b|libc\+\+abi: terminating due to uncaught exception\b)/
const unbuffered = `#include <stdio.h>
__attribute__((constructor)) static void live_code_unbuffered(void) { setvbuf(stdout, NULL, _IONBF, 0)\x3b }
`

function parseCompile(text, files, diagnostic) {
  const result = []
  for (const line of text.split('\n')) {
    const match = diagnostic.exec(line)
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

function parseRuntime(text, files, runtime, frame, cpp) {
  const lines = text.split('\n')
  const result = []
  const seen = new Set()
  const add = item => {
    const key = `${item.file}:${item.line}:${item.message}`
    if (!seen.has(key)) result.push(item)
    seen.add(key)
  }
  for (const line of lines) {
    const match = runtime.exec(line)
    const file = match && matchFile(match[1], files)
    if (file) add({ file, line: Number(match[2]), column: Number(match[3]), severity: 'error', message: shorten(match[4]) })
  }
  const headlineIndex = lines.findIndex(line => sanitizerHeadline.test(line) || (cpp && exceptionHeadline.test(line)))
  if (headlineIndex < 0) return result
  const headline = lines[headlineIndex]
  const sanitizer = sanitizerHeadline.exec(headline)
  const what = /^\s+what\(\):\s+(.*)$/.exec(lines[headlineIndex + 1] ?? '')
  const message = shorten(sanitizer
    ? sanitizer[1].replace(/ on (?:unknown )?address.*$/, '').replace(/ at pc .*$/, '')
    : what?.[1] ?? headline)
  for (const line of lines.slice(headlineIndex)) {
    const match = frame.exec(line)
    const file = match && matchFile(match[1], files)
    if (file) {
      if (!result.some(item => item.file === file && item.line === Number(match[2]))) {
        add({ file, line: Number(match[2]), column: Number(match[3] ?? 1), severity: 'error', message })
      }
      break
    }
  }
  return result
}

export function gccLanguage({ compiler, standard, source, header, extensions, cpp = false, completion }) {
  const location = String.raw`^(?:\./)?(.+?\.${extensions}):(\d+):(\d+): `
  const diagnostic = new RegExp(`${location}(?:fatal )?(error|warning): (.*)$`)
  const runtime = new RegExp(`${location}runtime error: (.*)$`)
  const symbol = cpp ? '.*?' : String.raw`\S+`
  const path = cpp ? String.raw`(?:\.?/.+?|\S+)` : String.raw`\S+`
  const frame = new RegExp(String.raw`^\s*#\d+ 0x[0-9a-f]+ in ${symbol} (${path}\.${extensions}):(\d+)(?::(\d+))?`)

  return {
    completion,
    setupEditor: () => import('monaco-editor/languages/definitions/cpp/register.js'),
    toolchain: compiler,
    validate: options => optionalString(options.compiler) && stringList(options.flags) && stringList(options.link)
      && (options.sanitize === undefined || typeof options.sanitize === 'boolean'),
    sourcesValid: names => names.some(source),
    template(path) {
      if (!header(path)) return ''
      const guard = path.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^(?=\d)/, '_')
      return `#ifndef ${guard}\n#define ${guard}\n\n\n\n#endif\n`
    },
    async prepare({ options, names, writeFile, resolve }) {
      const helper = cpp ? '.live-code-unbuffered.cpp' : '.live-code-unbuffered.c'
      const program = resolve('.live-code-program')
      await writeFile(helper, unbuffered)
      const sanitize = options.sanitize === false ? [] : ['-fsanitize=address,undefined', '-fno-omit-frame-pointer']
      return {
        compile: [options.compiler ?? compiler, [
          ...(options.flags ?? [`-std=${standard}`, '-Wall', '-Wextra', '-g', '-O0']),
          ...sanitize,
          '-fdiagnostics-color=never',
          '-I.',
          '-o', program,
          ...names.filter(source).map(name => `./${name}`),
          helper,
          ...(options.link ?? ['-lm']),
        ]],
        run: [program, []],
        env: { ASAN_OPTIONS: 'detect_leaks=0:abort_on_error=0:print_legend=0:dump_registers=0', UBSAN_OPTIONS: 'print_stacktrace=1' },
      }
    },
    compileDiagnostics: (text, { files }) => parseCompile(text, files, diagnostic),
    runtimeDiagnostics: (text, { files }) => parseRuntime(text, files, runtime, frame, cpp),
  }
}
