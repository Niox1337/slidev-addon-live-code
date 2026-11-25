import { describe, expect, test } from 'vitest'
import go from '../shared/languages/go.mjs'

const context = { directory: '/tmp/live code', files: { 'main.go': '', 'helper/parse.go': '' } }

describe('Go compile diagnostics', () => {
  test('reads relative locations with and without a package header', () => {
    const output = '# livecode\n./main.go:3:2: undefined: missing\nhelper/parse.go:6:9: undefined: token\n'
    expect(go.compileDiagnostics(output, context)).toEqual([
      { file: 'main.go', line: 3, column: 2, severity: 'error', message: 'undefined: missing' },
      { file: 'helper/parse.go', line: 6, column: 9, severity: 'error', message: 'undefined: token' },
    ])
    expect(go.compileDiagnostics('main.go:3:2: undefined: missing\n', context)).toHaveLength(1)
  })

  test('defaults the column and ignores errors outside the project directory', () => {
    const output = '/tmp/live code/main.go:9: missing return\n/tmp/library/main.go:4:2: undefined: parse\n'
    expect(go.compileDiagnostics(output, context)).toEqual([
      { file: 'main.go', line: 9, column: 1, severity: 'error', message: 'missing return' },
    ])
  })
})

describe('Go runtime diagnostics', () => {
  test('reports the first project frame after a panic', () => {
    const output = [
      'panic: regexp: Compile(`[`): error parsing regexp: missing closing ]: `[`',
      '',
      'goroutine 1 [running]:',
      'regexp.MustCompile({0x104cd09e0, 0x1})',
      '\t/usr/local/go/src/regexp/regexp.go:313 +0xb0',
      'livecode/helper.Parse(...)',
      '\t/tmp/live code/helper/parse.go:7',
      'main.main()',
      '\t/tmp/live code/main.go:10 +0x1d',
    ].join('\n')
    expect(go.runtimeDiagnostics(output, context)).toEqual([
      { file: 'helper/parse.go', line: 7, column: 1, severity: 'error', message: 'regexp: Compile(`[`): error parsing regexp: missing closing ]: `[`' },
    ])
  })

  test('reads fatal errors and their goroutine traces', () => {
    const output = 'fatal error: all goroutines are asleep - deadlock!\n\ngoroutine 1 [select (no cases)]:\nmain.main()\n\t/tmp/live code/main.go:4 +0xf\n'
    expect(go.runtimeDiagnostics(output, context)).toEqual([
      { file: 'main.go', line: 4, column: 1, severity: 'error', message: 'all goroutines are asleep - deadlock!' },
    ])
  })

  test('ignores a trace whose only frame is outside the project', () => {
    const output = 'panic: lesson failed\n\ngoroutine 1 [running]:\nmain.main()\n\t/tmp/other/main.go:7 +0x1d\n'
    expect(go.runtimeDiagnostics(output, context)).toEqual([])
  })
})
