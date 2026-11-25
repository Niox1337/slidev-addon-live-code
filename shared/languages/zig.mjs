import { matchFile, optionalString, shorten, stringList } from './shared.mjs'

const zigDiagnostic = /^(.+?\.zig):(\d+):(\d+):\s+(error|warning):\s+(.*)$/
const zigHeadline = /^(?:(?:thread \d+ )?panic|error):\s+(.*)$/
const zigFrame = /^(.+?\.zig):(\d+):(\d+):\s+0x[\da-f]+\s+in\s/i
const entryFile = options => options.main ?? 'main.zig'
const plainOutput = text => text.replace(/\x1b\[[\d;]*m/g, '')

function parseZig(text, { files, directory }) {
  const result = []
  for (const line of plainOutput(text).split('\n')) {
    const match = zigDiagnostic.exec(line.trim())
    const file = match && matchFile(match[1], files, directory)
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

function parseZigRuntime(text, { files, directory }) {
  let headline
  for (const line of plainOutput(text).split('\n')) {
    const clean = line.trim()
    headline ??= zigHeadline.exec(clean)?.[1]
    if (headline === undefined) continue
    const match = zigFrame.exec(clean)
    const file = match && matchFile(match[1], files, directory)
    if (file) {
      return [{ file, line: Number(match[2]), column: Number(match[3]), severity: 'error', message: shorten(headline) }]
    }
  }
  return []
}

export default {
  completion: () => import('./completion/zig.mjs'),
  async setupEditor(monaco) {
    if (monaco.languages.getLanguages().some(language => language.id === 'zig')) return
    const { zigConfiguration, zigTokens } = await import('./zig-monarch.mjs')
    monaco.languages.register({ id: 'zig', extensions: ['.zig'], aliases: ['Zig'] })
    monaco.languages.setLanguageConfiguration('zig', zigConfiguration)
    monaco.languages.setMonarchTokensProvider('zig', zigTokens)
  },
  toolchain: 'zig',
  validate: options => optionalString(options.main) && stringList(options.flags),
  sourcesValid: (names, options) => names.includes(entryFile(options)),
  template: () => '',
  compileTimeout: 120_000,
  prepare({ options, resolve }) {
    const program = resolve('.live-code-program')
    return {
      compile: ['zig', ['build-exe', entryFile(options), `-femit-bin=${program}`, '-O', 'Debug', ...(options.flags ?? [])]],
      run: [program, []],
    }
  },
  compileDiagnostics: parseZig,
  runtimeDiagnostics: parseZigRuntime,
}
