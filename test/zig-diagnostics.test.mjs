import { describe, expect, test } from 'vitest'
import zig from '../shared/languages/zig.mjs'

const context = { directory: '/tmp/live code', files: { 'main.zig': '', 'helpers/values.zig': '' } }

describe('Zig compile diagnostics', () => {
  test('reads relative locations and ignores source excerpts', () => {
    const output = 'main.zig:3:5: error: use of undeclared identifier \'x\'\n    x += 1;\n    ^\n'
    expect(zig.compileDiagnostics(output, context)).toEqual([
      { file: 'main.zig', line: 3, column: 5, severity: 'error', message: 'use of undeclared identifier \'x\'' },
    ])
  })

  test('reads coloured absolute locations and skips notes', () => {
    const output = [
      '\x1b[1m/tmp/live code/main.zig:3:18: \x1b[31merror: \x1b[0mexpected type \'u8\', found \'u16\'',
      '/tmp/live code/main.zig:3:18: note: unsigned 8-bit int cannot represent all possible unsigned 16-bit values',
      '/tmp/live code/helpers/values.zig:1:16: note: parameter type declared here',
      '/opt/zig/lib/main.zig:8:1: error: invalid type',
    ].join('\r\n')
    expect(zig.compileDiagnostics(output, context)).toEqual([
      { file: 'main.zig', line: 3, column: 18, severity: 'error', message: 'expected type \'u8\', found \'u16\'' },
    ])
  })
})

describe('Zig runtime diagnostics', () => {
  test('reports the first project frame after a thread panic', () => {
    const output = [
      'thread 1234 panic: index out of bounds: index 4, len 2',
      '/opt/zig/lib/main.zig:82:17: 0x11e4930 in read (std.zig)',
      '/tmp/live code/helpers/values.zig:5:19: 0x11e3c7e in get (main)',
      '    return values[index];',
      '                 ^',
      '/tmp/live code/main.zig:2:18: 0x11e3baa in main (main)',
    ].join('\n')
    expect(zig.runtimeDiagnostics(output, context)).toEqual([
      { file: 'helpers/values.zig', line: 5, column: 19, severity: 'error', message: 'index out of bounds: index 4, len 2' },
    ])
  })

  test('reports an error returned from main', () => {
    const output = [
      'error: PermissionDenied',
      '/tmp/live code/helpers/values.zig:3:5: 0x11e2fbc in read (main)',
      '    return error.PermissionDenied;',
      '    ^',
      '/tmp/live code/main.zig:2:5: 0x11e3097 in main (main)',
    ].join('\n')
    expect(zig.runtimeDiagnostics(output, context)).toEqual([
      { file: 'helpers/values.zig', line: 3, column: 5, severity: 'error', message: 'PermissionDenied' },
    ])
  })

  test('ignores an error without a project frame', () => {
    expect(zig.runtimeDiagnostics('error: PermissionDenied\n', context)).toEqual([])
  })
})
