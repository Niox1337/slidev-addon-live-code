import { languageList } from '../shared/languages/index.mjs'

const plain = { id: 'plaintext', monaco: 'plaintext', label: 'Text' }
const describe = language => ({ id: language.id, monaco: language.monaco, label: language.label })
const byExtension = new Map()
for (const language of languageList) {
  for (const extension of language.extensions) {
    const key = extension.slice(1).toLowerCase()
    if (!byExtension.has(key)) byExtension.set(key, describe(language))
  }
}
const extensionPattern = [...byExtension.keys()].map(extension => extension.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')

export function languageOfFile(path = '', preferred = null) {
  const extension = /\.([^./]+)$/.exec(path)?.[1]?.toLowerCase()
  const owner = languageList.find(language => language.id === preferred)
  if (owner?.extensions.some(item => item.slice(1).toLowerCase() === extension)) return describe(owner)
  return byExtension.get(extension) ?? plain
}

export function languageLabel(id) {
  return languageList.find(language => language.id === id)?.label ?? null
}

export const sourceLocation = new RegExp(`((?:[\\w$.-]+\\/)*[\\w$.-]+\\.(?:${extensionPattern})):(\\d+)`, 'g')
