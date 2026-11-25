export default {
  language: 'haskell',
  probe: ['ghc', ['--version']],
  timeout: 120_000,
  options: { initialFile: 'Main.hs' },
  cases: [
    {
      name: 'prints output',
      files: { 'Main.hs': 'main :: IO ()\nmain = putStrLn "hello from haskell"\n' },
      expect: { phase: 'finished', output: 'hello from haskell' },
    },
    {
      name: 'reports a compile error',
      files: { 'Main.hs': 'main :: IO ()\nmain = do\n  putStrLn (1 + True)\n' },
      expect: { phase: 'compile-error', diagnostic: { file: 'Main.hs', line: 3, severity: 'error' } },
    },
    {
      name: 'reports a runtime error',
      files: { 'Main.hs': 'main :: IO ()\nmain = do\n  print (head ([] :: [Int]))\n' },
      expect: { phase: 'error' },
    },
  ],
}
