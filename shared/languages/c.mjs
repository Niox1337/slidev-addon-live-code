import { gccLanguage } from './gcc.mjs'

export default gccLanguage({
  compiler: 'cc',
  standard: 'c17',
  source: name => name.endsWith('.c'),
  header: name => name.endsWith('.h'),
  extensions: '[ch]',
})
