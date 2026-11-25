import { createLanguageLoader } from '../shared/languages/index.mjs'

const definitions = import.meta.glob(['../shared/languages/*.mjs', '!../shared/languages/index.mjs'])

export const loadLanguage = createLanguageLoader(id => definitions[`../shared/languages/${id}.mjs`]())
