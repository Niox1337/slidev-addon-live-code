export default {
  language: 'c',
  probe: ['cc', ['--version']],
  cases: [
    {
      name: 'prints output',
      options: { initialFile: 'main.c' },
      files: { 'main.c': '#include <stdio.h>\n\nint main(void) {\n  printf("hello from c\\n");\n  return 0;\n}\n' },
      expect: { phase: 'finished', output: 'hello from c' },
    },
    {
      name: 'reports a compile error',
      options: { initialFile: 'main.c' },
      files: { 'main.c': 'int main(void) {\n  return 0;\n  missing();\n}\n' },
      expect: { phase: 'compile-error', diagnostic: { file: 'main.c', line: 3, severity: 'error' } },
    },
    {
      name: 'reports a runtime error',
      options: { initialFile: 'main.c' },
      files: { 'main.c': 'int main(void) {\n  int values[2] = {0, 1};\n  volatile int index = 4;\n  return values[index];\n}\n' },
      expect: { phase: 'error', diagnostic: { file: 'main.c', line: 4 } },
    },
    {
      name: 'reads input',
      options: { initialFile: 'main.c', inputPrompt: 'Name: ' },
      input: 'Ada',
      files: { 'main.c': '#include <stdio.h>\n\nint main(void) {\n  char name[32];\n  printf("Name: ");\n  scanf("%31s", name);\n  printf("Hello, %s\\n", name);\n  return 0;\n}\n' },
      expect: { phase: 'finished', output: 'Hello, Ada' },
    },
  ],
}
