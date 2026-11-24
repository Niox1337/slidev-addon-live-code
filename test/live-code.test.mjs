import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createServer } from 'vite'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { liveCode } from '../server/live-code.mjs'
import { readZip } from './read-zip.mjs'

const publicRoute = '/__slidev_live_code'
const presenterRoute = `${publicRoute}/presenter`
const cSource = 'int main(void) { return 0; }\n'
const cHeader = 'int example(void);\n'
const javaSource = 'public class Demo {}\n'
const notes = 'Presenter notes for the C project.'
const projectConfig = [
  { id: 'c', label: 'C demo', language: 'c', directory: 'c', initialFile: 'example.c' },
  { id: 'java', label: 'Java demo', language: 'java', directory: 'java', mainClass: 'Demo' },
]
const steps = [{ id: 'c-step', label: 'C example', slide: 1, nextSlide: 2, project: 'c', file: 'example.c', line: 1 }]

let root
let server
let origin
let cookie

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'live-code-vite-test-'))
  const fixture = {
    'slides.md': '# Test deck\n',
    'live-code.config.mjs': `export default ${JSON.stringify(projectConfig)}\nexport const steps = ${JSON.stringify(steps)}\n`,
    'c/example.c': cSource,
    'c/example.h': cHeader,
    'java/Demo.java': javaSource,
    '.slidev-live-code-notes/c.md': notes,
  }
  for (const [name, contents] of Object.entries(fixture)) {
    const path = join(root, name)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, contents)
  }
  server = await createServer({
    root,
    configFile: false,
    plugins: [liveCode()],
    server: { port: 0, host: '127.0.0.1' },
    logLevel: 'silent',
  })
  await server.listen()
  origin = `http://127.0.0.1:${server.httpServer.address().port}`
  const handshake = await request('/presenter/1')
  const setCookie = handshake.headers.get('set-cookie')
  await handshake.arrayBuffer()
  expect(setCookie).toMatch(new RegExp(`^slidev-live-code-\\d+=[a-f0-9]{48}; Path=${presenterRoute}; HttpOnly; SameSite=Strict$`))
  cookie = setCookie.split(';', 1)[0]
}, 10_000)

afterAll(async () => {
  try {
    await server?.close()
  }
  finally {
    if (root) await rm(root, { recursive: true, force: true })
  }
})

function request(path, options) {
  return fetch(`${origin}${path}`, { signal: AbortSignal.timeout(3000), ...options })
}

function presenterPost(action, { Cookie = cookie, ...headers } = {}, path = presenterRoute) {
  return request(path, {
    method: 'POST',
    headers: { ...(Cookie === null ? {} : { Cookie }), Origin: origin, 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(action),
  })
}

async function json(response, status = 200) {
  const body = await response.json()
  expect(response.status, JSON.stringify(body)).toBe(status)
  return body
}

async function act(action) {
  return json(await presenterPost(action))
}

test('audience GET exposes visible code and omits presenter data', async () => {
  await act({ type: 'select', project: 'c', file: 'example.c' })
  await act({ type: 'view', visible: false })
  const hidden = await json(await request(publicRoute))
  expect(hidden).toEqual({ visible: false, revision: expect.any(Number), locale: null })

  const presenter = await json(await request(presenterRoute, { headers: { Cookie: cookie } }))
  expect(presenter.notes).toBe(notes)
  expect(presenter.steps).toEqual([{ id: 'c-step', label: 'C example', slide: 1 }])
  expect(presenter.projects.map(({ id, language }) => [id, language])).toEqual([['c', 'c'], ['java', 'java']])

  await act({ type: 'select', project: 'c', file: 'example.c' })
  const audience = await json(await request(publicRoute))
  expect(audience).toMatchObject({ visible: true, project: 'c', file: 'example.c', code: cSource })
  for (const name of ['projects', 'original', 'interactive', 'steps', 'noteStep', 'notes', 'autosave']) {
    expect(audience).not.toHaveProperty(name)
  }
})

test('the public route rejects POST even with presenter credentials', async () => {
  const response = await presenterPost({ type: 'view', visible: true }, {}, publicRoute)
  expect(await json(response, 405)).toHaveProperty('error')
})

test.each([
  ['without the cookie', { Cookie: null }],
  ['with a foreign origin', { Origin: 'http://example.invalid' }],
  ['with a different content type', { 'Content-Type': 'text/plain' }],
])('presenter POST is rejected %s', async (_label, headers) => {
  const response = await presenterPost({ type: 'view', visible: true }, headers)
  expect(await json(response, 403)).toHaveProperty('error')
})

test('creates, renames, moves, deletes and restores a file', async () => {
  const project = 'c'
  const created = await act({ type: 'create-file', project, path: 'extra.c' })
  expect(created).toMatchObject({ project, file: 'extra.c', code: '' })
  const code = 'int extra(void) { return 7; }\n'
  await act({ type: 'edit', project, file: 'extra.c', code })

  const renamed = await act({ type: 'rename', project, from: 'extra.c', to: 'helper.c' })
  expect(renamed).toMatchObject({ file: 'helper.c', code })
  expect(renamed.projects.find(item => item.id === project).created).toEqual(['helper.c'])

  await act({ type: 'create-folder', project, path: 'lib' })
  const moved = await act({ type: 'rename', project, from: 'helper.c', to: 'lib/helper.c' })
  expect(moved).toMatchObject({ file: 'lib/helper.c', code })
  expect(moved.projects.find(item => item.id === project)).toMatchObject({
    created: ['lib/helper.c'],
    folders: ['lib'],
  })

  const deleted = await act({ type: 'delete', project, path: 'lib/helper.c' })
  expect(deleted).toMatchObject({ file: 'example.c', code: cSource })
  expect(deleted.projects.find(item => item.id === project).files).not.toContain('lib/helper.c')

  const restored = await act({ type: 'undo-delete', project })
  expect(restored.projects.find(item => item.id === project).created).toEqual(['lib/helper.c'])
  expect(await act({ type: 'select', project, file: 'lib/helper.c' })).toMatchObject({ code })
  await act({ type: 'delete', project, path: 'lib' })
  await act({ type: 'save-code' })
})

test('save writes edited code to the saves directory', async () => {
  const project = 'java'
  const file = 'Demo.java'
  const code = 'public class Demo { int count = 3; }\n'
  await act({ type: 'select', project, file })
  const edited = await act({ type: 'edit', project, file, code })
  expect(edited.autosave.pending).toBe(true)
  const saved = await act({ type: 'save-code' })
  expect(saved.autosave).toMatchObject({ pending: false, error: false, savedAt: expect.any(Number) })
  expect(await readFile(join(root, '.slidev-live-code-saves', project, file), 'utf8')).toBe(code)
  expect(await readFile(join(root, project, file), 'utf8')).toBe(javaSource)
  await act({ type: 'reset', project, file })
  await act({ type: 'save-code' })
})

test('download returns a zip only for the visible current project', async () => {
  const download = project => request(`${publicRoute}/download?project=${project}`)
  await act({ type: 'select', project: 'c' })
  await act({ type: 'view', visible: false })
  await json(await download('c'), 403)
  await act({ type: 'view', visible: true })
  await json(await download('java'), 403)

  const response = await download('c')
  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toBe('application/zip')
  const files = readZip(Buffer.from(await response.arrayBuffer()))
  expect(Object.fromEntries(files.map(({ name, data }) => [name, data.toString('utf8')]))).toEqual({
    'c/': '',
    'c/example.c': cSource,
    'c/example.h': cHeader,
  })

  await act({ type: 'select', project: 'java' })
  await json(await download('c'), 403)
  const java = await download('java')
  expect(java.status).toBe(200)
  expect(readZip(Buffer.from(await java.arrayBuffer())).map(({ name }) => name)).toEqual(['java/', 'java/Demo.java'])
})
