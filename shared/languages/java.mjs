import { matchFile } from './shared.mjs'

const javaClass = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/
const javacDiagnostic = /^(?:\.\/)?(.+?\.java):(\d+): (error|warning): (.*)$/
const javaFrame = /^\s+at ([\w$.]+)\.[\w$<>]+\(([\w$]+\.java):(\d+)\)/

function parseJavac(text, { files }) {
  const lines = text.split('\n')
  const result = []
  for (const [index, line] of lines.entries()) {
    const match = javacDiagnostic.exec(line)
    const file = match && matchFile(match[1], files)
    if (!file) continue
    const caret = lines[index + 2]
    const column = caret && /^\s*\^\s*$/.test(caret) ? caret.indexOf('^') + 1 : 1
    result.push({ file, line: Number(match[2]), column, severity: match[3], message: match[4] })
  }
  return result
}

function resolveJavaFile(files, className, fileName) {
  const packagePath = className.replace(/\$.*$/, '').split('.').slice(0, -1).join('/')
  const exact = packagePath ? `${packagePath}/${fileName}` : fileName
  if (Object.hasOwn(files, exact)) return exact
  const matches = Object.keys(files).filter(name => name.split('/').at(-1) === fileName)
  return matches.length === 1 ? matches[0] : null
}

function parseJavaRuntime(text, { files }) {
  const lines = text.split('\n')
  const headline = lines.find(line => /^Exception in thread|^\S+(?:Exception|Error)\b/.test(line))
  if (!headline) return []
  for (const line of lines) {
    const match = javaFrame.exec(line)
    if (!match) continue
    const file = resolveJavaFile(files, match[1], match[2])
    if (file) return [{ file, line: Number(match[3]), column: 1, severity: 'error', message: headline.replace(/^Exception in thread "[^"]*" /, '') }]
  }
  return []
}

export default {
  setupEditor: () => import('monaco-editor/languages/definitions/java/register.js'),
  toolchain: 'javac / java',
  validate: options => typeof options.mainClass === 'string' && javaClass.test(options.mainClass),
  template(path) {
    const name = path.split('/').at(-1).replace(/\.java$/, '')
    return javaClass.test(name) ? `public class ${name} {\n    \n}\n` : ''
  },
  prepare({ directory, options, names }) {
    return {
      compile: ['javac', ['-encoding', 'UTF-8', '-d', directory, ...names.map(name => `./${name}`)]],
      run: ['java', ['-cp', directory, options.mainClass]],
    }
  },
  compileDiagnostics: parseJavac,
  runtimeDiagnostics: parseJavaRuntime,
}
