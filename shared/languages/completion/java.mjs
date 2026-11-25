export const grammar = () => import('monaco-editor/languages/definitions/java/java.js').then(module => module.language)

export const members = [
  'length', 'size', 'get', 'set', 'add', 'remove', 'contains', 'isEmpty', 'equals', 'hashCode', 'toString', 'compareTo',
  'charAt', 'substring', 'indexOf', 'split', 'trim', 'toUpperCase', 'toLowerCase', 'startsWith', 'endsWith',
  'out', 'in', 'println', 'print', 'printf', 'nextInt', 'nextLine', 'next', 'hasNext', 'hasNextLine', 'close',
  'put', 'containsKey', 'keySet', 'values', 'entrySet', 'getKey', 'getValue', 'stream', 'map', 'filter', 'collect', 'forEach', 'sort',
]

export const snippets = [
  { label: 'main', body: 'public static void main(String[] args) {\n\t${0}\n}' },
  { label: 'sout', body: 'System.out.println(${0});' },
  { label: 'fori', body: 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n\t${0}\n}' },
  { label: 'foreach', body: 'for (${1:var} ${2:item} : ${3:items}) {\n\t${0}\n}' },
  { label: 'if', body: 'if (${1:condition}) {\n\t${0}\n}' },
  { label: 'while', body: 'while (${1:condition}) {\n\t${0}\n}' },
  { label: 'class', body: 'public class ${1:Name} {\n\t${0}\n}' },
  { label: 'try', body: 'try {\n\t${1}\n} catch (${2:Exception} ${3:e}) {\n\t${0}\n}' },
]
