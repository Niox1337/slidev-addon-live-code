export default {
  language: 'typescript',
  probe: [process.execPath, ['-e', 'process.exit(require("node:module").stripTypeScriptTypes ? 0 : 1)']],
  cases: [
    {
      name: 'prints output',
      options: { initialFile: 'main.ts' },
      files: { 'main.ts': 'import { greet } from \'./greet.ts\'\n\nconst name: string = \'typescript\'\nconsole.log(greet(name))\n', 'greet.ts': 'export function greet(name: string): string {\n  return `hello from ${name}`\n}\n' },
      expect: { phase: 'finished', output: 'hello from typescript' },
    },
    {
      name: 'reports a syntax error',
      options: { initialFile: 'main.ts' },
      files: { 'main.ts': 'const value: number = 2\n\nconsole.log((value +)\n' },
      expect: { phase: 'compile-error', diagnostic: { file: 'main.ts', line: 3, severity: 'error' } },
    },
    {
      name: 'reports a runtime error',
      options: { initialFile: 'main.ts' },
      files: { 'main.ts': 'function first(items: number[]): number {\n  if (!items.length) {\n    throw new Error(\'empty list\')\n  }\n  return items[0]\n}\n\nconsole.log(first([]))\n' },
      expect: { phase: 'error', diagnostic: { file: 'main.ts', line: 3, message: 'Error: empty list' } },
    },
  ],
}
