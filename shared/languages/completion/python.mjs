export const grammar = () => import('monaco-editor/languages/definitions/python/python.js').then(module => module.language)

export const members = [
  'append', 'extend', 'insert', 'pop', 'remove', 'sort', 'reverse', 'index', 'count', 'copy', 'clear',
  'keys', 'values', 'items', 'get', 'update', 'setdefault', 'add', 'discard', 'union', 'intersection', 'difference',
  'split', 'join', 'strip', 'lstrip', 'rstrip', 'replace', 'lower', 'upper', 'title', 'startswith', 'endswith',
  'find', 'format', 'isdigit', 'isalpha', 'encode', 'decode', 'read', 'readline', 'readlines', 'write', 'close',
]

export const snippets = [
  { label: 'def', body: 'def ${1:name}(${2}):\n\t${0:pass}' },
  { label: 'class', body: 'class ${1:Name}:\n\tdef __init__(self${2}):\n\t\t${0:pass}' },
  { label: 'for', body: 'for ${1:item} in ${2:items}:\n\t${0:pass}' },
  { label: 'for range', body: 'for ${1:i} in range(${2:n}):\n\t${0:pass}' },
  { label: 'while', body: 'while ${1:condition}:\n\t${0:pass}' },
  { label: 'if', body: 'if ${1:condition}:\n\t${0:pass}' },
  { label: 'try', body: 'try:\n\t${1:pass}\nexcept ${2:Exception} as ${3:error}:\n\t${0:raise}' },
  { label: 'with open', body: 'with open(${1:path}) as ${2:file}:\n\t${0:pass}' },
  { label: 'main', body: 'def main():\n\t${0:pass}\n\n\nif __name__ == "__main__":\n\tmain()' },
]
