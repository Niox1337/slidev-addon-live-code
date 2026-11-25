export const grammar = () => import('monaco-editor/languages/definitions/go/go.js').then(module => module.language)

export const members = [
  'Println', 'Printf', 'Sprintf', 'Print', 'Errorf', 'Scan', 'Scanln', 'NewReader', 'NewScanner', 'ReadString', 'Text',
  'Itoa', 'Atoi', 'Split', 'Join', 'Contains', 'TrimSpace', 'ToUpper', 'ToLower', 'Lock', 'Unlock', 'Add', 'Done', 'Wait',
]

export const snippets = [
  { label: 'main', body: 'package main\n\nimport "fmt"\n\nfunc main() {\n\t${0}\n}' },
  { label: 'func', body: 'func ${1:name}(${2}) ${3}{\n\t${0}\n}' },
  { label: 'for', body: 'for ${1:i} := 0; ${1:i} < ${2:n}; ${1:i}++ {\n\t${0}\n}' },
  { label: 'for range', body: 'for ${1:_}, ${2:item} := range ${3:items} {\n\t${0}\n}' },
  { label: 'if err', body: 'if err != nil {\n\t${0:return err}\n}' },
  { label: 'println', body: 'fmt.Println(${0})' },
  { label: 'struct', body: 'type ${1:Name} struct {\n\t${0}\n}' },
]
