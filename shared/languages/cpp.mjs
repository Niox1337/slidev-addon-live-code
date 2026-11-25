import { gccLanguage } from './gcc.mjs'

export default gccLanguage({
  compiler: 'c++',
  standard: 'c++20',
  source: name => /\.(?:cpp|cc|cxx)$/.test(name),
  header: name => /\.(?:hpp|hh|h)$/.test(name),
  extensions: '(?:cpp|cc|cxx|hpp|hh|h)',
  cpp: true,
  completion: () => import('./completion/cpp.mjs'),
})
