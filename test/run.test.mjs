import { spawnSync } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { startDeck } from './deck.mjs'

const casesFolder = new URL('./run-cases/', import.meta.url)
const suites = await Promise.all((await readdir(casesFolder)).filter(name => name.endsWith('.mjs')).sort()
  .map(async name => (await import(new URL(name, casesFolder).href)).default))
const settled = ['finished', 'error', 'compile-error', 'stopped']

function available(probe) {
  const [command, args = ['--version']] = probe
  return spawnSync(command, args, { stdio: 'ignore', timeout: 20_000 }).status === 0
}

const enabled = suites.filter(suite => available(suite.probe))
const projects = enabled.flatMap(suite => suite.cases.map((item, index) => ({
  id: `${suite.language}-${index}`,
  label: `${suite.language} ${item.name}`,
  language: suite.language,
  directory: `projects/${suite.language}-${index}`,
  ...suite.options,
  ...item.options,
})))
const files = Object.fromEntries(enabled.flatMap(suite => suite.cases.flatMap((item, index) => Object.entries(item.files)
  .map(([name, text]) => [`projects/${suite.language}-${index}/${name}`, text]))))

let deck

beforeAll(async () => {
  if (!projects.length) return
  deck = await startDeck({
    'slides.md': '# Run test deck\n',
    'live-code.config.mjs': `export default ${JSON.stringify(projects)}\n`,
    ...files,
  })
}, 20_000)

afterAll(async () => {
  await deck?.close()
})

async function runProject(id, { input, timeout }) {
  await deck.act({ type: 'select', project: id })
  await deck.act({ type: 'run' })
  const deadline = Date.now() + timeout
  let sent = false
  while (Date.now() < deadline) {
    const state = await deck.snapshot()
    if (input !== undefined && !sent && state.awaitingInput) {
      await deck.act({ type: 'input', line: input })
      sent = true
    }
    if (settled.includes(state.phase)) return state
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  await deck.act({ type: 'stop' })
  throw new Error(`${id} did not finish within ${timeout} ms`)
}

for (const suite of suites) {
  describe.skipIf(!enabled.includes(suite))(`run ${suite.language}`, () => {
    const timeout = suite.timeout ?? 60_000
    suite.cases.forEach((item, index) => {
      test(item.name, async () => {
        const state = await runProject(`${suite.language}-${index}`, { input: item.input, timeout })
        const output = state.output.map(chunk => chunk.text).join('')
        expect(state.phase, output).toBe(item.expect.phase)
        for (const text of [item.expect.output ?? []].flat()) expect(output).toContain(text)
        for (const diagnostic of [item.expect.diagnostic ?? []].flat()) {
          expect(state.diagnostics, output).toContainEqual(expect.objectContaining(diagnostic))
        }
      }, timeout + 5000)
    })
  })
}
