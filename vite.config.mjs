import { languageList } from './shared/languages/index.mjs'
import { liveCode } from './server/live-code.mjs'

export default {
  resolve: {
    dedupe: ['@slidev/client', 'markdown-exit', 'monaco-editor', 'vue'],
  },
  optimizeDeps: {
    include: [
      'markdown-exit',
      'monaco-editor/editor/editor.api.js',
      'monaco-editor/editor/contrib/find/browser/findController.js',
      ...languageList.flatMap(language => language.optimize ?? []),
    ],
  },
  plugins: [liveCode()],
}
