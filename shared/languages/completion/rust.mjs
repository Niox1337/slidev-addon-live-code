export const grammar = () => import('monaco-editor/languages/definitions/rust/rust.js').then(module => module.language)

export const members = [
  'len', 'push', 'pop', 'iter', 'iter_mut', 'into_iter', 'map', 'filter', 'collect', 'unwrap', 'expect', 'clone',
  'to_string', 'as_str', 'is_empty', 'contains', 'insert', 'remove', 'get', 'get_mut', 'sort', 'sort_by', 'enumerate',
  'rev', 'sum', 'trim', 'split', 'parse', 'lines', 'chars', 'bytes', 'keys', 'values', 'entry', 'or_insert',
  'new', 'from', 'with_capacity', 'read_line', 'stdin',
]

export const snippets = [
  { label: 'fn', body: 'fn ${1:name}(${2}) {\n\t${0}\n}' },
  { label: 'main', body: 'fn main() {\n\t${0}\n}' },
  { label: 'for', body: 'for ${1:item} in ${2:items} {\n\t${0}\n}' },
  { label: 'if let', body: 'if let Some(${1:value}) = ${2:option} {\n\t${0}\n}' },
  { label: 'match', body: 'match ${1:value} {\n\t${2:_} => ${0},\n}' },
  { label: 'println', body: 'println!("${1:{\\}}", ${2});' },
  { label: 'struct', body: 'struct ${1:Name} {\n\t${0}\n}' },
  { label: 'impl', body: 'impl ${1:Name} {\n\t${0}\n}' },
]
