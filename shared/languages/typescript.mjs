import { checkStep, entryFile, nodeRun, parseNode, parseNodeCheck, parseTsc, scriptFiles, validateNode } from './node.mjs'

const entry = (names, options) => entryFile(names, options, names.includes('main.mts') ? 'main.mts' : 'main.ts')
const tscFlags = ['--noEmit', '--pretty', 'false', '--strict', '--skipLibCheck', '--target', 'es2023',
  '--module', 'nodenext', '--moduleResolution', 'nodenext', '--allowImportingTsExtensions']

function runFlags() {
  const flags = ['--disable-warning=ExperimentalWarning']
  if (!globalThis.process?.features?.typescript) flags.push('--experimental-strip-types')
  return flags
}

export default {
  completion: () => import('./completion/typescript.mjs'),
  setupEditor: () => import('monaco-editor/languages/definitions/typescript/register.js'),
  toolchain: 'node',
  validate: options => validateNode(options)
    && (options.typecheck === undefined || typeof options.typecheck === 'boolean' || (typeof options.typecheck === 'string' && options.typecheck.length > 0)),
  sourcesValid: (names, options) => names.includes(entry(names, options)),
  compileTimeout: 60_000,
  async prepare(context) {
    const { options, names } = context
    const run = await nodeRun(context, entry(names, options), runFlags())
    if (!options.typecheck) return { compile: checkStep(names), run }
    const tsc = options.typecheck === true ? 'tsc' : options.typecheck
    return { toolchain: tsc, compile: [tsc, [...tscFlags, ...scriptFiles(names).filter(name => /\.[cm]?ts$/.test(name))]], run }
  },
  compileDiagnostics: (text, context) => [...parseTsc(text, context), ...parseNodeCheck(text, context)],
  runtimeDiagnostics: parseNode,
}
