import { matchFile, optionalString, shorten } from './shared.mjs'

const checker = `import sys, warnings
failed = False
for name in sys.argv[1:]:
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter('always')
        try:
            with open(name, encoding='utf-8') as source:
                compile(source.read(), name, 'exec', dont_inherit=True)
        except SyntaxError as error:
            failed = True
            print(f'{name}:{error.lineno or 1}:{error.offset or 1}: error: {type(error).__name__}: {error.msg}')
        except ValueError as error:
            failed = True
            print(f'{name}:1:1: error: {type(error).__name__}: {error}')
    for item in caught:
        print(f'{name}:{item.lineno}:1: warning: {item.category.__name__}: {item.message}')
sys.exit(1 if failed else 0)
`
const checkLine = /^(.+?\.py):(\d+):(\d+): (error|warning): (.*)$/
const frameLine = /^\s*File "(.+?)", line (\d+)/
const entryFile = (names, options) => options.main ?? (names.includes('main.py') ? 'main.py' : options.initialFile ?? names[0])
const projectFile = (path, files) => matchFile(path.replace(/\\/g, '/'), files)

function parseCheck(text, { files }) {
  const result = []
  for (const line of text.split(/\r?\n/)) {
    const match = checkLine.exec(line)
    const file = match && projectFile(match[1], files)
    if (file) result.push({ file, line: Number(match[2]), column: Number(match[3]), severity: match[4], message: shorten(match[5]) })
  }
  return result
}

function parseTraceback(text, { files }) {
  const lines = text.split(/\r?\n/)
  const start = lines.findLastIndex(line => line.startsWith('Traceback (most recent call last):'))
  if (start < 0) return []
  let location = null
  let message = null
  for (const line of lines.slice(start + 1)) {
    const frame = frameLine.exec(line)
    if (frame) {
      const file = projectFile(frame[1], files)
      if (file) location = { file, line: Number(frame[2]) }
    }
    else if (line && !/^\s/.test(line)) message = line
  }
  return location && message ? [{ ...location, column: 1, severity: 'error', message: shorten(message) }] : []
}

export default {
  completion: () => import('./completion/python.mjs'),
  setupEditor: () => import('monaco-editor/languages/definitions/python/register.js'),
  toolchain: 'python3',
  validate: options => optionalString(options.interpreter) && optionalString(options.main),
  sourcesValid: (names, options) => names.includes(entryFile(names, options)),
  prepare({ options, names }) {
    const interpreter = options.interpreter ?? (globalThis.process?.platform === 'win32' ? 'python' : 'python3')
    return {
      toolchain: interpreter,
      compile: [interpreter, ['-I', '-c', checker, ...names.filter(name => name.endsWith('.py'))]],
      run: [interpreter, ['-u', entryFile(names, options)]],
      env: { PYTHONDONTWRITEBYTECODE: '1', PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' },
    }
  },
  compileDiagnostics: parseCheck,
  runtimeDiagnostics: parseTraceback,
}
