import * as monaco from 'monaco-editor/editor/editor.api.js'
import { loadLanguage } from './language-loader.mjs'

const grammarWordKeys = /keyword|builtin|type|constant|macro/i
const identifier = /[A-Za-z_][\w]*!?/g
const memberAccess = /(?:\.|->|::)([A-Za-z_]\w*)/g
const afterAccess = /(?:[A-Za-z_)\]>]\.|->|::)$/

let contributions
const providers = new Map()

export function loadCompletion() {
  contributions ??= Promise.all([
    import('monaco-editor/editor/contrib/suggest/browser/suggestController.js'),
    import('monaco-editor/editor/contrib/snippet/browser/snippetController2.js'),
  ]).then(() => {
    monaco.editor.addKeybindingRule({
      keybinding: monaco.KeyCode.RightArrow,
      command: 'acceptSelectedSuggestion',
      when: 'suggestWidgetVisible && suggestWidgetHasFocusedSuggestion && textInputFocus',
    })
  })
  return contributions
}

function grammarWords(grammar) {
  const words = new Set()
  for (const [key, value] of Object.entries(grammar ?? {})) {
    if (!grammarWordKeys.test(key) || !Array.isArray(value)) continue
    for (const word of value) if (typeof word === 'string' && /^[A-Za-z_@#][\w]*!?$/.test(word)) words.add(word)
  }
  return words
}

function insideString(prefix) {
  const quotes = prefix.replace(/\\./g, '').match(/["'`]/g) ?? []
  return quotes.length % 2 === 1
}

function projectText(languageId) {
  return monaco.editor.getModels().filter(model => model.getLanguageId() === languageId).map(model => model.getValue())
}

function countOf(texts, word) {
  let count = 0
  for (const text of texts) for (const match of text.matchAll(identifier)) if (match[0] === word && ++count > 1) return count
  return count
}

function createProvider(languageId, { keywords, members, snippets }) {
  const { CompletionItemKind: Kind, CompletionItemInsertTextRule: Rule } = monaco.languages
  return {
    triggerCharacters: ['.', ':', '>'],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position)
      const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn)
      const prefix = model.getLineContent(position.lineNumber).slice(0, word.startColumn - 1)
      if (insideString(prefix)) return { suggestions: [] }
      const texts = projectText(languageId)
      const typedOnce = countOf(texts, word.word) <= 1

      if (afterAccess.test(prefix)) {
        const names = new Set(members)
        for (const text of texts) for (const match of text.matchAll(memberAccess)) names.add(match[1])
        if (typedOnce) names.delete(word.word)
        return { suggestions: [...names].map(name => ({ label: name, kind: Kind.Field, insertText: name, range })) }
      }
      if (/[.:>-]$/.test(prefix) || /\d$/.test(prefix)) return { suggestions: [] }

      const words = new Set()
      for (const text of texts) for (const match of text.matchAll(identifier)) if (match[0].length > 1) words.add(match[0])
      if (typedOnce) words.delete(word.word)
      for (const keyword of keywords) words.delete(keyword)
      const snippetLabels = new Set(snippets.map(snippet => snippet.label))
      return {
        suggestions: [
          ...[...words].map(name => ({ label: name, kind: Kind.Variable, insertText: name, range, sortText: `0${name}` })),
          ...[...keywords].filter(name => !snippetLabels.has(name)).map(name => ({ label: name, kind: Kind.Keyword, insertText: name, range, sortText: `1${name}` })),
          ...snippets.map(snippet => ({
            label: snippet.label,
            kind: Kind.Snippet,
            insertText: snippet.body,
            insertTextRules: Rule.InsertAsSnippet,
            documentation: snippet.body.replace(/\$\{\d+:?([^}]*)\}/g, '$1').replace(/\\(.)/g, '$1'),
            range,
            sortText: `2${snippet.label}`,
          })),
        ],
      }
    },
  }
}

export function enableCompletion(id) {
  if (!id || id === 'plaintext') return Promise.resolve()
  if (!providers.has(id)) {
    providers.set(id, loadLanguage(id).then(async language => {
      const data = await language.completion?.() ?? {}
      const keywords = grammarWords(await data.grammar?.())
      for (const keyword of data.keywords ?? []) keywords.add(keyword)
      monaco.languages.registerCompletionItemProvider(language.monaco, createProvider(language.monaco, {
        keywords,
        members: data.members ?? [],
        snippets: data.snippets ?? [],
      }))
    }).catch(error => console.error(`Live code: ${id} completion failed`, error)))
  }
  return providers.get(id)
}
