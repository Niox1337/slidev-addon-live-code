import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createServer } from 'vite'
import { liveCode } from '../server/live-code.mjs'

const presenterRoute = '/__slidev_live_code/presenter'

export async function startDeck(files) {
  const root = await mkdtemp(join(tmpdir(), 'live-code-deck-'))
  for (const [name, contents] of Object.entries(files)) {
    const path = join(root, name)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, contents)
  }
  const server = await createServer({
    root,
    configFile: false,
    plugins: [liveCode()],
    server: { port: 0, host: '127.0.0.1' },
    logLevel: 'silent',
  })
  await server.listen()
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`
  const request = (path, options) => fetch(`${origin}${path}`, { signal: AbortSignal.timeout(5000), ...options })
  const handshake = await request('/presenter/1')
  await handshake.arrayBuffer()
  const cookie = handshake.headers.get('set-cookie').split(';', 1)[0]

  async function snapshot() {
    const response = await request(presenterRoute, { headers: { Cookie: cookie } })
    return response.json()
  }

  async function act(action) {
    const response = await request(presenterRoute, {
      method: 'POST',
      headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify(action),
    })
    const body = await response.json()
    if (response.status !== 200) throw new Error(`${action.type} failed with ${response.status}: ${JSON.stringify(body)}`)
    return body
  }

  async function close() {
    try {
      await server.close()
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  }

  return { root, snapshot, act, close }
}
