import * as monaco from 'monaco-editor/editor/editor.api.js'
import { loadLanguage } from '../shared/languages/index.mjs'

const ready = new Map()

export function prepareEditorLanguage(id) {
  if (!id || id === 'plaintext') return Promise.resolve()
  if (!ready.has(id)) {
    ready.set(id, loadLanguage(id)
      .then(language => language.setupEditor?.(monaco))
      .catch(error => console.error(`Live code: ${id} editor setup failed`, error)))
  }
  return ready.get(id)
}

export function createLanguageModel(code, language) {
  const model = monaco.editor.createModel(code, language.monaco)
  prepareEditorLanguage(language.id).then(() => {
    if (!model.isDisposed()) monaco.editor.setModelLanguage(model, language.monaco)
  })
  return model
}
