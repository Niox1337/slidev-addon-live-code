import { checkStep, entryFile, nodeRun, parseNode, parseNodeCheck, validateNode } from './node.mjs'

const entry = (names, options) => entryFile(names, options, names.includes('main.mjs') ? 'main.mjs' : 'main.js')

export default {
  completion: () => import('./completion/javascript.mjs'),
  setupEditor: () => import('monaco-editor/languages/definitions/javascript/register.js'),
  toolchain: 'node',
  validate: validateNode,
  sourcesValid: (names, options) => names.includes(entry(names, options)),
  async prepare(context) {
    return { compile: checkStep(context.names), run: await nodeRun(context, entry(context.names, context.options)) }
  },
  compileDiagnostics: parseNodeCheck,
  runtimeDiagnostics: parseNode,
}
