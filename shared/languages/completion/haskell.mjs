export const grammar = () => import('../haskell-monarch.mjs').then(module => module.haskellTokens)

export const members = []

export const snippets = [
  { label: 'main', body: 'main :: IO ()\nmain = do\n\t${0}' },
  { label: 'function', body: '${1:name} :: ${2:Int} -> ${3:Int}\n${1:name} ${4:x} = ${0}' },
  { label: 'case', body: 'case ${1:value} of\n\t${2:pattern} -> ${0}' },
  { label: 'data', body: 'data ${1:Name} = ${0}' },
  { label: 'where', body: 'where\n\t${0}' },
]
