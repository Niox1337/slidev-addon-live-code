import c from './c.mjs'
import haskell from './haskell.mjs'
import java from './java.mjs'

export const languageList = [java, c, haskell]

for (const language of languageList) {
  const problems = [
    typeof language.id === 'string' && /^[a-z][\w-]*$/.test(language.id) ? null : 'id',
    typeof language.label === 'string' && language.label ? null : 'label',
    Array.isArray(language.extensions) && language.extensions.length
      && language.extensions.every(extension => /^\.[\w-]+$/.test(extension)) ? null : 'extensions',
    typeof language.editor?.language === 'string' ? null : 'editor.language',
    typeof language.prepare === 'function' ? null : 'prepare',
  ].filter(Boolean)
  if (problems.length) throw new Error(`Live code language ${language.id ?? '?'} has invalid fields: ${problems.join(', ')}`)
}

for (const language of languageList) {
  if (new Set(language.extensions).size !== language.extensions.length) {
    throw new Error(`Live code language ${language.id} lists an extension twice.`)
  }
}

export const languages = Object.fromEntries(languageList.map(language => [language.id, language]))
