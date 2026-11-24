import { languageList } from '../shared/languages/index.mjs'

const plain = { id: 'plaintext', monaco: 'plaintext', label: 'Text' }
const byExtension = new Map(languageList.flatMap(language => language.extensions.map(extension => [
  extension.slice(1).toLowerCase(),
  { id: language.id, monaco: language.editor.language, label: language.label },
])))
const extensionPattern = [...byExtension.keys()].map(extension => extension.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')

export function languageOfFile(path = '') {
  const extension = /\.([^./]+)$/.exec(path)?.[1]?.toLowerCase()
  return byExtension.get(extension) ?? plain
}

export function languageLabel(id) {
  return languageList.find(language => language.id === id)?.label ?? null
}

export const sourceLocation = new RegExp(`((?:[\\w$.-]+\\/)*[\\w$.-]+\\.(?:${extensionPattern})):(\\d+)`, 'g')
