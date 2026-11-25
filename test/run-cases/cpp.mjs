export default {
  language: 'cpp',
  probe: ['c++', ['--version']],
  cases: [
    {
      name: 'prints output from multiple sources',
      options: { initialFile: 'main.cpp' },
      files: {
        'main.cpp': '#include "greeting.hpp"\n#include <iostream>\n\nint main() {\n  std::cout << greeting() << "\\n"\x3b\n}\n',
        'greeting.hpp': 'const char* greeting()\x3b\n',
        'greeting.cc': '#include "greeting.hpp"\n\nconst char* greeting() {\n  return "hello from c++"\x3b\n}\n',
      },
      expect: { phase: 'finished', output: 'hello from c++' },
    },
    {
      name: 'reports a compile error',
      options: { initialFile: 'main.cpp' },
      files: { 'main.cpp': 'int main() {\n  return missing()\x3b\n}\n' },
      expect: { phase: 'compile-error', diagnostic: { file: 'main.cpp', line: 2, severity: 'error' } },
    },
    {
      name: 'reports a runtime error',
      options: { initialFile: 'bounds.cxx' },
      files: { 'bounds.cxx': 'int main() {\n  int values[2] = {0, 1}\x3b\n  volatile int index = 4\x3b\n  return values[index]\x3b\n}\n' },
      expect: { phase: 'error', diagnostic: { file: 'bounds.cxx', line: 4, severity: 'error' } },
    },
    {
      name: 'reads input',
      options: { initialFile: 'main.cpp', inputPrompt: 'Name: ' },
      input: 'Ada',
      files: { 'main.cpp': '#include <cstdio>\n\nint main() {\n  char name[32]\x3b\n  std::printf("Name: ")\x3b\n  if (std::scanf("%31s", name) != 1) return 1\x3b\n  std::printf("Hello, %s\\n", name)\x3b\n}\n' },
      expect: { phase: 'finished', output: 'Hello, Ada' },
    },
  ],
}
