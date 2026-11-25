import { expect, test } from 'vitest'
import python from '../shared/languages/python.mjs'

const files = { 'main.py': '', 'helper.py': '' }

test('reads checker output', () => {
  const text = [
    'main.py:2:8: error: SyntaxError: expected \':\'',
    'helper.py:1:1: warning: SyntaxWarning: "\\d" is an invalid escape sequence.',
  ].join('\n')
  expect(python.compileDiagnostics(text, { files })).toEqual([
    { file: 'main.py', line: 2, column: 8, severity: 'error', message: 'SyntaxError: expected \':\'' },
    { file: 'helper.py', line: 1, column: 1, severity: 'warning', message: 'SyntaxWarning: "\\d" is an invalid escape sequence.' },
  ])
})

test('points at the deepest project frame of a traceback', () => {
  const text = [
    'Traceback (most recent call last):',
    '  File "/tmp/run/main.py", line 3, in <module>',
    '    print(divide(1, 0))',
    '          ~~~~~~^^^^^^',
    '  File "/tmp/run/helper.py", line 2, in divide',
    '    return a / b',
    '           ~~^~~',
    'ZeroDivisionError: division by zero',
  ].join('\n')
  expect(python.runtimeDiagnostics(text, { files })).toEqual([
    { file: 'helper.py', line: 2, column: 1, severity: 'error', message: 'ZeroDivisionError: division by zero' },
  ])
})

test('uses the last traceback of a chained exception', () => {
  const text = [
    'Traceback (most recent call last):',
    '  File "C:\\run\\helper.py", line 2, in divide',
    'ZeroDivisionError: division by zero',
    '',
    'During handling of the above exception, another exception occurred:',
    '',
    'Traceback (most recent call last):',
    '  File "C:\\run\\main.py", line 5, in <module>',
    '  File "/usr/lib/python3.13/json/__init__.py", line 346, in loads',
    'ValueError: bad input',
  ].join('\n')
  expect(python.runtimeDiagnostics(text, { files })).toEqual([
    { file: 'main.py', line: 5, column: 1, severity: 'error', message: 'ValueError: bad input' },
  ])
})

test('ignores output without a traceback', () => {
  expect(python.runtimeDiagnostics('exit requested\n', { files })).toEqual([])
})
