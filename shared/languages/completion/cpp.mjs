export const grammar = () => import('monaco-editor/languages/definitions/cpp/cpp.js').then(module => module.language)

export const members = [
  'push_back', 'pop_back', 'emplace_back', 'size', 'empty', 'begin', 'end', 'front', 'back', 'insert', 'erase', 'clear',
  'find', 'count', 'at', 'substr', 'length', 'c_str', 'append', 'first', 'second', 'reserve', 'resize',
  'cout', 'cin', 'cerr', 'endl', 'string', 'vector', 'map', 'unordered_map', 'set', 'pair', 'make_pair', 'sort', 'move', 'getline',
]

export const snippets = [
  { label: 'main', body: '#include <iostream>\n\nint main() {\n\t${0}\n\treturn 0;\n}' },
  { label: 'include', body: '#include <${1:iostream}>' },
  { label: 'for', body: 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ++${1:i}) {\n\t${0}\n}' },
  { label: 'for range', body: 'for (const auto& ${1:item} : ${2:items}) {\n\t${0}\n}' },
  { label: 'if', body: 'if (${1:condition}) {\n\t${0}\n}' },
  { label: 'cout', body: 'std::cout << ${1} << std::endl;' },
  { label: 'class', body: 'class ${1:Name} {\npublic:\n\t${0}\n};' },
]
