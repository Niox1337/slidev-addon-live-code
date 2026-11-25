const reader = 'const readline = require(\'node:readline\')\n\nprocess.stdout.write(\'Name: \')\nconst lines = readline.createInterface({ input: process.stdin })\nlines.once(\'line\', name => {\n  console.log(`Hello, ${name}`)\n  lines.close()\n})\n'

export default {
  language: 'javascript',
  probe: [process.execPath, ['--version']],
  cases: [
    {
      name: 'prints output',
      options: { initialFile: 'main.mjs' },
      files: { 'main.mjs': 'import { greet } from \'./greet.mjs\'\n\nconsole.log(greet(\'javascript\'))\n', 'greet.mjs': 'export const greet = name => `hello from ${name}`\n' },
      expect: { phase: 'finished', output: 'hello from javascript' },
    },
    {
      name: 'reports a syntax error',
      options: { initialFile: 'main.js' },
      files: { 'main.js': 'const value = 2\n\nconsole.log((value +)\n' },
      expect: { phase: 'compile-error', diagnostic: { file: 'main.js', line: 3, severity: 'error' } },
    },
    {
      name: 'reports a runtime error',
      options: { initialFile: 'main.mjs' },
      files: { 'main.mjs': 'import { check } from \'./check.mjs\'\n\ncheck(-1)\n', 'check.mjs': 'export function check(value) {\n  if (value < 0) {\n    throw new RangeError(\'negative\')\n  }\n}\n' },
      expect: { phase: 'error', diagnostic: { file: 'check.mjs', line: 3, message: 'RangeError: negative' } },
    },
    {
      name: 'reads input',
      options: { initialFile: 'main.js', inputPrompt: 'Name: ' },
      input: 'Ada',
      files: { 'main.js': reader },
      expect: { phase: 'finished', output: 'Hello, Ada' },
    },
  ],
}
