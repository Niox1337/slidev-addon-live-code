import { matchFile, optionalString, shorten } from './shared.mjs'

const checker = `const { spawnSync } = require('node:child_process')
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs')
const { dirname, join, resolve } = require('node:path')
const strip = require('node:module').stripTypeScriptTypes
let failed = false
for (const file of process.argv.slice(1)) {
  let target = file
  if (/\\.[cm]?ts$/.test(file)) {
    let code
    try {
      code = strip(readFileSync(file, 'utf8'))
    }
    catch (error) {
      const line = /^:(\\d+)\\n/.exec(error?.stack ?? '')
      if (!line) continue
      failed = true
      const body = error.stack.split(/\\r?\\n/).slice(2).filter(text => !/^\\s+at /.test(text))
      process.stderr.write([resolve(file) + ':' + line[1], ...body].join('\\n').trimEnd().replace(/ \\[\\w+\\]:/, ':') + '\\n\\n')
      continue
    }
    target = join('.live-code-check', file.replace(/ts$/, 'js'))
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, code)
  }
  const result = spawnSync(process.execPath, ['--check', target], { encoding: 'utf8' })
  if (result.status !== 0) {
    failed = true
    const lines = result.stderr.split(resolve(target)).join(resolve(file)).split(/\\r?\\n/)
    process.stderr.write(lines.filter(line => !/^\\s+at |^Node\\.js v/.test(line)).join('\\n').trimEnd() + '\\n\\n')
  }
}
process.exit(failed ? 1 : 0)
`
const header = /^(?:file:\/\/)?(.+?\.[cm]?[jt]s):(\d+)$/
const frame = /^\s+at (?:.*? \()?(?:file:\/\/)?(.+?\.[cm]?[jt]s):(\d+):(\d+)\)?$/
const errorLine = /^(?:Uncaught )?[A-Z][\w$]*(?: \[\w+\])?: |^[A-Z][\w$]*Error$/
const tscLine = /^(.+?\.[cm]?tsx?)\((\d+),(\d+)\): (error|warning) TS\d+: (.*)$/

export const scriptFiles = names => names.filter(name => /\.[cm]?[jt]s$/.test(name))
export const entryFile = (names, options, fallback) => options.main ?? (names.includes(fallback) ? fallback : options.initialFile ?? names[0])

function projectFile(path, files) {
  let clean = path.replace(/\\/g, '/')
  try {
    clean = decodeURI(clean)
  }
  catch {}
  return matchFile(clean, files)
}

export function parseNode(text, { files }) {
  const lines = text.split(/\r?\n/)
  const top = lines.findIndex(line => header.test(line) && projectFile(header.exec(line)[1], files))
  const from = top < 0 ? 0 : top + 2
  let messageIndex = lines.findIndex((line, index) => index >= from && errorLine.test(line))
  if (messageIndex < 0 && top >= 0) messageIndex = lines.findIndex((line, index) => index >= from && line.trim() && !/^\s*\^+\s*$/.test(line))
  if (messageIndex < 0) return []
  const message = shorten(lines[messageIndex].replace(/^Uncaught /, '').replace(/ \[\w+\]:/, ':'))
  if (top >= 0) {
    const caret = lines[top + 2]?.match(/^(\s*)\^/)
    const match = header.exec(lines[top])
    return [{ file: projectFile(match[1], files), line: Number(match[2]), column: caret ? caret[1].length + 1 : 1, severity: 'error', message }]
  }
  for (const line of lines.slice(messageIndex + 1)) {
    const match = frame.exec(line)
    const file = match && projectFile(match[1], files)
    if (file) return [{ file, line: Number(match[2]), column: Number(match[3]), severity: 'error', message }]
  }
  return []
}

export function parseTsc(text, { files }) {
  const result = []
  for (const line of text.split(/\r?\n/)) {
    const match = tscLine.exec(line)
    const file = match && projectFile(match[1], files)
    if (file) result.push({ file, line: Number(match[2]), column: Number(match[3]), severity: match[4], message: shorten(match[5]) })
  }
  return result
}

export function parseNodeCheck(text, context) {
  const lines = text.split(/\r?\n/)
  const starts = lines.flatMap((line, index) => header.test(line) ? [index] : [])
  return starts.flatMap((start, index) => parseNode(lines.slice(start, starts[index + 1]).join('\n'), context))
}

export const validateNode = options => optionalString(options.main)
  && (options.args === undefined || (Array.isArray(options.args) && options.args.every(item => typeof item === 'string')))

const stdinRelease = `process.stdin.on('pause', () => process.stdin.unref?.())
process.stdin.on('resume', () => process.stdin.ref?.())
`

export async function nodeRun({ options, writeFile, resolve }, entry, flags = []) {
  await writeFile('.live-code-stdin.cjs', stdinRelease)
  return [globalThis.process?.execPath ?? 'node', [...flags, '--require', resolve('.live-code-stdin.cjs'), ...(options.args ?? []), entry]]
}

export function checkStep(names) {
  return [globalThis.process?.execPath ?? 'node', ['--disable-warning=ExperimentalWarning', '-e', checker, ...scriptFiles(names)]]
}
