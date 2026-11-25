const monacoRegister = name => `monaco-editor/languages/definitions/${name}/register.js`
const monacoGrammar = name => `monaco-editor/languages/definitions/${name}/${name}.js`

export const languageList = [
  { id: 'java', label: 'Java', extensions: ['.java'], monaco: 'java', optimize: [monacoRegister('java'), monacoGrammar('java')] },
  { id: 'c', label: 'C', extensions: ['.c', '.h'], monaco: 'c', optimize: [monacoRegister('cpp')] },
  { id: 'cpp', label: 'C++', extensions: ['.cpp', '.cc', '.cxx', '.hpp', '.hh', '.h'], monaco: 'cpp', optimize: [monacoRegister('cpp'), monacoGrammar('cpp')] },
  { id: 'rust', label: 'Rust', extensions: ['.rs'], monaco: 'rust', optimize: [monacoRegister('rust'), monacoGrammar('rust')] },
  { id: 'go', label: 'Go', extensions: ['.go'], monaco: 'go', optimize: [monacoRegister('go'), monacoGrammar('go')] },
  { id: 'zig', label: 'Zig', extensions: ['.zig'], monaco: 'zig' },
  { id: 'haskell', label: 'Haskell', extensions: ['.hs'], monaco: 'haskell' },
  { id: 'python', label: 'Python', extensions: ['.py'], monaco: 'python', optimize: [monacoRegister('python'), monacoGrammar('python')] },
  { id: 'javascript', label: 'JavaScript', extensions: ['.js', '.mjs', '.cjs'], monaco: 'javascript', optimize: [monacoRegister('javascript'), monacoGrammar('javascript')] },
  { id: 'typescript', label: 'TypeScript', extensions: ['.ts', '.mts', '.cts'], monaco: 'typescript', optimize: [monacoRegister('typescript'), monacoGrammar('typescript')] },
]

for (const language of languageList) {
  const problems = [
    typeof language.id === 'string' && /^[a-z][\w-]*$/.test(language.id) ? null : 'id',
    typeof language.label === 'string' && language.label ? null : 'label',
    Array.isArray(language.extensions) && language.extensions.length
      && language.extensions.every(extension => /^\.[\w-]+$/.test(extension))
      && new Set(language.extensions).size === language.extensions.length ? null : 'extensions',
    typeof language.monaco === 'string' ? null : 'monaco',
  ].filter(Boolean)
  if (problems.length) throw new Error(`Live code language ${language.id ?? '?'} has invalid fields: ${problems.join(', ')}`)
}

export function findLanguage(id) {
  return languageList.find(language => language.id === id) ?? null
}

export function createLanguageLoader(importDefinition) {
  const loaded = new Map()
  return function loadLanguage(id) {
    const meta = findLanguage(id)
    if (!meta) return Promise.reject(new Error(`Unknown language: ${id}. Use ${languageList.map(language => language.id).join(', ')}.`))
    if (!loaded.has(id)) {
      loaded.set(id, importDefinition(id).then(({ default: definition }) => {
        if (typeof definition?.prepare !== 'function') throw new Error(`Live code language ${id} has no prepare function.`)
        return { ...definition, ...meta }
      }))
      loaded.get(id).catch(() => loaded.delete(id))
    }
    return loaded.get(id)
  }
}
