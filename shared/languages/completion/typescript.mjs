import { members, snippets as scriptSnippets } from './javascript.mjs'

export const grammar = () => import('monaco-editor/languages/definitions/typescript/typescript.js').then(module => module.language)
export { members }

export const snippets = [
  ...scriptSnippets,
  { label: 'interface', body: 'interface ${1:Name} {\n\t${0}\n}' },
  { label: 'type', body: 'type ${1:Name} = ${0}' },
]
