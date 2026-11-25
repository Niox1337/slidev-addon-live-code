import { matchFile, optionalString, shorten, stringList } from './shared.mjs'

const ghcLocation = /^(?:\.\/)?(.+?\.hs):(?:(\d+):(\d+)(?:-\d+)?|\((\d+),(\d+)\)-\(\d+,\d+\)): (error|warning)(.*)$/
const ghcRuntimeLocation = /(\S+?\.hs):(?:(\d+):(\d+)(?:-\d+)?|\((\d+),(\d+)\)-\(\d+,\d+\))/
const ghcCalledAt = /called at (\S+?\.hs):(\d+):(\d+)/
const entryFile = (names, options) => options.main ?? (names.includes('Main.hs') ? 'Main.hs' : options.initialFile ?? names[0])

function ghcMessage(lines, start, rest) {
  const body = []
  for (let index = start; index < lines.length && /^ {4}/.test(lines[index]); index += 1) {
    if (body.length && /^ {4}•/.test(lines[index])) break
    body.push(lines[index])
  }
  const inline = rest.replace(/^:\s*/, '').replace(/\[[^\]]*\]\s*/g, '')
  return shorten((body.length ? body.join(' ') : inline).replace(/^\s*•\s*/, ''))
}

function parseGhc(text, { files }) {
  const lines = text.split('\n')
  const result = []
  for (const [index, line] of lines.entries()) {
    const match = ghcLocation.exec(line)
    const file = match && matchFile(match[1], files)
    if (!file) continue
    result.push({
      file,
      line: Number(match[2] ?? match[4]),
      column: Number(match[3] ?? match[5]),
      severity: match[6],
      message: ghcMessage(lines, index + 1, match[7]),
    })
  }
  return result
}

function parseGhcRuntime(text, { files }) {
  const lines = text.split('\n').filter(Boolean)
  const headlineIndex = lines.findIndex(line => /^(?:<interactive>|[\w.-]+): /.test(line))
  if (headlineIndex < 0) return []
  let headline = lines[headlineIndex].replace(/^(?:<interactive>|[\w.-]+): /, '')
  if (/^Uncaught exception\b.*:$/.test(headline) && lines[headlineIndex + 1] && !/^\s*(?:HasCallStack|CallStack)\b/.test(lines[headlineIndex + 1])) {
    headline = lines[headlineIndex + 1]
  }
  for (const line of lines.slice(headlineIndex)) {
    const called = ghcCalledAt.exec(line)
    const calledFile = called && matchFile(called[1], files)
    if (calledFile) return [{ file: calledFile, line: Number(called[2]), column: Number(called[3]), severity: 'error', message: shorten(headline) }]
  }
  const located = ghcRuntimeLocation.exec(headline)
  const file = located && matchFile(located[1], files)
  if (!file) return []
  const message = headline.slice(located.index + located[0].length).replace(/^:\s*/, '')
  return [{ file, line: Number(located[2] ?? located[4]), column: Number(located[3] ?? located[5]), severity: 'error', message: shorten(message) }]
}

export default {
  completion: () => import('./completion/haskell.mjs'),
  async setupEditor(monaco) {
    if (monaco.languages.getLanguages().some(language => language.id === 'haskell')) return
    const { haskellConfiguration, haskellTokens } = await import('./haskell-monarch.mjs')
    monaco.languages.register({ id: 'haskell', extensions: ['.hs'], aliases: ['Haskell'] })
    monaco.languages.setLanguageConfiguration('haskell', haskellConfiguration)
    monaco.languages.setMonarchTokensProvider('haskell', haskellTokens)
  },
  toolchain: 'ghc',
  validate: options => optionalString(options.compiler) && stringList(options.flags) && optionalString(options.main),
  sourcesValid: (names, options) => names.includes(entryFile(names, options)),
  template(path) {
    const module = path.replace(/\.hs$/, '').split('/').join('.')
    return /^[A-Z][\w']*(?:\.[A-Z][\w']*)*$/.test(module) ? `module ${module} where\n\n` : ''
  },
  compileTimeout: 60_000,
  prepare({ options, names }) {
    const compiler = options.compiler ?? 'ghc'
    const shared = [...(options.flags ?? []), '-v0', '-ignore-dot-ghci', '-fdiagnostics-color=never', '-i.', `./${entryFile(names, options)}`]
    return {
      compile: [compiler, ['-fno-code', ...shared]],
      run: [compiler, [...shared, '-w', '-e', 'System.IO.hSetBuffering System.IO.stdout System.IO.NoBuffering >> main']],
    }
  },
  compileDiagnostics: parseGhc,
  runtimeDiagnostics: parseGhcRuntime,
}
