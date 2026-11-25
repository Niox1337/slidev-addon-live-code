export const grammar = () => import('../zig-monarch.mjs').then(module => module.zigTokens)

export const members = [
  'print', 'debug', 'heap', 'mem', 'io', 'fmt', 'allocator', 'alloc', 'free', 'append', 'items', 'len',
  'init', 'deinit', 'writer', 'reader', 'getStdOut', 'getStdIn', 'page_allocator', 'ArrayList', 'eql',
]

export const snippets = [
  { label: 'main', body: 'const std = @import("std");\n\npub fn main() !void {\n\t${0}\n}' },
  { label: 'fn', body: 'fn ${1:name}(${2}) ${3:void} {\n\t${0}\n}' },
  { label: 'for', body: 'for (${1:items}) |${2:item}| {\n\t${0}\n}' },
  { label: 'while', body: 'while (${1:condition}) {\n\t${0}\n}' },
  { label: 'print', body: 'std.debug.print("${1:{\\}}\\\\n", .{${2}});' },
]
