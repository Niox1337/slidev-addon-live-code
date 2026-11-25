import { expect, test } from 'vitest'
import { parseNode, parseNodeCheck, parseTsc } from '../shared/languages/node.mjs'

const files = { 'main.ts': '', 'lib/check.mjs': '', 'main.js': '' }

test('reads syntax check blocks with caret columns', () => {
  const text = [
    '/tmp/run/main.js:3',
    'console.log((value +)',
    '                    ^',
    '',
    'SyntaxError: Unexpected token \')\'',
    '',
    '/tmp/run/main.ts:2',
    'function f( {',
    '',
    'SyntaxError: Expression expected',
    '',
  ].join('\n')
  expect(parseNodeCheck(text, { files })).toEqual([
    { file: 'main.js', line: 3, column: 21, severity: 'error', message: 'SyntaxError: Unexpected token \')\'' },
    { file: 'main.ts', line: 2, column: 1, severity: 'error', message: 'SyntaxError: Expression expected' },
  ])
})

test('reads an uncaught error from a file URL header', () => {
  const text = [
    'file:///tmp/run/main.ts:2',
    '  return list.map(x => x.foo())',
    '                         ^',
    '',
    'TypeError: x.foo is not a function',
    '    at file:///tmp/run/main.ts:2:26',
    '    at Array.map (<anonymous>)',
    '',
    'Node.js v22.20.0',
  ].join('\n')
  expect(parseNode(text, { files })).toEqual([
    { file: 'main.ts', line: 2, column: 26, severity: 'error', message: 'TypeError: x.foo is not a function' },
  ])
})

test('falls back to the first project stack frame', () => {
  const text = [
    'node:internal/modules/esm/resolve:283',
    '    throw new ERR_MODULE_NOT_FOUND(path)',
    '          ^',
    '',
    'Error [ERR_MODULE_NOT_FOUND]: Cannot find module \'/tmp/run/lib/missing.mjs\'',
    '    at finalizeResolution (node:internal/modules/esm/resolve:283:11)',
    '    at file:///tmp/run/lib/check.mjs:1:1',
  ].join('\n')
  expect(parseNode(text, { files })).toEqual([
    { file: 'lib/check.mjs', line: 1, column: 1, severity: 'error', message: 'Error: Cannot find module \'/tmp/run/lib/missing.mjs\'' },
  ])
})

test('reads tsc output', () => {
  const text = 'main.ts(4,7): error TS2322: Type \'string\' is not assignable to type \'number\'.\n'
  expect(parseTsc(text, { files })).toEqual([
    { file: 'main.ts', line: 4, column: 7, severity: 'error', message: 'Type \'string\' is not assignable to type \'number\'.' },
  ])
})
