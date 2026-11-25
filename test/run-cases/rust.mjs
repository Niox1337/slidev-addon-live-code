export default {
  language: 'rust',
  probe: ['rustc', ['--version']],
  cases: [
    {
      name: 'prints output from a module',
      options: { initialFile: 'src/lesson.rs', main: 'src/lesson.rs', edition: '2021', flags: ['-Dwarnings'] },
      files: {
        'src/lesson.rs': 'mod greeting\x3b\n\nfn main() {\n    println!("{}", greeting::message())\x3b\n}\n',
        'src/greeting.rs': 'pub fn message() -> &\'static str {\n    "hello from rust"\n}\n',
      },
      expect: { phase: 'finished', output: 'hello from rust' },
    },
    {
      name: 'reports a compile error',
      files: { 'main.rs': 'fn main() {\n    println!("{}", missing)\x3b\n}\n' },
      expect: { phase: 'compile-error', diagnostic: { file: 'main.rs', line: 2, severity: 'error' } },
    },
    {
      name: 'reports a runtime error',
      files: { 'main.rs': 'fn main() {\n    panic!("lesson failed")\x3b\n}\n' },
      expect: { phase: 'error', diagnostic: { file: 'main.rs', line: 2, severity: 'error', message: 'lesson failed' } },
    },
    {
      name: 'reads input',
      options: { inputPrompt: 'Name: ' },
      input: 'Ada',
      files: { 'main.rs': 'use std::io::{self, Write}\x3b\n\nfn main() {\n    let mut name = String::new()\x3b\n    print!("Name: ")\x3b\n    io::stdout().flush().unwrap()\x3b\n    io::stdin().read_line(&mut name).unwrap()\x3b\n    println!("Hello, {}", name.trim())\x3b\n}\n' },
      expect: { phase: 'finished', output: 'Hello, Ada' },
    },
  ],
}
