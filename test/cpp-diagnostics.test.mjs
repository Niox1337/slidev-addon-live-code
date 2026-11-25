import { describe, expect, test } from 'vitest'
import { loadLanguage } from '../shared/languages/index.mjs'

const { compileDiagnostics, runtimeDiagnostics } = await loadLanguage('cpp')

describe('C++ compile diagnostics', () => {
  test('parses a Clang error in an included header', () => {
    const text = `In file included from ./broken.cc:1:
./include/example.hpp:3:10: error: use of undeclared identifier 'missing'
1 error generated.
`
    expect(compileDiagnostics(text, { files: { 'broken.cc': '', 'include/example.hpp': '' } })).toEqual([
      { file: 'include/example.hpp', line: 3, column: 10, severity: 'error', message: 'use of undeclared identifier \'missing\'' },
    ])
  })

  test('parses GCC errors and warnings without warning flags', () => {
    const text = `In file included from ./broken.cc:1:
./include/example.hpp: In function 'int sample()':
./include/example.hpp:3:10: error: 'missing' was not declared in this scope
./include/example.hpp:2:7: warning: unused variable 'unused' [-Wunused-variable]
`
    expect(compileDiagnostics(text, { files: { 'include/example.hpp': '' } })).toEqual([
      { file: 'include/example.hpp', line: 3, column: 10, severity: 'error', message: '\'missing\' was not declared in this scope' },
      { file: 'include/example.hpp', line: 2, column: 7, severity: 'warning', message: 'unused variable \'unused\'' },
    ])
  })
})

describe('C++ runtime diagnostics', () => {
  test('parses a UBSan source location', () => {
    const text = `bounds.cxx:4:10: runtime error: index 4 out of bounds for type 'int[2]'
SUMMARY: UndefinedBehaviorSanitizer: undefined-behavior bounds.cxx:4:10
`
    expect(runtimeDiagnostics(text, { files: { 'bounds.cxx': '' } })).toEqual([
      { file: 'bounds.cxx', line: 4, column: 10, severity: 'error', message: "index 4 out of bounds for type 'int[2]'" },
    ])
  })

  test('parses an ASan frame with spaces in the symbol and path', () => {
    const text = `==25849==ERROR: AddressSanitizer: heap-buffer-overflow on address 0x602000000b18 at pc 0x000102650854 bp 0x00016d7ada50 sp 0x00016d7ada48
READ of size 4 at 0x602000000b18 thread T0
    #0 0x000102650850 in lesson::read(int*, int) /tmp/live-code-frames-G2jXsE/lesson files/heap.cpp:3:10
    #1 0x0001026508dc in main /tmp/live-code-frames-G2jXsE/lesson files/heap.cpp:8:10
`
    expect(runtimeDiagnostics(text, { files: { 'lesson files/heap.cpp': '' } })).toEqual([
      { file: 'lesson files/heap.cpp', line: 3, column: 10, severity: 'error', message: 'heap-buffer-overflow' },
    ])
  })

  test.each([
    {
      runtime: 'libstdc++',
      headline: 'terminate called after throwing an instance of \'std::runtime_error\'\n  what():  lesson failed',
      frame: '    #6 0x000102ce8880 in main /tmp/live-code-throw-4NdC1j/throw.cpp:3:43',
      column: 43,
      message: 'lesson failed',
    },
    {
      runtime: 'libc++abi',
      headline: 'libc++abi: terminating due to uncaught exception of type std::runtime_error: lesson failed',
      frame: '    #8 0x000104684930 in main /tmp/live-code-throw-4NdC1j/throw.cpp:3:3',
      column: 3,
      message: 'libc++abi: terminating due to uncaught exception of type std::runtime_error: lesson failed',
    },
  ])('reports a $runtime exception only when a project frame is present', ({ headline, frame, column, message }) => {
    const context = { files: { 'throw.cpp': '' } }
    const trace = `AddressSanitizer:DEADLYSIGNAL
==25897==ERROR: AddressSanitizer: ABRT on unknown address 0x00019fd4c650 (pc 0x00019fd4c650 bp 0x00016b779970 sp 0x00016b779950 T0)
    #0 0x00019fd4c650 in __pthread_kill (/usr/lib/system/libsystem_kernel.dylib:arm64e+0x9650)
`
    expect(runtimeDiagnostics(`${headline}\n${trace}${frame}\n`, context)).toEqual([
      { file: 'throw.cpp', line: 3, column, severity: 'error', message },
    ])
    expect(runtimeDiagnostics(`${headline}\n${trace}`, context)).toEqual([])
  })
})
