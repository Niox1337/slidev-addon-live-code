import { spawnSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createTerminals } from '../terminal.mjs'

const supportedPlatform = ['darwin', 'linux'].includes(process.platform)
const pythonAvailable = supportedPlatform && spawnSync('python3', ['--version'], { stdio: 'ignore' }).status === 0
const id = 'project'
const files = { 'example.c': 'original\n', 'include/example.h': 'header\n' }
const pollOptions = { interval: 25, timeout: 3000 }

describe.skipIf(!pythonAvailable)('terminal sessions', () => {
  let terminals
  let request
  let response
  let events
  let onChange

  beforeEach(() => {
    vi.stubEnv('SHELL', '/bin/sh')
    onChange = vi.fn((_id, { updated }) => new Set(updated.map(([name]) => name)))
    terminals = createTerminals({
      message: name => name,
      accept: (_id, name) => /\.[ch]$/.test(name),
      onChange,
    })
    events = []
    request = new EventEmitter()
    response = {
      writeHead: vi.fn(),
      write: chunk => {
        if (chunk.startsWith('data: ')) events.push(JSON.parse(chunk.slice(6)))
      },
      end: vi.fn(),
    }
    terminals.subscribe(id, request, response)
  })

  afterEach(() => {
    terminals.shutdown()
    request.emit('close')
    vi.unstubAllEnvs()
  })

  const output = () => events.filter(event => event.type === 'output').map(event => event.data).join('')
  const start = () => terminals.start(id, { files, folders: ['include'], cols: 80, rows: 24 })

  async function workspace() {
    expect(terminals.input(id, 'printf \'workspace:%s\\n\' "$PWD"\r')).toBe(true)
    const path = () => output().match(/workspace:(\/[^\r\n]+)/)?.[1]
    await expect.poll(path, pollOptions).toBeDefined()
    return path()
  }

  test('broadcasts shell output and exits on kill', async () => {
    expect(response.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
      'Content-Type': 'text/event-stream',
    }))
    expect(events).toEqual([{ type: 'none' }])
    await start()
    expect(events).toContainEqual({ type: 'start', cols: 80, rows: 24 })
    expect(terminals.input(id, 'echo marker-$((40+2))\r')).toBe(true)
    await expect.poll(output, pollOptions).toContain('marker-42')
    expect(terminals.kill(id)).toBe(true)
    await expect.poll(() => events, pollOptions).toContainEqual({ type: 'exit', code: 0 })
    expect(terminals.input(id, 'echo closed\r')).toBe(false)
  }, 7000)

  test('sync writes changed files into the workspace', async () => {
    await start()
    const directory = await workspace()
    for (const [name, text] of Object.entries(files)) {
      expect(await readFile(join(directory, name), 'utf8')).toBe(text)
    }

    terminals.sync(id, { ...files, 'example.c': 'synced\n' }, ['include'])
    await expect.poll(() => readFile(join(directory, 'example.c'), 'utf8'), pollOptions).toBe('synced\n')
  }, 7000)

  test('reports files created inside the workspace', async () => {
    await start()
    const directory = await workspace()
    await writeFile(join(directory, 'include/new.h'), 'created\n')
    await expect.poll(() => onChange.mock.calls, pollOptions).toContainEqual([
      id, { updated: [['include/new.h', 'created\n']], removed: [] },
    ])
  }, 7000)

  test('shutdown removes the temp folder of a running session', async () => {
    await start()
    const directory = await workspace()
    const root = dirname(directory)
    expect((await stat(root)).isDirectory()).toBe(true)
    terminals.shutdown()
    expect(response.end).toHaveBeenCalledOnce()
    await expect(stat(root)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
