export default {
  language: 'zig',
  probe: ['zig', ['version']],
  timeout: 130_000,
  options: { initialFile: 'main.zig' },
  cases: [
    {
      name: 'prints output',
      options: { main: 'hello.zig', initialFile: 'hello.zig' },
      files: { 'hello.zig': 'const std = @import("std");\npub fn main() void {\n  std.debug.print("hello from zig\\n", .{});\n}\n' },
      expect: { phase: 'finished', output: 'hello from zig' },
    },
    {
      name: 'reports a compile error',
      files: { 'main.zig': 'pub fn main() void {\n  _ = missing;\n}\n' },
      expect: { phase: 'compile-error', diagnostic: { file: 'main.zig', line: 2, severity: 'error' } },
    },
    {
      name: 'reports a runtime error',
      files: { 'main.zig': 'pub fn main() void {\n  @panic("lesson failed");\n}\n' },
      expect: { phase: 'error', diagnostic: { file: 'main.zig', line: 2, severity: 'error', message: 'lesson failed' } },
    },
  ],
}
