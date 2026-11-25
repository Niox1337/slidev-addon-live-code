export const grammar = () => import('monaco-editor/languages/definitions/javascript/javascript.js').then(module => module.language)

export const members = [
  'length', 'push', 'pop', 'shift', 'unshift', 'slice', 'splice', 'map', 'filter', 'reduce', 'forEach', 'find',
  'findIndex', 'some', 'every', 'includes', 'indexOf', 'join', 'split', 'trim', 'toUpperCase', 'toLowerCase',
  'startsWith', 'endsWith', 'replace', 'keys', 'values', 'entries', 'log', 'error', 'warn', 'then', 'catch', 'finally',
  'toString', 'toFixed', 'parse', 'stringify', 'has', 'get', 'set', 'add', 'delete',
]

export const snippets = [
  { label: 'function', body: 'function ${1:name}(${2}) {\n\t${0}\n}' },
  { label: 'arrow', body: 'const ${1:name} = (${2}) => {\n\t${0}\n}' },
  { label: 'for', body: 'for (let ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n\t${0}\n}' },
  { label: 'for of', body: 'for (const ${1:item} of ${2:items}) {\n\t${0}\n}' },
  { label: 'if', body: 'if (${1:condition}) {\n\t${0}\n}' },
  { label: 'log', body: 'console.log(${0})' },
  { label: 'class', body: 'class ${1:Name} {\n\tconstructor(${2}) {\n\t\t${0}\n\t}\n}' },
  { label: 'try', body: 'try {\n\t${1}\n} catch (${2:error}) {\n\t${0}\n}' },
]
