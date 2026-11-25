import { describe, expect, test } from 'vitest'
import { loadLanguage } from '../shared/languages/index.mjs'

const { compileDiagnostics, runtimeDiagnostics } = await loadLanguage('rust')

describe('Rust compile diagnostics', () => {
  const context = { files: { 'main.rs': '', 'lesson.rs': '' } }

  test('parses a coded error in a module and ignores the summary', () => {
    const text = './lesson.rs:3:20: error[E0425]: cannot find value `missing` in this scope: not found in this scope\nerror: aborting due to 1 previous error\n'
    expect(compileDiagnostics(text, context)).toEqual([
      { file: 'lesson.rs', line: 3, column: 20, severity: 'error', message: 'cannot find value `missing` in this scope: not found in this scope' },
    ])
    expect(compileDiagnostics(text, { files: { 'main.rs': '' } })).toEqual([])
  })

  test('parses a warning without a diagnostic code', () => {
    const text = './lesson.rs:2:9: warning: unused variable: `unused`: help: if this is intentional, prefix it with an underscore: `_unused`\nwarning: 1 warning emitted\n'
    expect(compileDiagnostics(text, context)).toEqual([
      { file: 'lesson.rs', line: 2, column: 9, severity: 'warning', message: 'unused variable: `unused`: help: if this is intentional, prefix it with an underscore: `_unused`' },
    ])
  })
})

describe('Rust runtime diagnostics', () => {
  test.each(['thread \'main\'', 'thread \'main\' (178975)'])('parses a panic from %s', thread => {
    const text = `\n${thread} panicked at ./lesson.rs:3:5:
lesson failed
note: run with \`RUST_BACKTRACE=1\` environment variable to display a backtrace
`
    expect(runtimeDiagnostics(text, { files: { 'lesson.rs': '' } })).toEqual([
      { file: 'lesson.rs', line: 3, column: 5, severity: 'error', message: 'lesson failed' },
    ])
    expect(runtimeDiagnostics(text, { files: { 'main.rs': '' } })).toEqual([])
  })
})
