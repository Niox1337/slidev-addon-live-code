const monacoRegister = name => `monaco-editor/languages/definitions/${name}/register.js`

export const languageList = [
  { id: 'java', label: 'Java', extensions: ['.java'], monaco: 'java', optimize: [monacoRegister('java')], load: () => import('./java.mjs') },
  { id: 'c', label: 'C', extensions: ['.c', '.h'], monaco: 'c', optimize: [monacoRegister('cpp')], load: () => import('./c.mjs') },
  { id: 'cpp', label: 'C++', extensions: ['.cpp', '.cc', '.cxx', '.hpp', '.hh', '.h'], monaco: 'cpp', optimize: [monacoRegister('cpp')], load: () => import('./cpp.mjs') },
  { id: 'rust', label: 'Rust', extensions: ['.rs'], monaco: 'rust', optimize: [monacoRegister('rust')], load: () => import('./rust.mjs') },
  { id: 'go', label: 'Go', extensions: ['.go'], monaco: 'go', optimize: [monacoRegister('go')], load: () => import('./go.mjs') },
  { id: 'zig', label: 'Zig', extensions: ['.zig'], monaco: 'zig', load: () => import('./zig.mjs') },
  { id: 'haskell', label: 'Haskell', extensions: ['.hs'], monaco: 'haskell', load: () => import('./haskell.mjs') },
  { id: 'python', label: 'Python', extensions: ['.py'], monaco: 'python', optimize: [monacoRegister('python')], load: () => import('./python.mjs') },
  { id: 'javascript', label: 'JavaScript', extensions: ['.js', '.mjs', '.cjs'], monaco: 'javascript', optimize: [monacoRegister('javascript')], load: () => import('./javascript.mjs') },
  { id: 'typescript', label: 'TypeScript', extensions: ['.ts', '.mts', '.cts'], monaco: 'typescript', optimize: [monacoRegister('typescript')], load: () => import('./typescript.mjs') },
]

for (const language of languageList) {
  const problems = [
    typeof language.id === 'string' && /^[a-z][\w-]*$/.test(language.id) ? null : 'id',
    typeof language.label === 'string' && language.label ? null : 'label',
    Array.isArray(language.extensions) && language.extensions.length
      && language.extensions.every(extension => /^\.[\w-]+$/.test(extension))
      && new Set(language.extensions).size === language.extensions.length ? null : 'extensions',
    typeof language.monaco === 'string' ? null : 'monaco',
    typeof language.load === 'function' ? null : 'load',
  ].filter(Boolean)
  if (problems.length) throw new Error(`Live code language ${language.id ?? '?'} has invalid fields: ${problems.join(', ')}`)
}

const loaded = new Map()

export function findLanguage(id) {
  return languageList.find(language => language.id === id) ?? null
}

export function loadLanguage(id) {
  const meta = findLanguage(id)
  if (!meta) return Promise.reject(new Error(`Unknown language: ${id}. Use ${languageList.map(language => language.id).join(', ')}.`))
  if (!loaded.has(id)) {
    loaded.set(id, meta.load().then(({ default: definition }) => {
      if (typeof definition?.prepare !== 'function') throw new Error(`Live code language ${id} has no prepare function.`)
      return { ...definition, ...meta }
    }))
    loaded.get(id).catch(() => loaded.delete(id))
  }
  return loaded.get(id)
}
