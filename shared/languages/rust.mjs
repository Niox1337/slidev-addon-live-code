import { matchFile, optionalString, shorten, stringList } from './shared.mjs'

const diagnostic = /^(.+?\.rs):(\d+):(\d+): (error|warning)(?:\[[^\]]+\])?: (.*)\r?$/
const panic = /^thread 'main'(?: \(\d+\))? panicked at (.+?\.rs):(\d+):(\d+):\r?$/
const entryFile = options => options.main ?? 'main.rs'

function parseRustc(text, { files }) {
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
      message: shorten(match[5]),
    })
  }
  return result
}

function parsePanic(text, { files }) {
  const lines = text.split('\n')
  for (const [index, line] of lines.entries()) {
    const match = panic.exec(line)
    const file = match && matchFile(match[1], files)
    if (!file) continue
    return [{ file, line: Number(match[2]), column: Number(match[3]), severity: 'error', message: shorten(lines[index + 1] ?? '') }]
  }
  return []
}

export default {
  setupEditor: () => import('monaco-editor/languages/definitions/rust/register.js'),
  toolchain: 'rustc',
  validate: options => optionalString(options.main) && optionalString(options.edition) && stringList(options.flags),
  sourcesValid: (names, options) => names.includes(entryFile(options)),
  template: () => '',
  compileTimeout: 60_000,
  prepare({ options, resolve }) {
    const program = resolve('program')
    return {
      compile: ['rustc', [
        ...(options.flags ?? []),
        '--edition', options.edition ?? '2024',
        '--error-format=short',
        '-C', 'debuginfo=2',
        '--color', 'never',
        '-o', program,
        `./${entryFile(options)}`,
      ]],
      run: [program, []],
      env: { RUST_BACKTRACE: '0' },
    }
  },
  compileDiagnostics: parseRustc,
  runtimeDiagnostics: parsePanic,
}
