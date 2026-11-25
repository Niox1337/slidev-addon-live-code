import { matchFile, shorten, stringList } from './shared.mjs'

const goDiagnostic = /^(.+?\.go):(\d+)(?::(\d+))?:\s+(.*)$/
const goHeadline = /^(?:panic|fatal error):\s+(.*)$/
const goFrame = /^\s+(.+?\.go):(\d+)(?=\s|$)/

function parseGo(text, { files, directory }) {
  const result = []
  for (const line of text.split('\n')) {
    const match = goDiagnostic.exec(line.trim())
    const file = match && matchFile(match[1], files, directory)
    if (!file) continue
    result.push({
      file,
      line: Number(match[2]),
      column: Number(match[3] ?? 1),
      severity: 'error',
      message: shorten(match[4]),
    })
  }
  return result
}

function parseGoRuntime(text, { files, directory }) {
  let headline
  for (const line of text.split('\n')) {
    headline ??= goHeadline.exec(line.trim())?.[1]
    if (headline === undefined) continue
    const match = goFrame.exec(line)
    const file = match && matchFile(match[1], files, directory)
    if (file) return [{ file, line: Number(match[2]), column: 1, severity: 'error', message: shorten(headline) }]
  }
  return []
}

export default {
  completion: () => import('./completion/go.mjs'),
  setupEditor: () => import('monaco-editor/languages/definitions/go/register.js'),
  toolchain: 'go',
  validate: options => stringList(options.flags),
  template: path => path.endsWith('.go') ? 'package main\n' : '',
  compileTimeout: 120_000,
  async prepare({ options, names, writeFile, resolve, readProjectFile }) {
    if (!names.includes('go.mod')) {
      const manifest = await readProjectFile?.('go.mod')
      await writeFile('go.mod', manifest ?? 'module livecode\n\ngo 1.22\n')
      if (manifest !== undefined) {
        const checksums = await readProjectFile('go.sum')
        if (checksums !== undefined) await writeFile('go.sum', checksums)
      }
    }
    const program = resolve('.live-code-program')
    return {
      compile: ['go', ['build', ...(options.flags ?? []), '-o', program, '.']],
      run: [program, []],
      env: { GOTOOLCHAIN: 'local', GOFLAGS: '-mod=mod', GO111MODULE: 'on' },
    }
  },
  compileDiagnostics: parseGo,
  runtimeDiagnostics: parseGoRuntime,
}
