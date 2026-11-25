export default {
  language: 'go',
  probe: ['go', ['version']],
  timeout: 130_000,
  options: { initialFile: 'main.go' },
  cases: [
    {
      name: 'prints output using the project module',
      files: {
        'go.mod': 'module example.com/exercise\n\ngo 1.22\n',
        'main.go': 'package main\n\nimport "example.com/exercise/greeting"\n\nfunc main() {\n  greeting.Print()\n}\n',
        'greeting/greeting.go': 'package greeting\n\nimport "fmt"\n\nfunc Print() {\n  fmt.Println("hello from go")\n}\n',
      },
      expect: { phase: 'finished', output: 'hello from go' },
    },
    {
      name: 'reports a compile error',
      files: { 'main.go': 'package main\nfunc main() {\n  missing()\n}\n' },
      expect: { phase: 'compile-error', diagnostic: { file: 'main.go', line: 3, severity: 'error' } },
    },
    {
      name: 'reports a runtime error',
      files: { 'main.go': 'package main\nfunc main() {\n  panic("lesson failed")\n}\n' },
      expect: { phase: 'error', diagnostic: { file: 'main.go', line: 3, severity: 'error', message: 'lesson failed' } },
    },
    {
      name: 'reads input',
      options: { inputPrompt: 'Name: ' },
      input: 'Ada',
      files: { 'main.go': 'package main\n\nimport "fmt"\n\nfunc main() {\n  var name string\n  fmt.Print("Name: ")\n  fmt.Scanln(&name)\n  fmt.Printf("Hello, %s\\n", name)\n}\n' },
      expect: { phase: 'finished', output: 'Hello, Ada' },
    },
  ],
}
