const python = process.platform === 'win32' ? 'python' : 'python3'

export default {
  language: 'python',
  probe: [python, ['--version']],
  cases: [
    {
      name: 'prints output',
      options: { initialFile: 'main.py' },
      files: { 'main.py': 'from helper import greet\n\nprint(greet("python"))\n', 'helper.py': 'def greet(name):\n    return f"hello from {name}"\n' },
      expect: { phase: 'finished', output: 'hello from python' },
    },
    {
      name: 'reports a syntax error',
      options: { initialFile: 'main.py' },
      files: { 'main.py': 'print("ok")\n\nif True\n    print("missing colon")\n' },
      expect: { phase: 'compile-error', diagnostic: { file: 'main.py', line: 3, severity: 'error' } },
    },
    {
      name: 'reports a runtime error',
      options: { initialFile: 'main.py' },
      files: { 'main.py': 'from helper import divide\n\nprint(divide(1, 0))\n', 'helper.py': 'def divide(a, b):\n    return a / b\n' },
      expect: { phase: 'error', diagnostic: { file: 'helper.py', line: 2, message: 'ZeroDivisionError: division by zero' } },
    },
    {
      name: 'reads input',
      options: { initialFile: 'main.py', inputPrompt: 'Name: ' },
      input: 'Ada',
      files: { 'main.py': 'name = input("Name: ")\nprint(f"Hello, {name}")\n' },
      expect: { phase: 'finished', output: 'Hello, Ada' },
    },
  ],
}
